---
title: "When the Index Is Stale: A Parallel Filesystem Walk as a Last-Resort Fallback"
date: "May 2026"
readTime: "6 min"
tags: ["Python", "Concurrency", "Windows", "Automation"]
---

I maintain a small tool at the office that matches incoming request PDFs to an original record they depend on. Each PDF's filename encodes a request number. The tool resolves that number through SQL Server to find the case stop it belongs to, something like `658534-01`, then looks that stop up in a local index: a SQLite database that maps filenames to their full path on the records archive share. If the lookup succeeds, the tool copies the original file alongside the new one. If it doesn't, the PDF gets moved to a `NOT IN PDF ARCHIVE` folder and someone has to go find it by hand.

That index is a copy, not a live view. It gets rebuilt periodically from whatever's actually on the archive share, and between rebuilds it can be wrong two ways: a case that was filed since the last rebuild just isn't in there yet, or an entry points at a path that's since moved. Either way, the tool reports "not in DB" for a file that is, provably, sitting right there on the network.

## The lazy fix would have been per-file

The easy version of a fallback is: on a miss, walk the archive share looking for that one filename. I didn't want that. The archive share holds years of records, organized by year and then by month, and a single miss walking the whole thing top to bottom is a bad trade for one file. Worse, a batch run through the tool regularly produces a dozen or more misses in the same pass, mostly for the same underlying reason (the index just hasn't caught up yet). Walking the tree once per miss meant redoing the same directory listings a dozen times over.

So instead of a fallback per file, I built a fallback per batch. The resolve phase now returns four things instead of three: `(opp_number, success, detail, original)`, where `original` is the resolved case stop even when the file lookup itself failed. That's the piece that used to get thrown away on failure. Every miss that got far enough to have a resolved case stop becomes a `fallback_candidate`. Once every PDF in the batch has run through resolution, the candidates get collected into one set of "needles," and one parallel walk goes looking for all of them at once.

```python
work_units = []
years = sorted(
    (e.path for e in os.scandir(root)
     if e.is_dir() and e.name.isdigit() and len(e.name) == 4),
    reverse=True,
)
for year_path in years:
    months = [e.path for e in os.scandir(year_path) if e.is_dir()]
    if months:
        work_units.extend(months)
    else:
        work_units.append(year_path)

with ThreadPoolExecutor(max_workers=max_workers) as ex:
    list(ex.map(scan, work_units))
```

Month folders are the unit of parallelism, not year folders, because a handful of year directories doesn't give sixteen worker threads much to do. Years are sorted newest first, because the requests coming through the tool skew recent. If everything you're looking for happens to be from this year, you want those threads scanning January 2026 before they bother with 2019.

## Stopping as soon as you can

The other piece is early termination, and it needed a small amount of care because `scan()` recurses into subdirectories and multiple worker threads are running it at the same time against a shared `found` dict:

```python
found = {}
lock = threading.Lock()

def done():
    return len(found) >= len(needles)

def scan(path):
    if done():
        return
    entries = list(os.scandir(path))
    subdirs = []
    for entry in entries:
        if entry.is_file(follow_symlinks=False):
            name = entry.name.lower()
            if name in needles:
                with lock:
                    if name not in found:
                        found[name] = entry.path
                        if done():
                            return
        elif entry.is_dir(follow_symlinks=False):
            subdirs.append(entry.path)
    for sub in subdirs:
        if done():
            return
        scan(sub)
```

The `done()` check happens before every directory listing and again before recursing into every subdirectory. That matters more than it looks: once fifteen of sixteen needles turn up in the first few month folders, the sixteenth thread doesn't need the other fifteen threads to notice and stop, each one checks for itself on every step down the tree. Matching is done on the lowercased filename because the index sometimes disagrees with the filesystem on case, and Windows doesn't care either way.

The lock only guards the write to `found`, not the read in `done()` or the scan loop itself, so there's a small window where two threads could both find the same file and both take the `if name not in found` branch before either writes. That's fine here: the write is idempotent, the same path gets written twice at worst, and nothing downstream cares about a duplicate assignment to the same key.

## Zero-cost when the index is right

Everything above only runs when `fallback_candidates` is non-empty. If every PDF in the batch resolves through the index normally, `aggressive_search` never gets called, and the tool costs nothing beyond what it always cost. That was the one requirement I didn't want to compromise on: this is a fallback for a failure mode that happens sometimes, not a new default path that taxes every run to protect against a problem most runs don't have.

The commit that shipped this touched four files and came out to 152 lines, most of them in the new `aggressive_search` function and the batching logic in `main()`. It bumped the tool from 1.19 to 1.20. Filenames it fails to place after both the index lookup and the filesystem walk now say so explicitly, "not in DB or on the archive share," instead of just "not in DB," which mattered more than the code did: it tells the person clearing that folder by hand whether it's worth checking the archive again themselves, or whether the file genuinely isn't there yet.
