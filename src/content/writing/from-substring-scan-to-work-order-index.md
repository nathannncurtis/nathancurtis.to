---
title: "From Substring Scan To Work-Order Index"
date: "March 2026"
readTime: "5 min"
tags: ["Python", "SQLite", "Performance"]
---

At the office, PDFs land in a folder from a scanner and each one needs to be matched to the right record folder on a network share, then copied there. I wrote the first version of that matcher the lazy way: take the PDF's filename, strip the extension, and run it through SQLite as a substring search.

```python
like_param = f'%{search_term}%'
folder_query = (
    "SELECT 'folder' as type, folder_name, folder_path, source_root "
    "FROM folder_locations "
    "WHERE folder_name LIKE ? AND source_root IN (...)"
)
```

If the database search came up empty, there was a second fallback: walk the enabled root folders live and check every entry name for the search term as a substring, case-insensitive. Two scans, both doing the same imprecise thing: does this string appear somewhere inside that string.

It worked, mostly. It also had the failure mode every `LIKE '%x%'` search eventually has: false positives on any name that happens to contain the search term as a substring, and no way to know a match was wrong until someone opened the wrong folder.

## Noticing the pattern

The filenames and folder names weren't random. Nobody had documented it anywhere, but every record folder and every loose file was named around the same shape: six digits, a dash, two more alphanumeric characters, and sometimes an "OPP" prefix in front of the digits. It wasn't a rule anyone wrote down. It was just how the folders had always been named, informally, for years, by whoever was filing at the time.

Once I saw it, the substring search looked like the wrong tool entirely. I wasn't looking for "does this text appear in that text." I was looking for one specific token that both the incoming PDF and the target folder already had in common. That's an exact-match problem wearing a fuzzy-match disguise.

I wrote a regex for it and dropped it into both files that needed it:

```python
WO_PATTERN = re.compile(r'((?:OPP)?\d{6}-[A-Za-z0-9]{2})')

def extract_work_order(name):
    match = WO_PATTERN.search(name)
    return match.group(1) if match else None
```

## Rebuilding the index around the token, not the name

The indexer (`file_db_builder.py`) used to walk every directory, record every folder and every file by its literal name, and recurse all the way down. I changed what it indexes: if a folder's name contains a work-order token, that folder gets indexed by the token and the walk stops there (`dirnames.clear()`), because everything under a matched folder belongs to that one record and doesn't need its own entries. If a folder's name doesn't match, the walk keeps going, but any loose files sitting in it still get pulled out and indexed by whatever token they carry.

That one change did two things at once. It cut the number of rows going into the database, since a record folder with a few thousand files underneath used to produce a few thousand rows and now produces one. And it made every row in `folder_locations` and `file_locations` keyed on the same token type, which is what made exact matching in the lookup possible in the first place.

## Exact match replaces both search paths

With the index keyed on work-order tokens, the query in `main.py` collapsed from `LIKE ?` with a `%...%` wrapper to a plain `= ?`:

```python
folder_query = (
    "SELECT 'folder' as type, folder_name, folder_path, source_root "
    "FROM folder_locations "
    "WHERE folder_name = ? AND source_root IN (...)"
)
```

`manual_search`, the live filesystem-walk fallback, came out entirely. It existed to catch what the substring index missed, but an exact-match index built from a correct extraction doesn't miss things the same way. What used to be two slow, imprecise passes is now one indexed lookup on a token pulled out of the PDF's own filename with the same regex the indexer used to build the table.

## The bug I caught before it shipped

Old code returned the matched name as the second column of every row and used it directly as the destination filename when copying:

```python
dest_file = os.path.join(dest_folder, name)
```

That was fine when `name` was the original folder or file name. Once I switched the index to store the work-order token in that column instead, this line would have quietly renamed every copied file to its work-order number, discarding the real filename. I caught it by tracing what `copy_matches_to_folder` actually receives now versus what it received before I touched the indexer, and fixed it to pull the real name back off the path instead of the index:

```python
original_filename = os.path.basename(path)
dest_file = os.path.join(dest_folder, original_filename)
```

Changing what a column means breaks every downstream line of code that assumed the old meaning, including the lines that never looked wrong on their own. `name` was still a string in both versions. It just stopped meaning the same thing, and nothing in Python was going to flag that for me. I only caught it because I traced `copy_matches_to_folder` by hand, arguments in, arguments out, before trusting the new index.
