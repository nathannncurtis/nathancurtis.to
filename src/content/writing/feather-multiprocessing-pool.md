---
title: "The Multiprocessing.Pool That Opened a Dozen Windows"
date: "May 2025"
readTime: "6 min"
tags: ["Python", "PyQt", "Concurrency"]
---

Feather is a small desktop tool I wrote for myself: point it at a folder of scanned pages, and it resizes every JPEG, PNG, or TIFF in there to fit an 8.5x11 page at 300 DPI, so the batch prints or feeds an OCR pipeline cleanly instead of coming out at a dozen inconsistent sizes. The whole thing is a PyQt5 window with a progress bar. Simple enough that I didn't think hard about the first version of its batch processor, and that's exactly where the trouble started.

## A pool that multiplies windows instead of images

The original `process_image` function ran under a `multiprocessing.Pool`:

```python
cores_to_use = round(cpu_count() * 0.65)
with Pool(cores_to_use) as pool:
    for i, _ in enumerate(pool.imap_unordered(process_image, [(path, target_size) for path in file_paths])):
        progress_value = int((i + 1) * progress_step)
        self.progress.emit(progress_value)
```

Reasonable-looking code: cap at 65% of cores, farm the resize-and-save work out to worker processes, update the progress bar as results come back. What actually happened when I pointed it at a real folder of scans was that new Feather windows started popping open on screen, one after another, while the batch ran. Not a crash, not a hang: new instances of the whole GUI application, as if I'd double-clicked the shortcut a dozen times.

I didn't chase down the exact mechanism at the time. `multiprocessing` on Windows uses spawn, not fork, which means each worker re-imports the entry-point module from scratch rather than inheriting the parent's memory. The `if __name__ == '__main__':` guard is supposed to stop that reimport from re-running `QApplication` and `MainWindow().show()`, and it was in place, but something about running a `Pool` from inside a `QThread` in a script meant to become a packaged Windows executable was enough to defeat it. The fix I shipped first was the blunt one: rip `multiprocessing` out entirely and go back to a plain sequential loop, one image at a time, no pool. That's commit `0aedb56`, and the commit message says exactly what it did: "fixed issue where multiple instances were opening upon processing."

That fix worked. It also meant Feather now resized a folder of scans one file at a time on a single thread, which is the commit I actually want to talk about here.

## Putting concurrency back, the boring way

A week later I rewrote the worker again, this time with `concurrent.futures.ThreadPoolExecutor` instead of `multiprocessing.Pool`:

```python
self.max_workers = min(multiprocessing.cpu_count(), 8)
self.batch_size = batch_size

with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
    future_to_batch = {
        executor.submit(process_image_batch, batch, self.target_size_pixels,
                         progress_tracker, self.progress): batch
        for batch in file_batches
    }
    for future in as_completed(future_to_batch):
        ...
```

Threads instead of processes means everything stays inside the one running interpreter: no spawn, no reimport, no second `QApplication` accidentally standing up a second window. Pillow's `Image.open`, `resize`, and `save` do enough of their work in C that a thread pool still gets real overlap on I/O and decode/encode, even with the GIL in the picture. Workers are capped at 8 regardless of core count, and files are split into batches of 10 (`process_image_batch`) so a run over a few hundred scans doesn't try to hold every image open in memory at once.

Going from one thread to eight also meant the plain "processed count / total" I'd been using for the progress bar was no longer safe, since multiple worker threads increment it concurrently now. So I added a small `ProgressTracker` with a `threading.Lock` around two counters:

```python
class ProgressTracker:
    def __init__(self, total_files):
        self._lock = threading.Lock()
        self._processed = 0
        self._errors = 0
        self._total = total_files

    def increment_processed(self):
        with self._lock:
            self._processed += 1
            return self._processed
```

Small, but it's the difference between a progress bar that occasionally reports 97% twice and one that doesn't.

The same commit also fixed a real correctness bug in the resize itself. The earlier version forced every image to RGB and pasted it onto a plain white background sized to the fixed target, which meant a landscape scan on a portrait target (or the reverse) came out squashed rather than fitted. The rewrite checks the aspect ratio of the source against the target, swaps the target's width and height if the orientations don't match, then scales by `min(scale_width, scale_height)` so the whole page lands inside the frame without distortion. It also stopped assuming every scan was RGB: 1-bit black-and-white scans get a white background in mode `1`, grayscale scans stay in `L`, palette images (`P`) get their palette copied over, and CMYK gets its own white. JPEG saves keep the source's original quality setting instead of a hardcoded `70`, and TIFF saves carry over compression and the `description`/`software`/`datetime` tags instead of dropping them.

And after each image, `process_single_image` explicitly does `del scaled_img; del final_img`, and the batch loop calls `gc.collect()` after every file. Scanned pages at 300 DPI aren't huge individually, but a folder of a few hundred of them, held across eight concurrent workers, adds up fast enough that I wanted Python reclaiming memory on a schedule I controlled rather than whenever the garbage collector felt like it.

## The actual lesson

The pool wasn't wrong because parallelism was wrong. It was wrong because I reached for OS processes to solve a problem that lives inside one GUI application, on Windows, where spawning a new process is expensive and, in this case, dangerous: it can re-launch the thing you're trying to run in the background. Threads gave me back the concurrency without the reimport hazard, and the lock around two integers is the whole cost of making that safe.

Feather.py today has no `multiprocessing` import at all. It has a `ThreadPoolExecutor` capped at 8 workers, a batch size of 10, one `threading.Lock`, and a `gc.collect()` call after every image.
