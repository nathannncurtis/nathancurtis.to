---
title: "One 200,000-Page Order Found Every Per-Page Cost I'd Never Measured"
date: "October 2026"
readTime: "10 min"
tags: ["Python", "PDF", "Performance", "Profiling"]
---

The office's document pipeline takes a work order's source PDFs, renders every page, classifies each one, has a second model check those labels as a judge, renders the final page images, glues them into one combined PDF and OCRs it. Most orders are under 50 pages and finish in a couple of minutes. A big one is a few thousand pages and takes forty minutes to an hour.

At the end of September one order came in at 199,689 pages: two source PDFs, one about 90,000 pages and one about 110,000. It ran for eleven hours without classifying a single page. By the afternoon of its third day I had killed it twice and the queue's own safety net had killed it once. Behind most of that was something the code did once per page that I had never timed, because on a 4,000-page order it didn't register.

## Eleven hours, nothing classified

The worker process was alive. The classification server had seen no requests from it and its output folder was empty. My first read was that it wasn't stuck: four render helpers were each pinning a core, and I put the quiet evening before that down to slow single-threaded steps, which you'd expect at nearly 200,000 pages.

That was a guess, and it didn't survive the question of which steps. The main process had used about 21 minutes of CPU in 10 hours 50 minutes. Nothing single-threaded had been running. It had spent the evening waiting.

I couldn't see what the helpers were doing from outside the process, so I installed py-spy into a side folder on the box and dumped one:

```
Thread (active+gil): "MainThread"
    fz_load_outline (pymupdf\mupdf.py:50611)
    _loadOutline (pymupdf\__init__.py:3987)
    init_doc (pymupdf\__init__.py:5317)
    __init__ (pymupdf\__init__.py:3038)
    _render_and_b64_for_classify (services\work_order_processing\processor.py:180)
    _process_worker (concurrent\futures\process.py:264)
```

A second helper showed the same stack. Neither was rendering. Both were opening the PDF. Every page was its own task in the process pool, and each task did `fitz.open(pdf_path)`, rendered one page and closed the document. PyMuPDF loads the outline when it opens a document, and on a 90,000-page file that takes about a second. Four helpers at a second per open is about four pages a second.

The other half was memory. The code rendered every page to base64 and held all of them before making one classify call. The process was at 77.5 GB on a 128 GB box and growing about 110 MB a minute, with classification still to come.

The fix groups pages into runs of up to 25 consecutive pages from one source, so a task opens the file once per run. It also renders and classifies 1,000 pages at a time and releases each chunk before the next:

```python
_CLASSIFY_CHUNK_PAGES = 1000
_CLASSIFY_RENDER_RUN_PAGES = 25
```

I killed the order and re-dropped it. Twenty-six minutes in it had classified about 46,000 pages and was holding 2.5 GB. It classified all 199,689 pages in 1.9 hours.

## The judge was idle and the lock was busy

A day later the same order was in the judge pass, moving at about 4,500 pages an hour. The judge model was answering a page in 1.16 seconds with nothing queued behind it, so the model wasn't the limit. This time I recorded a 30-second py-spy profile of the worker and counted the samples inside the page-render function by what they were doing:

```
render samples (all threads): 2586
    1180 __init__ > init_doc
    1110 (own line)
     191 close
      89 __init__ > fz_open_document_with_stream_and_dir
       5 get_pixmap > get_pixmap
```

Five samples in `get_pixmap`, 1,180 in opening the document. It was the same bug in a different function. `_render_page_for_pipeline` opened the source for every judged page, and it did it inside the process-wide MuPDF lock, because that function runs on threads and MuPDF isn't thread-safe. Each open cost about 0.8 seconds and the lock was busy about 97% of the time. That capped the whole pass at about 1.25 pages a second no matter how many threads were waiting.

The judge pass now keeps one open document per source for the length of the pass and closes them when it ends. The final page render had the same per-page open in every pool child, and it got the same 25-page runs as classification.

The same profile had something in it I wasn't looking for:

```
main thread samples: 1496
     645  43.1% failed import lookup (httpcore sniffio)
     600  40.1% qa_page other
     199  13.3% idle wait (select/GetQueued)
      49   3.3% TLS handshake
```

43% of the asyncio main thread was spent failing to import a module. This is in httpcore 1.0.9:

```python
def current_async_library() -> str:
    # Determine if we're running under trio or asyncio.
    # See https://sniffio.readthedocs.io/en/latest/
    try:
        import sniffio
    except ImportError:  # pragma: nocover
        environment = "asyncio"
    else:
        environment = sniffio.current_async_library()
```

`sniffio` wasn't installed in the worker's bundled Python. Python doesn't cache a failed import, so every judge request walked `sys.path` on disk looking for it again, then fell through to `"asyncio"`. The fix is one line in `requirements.txt`. This one has nothing to do with order size. Every judge request had been paying it, and I only saw it because this order made me profile the worker.

## The safety net fired

In July I wrote about this queue's reaper learning to check whether a claim's worker is still alive, with a 24-hour hard ceiling behind it for a worker that is alive but hung. I said the ceiling barely matters day to day.

At the speed it was going, this order was about three days of work on one claim. At its 24th hour the ceiling reaped it, mid-judging, while its worker was alive and heartbeating. The other box re-claimed it and failed it at once. The ceiling is seven days now. A dead worker's claim is still reaped within one cycle by the liveness and heartbeat checks, which don't wait for the ceiling.

The order started over from page one a little after 1 a.m., on that second box. This time the judge pass took 18 minutes. I can't credit that to the lock fix alone: a separate change went live the same night that settles most pages before they reach the judge, and only 6,654 of the 199,689 went to it.

## Gluing 199,660 pages one at a time

The final renders finished at 07:16 and the order went quiet again. One core busy, no new files. The stack:

```
Thread (active+gil): "MainThread"
    page_xref (pymupdf\extra.py:75)
    page_xref (pymupdf\__init__.py:6032)
    _do_links (pymupdf\__init__.py:3235)
    insert_pdf (pymupdf\__init__.py:5521)
    combine_classified_pages (services\work_order_processing\pdf\combining.py:1912)
```

The combine step converted each page image to a one-page PDF and inserted it into the combined document, one page at a time. There was no progress counter I could read, so I ran `py-spy dump --locals` and read the loop variable out of the frame: `page_81139.tif`, two and a half hours in. A minute-long sample a few minutes later measured 6.21 pages a second, against an average of about 9 up to that point. Every `insert_pdf` call copies links, which means walking the destination document, and the destination had 84,000 pages in it and was growing.

I expected a one-line fix: `links=False`. These pages are single images and carry no links. A synthetic benchmark, inserting 30,000 tiny one-page PDFs, only half agreed:

```
per page, links=True: first 1000 0.10s, last 1000 3.20s, total 41.3s for 30000
per page, links=False: first 1000 0.07s, last 1000 1.38s, total 16.0s for 30000
chunks of 1000, links=False: total 13.6s for 30000
```

`links=False` cut the total from 41.3 seconds to 16.0, but the last 1,000 inserts still cost 1.38 seconds against 0.07 for the first. Building 1,000-page chunks and appending each chunk once did a little better.

Then I ran it with production-shaped pages, a 1700x2200 Group 4 TIFF pushed through the real conversion function. Seconds per 1,000 pages over 10,000 pages, both with `links=False`:

```
per page   s/1000: [12.34, 12.39, 12.65, 12.58, 12.64, 12.81, 13.99, 14.62, 14.38, 15.27]
chunks 1k  s/1000: [12.3, 12.35, 12.66, 14.0, 14.27, 14.3, 14.32, 14.44, 15.36, 14.91]
```

No difference. The 12 seconds per 1,000 was mostly PIL converting each image to PDF, one at a time, each conversion awaited in turn. The benchmark with tiny pages had skipped that step. Putting the conversion on 8 threads got it to about 10.5 seconds, because PIL holds the GIL for that work. Handing it to the worker's existing render process pool got this:

```
processes s/1000: [3.11, 2.92, 2.61, 2.86, 2.71, 2.79, 2.81, 2.79, 2.79, 2.88]
```

2.8 seconds per 1,000 and flat. At that rate 199,660 pages is about ten minutes. My estimate for the old loop was about twelve hours.

## 75 GB

I shipped that fix and left the running order on the old loop. By early afternoon it was at page 141,000 of 199,660, the worker was holding 75 GB, and the box had 2 GB of commit left. The whole combined document lived in memory until the final save. My new code from that morning did the same thing, only faster.

The loop had a worse problem. A page that failed to insert was logged and skipped, which is right for a corrupt image and wrong for `MemoryError`. Running out of memory there would have shipped a combined PDF with pages missing and one log line to show for it.

The combine now saves each 1,000-page chunk to disk as it's built and joins them with qpdf at the end. Two hundred chunk paths would pass Windows' command-line limit, so the arguments go through an `@argfile`:

```python
for arg in ["--empty", "--pages", *part_paths, "--", output_pdf_path]:
    fh.write(arg + "\n")
...
proc = subprocess.run([qpdf, f"@{argfile}"], capture_output=True, text=True)
```

`MemoryError` on a page now fails the combine. I killed the order, the box went from 2 GB of free commit back to 86 GB, and the order was re-claimed on the new code within a couple of minutes.

## Why none of it showed at 4,000 pages

Opening a PDF costs more the bigger the PDF is, and I was paying that once per page. Inserting into a document while copying links costs more the bigger the document is, and I was paying that once per page too. On a 4,000-page order the combine step takes a few minutes, so I had never looked.

The three slow loops all turned up the same way, from py-spy on a live process that looked idle or looked busy for the wrong reason. The benchmark from the combine fix sits in the repo next to the tests now, with this in its docstring: "If the last 1,000 cost far more than the first, the loop is quadratic."