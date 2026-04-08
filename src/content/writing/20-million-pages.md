---
title: "What Breaks When You Process 20 Million Pages"
date: "January 2026"
readTime: "5 min"
tags: ["Python", "Production", "Lessons"]
---

## The tool

File Processor is a batch document converter. It takes PDFs and converts them to TIFF or JPEG across network shares. It has a PyQt5 GUI with a configurable job queue, handles multiple concurrent conversion profiles, and rebalances CPU cores at runtime as jobs start and finish.

It's been running daily in a production environment for over two years. As of writing, it has processed over 20 million pages. Here's what I've learned from keeping it alive at that scale.

## Files lie about what they are

A PDF is not always a PDF. Some files have a .pdf extension but are actually TIFF files that someone renamed. Some are corrupted halfway through. Some have pages that are 0x0 pixels. Some have embedded fonts that reference character maps that don't exist.

At page one million, you think you've seen everything. By page ten million, you've learned that every assumption you made about file formats has an exception sitting in a network folder somewhere waiting to crash your overnight job.

The fix is boring: wrap every single file operation in error handling that logs the failure, skips the file, and keeps going. Never let one broken file kill a batch of ten thousand. This sounds obvious but it took three production failures before I got the granularity right.

## Network shares are not local disks

The tool reads from and writes to network shares (SMB/CIFS on Windows). Network I/O is fundamentally different from local disk I/O in ways that matter at scale:

- **Latency spikes.** A local read takes microseconds. A network read takes milliseconds, sometimes seconds if the server is under load. Multiply that by thousands of files and a 2-second network hiccup becomes a 30-minute delay.
- **Connection drops.** Network shares disconnect silently. The file handle you opened five seconds ago might be dead. Every file operation needs retry logic.
- **Locking.** Other users and processes are reading the same shares. File locks appear and disappear unpredictably. You can't assume exclusive access to anything.

The original version used simple sequential file I/O. The current version opens files with retry logic, validates the connection before starting a batch, and checkpoints progress so a network failure doesn't restart the entire job.

## CPU core management is a real problem

File Processor runs multiple conversion profiles concurrently. Each profile gets allocated a number of CPU cores for its multiprocessing workers. The total cores used across all profiles can't exceed the physical core count.

When a profile finishes, its cores should be available for remaining profiles. When a new profile starts, cores need to be taken from profiles that have more than they need. This is runtime core rebalancing, and getting it wrong means either wasting CPU (cores sitting idle) or oversubscribing (too many workers, context switching kills throughput).

The rebalancer runs on a 10-second timer. It checks which profiles are active, calculates fair shares based on remaining work, and adjusts worker counts. It's about 50 lines of code and it took three rewrites to get right.

## Logging is survival

At 20 million pages, you can't debug by reproducing the problem. The file that caused the crash was processed three weeks ago and has since been moved or deleted. The only evidence is what you logged at the time.

Every file processed gets a log entry with the input path, output path, page count, processing time, and any warnings. Every error gets a full stack trace. The log files are large but searchable, and they've saved me more than any test suite.

## What I'd build differently today

The conversion engines (PDF-to-TIFF, PDF-to-JPEG, JPEG-to-TIFF) shell out to external tools via subprocess. This works but it means spawning a new process for every file, which adds overhead and makes error handling harder. If I rebuilt this today, I'd use pikepdf and Pillow directly in-process for most conversions and only shell out for edge cases that need Ghostscript.

The GUI and the processing logic are tightly coupled. The PyQt5 UI runs in the main thread and communicates with worker threads via signals. This works but it means the tool can't run headless. A clean separation (processing engine as a CLI, GUI as a frontend) would have made it easier to run on servers and to test.

But it processes 20 million pages and counting, so I'm not rewriting it any time soon.
