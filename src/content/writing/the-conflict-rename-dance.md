---
title: "The Conflict-Rename Dance"
date: "March 2026"
readTime: "5 min"
tags: ["Concurrency", "File Systems", "Python"]
---

I built an internal tool that takes an incoming PDF named for a work order, hunts a shared network drive for any folders or files that match that work order number, and drops copies of everything it finds into a results folder next to the original. Then it moves the original PDF into that same results folder so the whole thing is self-contained.

The interesting part isn't the matching. It's what happens when the results folder already has a file with that name in it, because the same work order got processed twice, or because someone reran the tool on the same input. That single edge case took four commits over a week to actually get right, and three of those four happened within eighteen minutes of each other on the same morning.

## Renaming the wrong file

The first version, from a commit a week earlier, handled the conflict by calling a helper called `unique_name()` on the destination path before moving the new PDF in:

```python
if os.path.exists(dest_path):
    dest_path = unique_name(dest_path)
if os.path.exists(original_path):
    shutil.move(original_path, dest_path)
```

`unique_name()` just appends `(1)`, `(2)`, and so on until it finds a name that doesn't exist. The bug is which file gets the suffix. This renamed the *incoming* file, meaning the freshly processed PDF ended up as `work_order (1).pdf` while whatever was already sitting in the folder kept the clean name. That's backwards. The file someone just looked for is the one they want to find by its plain name; the older, possibly stale copy is the one that should get pushed aside.

So the next commit flipped it: move the existing file out to a temp path, compute a unique name for it, move it back under that new name, then let the incoming PDF take the now-empty original path.

```python
conflict_tmp = os.path.join(tmp_dir, f"conflict_{pdf_name}")
shutil.move(dest_path, conflict_tmp)
renamed = unique_name(dest_path)
shutil.move(conflict_tmp, renamed)
```

That felt right and shipped. I moved on for six days.

## The check that checked nothing

Coming back to it, I noticed `unique_name(dest_path)` in that snippet runs *after* `shutil.move(dest_path, conflict_tmp)` has already vacated `dest_path`. `unique_name()` decides whether a name is taken by calling `os.path.exists()` on it. By the time it runs, the path it's checking doesn't exist anymore, because the line above just moved the only file that was there. So the function reports the plain name as free and hands back `dest_path` unchanged. The rename does nothing. The old file gets moved right back onto the exact path it just left, and then the incoming PDF overwrites it a moment later, which is precisely the data loss the whole change was supposed to prevent. I'd fixed the direction of the bug and reintroduced it in the same breath, just one line further down.

While tracking that down I found a second copy of the same overwrite problem in a completely different function, the one that copies an entire matched *folder's* contents rather than a single PDF. It had no conflict handling at all:

```python
if os.path.exists(dest_file):
    conflict_tmp = tempfile.mkdtemp(prefix="rf_conflict_")
    tmp_copy = os.path.join(conflict_tmp, file)
    shutil.copy2(src_file, tmp_copy)
    renamed_dest = unique_name(dest_file)
    shutil.move(tmp_copy, renamed_dest)
    shutil.rmtree(conflict_tmp, ignore_errors=True)
    file_count += 1
    continue
```

That one went in first, at 9:44am. Fifteen minutes later I fixed the self-defeating check in the PDF-move path by computing the renamed path from the original filename before touching anything, instead of asking a function that only knows how to lie about it once the original is gone:

```python
base, ext = os.path.splitext(dest_path)
renamed = f"{base} (server){ext}"
conflict_tmp = os.path.join(tmp_dir, os.path.basename(renamed))
shutil.copy2(dest_path, conflict_tmp)
os.remove(dest_path)
shutil.move(conflict_tmp, renamed)
```

That also switched from `shutil.move` to `shutil.copy2` followed by an explicit `os.remove`, so a network hiccup mid-operation leaves the original file intact instead of losing it in transit.

## Then I second-guessed the suffix

Three minutes after that, one more commit: `(server)` was a fine label but it didn't match the `(1)`, `(2)` style the rest of the tool already used for stacked conflicts, so I swapped it for a small counting loop that lives entirely inside this one code path instead of calling out to the shared `unique_name()` again:

```python
renamed = f"{base} (1){ext}"
counter = 1
while os.path.exists(renamed):
    counter += 1
    renamed = f"{base} ({counter}){ext}"
```

The loop runs before anything is removed, which is the property that mattered. `unique_name()` itself wasn't broken; calling it after clearing the path it was checking was.

Four commits, one work order's worth of files at stake each time: `177595f` on March 17 at 11:58pm, then `6933bd4`, `374e8ac`, and `dcce531` back to back on March 23 between 9:44 and 10:02am. The lesson wasn't about network shares or race conditions between processes. It was about running an existence check after the thing it's checking has already been moved out from under it, which is a much more mundane way to lose a file than anything a second process could do to you.
