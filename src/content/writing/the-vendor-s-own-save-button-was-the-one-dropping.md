---
title: "The Vendor's Own Save Button Was the One Dropping Data"
date: "October 2026"
readTime: "8 min"
tags: ["Python", "SQL Server", "Reverse Engineering"]
---

At the office, how a client wants their records delivered (paper, CD, download, OCR, labels and so on) is stored in the vendor's order system as ten on/off flags. Each flag is one byte at a fixed position inside a binary column called `Options`, with no column of its own. The same ten flags exist on three tables: the account, each attorney under it, and each contact under it. The positions are different on every table.

I had to change a client with seven billing accounts. I did the main account the supported way, through the vendor's UI, turning three of those flags on. The other six had to match it, and those I was going to do with a script. That meant writing into the blob with SQL, so I needed to know exactly which bytes to touch.

## A byte map I didn't trust

I had a layout. It came from decompiling the vendor's .NET code and reading off where each field lands in the blob:

```python
# 0-based byte offsets
OFF = {'Customer': {'Paper': 40, 'CD': 41, 'Download': 42, 'Bookmark': 43, 'OCR': 44, 'TOC': 45, 'XraysOnCD': 46, 'EnablePDF': 47, 'Labeling': 11},
       'Attorney': {'Paper': 5, 'CD': 6, 'Download': 7, 'Bookmark': 8, 'OCR': 9, 'TOC': 10, 'XraysOnCD': 14, 'EnablePDF': 15, 'Labeling': 13, 'BateStamp': 12},
       'Contact':  {'Paper': 8, 'CD': 9, 'Download': 10, 'Bookmark': 11, 'OCR': 12, 'TOC': 13, 'XraysOnCD': 6, 'EnablePDF': 7, 'Labeling': 5, 'BateStamp': 4}}
```

The account row has nine entries because its tenth flag is an ordinary column. The account blob is 100 bytes; the other two are 40.

That layout describes the code I decompiled. I wanted to see the running application write those same bytes before I wrote any.

## Watching one save

The save I'd just done by hand would do. That morning at 09:34 I had pulled all three tables to JSON, blobs included as hex, for the comparison work that prompted the change. My save went through at 16:42. So I had a before-image of every row it could have touched. I diffed each row against the live one, byte by byte, and grouped the rows by which positions had changed (account code removed from each line):

```
Attorney rows changed since morning pull: 63
    (9, 13, 15) 61
    (5, 6, 9, 13, 15) 1
    (9, 13, 14, 15) 1
Contact rows changed since morning pull: 161
    (5, 7, 12) 116
    (5, 7, 12, 26) 38
    (5, 6, 7, 12) 5
    (5, 7, 9, 12) 1
    (5, 7, 12, 26, 29) 1
Customer bytes changed: [11, 44, 47] now [1, 1, 1]
```

The three flags I had turned on were labeling, OCR and enable-PDF. On the account those are bytes 11, 44 and 47. On an attorney, 13, 9 and 15. On a contact, 5, 12 and 7. The map was right on all three tables.

The smaller groups are delivery flags too. One attorney lost paper and CD (5 and 6), which I'd set on purpose. Another attorney and five contacts gained x-rays on CD (14 on an attorney, 6 on a contact), and one contact gained CD (9).

Bytes 26 and 29 aren't delivery flags.

## Bytes 26 and 29

In the decompiled map, byte 26 of a contact's blob is whether that person gets due-date status emails. Byte 29 is whether their signature is used. Neither has anything to do with delivery, and I hadn't touched either one. On 39 contacts byte 26 had gone from 1 to 0. One of the 39 also lost byte 29.

I went looking for anything that would have recorded it. There are no triggers on any of the three tables. The application has an audit log table, and it holds no rows for any of the three. The account table has a last-edited user and timestamp. The attorney and contact tables have no audit columns at all. The only record that 39 people had been switched off due-date emails was a JSON file I'd pulled seven hours earlier, and I hadn't pulled it as a backup.

My best explanation is that the UI writes the whole 40-byte blob back from an object in memory, so whatever that object held for 26 and 29 is what got written. I haven't traced the code path to prove it.

## The write

The plan script connects with a read-only login. For every row under the six accounts it works out which flag bytes differ from the target and writes two files: `plan.json`, and a backup holding the full prior blob of every row it would touch. It writes nothing to the database. The plan came to 303 rows: 6 accounts, 117 attorneys, 180 contacts.

The apply script uses a separate login that can write. It goes one row at a time. This is the attorney and contact branch, trimmed:

```python
expected = bytes.fromhex(BACKUP[(table, json.dumps(key, sort_keys=True))]['Options'])
cur_row = read_row(table, key)
if cur_row[0] != expected:
    log(f"SKIP {i}: {table} {key} {r['name'][:30]} changed since plan; not touched"); skipped += 1; continue
new = bytearray(expected)
for f, (a, b) in r['changes'].items():
    new[OFF[table][f]] = b
cur.execute(f"UPDATE {table} SET Options=? WHERE CustomerCode=? AND Code=? AND Options=?",
            (bytes(new), key['CustomerCode'], key['Code'], expected))
if cur.rowcount != 1:
    log(f"STOP {i}: {table} {key} rowcount {cur.rowcount}"); break
after = read_row(table, key)
# ... check the ten flags against the target ...
untouched_ok = all(after[0][j] == expected[j] for j in range(len(expected)) if j not in OFF[table].values())
if not untouched_ok:
    log(f"STOP {i}: {table} {key} a non-protocol byte changed"); break
```

The docstring at the top of that file still says `STUFF`, because the plan was to patch one byte in place in SQL. What the script actually does is build the new blob in Python and write the whole thing, which is probably the same kind of write the vendor's UI does. The difference is where the bytes come from. The new blob is the row's own prior bytes with only the planned positions changed. A row that no longer matches its backup is skipped and logged. The `AND Options=?` in the WHERE carries the exact prior blob, so if the row changes between that check and the UPDATE, the UPDATE matches zero rows and the run stops. After each write the script re-reads the row, checks the ten flags, and compares every other byte against the before-image.

The log from the run, with the per-row lines and the login name cut:

```
17:13:07  APPLY start: 303 rows planned, backup file backup-20260916-171043.json
17:13:07  backup table NOT created (... CREATE TABLE permission denied in database '<db>'. (262) ...); continuing on the JSON backup backup-20260916-171043.json
17:13:19  APPLY done: 303 rows written, 0 skipped, 0 stopped
```

The second line is my mistake. The first version of the script tried to copy the rows into a backup table inside the database before writing. The write login can't create tables, which is correct, and I had no business running DDL on a vendor's database anyway. That block is gone. The JSON file is the backup.

303 rows took 12 seconds. A second client the same evening, one flag across eight accounts, was 92 rows in 4 seconds.

## Putting the bytes back

Twelve days later I ran a plan and apply pair built the same way against the 39 contacts. The plan compares the morning before-image to the current row and restores a byte only where it was 1 before, is 0 now, and isn't one of the ten delivery flags. It read 162 contacts and planned 39. One contact had been added since that morning and had no before-image, so it was left alone. The apply wrote 39 rows, 0 skipped, 0 stopped, between 10:04:39 and 10:04:40.

## Where I stopped

Open orders carry their own copy of the flags, in a different blob, on the order's ship-to rows and again on the ship-to rows of each facility on the order. Changing the client doesn't change orders already logged. A dry run for that same client came to 1,400 rows: 325 at the order level and 1,075 at the facility level.

The apply script for those rows is written and guarded the same way. The layout of that blob comes from decompiled code too, and I have never watched the UI save an order. The script hasn't run. I decided not to update live orders at all.
