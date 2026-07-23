---
title: "Six Broken Releases in One Afternoon: Reverse-Engineering NAPS2's Undocumented Portable-Mode File Layout"
date: "May 2026"
readTime: "7 min"
tags: ["Python", "PyQt5", "Windows", "Debugging"]
---

The office has a small PyQt5 app that wraps NAPS2, an open-source scanning tool, so a document scanner can produce a searchable PDF with one button click instead of someone hand-driving the NAPS2 GUI. The Python side is thin: build a command line, shell out to `NAPS2.Console.exe`, wait for a PDF to land. The original version of this file was six lines.

Between 11:59 and 3:14 that afternoon I shipped six releases, v1.0.2 through v1.0.7, chasing a chain of bugs I'd introduced myself. Every one of them came from the same source: NAPS2's portable mode has no documentation on where it expects its files, and I kept guessing wrong.

## The crash

The only person actually testing this was a coworker whose machine happened to have NAPS2 pre-configured from an earlier manual setup. Her log file showed the app dying between "Master profile rewritten" and the next line it should have logged. The intervening code was a couple of Qt UI updates and a call to `QApplication.processEvents()`.

`processEvents()` inside a Qt slot, in an exe bundled by our Python-to-exe compiler, is a known footgun, re-entrancy and handle-table interactions that don't show up until you hit them. Pulling it out fixed the crash. The status label still repaints fine; it just waits for `subprocess.run` to hand control back to the event loop instead of forcing a redraw mid-call.

While I had the log open I found a second problem: NAPS2 was silently falling back to `%APPDATA%\NAPS2`, which only existed on her machine because she'd configured it by hand. Everyone else got NAPS2's stock profiles instead of our bundled ones, which is why scans came out the wrong size with no OCR. I added an `App/naps2.portable` marker file, moved `Data/` inside `App/`, and figured portable mode was solved.

v1.0.2 also failed to compile, the installer script still had a stale `Data\*` source line pointing at a folder that no longer existed at the top level. I dropped the line, and since the actual v1.0.2 build never shipped, I bumped straight to v1.0.3 with identical contents rather than re-tag something that never went out the door.

## The crash that wasn't fixed

v1.0.3 still crashed, in the same place, one line earlier than before. The new trace logging I'd added called:

```python
logger.info(
    "scan_document: inputs read",
    extra={"filename": filename, ...},
)
```

`filename` is a reserved `LogRecord` attribute, Python's logging module sets it from the caller's source file, and `Logger.makeRecord` raises `KeyError("Attempt to overwrite 'filename' in LogRecord")` if your `extra` dict tries to reuse it. In a windowed exe with no console attached, that exception has nowhere to print and just kills the process. This exact bug had been sitting in the original scan-starting log call since v1.0.1; I'd just moved a copy of it earlier in the function when I added granular logging. Renamed the key to `out_basename` in v1.0.4 and the crash was finally gone.

## The scan that wasn't a scan

With the crash fixed, my coworker's next test came back in about 440ms with NAPS2's exit code 0, stdout of a single letter `X`, and no PDF on disk. `X` is NAPS2's per-page failure marker.

The cause was `--enable-ocr --ocr-lang eng`, flags I'd added believing they restored the original behavior. In portable mode, NAPS2 only looks for Tesseract's language data under `App\Data\Components\`, it does not fall back to `%APPDATA%\NAPS2\Components` the way non-portable mode does. We weren't bundling `eng.traineddata`, so NAPS2 aborted before scanning a single page. The original wrapper never passed these flags at all; it had been quietly riding on my coworker's pre-existing NAPS2 install having OCR configured with real language data. I dropped the flags for v1.0.5 and made a note to bundle the trained data properly later.

The other change in v1.0.5 was to the logging itself. Our log shipper wasn't reliably forwarding `extra` fields to the aggregator, so a line reading "NAPS2 invocation completed" carried none of the return code, stdout, or stderr that would explain what actually happened. I wrote a formatter that appends every non-reserved `extra` key as `key=value` pairs after a pipe character, so the local rotating log became the actual source of truth. It's worth noting the reserved-attribute set I hardcoded into that formatter, `name`, `msg`, `levelname`, `filename`, `lineno`, and so on, is precisely the list that had bitten me two releases earlier.

## The DPI that wasn't a DPI

That better logging immediately paid off. v1.0.6's test surfaced NAPS2's actual rejection:

```
ERROR(S):
  Option 'dpi' is defined with a bad format.
```

I'd been passing `--dpi Dpi200`, the enum name NAPS2 uses internally inside `profiles.xml`, instead of the plain integer `200` the command-line flag actually wants. One-line fix: `f"Dpi{dpi_int}"` became `str(dpi_int)`. I wrote in that commit message that every scan-path bug since v1.0.0 had been in code I'd added on top of the original wrapper, never in NAPS2 or the six-line `subprocess.run` call that shipped in v1.0.0. That should have been a bigger flag to myself than it was.

## The profile that wasn't found

v1.0.7 arrived because the DPI fix exposed one more layer: `returncode=1`, `stdout='The specified profile is unavailable or ambiguous.'`, even though `App\Data\profiles.xml` sat right there with the profile named in it.

The actual answer was that NAPS2's portable-mode detection looks for `Data\` as a sibling of the folder holding `NAPS2.Console.exe`, not nested inside it. The `naps2.portable` marker file I'd invented back in v1.0.2 doesn't exist as a real NAPS2 mechanism at all, I'd made up a pattern that sounded plausible and never verified it against NAPS2's actual behavior. With `Data\` in the wrong place, NAPS2 fell back yet again to `%APPDATA%\NAPS2`, which didn't exist on my coworker's machine this time, and reported the profile as missing instead of silently using defaults.

v1.0.0's original layout, before I touched any of it, already had `Data\` as a sibling of `App\`. I reverted to that, deleted the marker file, and left everything else from v1.0.4 through v1.0.6 in place: the renamed logging key, the dropped OCR flags, the plain-integer DPI value, the extras-aware formatter.

## What actually happened

Six release numbers, one afternoon, one root cause repeated with variations: I decided how NAPS2's portable mode worked instead of testing it, then spent five releases discovering, one broken assumption at a time, that the original six-line wrapper had already gotten it right. The fastest way through would have been to leave the working layout alone and add logging first. Every fix after v1.0.2 was really just me finding my way back to v1.0.0.
