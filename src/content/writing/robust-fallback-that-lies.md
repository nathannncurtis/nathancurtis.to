---
title: "The 'Robust' Fallback That Lies: A DICOM Decoder That Fabricates a Fake Volume on Failure"
date: "August 2025"
readTime: "4 min"
tags: ["Python", "DICOM", "Error Handling"]
---

I've been building a DICOM importer/viewer as a side project, the kind of tool that reads a folder of `.dcm` files and stitches them into a 3D volume you can scroll through. The loader lives in `robust_dicom_decoder.py`, and the docstring at the top says it plainly: "Robust DICOM Decoder featuring SimpleITK for 3D series." I named the file that on purpose. It turns out the name was a warning I didn't listen to.

## What the function is supposed to do

`decode_dicom_series_with_sitk` takes a list of file paths and hands them to `sitk.ImageSeriesReader`, which is genuinely the best tool for stacking a DICOM series into one 3D array. Real-world series are messy though: non-uniform slice spacing, JPEG variants pydicom's own reader chokes on, private tags, missing instances. `main_qt.py` even suppresses warnings for some of these cases at import time (`"Non uniform sampling"`, `"Unsupported JPEG"`). So the SimpleITK call is wrapped in a try/except, on the assumption that sometimes it'll throw and the app needs to survive that.

Here's the except block, in full:

```python
except Exception as e:
    logger.error(f"SimpleITK failed to load the series: {e}")
    try:
        ds = pydicom.dcmread(file_paths[0], stop_before_pixels=True, force=True)
        rows = int(ds.get('Rows', 512))
        cols = int(ds.get('Columns', 512))
        frames = len(file_paths)

        y, x = np.ogrid[:rows, :cols]
        placeholder_slice = (x + y) * (4095 / (rows + cols))
        volume = np.array([placeholder_slice + f * 50 for f in range(frames)], dtype=np.float32)
        logger.warning(f"SimpleITK failed. Returning a placeholder volume of shape {volume.shape}.")
        return np.clip(volume, 0, 4095), "SimpleITK_failed_placeholder"
    except Exception as pe:
        logger.error(f"Could not even create a placeholder: {pe}")
        return None, "Total_failure"
```

When the real reader throws, this doesn't propagate the error. It reads just enough metadata to know the image dimensions, builds a diagonal ramp (`x + y`) per slice, offsets each slice by `f * 50` so scrolling through the "volume" looks like something is changing, clips the whole thing to 0-4095, and hands it back as if it were data. The function does return a second value, a string tag, `"SimpleITK_failed_placeholder"` versus `"SimpleITK"` for the real path. That string is the only signal that anything went wrong.

## The part that actually breaks

I went looking at the two call sites, `main_qt.py` and `advanced_dicom_viewer.py`. Both do this:

```python
volume, method = decode_dicom_series_with_sitk(file_paths)
if volume is not None:
    # ...load metadata, build instances...
```

Neither one looks at `method`. It gets stored on each slice's metadata dict and then never inspected again. So the check that decides whether loading "succeeded" is just `volume is not None`, and the placeholder function was written specifically so that it's never `None` unless even the metadata read fails. A SimpleITK failure and a clean load are indistinguishable to the caller. No error dialog, no toast, nothing. The only trace is a `logger.warning` line that nobody's watching in a Qt app running in a normal user's session.

Play that forward: you drop in a series, SimpleITK throws for some reason (bad private tag, weird transfer syntax, whatever), and what you get on screen is a smooth diagonal gradient in every slice, looking exactly enough like "the app loaded my scan" to not raise an eyebrow if you're not looking closely. It's a placeholder that was built to never look broken, which is worse than one that looks obviously fake.

## Why I wrote it this way in the first place

I think I was solving the wrong problem. Early on I kept hitting SimpleITK failures on partial series (a folder with a few corrupt or non-image files in it), and I didn't want the app to just die with a stack trace every time. So I built a fallback that guaranteed *some* volume would always come back, and treated that as "robustness." It is not robustness. Robust error handling means the caller finds out something failed and can decide what to do about it. What I built is a decoder that lies about its own success so convincingly that I forgot to check for the lie at the two places that mattered.

The fix is straightforward and I haven't shipped it yet: either drop the placeholder path entirely and return `None` on SimpleITK failure like the single-file decoder already does (`decode_dicom_robust` just returns `None, "pydicom_failed"`), or keep it as an opt-in debug flag and make both call sites branch on `method.endswith("_placeholder")` before they ever call `_finish_loading`. Right now, as of the code sitting in this repo, they don't. A ramp built from `(x + y) * (4095 / (rows + cols))` is one `if` statement away from being an error message instead of a scan.
