---
title: "Building a Parallel OCR Pipeline in One Night"
date: "April 2026"
readTime: "10 min"
tags: ["Python", "OCR", "Parallelism", "Windows"]
---

## The problem

We ran out of pages on our paid monthly license for the OCR machines the office uses. 88,418 files across 132 folders still needed processing before the end of the billing cycle. The vendor doesn't carry over unused capacity or offer emergency page packs. When you hit the limit, it stops.

The office already had an OCR script running on a 48-core Windows server, but it was built for smaller batches and wasn't saturating the hardware. I needed to rebuild the pipeline to process the full backlog as fast as the machine could handle, and I needed it running that night.

## The machine

The target server had 48 physical CPU cores, plenty of RAM, and a network connection to the production file shares. What it didn't have was admin rights, Docker, or any ability to install software through normal channels. The Python environment ran through conda. Any binary dependencies (Tesseract, Ghostscript, jbig2enc) had to be bundled alongside the script in a `binaries/` folder and added to PATH at runtime.

Tesseract and Ghostscript were already bundled from a prior version of the script. JBIG2 compression was not. JBIG2 matters because it dramatically reduces file size on text-heavy scanned documents. Without it, the output PDFs would be 3-5x larger than necessary, and downstream tools that consume these files would choke on the volume.

## Compiling jbig2enc from source

The prebuilt jbig2enc binary available on SourceForge is 32-bit. On the 64-bit production server, it couldn't load its dependent DLLs. There's no official 64-bit Windows build.

The fix was compiling from source. The jbig2enc source was already present in the OCRmyPDF project folder on the machine. Building it required:

1. Downloading MinGW-w64 with GCC 14 (portable, no installer, no admin rights needed)
2. Pulling leptonica headers from conda-forge (jbig2enc depends on leptonica for image I/O)
3. Compiling with the right flags to produce a standalone 64-bit binary

This should have taken 15 minutes. It took closer to two hours. The leptonica headers from conda-forge didn't match the version jbig2enc expected. The include paths needed manual adjustment. The linker couldn't find `liblept` until I pointed it at the conda environment's lib directory explicitly. Each attempt was a compile, copy to the server, test, discover a new missing symbol, and repeat.

The resulting `jbig2.exe` was about 200KB and worked. It went into the `binaries/jbig2/` folder alongside Tesseract and Ghostscript.

## Three attempts at parallelism

The core problem was simple: run OCRmyPDF on 88,000 files using all 48 cores. The implementation was not simple.

### Attempt 1: ThreadPoolExecutor

The obvious first approach. Python's `concurrent.futures.ThreadPoolExecutor` with 48 workers, each calling `ocrmypdf.ocr()` through the Python API.

The result: 2-3% CPU utilization on a 48-core machine. The GIL (Global Interpreter Lock) was serializing everything. OCRmyPDF's Python API does significant work in Python before handing off to Tesseract: it validates the input, analyzes the PDF structure, sets up temp directories, configures Ghostscript arguments, and manages the output. All of that runs under the GIL. Even though Tesseract itself is a C++ subprocess that releases the GIL, the Python orchestration between tasks was enough to bottleneck the pipeline. Workers spent most of their time waiting for the GIL instead of doing useful work.

### Attempt 2: ProcessPoolExecutor

`ProcessPoolExecutor` bypasses the GIL by spawning separate Python processes, each with their own interpreter. In theory, 48 processes should fully utilize 48 cores.

In practice, Windows process creation is expensive compared to Linux. Each worker process has to spawn a new Python interpreter, import every module (ocrmypdf and all its dependencies), re-discover and validate the bundled Tesseract and Ghostscript binaries, and re-initialize the OCR engine.

The spawn overhead was visible in the logs. Workers were spending seconds on initialization before processing their first file. For a directory with 4 files, the initialization time exceeded the processing time. And because ProcessPoolExecutor on Windows uses the `spawn` start method (not `fork`), there's no way to share the initialized state between workers.

### Attempt 3: Raw subprocess.Popen

The approach that worked was the simplest one. Skip Python's pool executors entirely. Launch `ocrmypdf` as a CLI subprocess using `subprocess.Popen`. Manage the process pool manually: maintain a list of running processes, poll them in a loop with `proc.poll()`, and launch new ones as slots open up.

```python
running = {}  # proc -> (input_path, output_path, dir_name, idx)
task_iter = iter(tasks)
done = False

while not done or running:
    while len(running) < MAX_WORKERS and not done:
        task = next(task_iter, None)
        if task is None:
            done = True
            break
        inp, out, dname, idx = task
        cmd = _build_ocrmypdf_cmd(inp, out)
        proc = subprocess.Popen(
            cmd, stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL, env=env,
        )
        running[proc] = (inp, out, dname, idx)

    finished = []
    for proc in list(running):
        if proc.poll() is not None:
            finished.append(proc)

    for proc in finished:
        inp, out, dname, idx = running.pop(proc)
        # handle result, launch retry if needed
        ...

    if not finished and running:
        time.sleep(0.1)
```

Each `ocrmypdf` CLI invocation is a completely independent process: its own Python interpreter, its own Tesseract subprocess, its own temp files. No GIL contention because there's no shared Python interpreter. No pool executor overhead because there's no pool. The parent process does nothing but poll and launch. 48 Tesseract processes running simultaneously, each on its own core.

The worker count went through several iterations during testing: 30, 46, 48, 90, 96, 192, back to 48. Going above the physical core count added context-switching overhead without improving throughput. Tesseract is CPU-bound, not I/O-bound, so oversubscribing cores just slows everything down.

To keep each worker lightweight, the actual OCR call is isolated in a separate `ocr_worker.py` script. The parent process launches `python ocr_worker.py <input> <output>` for each file. The worker script is 45 lines: set up PATH for bundled binaries, call `ocrmypdf.ocr()`, exit. No state carried between invocations.

## The batch approach that didn't work

Before settling on per-file parallelism, I tried a different strategy for directories of images. The idea: combine all images in a folder into a single multi-page PDF using img2pdf (fast because it doesn't re-encode), then run a single `ocrmypdf` call on the combined PDF with `jobs=48` to let OCRmyPDF use its own internal parallelism.

```python
def ocr_directory_batch(image_files, output_path):
    import img2pdf
    import ocrmypdf

    with open(tmp_combined, "wb") as f:
        f.write(img2pdf.convert([str(p) for p in image_files]))

    ocrmypdf.ocr(tmp_combined, str(output_path), jobs=MAX_WORKERS)
```

On a 4-core development machine, this was faster than per-file processing. On the 48-core production machine, it was slower. The reason: Ghostscript's PDF rasterization step, which runs before Tesseract gets each page, is single-threaded. OCRmyPDF's `jobs` parameter parallelizes the per-page OCR after rasterization, but the rasterization itself is a serial bottleneck. On 48 cores, one core does rasterization while 47 wait. On 4 cores, the ratio is less painful.

Per-file parallelism avoids this because each file's entire pipeline (rasterize, OCR, optimize) runs independently. 48 files means 48 independent Ghostscript invocations on 48 cores. No serial bottleneck.

## The fallback chain

Pages started failing during the first test run. Ghostscript rendering errors (exit code 7), corrupt TIFF headers, PDFs with malformed page trees. These are legal documents. Missing pages in the output is not acceptable.

The fallback chain was built one tier at a time as failure modes appeared:

**Tier 1: OCRmyPDF with standard settings.** Handles 95%+ of files. Deskew, rotation detection, JBIG2 compression, lossless optimization. This is the path everything takes unless it fails.

**Tier 2: Retry with --force-ocr.** Some PDFs have an existing text layer that confuses OCRmyPDF's analysis. The `skip_text` flag is supposed to handle this, but certain malformed text layers cause the pipeline to error instead of skip. Force-OCR discards the existing text layer and redoes everything from scratch. Slower, but recovers files that Tier 1 rejects.

**Tier 3: PIL image-to-PDF.** Last resort. Open the image with Pillow, save it as a PDF with no text layer. The page is present in the output, visually correct, but not searchable. For a legal document pipeline, a non-searchable page is better than a missing page. Every file that hits this tier gets logged so it can be reprocessed later when there's time to investigate.

```python
def _fallback_to_pdf(input_path, output_path):
    try:
        from PIL import Image
        with Image.open(input_path) as img:
            if img.mode == "1":
                img = img.convert("L")
            elif img.mode not in ("L", "RGB"):
                img = img.convert("RGB")
            img.save(str(output_path), "PDF", resolution=200.0)
        return True
    except Exception:
        return False
```

The TIFFs that trigger the fallback chain tend to be ones with unusual compression schemes (old LZW variants, unusual bit depths) or files that were partially written to the network share before the source application finished flushing. The stability check (compare file size and mtime over a 2-second window) catches most of the latter, but not all.

## Handling Ctrl+C on Windows

At some point during testing I needed to stop the script. I pressed Ctrl+C. Nothing happened.

Python's default signal handling doesn't work reliably when you have 48 active subprocesses. The SIGINT signal gets delivered to the parent process, but Python's signal machinery defers handling it until the main thread returns to the interpreter loop. When the main thread is blocked in a tight poll loop with active subprocesses, the signal sits in a queue and never gets processed.

The progression of fixes:

`sys.exit(1)` raises SystemExit, which unwinds the call stack. But active subprocesses don't get terminated. The parent exits, 48 Tesseract processes keep running.

`os._exit(1)` kills the parent immediately without cleanup. Same problem: orphaned child processes.

`taskkill /F /T /PID` with the parent's PID. The `/T` flag kills the entire process tree. On Windows, the process tree can include things you didn't expect. This killed Explorer.

`taskkill /F /IM tesseract.exe` targets by image name. Kills every Tesseract process on the machine. This worked but needed to be the automated response, not a manual command.

The actual fix was `SetConsoleCtrlHandler` via ctypes:

```python
if platform.system().lower() == "windows":
    import ctypes
    _CTRL_C_EVENT = 0
    _CTRL_BREAK_EVENT = 1

    @ctypes.WINFUNCTYPE(ctypes.c_int, ctypes.c_uint)
    def _console_handler(event):
        if event in (_CTRL_C_EVENT, _CTRL_BREAK_EVENT):
            _force_kill()
            return 1
        return 0

    ctypes.windll.kernel32.SetConsoleCtrlHandler(
        _console_handler, 1,
    )
```

`SetConsoleCtrlHandler` registers a callback at the Windows API level, before Python's signal machinery gets a chance to intercept or defer the event. When Ctrl+C is pressed, Windows calls the handler directly. The handler calls `_force_kill()`, which issues targeted `taskkill /F /IM` commands for each known subprocess name (tesseract.exe, gswin64c.exe, jbig2.exe), then calls `os._exit(1)`.

## The output pipeline

Processed files land in a local output directory, then get copied to a dated path on a network share where other tools in the production pipeline pick them up automatically. The dated directory structure keeps things organized and prevents output from different runs from colliding.

The script runs as a scheduled job at 19:30, after business hours. Network shares are slower during the day when the office is actively reading and writing files. Running at night means the full network bandwidth is available for the OCR output copy, and the 48-core CPU load doesn't compete with anyone's interactive work.

On startup, the script sweeps the input folder for any files that are already present (in case files arrived while the script wasn't running). A secondary sweep runs every 10 seconds to catch anything the filesystem watcher missed. If the monitoring loop crashes, it restarts with linear backoff (5 seconds, 10 seconds, 15 seconds, up to 30 seconds between retries).

## What I'd build differently

The entire script is a single 886-line Python file. No package structure, no tests, no configuration file beyond hardcoded constants at the top. That's the right call for a tool built in 5 hours under pressure. It would be the wrong call for something that needs to be maintained long-term.

If this becomes a permanent part of the pipeline, I'd separate the OCR orchestration from the scheduling and file management. The orchestration logic (task queue, process pool, fallback chain) would be a standalone module that takes a list of files and returns results. The scheduler, network copy, and processed-folder management would wrap it. Right now they're interleaved in one function, which makes the code harder to test and harder to reuse.

The JBIG2 compilation issue would also be worth solving properly. A pre-built 64-bit Windows binary for jbig2enc should exist and be easy to find. It doesn't. If I have time, building one and publishing it would save the next person the same two-hour detour.

This was not a clean design-then-build. Every architectural choice was a reaction to something failing. The parallelism strategy changed three times. The fallback chain grew one tier at a time. The Ctrl+C handling was added after it killed Explorer. The batch optimization was implemented, benchmarked, and reversed. The JBIG2 binary was compiled from source after hours of dead ends with prebuilt options.

It processed 88,418 files. It's still running.
