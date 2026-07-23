---
title: "Stop Crawling the Whole Archive Once You've Found a Match"
date: "September 2025"
readTime: "6 min"
tags: ["Python", "Concurrency", "Windows", "Automation"]
---

I built a Send-To tool for the office: drop a batch of files onto it, and it goes and finds the already-OCR'd copies of those same files sitting somewhere in the processed-records share. The share is organized by date, something like `\\server\ocr_processed\<year>\<MM-YYYY>\<MM_DD>\...`, years of daily batches stacked in folders. The tool's whole job is: given a filename, figure out which day's folder it landed in, without anyone telling it which day that was.

My first pass at that search got the job done and did far more work than it needed to. The rewrite, a day later, is the more interesting version.

## Five phases, no early exit

The first cut was a `phased_search` function fed a list of phases: previous business day, current month, previous month, entire year, full archive. Each phase's `get_dirs` callback found the relevant folders, searched them with a `ThreadPoolExecutor`, and added whatever it searched to an `exclude_dirs` set so later phases wouldn't repeat work.

The bug wasn't a crash. It was in the docstring: "collecting all matching folders without stopping at the first match." The loop ran every phase, every time, no matter what it found. If the file showed up in yesterday's folder, the code still went on to open the current month, the previous month, all of 2025, and the full archive, recursively walking every subfolder in each. Finding a match on the first phase cost the same as finding nothing at all.

The "previous business day" phase alone was rough: `find_previous_business_day_folders` checked all 366 days back, submitting an `os.path.isdir` call for every day times every server share to an unbounded `ThreadPoolExecutor`, for every single file, one file at a time, in a plain `for` loop in `main()`.

## Checking one day before checking all of them

The rewrite (`find_incremental_business_day_folders`) checks the last 7 days one at a time, oldest work first, and bails the moment something turns up:

```python
for fut in as_completed(futures):
    result = fut.result()
    if result:
        matches.extend(result)
        # Cancel remaining futures since we found matches
        for remaining_fut in futures:
            if not remaining_fut.done():
                remaining_fut.cancel()
        break
```

Only if none of the last 7 days produce anything does it fall back to sweeping the rest of 2025, with a 16-worker pool that checks all the remaining day-folders exist before searching only the ones that do. `incremental_search` then chains phases the same way `phased_search` used to (current month, previous month, full archive) but every phase now returns as soon as it has matches instead of accumulating from all of them. The typical case, a file OCR'd yesterday or last week, now touches a handful of folders instead of the entire share.

## Parallelizing the files, not just the folders

The commit message calls this "process in parallel with assigned workers," which is the other half of the change. The old `main()` looped over each dropped file, called `phased_search`, copied whatever it found, then moved to the next file. If one file's search fell through to the full-archive phase, every file after it in the batch waited.

The rewrite builds the whole task list up front and assigns each file a worker slot before anything runs:

```python
search_tasks.append({
    'base_name': base_name,
    'search_name': search_name,
    'assigned_worker': len(search_tasks) % 8
})
```

Then it runs all of them through one `ThreadPoolExecutor(max_workers=8)` and processes results as they land via `as_completed`, copying matched files and printing a worker-tagged status line the moment each search finishes, rather than waiting on the batch in file order.

That second change is really what "designing and over-designing" comes down to here: the first version had already over-invested in a phase system that dutifully searched everything every time, and the fix wasn't a smarter search so much as two separate, boring decisions: stop looking once you've found it, and don't make one slow file block the rest of the batch.

## A smaller fix nearby

One commit earlier, a search directory's hostname got swapped for its raw IP address, with a commit message that just says it was "for non-headache DNS resolution." Whatever was wrong with name resolution on that particular share, hardcoding the number made the flakiness go away. Small, unglamorous, and it stayed that way through the parallel rewrite because nobody had time to fix DNS properly and the tool had files to find.

The version I shipped that day still prints its way through four possible phases in the worst case: last week, the rest of the year, last month, the whole archive. Most files, though, never see past the first `as_completed` loop; the fallback code exists for the ones that do, and it's the only part of the search that still walks the entire dated folder tree instead of one week of it.
