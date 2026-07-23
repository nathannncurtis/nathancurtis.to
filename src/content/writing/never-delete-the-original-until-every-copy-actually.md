---
title: "Never Delete the Original Until Every Copy Actually Landed"
date: "May 2026"
readTime: "5 min"
tags: ["Python", "Windows", "Concurrency", "Reliability"]
---

OCR Puller (Folders) is a Send To shortcut: drop a file on it, and it looks the filename up across the office's OCR archive shares, copies every matching month-folder into your working directory, drops a renamed copy of your original inside each match, then deletes the original from your working folder so you're not left with duplicates. It's one of a family of similar tools (a flat-copy variant, a records finder, a study aggregator) that all follow the same shape. I wrote the first version of this one in a single sitting and caught two ways it could quietly eat a user's input file, both before it ever shipped.

## The fan-out

The core function, `copy_matching_contents`, does three things in sequence: copy every matched folder into the working directory (one worker thread per folder, via `ThreadPoolExecutor`), drop a renamed `"- Copy"` of the original into each newly-copied folder, then delete the original. The delete is the payoff: the user dropped one file, gets back their file distributed everywhere it needed to go, and the working folder doesn't end up cluttered with an orphaned copy.

The first version of that function deleted the original unconditionally, after the loop, with no check on whether anything upstream had actually failed.

## Round 1: the folder-copy guard

Two matched folders, two worker threads, two `shutil.copy2` calls. If the archive share nests deep enough to overflow Windows' `MAX_PATH`, or the network drops a packet mid-copy, `copy_folder_with_contents` raises and that folder never gets added to `copied_folders`. The loop just logs a warning and moves on. Nothing stopped the final `os.remove(original_file_path)` from firing anyway. One folder out of five could fail silently and the user would still lose their only copy of the input.

The round 1 fix compared counts before deleting anything:

```python
if len(copied_folders) != len(matching_folders):
    # Preserve the original so the user can retry or triage manually.
    # Removing it after a partial fan-out would silently lose data when
    # the OCR archive contains paths that overflow Windows MAX_PATH or
    # the network drops mid-copy.
    logger.warning(
        "Not all matched folders copied; preserving original input file",
        extra={...},
    )
    return

try:
    os.remove(original_file_path)
```

Straightforward: if the fan-out was partial, bail before the delete. This felt complete. It wasn't.

## Round 2: the drop-phase gap

The guard only looked at `copied_folders` versus `matching_folders`, which covers the folder-copy phase. But there's a second phase after that: for every folder that *did* copy successfully, the code still has to `shutil.copy2` the renamed original into it. That copy can fail too, for the exact same reasons: a path that overflows `MAX_PATH` once you add the renamed filename, or the same network blip landing on the second write instead of the first.

Picture all five folders copying cleanly, so `len(copied_folders) == len(matching_folders)`. The round 1 check passes. Then the drop into folder three raises `OSError`. That failure was already being logged. It just wasn't being counted anywhere the delete check could see. The original still got removed at the end, and now there's a folder that was supposed to receive a copy of the input but doesn't have one, and no original left to retry from.

The fix tracked a second counter alongside the first:

```python
drop_failures = 0
for copied_folder in copied_folders:
    dest_path = os.path.join(copied_folder, new_filename)
    copy_num = 1
    while os.path.exists(dest_path):
        dest_path = os.path.join(copied_folder, f"{base} - Copy ({copy_num}){ext}")
        copy_num += 1
    try:
        shutil.copy2(original_file_path, dest_path)
    except OSError as e:
        drop_failures += 1
        logger.warning(...)

folder_copy_failures = len(matching_folders) - len(copied_folders)
if folder_copy_failures or drop_failures:
    logger.warning("Partial fan-out; preserving original input file", extra={...})
    return

try:
    os.remove(original_file_path)
```

Same shape as round 1, but now the guard has to see both failure modes before it's allowed to say "everything landed."

## What made this findable

Both bugs came out of the same review pass, minutes apart, on a file that had never been deployed. That's the part worth keeping: the round 1 commit message already says "found in round 1 review," meaning I sat down and asked, for every exit path out of this function, what state does the filesystem end up in. Round 1 answered that question for the folder-copy phase and missed that the function has two copy phases, not one. Round 2 came from asking the same question again, more literally: not "did the folders copy" but "did every write this function makes actually succeed."

The general version of the bug is a delete guarded by a check that covers only part of the operation it's supposed to be guarding. Any function shaped like copy-copy-delete has as many places to fail as it has copy calls, and a guard written against the first one you think of will pass a partial-success case that fails at a later step. The only check that's actually safe is one that counts every write that has to succeed, not the first set of writes you happened to be thinking about when you wrote the guard.

The original file still isn't deleted unless both counters are zero.
