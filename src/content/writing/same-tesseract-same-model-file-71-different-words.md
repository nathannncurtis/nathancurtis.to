---
title: "Same Tesseract, Same Model File, 71 Different Words"
date: "October 2026"
readTime: "8 min"
tags: ["Python", "OCR", "Tesseract", "Performance"]
---

The office's document pipeline OCRs every page with Tesseract. I ran the same 12 pages through Tesseract 5.3.4 on a Linux box and a Windows box, with the same `eng.traineddata` (I checked the SHA-256) and the same PNG files as input. Out of 3,508 words, 71 came back different. A second 5.3.4 build on the same Linux box matched the first on every word.

I only ran that test because of a different bug: neither Windows box was doing any OCR, and one of them has 96 cores.

## Every page went to one machine

There are three machines in this pipeline. A 96-core Windows box and a 24-core Windows box run the queue workers, and a 24-core Linux GPU server runs the classifier and the OCR endpoint. Back in May I'd built "joint OCR": a small helper that runs Tesseract on the worker's own machine, so the Rust OCR worker can round-robin pages between the server and localhost. The commit is dated May 28.

On October 1 I finally analyzed the stage traces we'd been collecting since August, 8.6 million records. OCR was about 95% of pipeline time. On the 96-core box the median OCR time per page was 8.1 seconds, and 6.0 of those were spent waiting on the HTTP call to the server. On the 24-core box it was 10.1 and 9.0. The wait was growing: on the 96-core box the median went from 5.0 seconds the week before to 6.5.

Then I compared page counts for that week. The server handled 244,638 OCR pages. The two worker boxes sent 244,596. Every page from the whole fleet was being read on one 24-core machine that was also running the classifier. The helper on the 96-core box was listening on port 9000 and had zero runs in the traces. The 24-core box didn't have a helper installed at all.

## The empty list

The launch side does the right thing. The launcher script starts the helper and puts its address in the environment the backend and its workers inherit (the app sets the same variable itself if the script hasn't):

```bat
REM Joint OCR: workers send to both the server and the local daemon.
set "OCR_PIPELINE_EXTRA_ENDPOINTS=http://127.0.0.1:9000"
```

The queue also has a settings file, and the May 28 commit added a key to it with a default:

```python
DEFAULTS: Dict[str, Any] = {
    ...
    "extra_ocr_endpoints": [],
```

When the engine starts workers, the settings get translated into environment overrides, which are merged last, on top of whatever the process inherited:

```python
def to_env_overrides(settings: Dict[str, Any]) -> Dict[str, str]:
    extra: List[str] = list(settings.get("extra_ocr_endpoints") or [])
    env = {
        ...
        "OCR_PIPELINE_EXTRA_ENDPOINTS": ",".join(extra),
    }
```

`",".join([])` is an empty string. So every worker got `OCR_PIPELINE_EXTRA_ENDPOINTS=""` written over the launcher's value, parsed that into zero extra endpoints, and sent everything to the server. Nothing failed. The helper was running and answering on its port, and no worker had its address.

Two lines below that `join`, in the same function, is a comment I wrote in August about a different group of settings:

```python
    # Inherit-on-empty: an unset QA knob must not appear in the override
    # dict at all, or it would blank out the value the backend was started
    # with and turn the judge off box-wide.
```

That's the same failure, worked out and written down for the QA keys. The OCR key sits just above that loop and never got the same treatment.

## Making the boxes match first

Turning it on was a one-line settings change, but it meant one document's pages would be read by two different machines. I wanted them to read the same way, so before enabling anything I put the server's Tesseract version on Windows: the conda-forge win-64 build of 5.3.4, unpacked into a portable folder, with the server's own `eng.traineddata` copied over.

The first run exited with `-1073741515`, which is `0xC0000135`, a missing DLL. Walking the import tables found two. `libcurl.dll` is linked by `tesseract.exe` but isn't in the package's declared dependencies. `liblzma.dll` was missing because the xz build my script picked, 5.2.9, doesn't ship it. I added libcurl, pinned xz to 5.2.6, and it ran.

## The comparison I got wrong

I pulled 12 real pages, OCR'd them on the server the way the endpoint does, and ran the same pages on the 24-core Windows box twice, once from the server's PNG and once from the original JPEG. My first comparison said 2 of 12 pages matched from the PNG, and that from the JPEG nearly every word was different: 323 of 383 on one page, 460 of 463 on another.

Both numbers were my test's fault. I'd piped Tesseract's stdout through PowerShell into `Set-Content`, which re-encoded the text and garbled anything outside ASCII, like the degree sign. I was also comparing word lists by position, so one extra token shifted every word after it. I reran with Tesseract writing its own TSV files and diffed the word sequences with `difflib.SequenceMatcher`:

```
words 3508 | same PNG: pages identical (text+position) 3 /12, words differ 71
           | raw JPEG: identical 1 /12, words differ 395
```

## The helper was feeding Tesseract a different image

The server's OCR endpoint opens each page with PIL and saves a temp PNG, and Tesseract reads the PNG. My local helper wrote the JPEG bytes straight to a temp file, so Tesseract decoded the JPEG itself, through Leptonica. Fed that way, the Windows box disagreed with the server on 395 of 3,508 words (11%). Fed the server's PNG, it disagreed on 71. The fix was to do the same thing in the helper:

```python
img = Image.open(io.BytesIO(image_bytes))
img = img if img.mode in ("L", "RGB", "1") else img.convert("RGB")
img.save(tmp, format="PNG", optimize=False)
```

The PR is 11 lines added and 2 deleted.

## The 71 words I couldn't get rid of

That left 71 words (2%) with identical PNG input.

The model file had the same hash on both sides. The server's distro Tesseract linked Leptonica 1.82.0 and the Windows build had 1.83.1, so I assembled the conda-forge linux-64 build of 5.3.4 with Leptonica 1.83.1 in a side folder on the server and ran the pages through that:

```
words 3508 | linux conda vs windows: pages identical 3 /12 words differ 71
           | linux conda vs linux today: identical 12 /12 words differ 0
```

I also forced `-c dotproduct=generic` on both sides to take the SIMD code paths out of it. Still 71, and the server's generic output matched its native output exactly.

So version, Leptonica and the data file are all ruled out, and what's left is the Windows build against the Linux build. The differences are small: the server read `International` where Windows read `Intemational`, `degC` against `deg`, `INTERFACE` against `INTERFACE,`, and different guesses on smudges. This text is only the search layer under the page image, so I accepted 2%.

## Turning it on

On the 96-core box the 5.3.4 build runs as a second helper on port 9001, next to the app's original one on 9000, so I didn't have to restart the app. It has 57 slots, 60% of the cores, because that machine does other work. The 24-core box got its own helper with 19. The worker's round-robin is `cursor % endpoint_count` with no weights, so to send two of every three pages to the helper, the list names it twice:

```json
"extra_ocr_endpoints": ["http://127.0.0.1:9001", "http://127.0.0.1:9001"]
```

On the 96-core box that's the settings file. The 24-core box's workers are started by their own launcher script, which sets the environment variable to the same two entries.

Tesseract by itself took 0.2 to 0.9 seconds a page in the parity test, which is how I knew the 6 to 9 seconds at the server was nearly all queueing. I have one before-and-after measurement so far: a 4,414-page order on the 24-core box went from 51.4 minutes to 17.9, with OCR dropping from about 12 seconds a page to 3.3. The wall-clock number also includes a few unrelated fixes that went in alongside it, so the per-page OCR figure is the cleaner one. The helper's trace for that run shows 2,206 pages, which is half the order; the list asks for two-thirds.

`",".join(extra)` is still in `to_env_overrides` on main. The 96-core box's settings file has a non-empty list now, and that is the only thing keeping its helper fed.
