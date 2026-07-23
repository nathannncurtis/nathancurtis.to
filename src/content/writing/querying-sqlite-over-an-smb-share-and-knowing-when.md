---
title: "Querying SQLite Over an SMB Share (and Knowing When to Brute-Force It)"
date: "May 2026"
readTime: "6 min"
tags: ["Python", "SQLite", "Windows", "Tooling"]
---

I built a Send-To utility at the office that pulls matching documents out of a large records archive on a network share. Right-click a folder, choose the tool from the Send To menu, and it goes and finds anything in the archive whose filename matches what's already in that folder. The archive is not small: years of scanned records, organized by year and month, sitting on a file server nobody wants to walk more than they have to.

## The naive version doesn't survive contact with SMB

My first instinct was the obvious one: for each input filename, walk the archive directory tree over the network share and look for a match. That's fine for a handful of files against a local disk. Over SMB, every `os.scandir` call on a subfolder is a round trip, and the archive has enough subfolders that a single-threaded walk takes minutes before you've even started matching anything. Users were sending folders with a dozen files at a time. Minutes per file was not a shippable tool.

The good news is I wasn't the first person to need to know where things live in that archive. A separate staging pipeline already walks it nightly and writes what it finds into a SQLite file sitting on another share: a `file_locations` table with a filename and a full path per row. If that index is fresh, I don't need to touch the archive at all. I need to query a database.

## The URI that isn't obvious

Opening a SQLite file that lives on a UNC path is where it got annoying. The straightforward thing:

```python
sqlite3.connect(r"\\index-srv\share\file_locations.db")
```

throws `unable to open database file`. SQLite's file-locking model assumes POSIX-ish semantics that most SMB shares don't reliably provide, and the driver bails rather than guess.

The fix is SQLite's URI connection form, and it needs two things most people don't reach for on the first try. First, the UNC path has to become a `file:` URI, which means converting backslashes to forward slashes and getting the slash count right: `file:` plus the two slashes for an empty authority, plus the two leading slashes of the UNC path itself, gives you four slashes before the server name.

```python
DB_URI = "file:////" + DB_PATH.lstrip("\\").replace("\\", "/") + "?mode=ro&immutable=1"
```

Second, and this is the part that actually makes it work: `mode=ro&immutable=1`. Read-only mode alone still tries to establish the usual locking dance. `immutable=1` tells SQLite the file will not change out from under it, so skip locking entirely and just read. Since this is a nightly-refreshed snapshot, that promise is true, and the query goes from "fails outright" to fast.

Once the connection opens, the whole lookup phase is one query and an in-memory scan:

```python
with sqlite3.connect(DB_URI, uri=True, timeout=5) as conn:
    cur = conn.execute("SELECT filename, file_path FROM file_locations")
    rows = [(fn.lower(), path) for fn, path in cur.fetchall()]
```

Every candidate match after that is a substring check against a Python list already sitting in memory. Zero additional network round trips for the matching itself.

## Knowing when to stop trusting the index

The index isn't infallible. It's a snapshot from the last overnight run, so anything filed today isn't in it yet, and if the index database itself is unreachable the whole DB-first path has to fail gracefully rather than crash the tool. Either way, some filenames come out of that phase unresolved, and for those there's no substitute for actually looking at the archive.

So phase two is the brute-force fallback: a parallel `scandir` walk of the entire archive, cranked to 128 worker threads. SMB `scandir` calls are latency-bound, not CPU-bound, so the fix for "each call is slow" is "make a lot of them concurrently rather than trying to make each one faster." The tricky part isn't the thread count, it's knowing when the walk is actually done, since you're recursively discovering new directories to submit as you go:

```python
def scan(d):
    try:
        ...
        for sub in local_dirs:
            with cv:
                pending[0] += 1
            executor.submit(scan, sub)
    finally:
        with cv:
            pending[0] -= 1
            if pending[0] == 0:
                cv.notify_all()
```

A pending counter under a condition variable, incremented before every submit and decremented when a scan finishes, with the main thread waiting on the condition until it drains to zero. That's the whole trick for draining a self-expanding fan-out of unknown depth without a fixed job list to `join` against.

## The shape of the whole thing

Two phases, in order of trust: query the pre-built index first, because it costs one round trip and an in-memory scan. Fall through to the aggressive live scan only for what the index missed, because that costs 128 threads hammering a file server. The index isn't the source of truth, the archive is, but treating a slightly-stale index as good enough for 99% of lookups is what keeps the tool from paying the full cost of a live scan every single time it runs.

Whatever doesn't resolve after both phases gets moved into a `NOT IN OPP`-style holding folder rather than silently dropped, so a miss is visible instead of quiet. Matched files get copied in with up to 32 parallel workers, and the originals get renamed with a `- Copy` suffix first, so nothing already sitting in the target folder gets confused with what the tool just pulled in.
