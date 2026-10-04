---
title: "Twenty-Two Bytes That Make an Encrypted File Look Unencrypted"
date: "October 2026"
readTime: "9 min"
tags: ["Python", "File Formats", "Code Review"]
---

The office is building an upload portal for records custodians, the people who send us documents. Some of what they send is password protected. When that happens the portal has to notice, ask for the password in the browser, and strip the encryption before the file is scanned and filed. If it fails to notice, an encrypted PDF lands on the office share flagged as an ordinary document, with no password on record. Nobody finds out until a clerk double-clicks it.

The original detector dispatched on file extension and handed the upload to pikepdf, py7zr, pyzipper or msoffcrypto. That worked, and it also meant four parsers were chewing on raw uploads inside the internet-facing process, before the virus scan. So I moved the parsers into a child process and put a cheap tier in front of them that reads a few bounded windows of the file and returns `(protected, authoritative)`. Authoritative answers are used as they are. Everything else forks the child.

The description on that pull request runs to round eleven. In most of those rounds, review found another way to make the fast tier say `(False, True)` about an encrypted file. The shortest one took 22 bytes.

## The bug, three times

The first cut looked at the leading bytes: `%PDF` means PDF, `PK\x03\x04` means zip. Review found four encrypted files it called unprotected, three of which the old extension dispatch had caught. An encrypted PDF with a scanner banner in front of `%PDF` was one. I fixed it by searching for `%PDF` in the first kilobyte.

Round two's review put an AES zip behind a single NUL byte and an encrypted PDF behind 1,030 bytes. Both came back `(False, True)`. This time I thought I had the real cause: every actual reader locates the container structurally, and I was matching prefixes. A zip is found from its end-of-central-directory record at the end of the file, so I scanned backward for that and made the leading bytes irrelevant:

```python
cd = _zip_central_directory(path, cd_max)  # raises _NotAZip / _ZipUnreadable
if cd is not None:
    return "zip", cd
if head.startswith(_SEVENZ_MAGIC):
    return "7z", None
if head.startswith(_OLE_MAGIC):
    return "ole", None
if _pdf_present(head, tail):
    return "pdf", None
return None, None
```

The docstring said zip went first "because a container that is both (a .docx, or an archive whose first member is a stored PDF) is a zip to every reader."

Round three's review appended this to an encrypted PDF:

```python
# 22 bytes that make any file look like an empty zip.
EMPTY_EOCD = protected._ZIP_EOCD + bytes(18)
```

That is `PK\x05\x06` and eighteen zeros: an end-of-central-directory record for an archive with no members. The zip probe ran first, found the record, read a directory of zero bytes, saw no encrypted members, and returned `(False, True)`. The PDF probe never ran. The same 22 bytes hid a content-encrypted 7z. The extension dispatch I was replacing caught both.

That was three rounds in a row with a false negative in the same function. I had been fixing the files the reviewers named, and each fix moved the failure to the next probe in the order. What survived every fix was that one probe ran first, short-circuited, and was allowed to return a final negative by itself.

## Claims instead of verdicts

So the probes stopped returning verdicts. Each one now returns a claim with a strength, and `detect` combines them:

```python
strong_answers = [a for a in answers if a[1]]
if len(strong_answers) == 1:
    _kind, _strong, (protected, authoritative) = strong_answers[0]
    if authoritative:
        return protected, True
if any(protected for _k, _s, (protected, _a) in answers):
    return True, False
return False, False
```

A negative is final only when exactly one probe claimed the file and its claim was strong. Two claimants, or a weak one, escalate to the child. An empty record is a weak claim and the PDF probe gets its turn, so the 22 bytes stopped working.

That left the question of what makes a zip claim strong. My first answer was a record that lands exactly on end-of-file with a non-empty directory that walks cleanly. Round four appended a real 116-byte archive to an encrypted PDF, which meets both conditions, and it reopened the hole across five formats.

## The number the uploader writes

The fix for that looked principled. A container should only speak for the bytes it covers, and a zip already tells you where it starts. The offset recorded in the record is relative to the archive; the directory's physical position in the file is not. Subtract one from the other and you get the length of whatever sits in front:

```python
prefix = cd_abs - cd_offset
...
return cd_size, cd_abs, total, exact_eof and prefix == 0, prefix
```

Zero for a real archive, 1,221 for the zip appended to a PDF. A zip with a non-zero prefix could no longer make a strong claim.

Round five had one blocking finding. `cd_abs` is structural. `cd_offset` is four bytes in the record that anyone can write. Append the 116-byte archive, overwrite that field with the directory's absolute position, and the subtraction comes out zero for an archive that starts wherever the payload ends. I had written a check for "does this archive start at byte zero" that never read byte zero.

The replacement, `_zip_body_covers_file`, asks the file. The directory has to name a member at archive offset zero, the file has to begin with that member's local header carrying the same name, and the last member has to run up to where the directory starts. The last condition matters more than the first two. A `PK\x03\x04` signature at offset zero is beaten by prepending four bytes, and a matching name by prepending a 38-byte header. Neither trick survives the last condition, because the one member ends forty bytes in and the directory sits a kilobyte later.

## An honest zip that is also a PDF

Round seven's file passed every one of those checks. It was a real zip with one stored member, an encrypted PDF, and the member was named `a` so that `%PDF` began at file offset 31. It starts with a local header, the member runs exactly to the directory, and the record lands on end-of-file. qpdf, which is what pikepdf uses, scans the first kilobyte for `%PDF` and tolerates the directory trailing after `%%EOF`, so it opens the same bytes as a PDF and asks for a password. Uploaded as `deposition.pdf`, it keeps that name onto the share.

The fast tier said `(False, True)` and the module's own library tier said `True`, on the same file.

I downgraded any zip claim that had swallowed another format's signature. Round nine built a three-member stored archive with a 9 KiB cover sheet in front of the encrypted PDF and a 100 KiB annex behind it, which pushed both ends of the PDF out of the windows I searched. So I tried to keep the cheap negative by proving an archive's contents inert: scan every stored member for another format's signature, under a byte budget.

Round ten had three findings against that scan. A PDF whose header reads `@PDF` has no signature to find, and qpdf reconstructs it anyway. A payload written raw but declared as deflated got skipped, because the scan trusted the declared method. And the scan navigated by `extra_len`, `csize` and `lh_offset` on the middle members, which nothing validated.

All of that is data the uploader writes, same as `cd_offset`. Patching those three would have left me waiting for a fourth, so I deleted the scan. A zip claim never settles a negative in the fast tier now. The only zip verdict it gives by itself is a positive, read from the encrypted bit in a central directory it walked end to end. A lie in a header field can cost a child process or an unnecessary prompt, but it can't produce a settled "not protected."

## What that cost

Every `.docx` is a zip, so every `.docx` now forks. On the 24-archive test corpus the escalation rate went from 5 of 24 to 22 of 24. The docstring I left in the module has the bill: the deleted scan cost that corpus 3.5 ms in total, and the library tier over the same archives costs 4.7 s, plus a child process per upload.

That made a second bug matter. Detection children come from a bounded pool with a 5 second wait, and a detection that missed the wait was mapped to `bad_password`: a password prompt on a file that has no password. With nearly every archive escalating, a 100-file batch of ten large zips and ninety `.docx` files measured a worst slot wait of about 4.0 s against that 5 s ceiling, on an idle dev box. I doubled the pool from 8 to 16, which brought the wait to between 2.3 and 2.7 s. I also changed the mapping, so a detection that can't run fails the upload and the uploader is told it "could not be uploaded, remove and add it again."

One of my own numbers was wrong along the way. I had justified scanning a whole file for signatures with a benchmark of 1.37 GB/s. The benchmark searched for one signature with `count` on each chunk. The shipped code searches for four and concatenates a carry buffer every iteration, and it measured 0.51 GB/s, about 17 seconds on an 8 GiB upload in the public process. The scan is capped at 16 MiB now, and hitting the cap escalates.

The last count in the pull request is 503 tests passing, against 276 on main before it. One of the new ones builds an encrypted PDF, appends `PK\x05\x06` and eighteen zero bytes, and asserts the answer is `True`.
