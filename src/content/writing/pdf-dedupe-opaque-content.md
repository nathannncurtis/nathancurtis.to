---
title: "When Two PDFs Are 'The Same': Hardening a Duplicate-File Detector"
date: "July 2026"
readTime: "6 min"
tags: ["Python", "PDF", "Code Review", "Data Integrity"]
---

At the office we run a pipeline that pulls scanned records off a set of shares, converts them to PDF, and combines them into a chart. Operators routinely file the same record twice: `scan.pdf` and `scan - Copy.pdf`, or `scan (2).pdf`, the shapes Windows Explorer generates when someone drags a file into a folder that already has one. Left alone, both copies get converted and stitched in, and the chart ends up with every page doubled. So I wrote a dedup step that drops the extra copy before conversion ever starts.

I did not want it to be clever. Dropping a genuinely distinct record is the one mistake this pipeline can't take back, so I built it as three stacked gates, all required before anything gets dropped:

1. **Name gate.** The two filenames have to collapse to the same stem and extension once you strip the Explorer suffixes, and only within a single share bucket.
2. **Size gate.** Byte counts have to match exactly or be within 2 bytes, the tolerance for a metadata-only resave.
3. **Content confirmation.** If the sha256 hashes match, done. If they don't but the pair passed the size gate, PDFs get compared structurally.

That third gate is where the interesting part lives. A structural compare exists because scanning software resaves a file and changes a few bytes of trailer or `/Info` metadata without touching a single pixel of the actual page. I didn't want that resave to keep a true duplicate around just because sha256 didn't match. So the structural check walks each page and requires three signals to agree: the extracted text, the sha256 digests of every embedded image in page order (the load-bearing check, since a scan's text layer is empty), and a digest of the raw page content stream, to catch vector-only content the other two can't see.

I shipped it. Then it went to review.

## The blind spot

The reviewer's question was simple: what's on a PDF page that isn't text, isn't an embedded image, and isn't in the content stream?

Three things, it turns out. An annotation's appearance stream. An AcroForm field's `/V` value. An embedded file attachment. None of those live where my three signals look. Text extraction skips annotation text entirely. `read_contents()` only sees `/Contents`, not `/Annots`. An attached file sitting in the document's embedded-file tree isn't part of any page at all.

So picture two copy-named PDFs that are byte-identical except one has a form field holding `01/02` and the other has the same field holding `01/03`, same length, same page geometry, same everything my code actually checked. My structural compare would confirm them as duplicates and drop one. That's not a resave artifact getting cleaned up. That's a distinct record with a different date silently disappearing from the chart.

The fix I landed on: any document carrying annotations, form fields, or embedded files is never structurally equal to anything, full stop, regardless of whether the annotation content matches. Such files dedupe on byte identity or not at all.

```python
def _has_opaque_content(doc) -> bool:
    """Content the page signature cannot see. Errors count as opaque
    (unknown -> unsafe -> keep both files)."""
    try:
        if getattr(doc, "is_form_pdf", False):
            return True
        if doc.embfile_count() > 0:
            return True
        for page in doc:
            if page.annot_xrefs():
                return True
        return False
    except Exception:  # noqa: BLE001
        return True
```

That last `except` matters as much as the checks above it. If probing a document for annotations throws for some unrelated reason, that counts as opaque too. Unknown collapses to unsafe, which collapses to keeping both files. The one thing this function is never allowed to do is fail toward a drop.

I added tests for exactly the case that worried me: two PDFs with identical-looking pages but a differing annotation value refuse to match, and, just as important, two PDFs with an *identical* annotation value also refuse to match, because "carries opaque content at all" is the actual gate, not "the opaque content happens to differ this time." A third test covers embedded files the same way. None of this touches the actual population the check exists for: scanned records, the dominant input type, carry no form fields or annotations, so the metadata-resave case it was built for still works exactly as before.

## The rest of round one

The reviewer also caught two smaller things in the same pass. The sha256 fingerprint step was re-reading the same "kept" file from the share over SMB once for every candidate compared against it, so a share bucket with one kept file and nine near-duplicates meant nine redundant round trips over the network for a single file. I memoized fingerprints in a dict scoped to one dedup run:

```python
def _fp(path: str) -> Optional[str]:
    if path not in fp_cache:
        fp_cache[path] = file_fingerprint(path)
    return fp_cache[path]
```

And the four-share-bucket tuple (`customer_service_directory`, `efax_directory`, `field_docs_directory`, `cnr_directory`) existed twice, once in the dedup module and once in the processor for an unrelated `_skipped/` path mirror. I moved it to `models.SHARE_DIRECTORY_KEYS` as the single source and left the processor's old name as an alias, so a fifth share added later only needs to be added once.

The module docstring originally claimed the three gates meant "a genuinely distinct record can never be discarded." I softened that to describe what the gates actually guarantee, since the whole point of round one was that the previous version of the code made a stronger claim than the code backed up.

## What stuck with me

The bug wasn't in any of the code I was staring at while writing it. It was in the three things I never wrote a check for, because they weren't part of the three signals I'd already decided were the complete list of "what's on a page." The two commits are ten minutes apart in the log: `feat: de-duplicate Windows copy-variant inputs` at 4:43pm, `Round 1: refuse structural PDF equality on opaque content` at 5:02pm. The feature and its blind spot shipped the same afternoon; the fix landed before either one reached anyone who'd notice the difference between a resave and a missing record.
