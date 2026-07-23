---
title: "The Slider Went to Ten, the Semaphore Stayed at Four"
date: "May 2026"
readTime: "7 min"
tags: ["Python", "Rust", "Concurrency", "OCR", "Performance"]
---

The office's scanning tool runs work orders through an OCR pipeline: render each page, classify it, run it through a Rust OCR worker that calls out to a GPU inference server, reassemble the PDF. A couple weeks earlier I'd shipped a PR that raised the operator-facing concurrency slider in the UI from 5 to 10, so operators could run more work orders side by side. Throughput didn't move. Operators were still watching four work orders churn at a time no matter what they picked.

## The semaphore that never got the memo

The slider change touched `MAX_USER_CONCURRENCY`, a constant that bounds what a `StartSessionRequest` will accept. It went from 5 to 10. What it didn't touch was `_WO_MAX_CONCURRENT`, the actual `asyncio.Semaphore` size the backend uses to gate how many work orders run at once. That was still 4. An operator could pick 10 in the UI, the request would validate fine, and the session would silently run at 4 anyway. Nobody threw an error. Nothing logged a warning. The slider was cosmetic.

I found it by grepping for every place a concurrency number gets read. Once I saw the two constants living in different files with no test connecting them, it was obvious how this had happened: two PRs (both mine) touched two knobs that needed to move together, and only one of them did. The fix was one line, `_WO_MAX_CONCURRENT` 4 to 10, plus a test that fails loudly if the two ever drift again: `test_default_wo_max_concurrent_matches_ui_slider_cap`.

A later review round found the same leak one layer up: the Pydantic schema for `StartSessionRequest.concurrency` still had `le=5` from before the slider existed, so operators who picked anything above 5 got a 422 before a session was even created. I replaced the hardcoded bound with a `field_validator` that reads `MAX_USER_CONCURRENCY` directly, so the next time this number moves it only has to move in one place.

## Idle GPUs and a formula that only worked on one box

The Rust OCR worker's default `--threads` was 4. The inference server behind it runs a pool of 16 RapidOCR engines. Four in-flight requests against sixteen engines meant the pool sat at 25% utilization no matter how fast anything else in the pipeline ran. Bumping the default to 16 was the single biggest lever in the whole PR, because it was the one place where capacity already existed and nothing was using it.

Render concurrency needed the same kind of look. The formula was `max(2, min(cpu_count // 2, 8))`, which caps out at 8 threads no matter how many cores the box has. On the office's 48-core GPU server that's most of the machine sitting idle during Stage A. I changed it to `max(4, min(cpu_count - 8, 32))`, reserving 8 cores for the OS, the Rust worker, jbig2, and the event loop, and raising the ceiling to 32.

An external reviewer caught a problem with that formula a few days later: on a 12-core dev workstation, `cpu_count - 8` gives 4, which is worse than the 6 threads the old `// 2` formula gave. The fix was to take the max of both formulas: `max(4, min(max(cpu_count // 2, cpu_count - 8), 32))`. Small boxes keep the old behavior, big boxes get the new ceiling. A parametrized test now pins both ends of that table so nobody "simplifies" it back to a single branch.

## Stop didn't stop anything

The operator's Stop button only ever halted the scanner loop that looks for new work orders to dispatch. Anything already dispatched kept running to completion, including the Rust OCR worker subprocess and the jbig2 children it spawns. An operator would click Stop, watch the UI go quiet, and the machine would keep grinding for however long the in-flight work order took, because nothing had actually been cancelled.

The session now tracks every dispatched task in `_wo_tasks` and cancels them on `stop()`. Cancelling the asyncio task raises `CancelledError` inside the orchestrator, whose cleanup path kills the worker process, and a new `_kill_process_tree` helper walks the child tree too, `taskkill /T` on Windows, `os.killpg` on POSIX, so the jbig2 children don't survive their parent. That only works if the worker is spawned as its own session leader, so the subprocess spawn picked up `start_new_session=True` on POSIX.

The first version of `_kill_process_tree` shelled out to `taskkill` synchronously with `subprocess.run(..., timeout=10)`, called straight from the orchestrator's async cleanup. Under a Stop button that cancels ten work orders at once, that blocked the event loop for up to 10×10 seconds while every cancellation drained one after another. A reviewer caught it in round one. The fix split the helper into a sync primitive kept for tests and an async wrapper that hands the blocking call off via `asyncio.to_thread`. A later pass replaced the flat two-second SIGTERM grace period with a 50ms liveness poll (`os.killpg(pgid, 0)`) so a process group that exits cleanly in 100ms doesn't make the operator wait out the full window anyway.

Two more cancellation bugs turned up later, both in `_unclaim_on_cancel`, the helper that renames a work order's claim file back so it isn't orphaned mid-processing. One was called twice for the same cancellation, once from the retry loop and once from the dispatcher's broader handler, double-incrementing a failure counter. The fix was an idempotency check: `state.status == 'cancelled'` means the helper already ran, so skip it. A round later, that check got flagged: it worked only because this helper happened to be the sole writer of that status string. Any future code that set `'cancelled'` for an unrelated reason would silently skip the cleanup. It became an explicit `_cancel_finalized` set instead, with exactly one writer, so the guarantee lives in a data structure instead of an assumption about who else touches a string.

## What the numbers actually said

I benchmarked the Rust worker's thread count against a mock OCR server, 50 pages, one second simulated latency per call:

| `--threads` | wall time | speedup |
|---|---|---|
| 4 (old default) | 17.3s | 1.0x |
| 8 | 8.9s | 1.94x |
| 16 (new default) | 5.5s | 3.17x |
| 32 | 3.6s | 4.79x |

The classify step got its own fix alongside all this: it was awaiting each batch of pages sequentially before firing the next, so a 200-page work order at batch size 32 meant 7 strictly serial round trips to the classifier before Stage A could hand anything to OCR. A semaphore-bounded `asyncio.gather` (default 8 concurrent, capped at 16) collapses that to about one round trip's wall time. That fix came with its own bug: the progress callback fired outside the lock that protected the completed-page counter, so two batches finishing close together could report progress out of order, the operator's progress bar visibly moving backward. Moving the callback inside the lock fixed it.

Six review rounds on this PR, four of them running in parallel against different slices of the change (cancellation, Rust threads, render concurrency, server defaults), turned up all of the above except the semaphore-versus-slider bug, which is the one that started the whole thing. The backend test suite finished at 733 tests passing, one pre-existing unrelated failure on a Windows path check that predates this PR by months.
