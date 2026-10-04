---
title: "Forty Processes, One JSONL File, Six Missing Rows"
date: "October 2026"
readTime: "6 min"
tags: ["Rust", "Python", "Concurrency", "Windows"]
---

The document pipeline at the office got stage tracing this summer. Every stage of a work order (classify, OCR, assemble) appends one JSON line to a trace file when it finishes: a trace id, the stage name, the host, the writer's PID, monotonic start and end, a wall-clock start, a page count and an outcome. Nine fields, the same in every writer. The Python writer exists in three copies, one per service. There's a Rust one inside the OCR worker, and matching ones in C#, a C header, PowerShell, bash and cmd for the parts of the pipeline that aren't wired up yet.

All of them appended to one file per machine per day, `traces-<host>-<YYYYMMDD>.jsonl`. Append mode, one line per record, open and close per write. The writers are measurement only and are never allowed to throw or block, so none of them takes a lock on the file.

## Six of 939

The first run against real data was a 940-page work order, 939 of them OCR'd. The traces found something right away. Where there should have been about 235 rows for four-page OCR chunks there was a single fat `ocr_worker` row, which is how I found out production had been running with pipelined OCR switched off by an old rollback script. With it back on, the same order went from 652.5 seconds to 277.6.

Pipelined OCR is also what put about 40 Rust worker processes in flight at once, all appending to the same daily file. When I counted the rows afterwards, 6 of the 939 `ocr_page` records were gone. That's 0.6%, lost to torn lines. The delivered PDF was unaffected, 940 of 940 pages.

The reader already skipped lines that failed to parse, so nothing crashed. I wrote it up in the PR thread as "noting, not doing." Three days later I opened an issue anyway, because the rows go missing exactly when concurrency is highest, and that's the region I most want to measure.

## One file per process

The fix I picked was to stop sharing the file. Every writer puts its own PID in the filename:

```python
path = directory / f"traces-{record['host']}-{local_date}-{os.getpid()}.jsonl"
```

Same change in every writer: `std::process::id()` in Rust, `$PID` in PowerShell, `$$` in bash, and so on down to cmd, which has to ask PowerShell for its own PID and falls back to `-0.jsonl` if that fails. The record contract didn't change. The reader didn't need a code change either, because its directory glob was already `traces-*.jsonl`, which matches the old shared files and the new per-PID ones.

That last part is where the first review round landed. The machines that had traced before the change still had real data in the old naming, and the only thing promising the reader would keep picking it up was a comment. Someone tidying the glob down to the per-PID shape later would orphan those files without any test noticing. There's now a test that writes one file in each naming into a temp directory and asserts rows come back from both:

```python
old_gen = tmp_path / "traces-TESTHOST-20260803.jsonl"
per_pid = tmp_path / "traces-TESTHOST-20260803-1234.jsonl"
...
stages = {r["stage"] for r in qt.rows_for(trace_id, files)}
assert stages == {"old_gen_stage", "per_pid_stage"}
```

I considered it done.

## It came back inside one process

The next PR in the stack added three finer spans inside the Rust worker, `osd_probe`, `encode` and `ocr_http`, so I could tell encoding time from network time per page. Two of its tests each ran a page through the worker, and they had to be serialized behind a lock. The commit message says why: concurrent guards appending to one per-PID file can interleave a corrupt JSONL line.

The worker runs pages on a rayon thread pool. Per-PID naming had given each process its own file and done nothing about the threads inside it. And the Rust writer did this:

```rust
let result = OpenOptions::new()
    .create(true)
    .append(true)
    .open(&path)
    .and_then(|mut f| writeln!(f, "{line}"));
```

`writeln!` on a bare `File` issues two writes: the body, then the newline. Append mode puts each of those at the end of the file, and between the two another thread's body can arrive. Two bodies end up on one line and neither record parses.

The Python writer never had this shape. It builds the JSON and the `"\n"` into one string and calls `fh.write(line)` once.

The fix is what the Python was already doing, plus a lock:

```rust
line.push('\n');
...
static APPEND_LOCK: Mutex<()> = Mutex::new(());
let result = OpenOptions::new()
    .create(true)
    .append(true)
    .open(&path)
    .and_then(|mut f| {
        let _guard = APPEND_LOCK
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        f.write_all(line.as_bytes())
    });
```

The whole line, newline included, goes out in one `write_all` under a process-global mutex. A poisoned lock is taken anyway, because a panic on some other thread isn't allowed to turn the trace writer into something that throws.

The regression test is 16 threads writing 25 records each into one directory, then reading every line back:

```rust
let parsed: serde_json::Value =
    serde_json::from_str(line).expect("torn or interleaved trace line");
assert_eq!(parsed["stage"], "contention_test");
assert_eq!(parsed.as_object().unwrap().len(), 9);
...
assert_eq!(total, 16 * 25, "every record must survive intact");
```

Against the old `writeln!` it failed readily.

## What I didn't go back and check

The 40 processes in the run that lost six rows were all the Rust worker, and the six rows were all `ocr_page` records, which the Rust worker writes. Every one of those writers was sending its newline as a separate write into a file shared with 39 others. At the time I put the loss down to Windows append semantics across processes, and the issue, the commit message and the README all still say so. Neither the issue nor either pull request records a run of the single-write version against the shared file, so I can't say whether it would have torn at all. Per-PID files make the question moot for anything written since.

## Since then

Pipelined OCR is supposed to start while the render is still running. The traces from September 29 through October 2 covered 948 orders, and in 948 of 948 OCR never overlapped the render, because the file that tells OCR to start was written after the render finished. That was a one-commit fix.
