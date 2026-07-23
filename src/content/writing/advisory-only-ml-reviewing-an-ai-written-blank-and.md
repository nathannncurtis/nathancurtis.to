---
title: "Advisory-Only ML: Reviewing an AI-Written Blank and Duplicate Page Detector"
date: "May 2026"
readTime: "6 min"
tags: ["Python", "Machine Learning", "Code Review", "Document Processing"]
---

Our document pipeline already runs a page classifier: every scanned page gets sorted into a type before it moves downstream. A teammate wanted to add a second, unrelated model next to it: DINOv2-small, computing a 384-dimension embedding for every page. Two uses for that embedding. Compare it to a set of precomputed blank-page templates by cosine similarity, and flag the page as possibly blank. Compare every page in a work order to every other page, and flag near-duplicates. Nothing gets removed automatically. The flags show up in the classification manifest, and a person decides whether to act on them.

The PR was built largely with Claude, and my job was reviewing it. Two rounds of feedback, four real issues, and none of them showed up in the 302 passing tests that shipped with the first version. They showed up from reading the diff.

## A silent drop, twice fixed

The embedding client posts a batch of page images to `/api/v1/embed-batch` and gets back a list of results keyed by page number. The first version mapped results by ID and moved on:

```python
results_by_id = {r["image_id"]: r for r in data["results"]}
embeddings = [PageEmbedding(page_number=pn, embedding=...) for pn, _ in images]
```

If the server returned fewer results than pages sent, in a batch of 32 that's a plausible partial-timeout scenario, this silently produced embeddings for whichever pages happened to be present and said nothing about the rest. No error, no flag, no way to know later which pages never got checked for blank or duplicate status.

Round one fixed it by counting: if `len(results_by_id) != len(images)`, return `None` from the batch call, which the caller already treats as "skip embedding analysis entirely." Safer, but it meant a single dropped page killed analysis for the whole work order and there was no retry, since `None` looked identical to any other failure. Round two changed `_send_batch` to raise `ValueError` on the mismatch instead. That routes it through `_embed_batch_with_retry`, which already does exponential backoff for exactly this kind of transient failure. Three attempts at the same bug, each one narrower: silent loss, then a blunt full skip, then a retry that only gives up if the mismatch is persistent.

## O(N²) in a page-count problem that scales

Duplicate detection needs the pairwise similarity between every page in a work order, which for N pages is already an N×N matrix. The first pass then walked that matrix with nested Python loops to find pairs over threshold. The fix uses numpy directly on the matrix it already had:

```python
pairs = np.argwhere(np.triu(sim_matrix, k=1) >= threshold)
for i, j in pairs:
    union(int(i), int(j))
```

`np.triu(sim_matrix, k=1)` zeroes the diagonal and the lower triangle so each pair is only counted once, and `argwhere` returns just the `(i, j)` indices that clear the threshold. The union-find that groups those pairs into duplicate clusters still runs in Python, but it only touches actual matches instead of every cell.

## The refactor that almost reintroduced a memory leak

Before this change, `_classify_pages` rendered PDF pages to images in batches and closed each batch's images in a `finally` block right after classifying it. Adding the embedding stage meant rendering needed to happen earlier too, so pages could be embedded before classification. The obvious refactor: pull rendering into a shared `_render_pages` method, call it once, and pass the same list of already-rendered images into both the embedding stage and the classifier.

That refactor quietly dropped the per-batch cleanup. When embeddings are on, the caller who rendered the pages is responsible for closing them once, after both stages finish. But the code path where embeddings are off still calls `_classify_pages` without pre-rendered pages, meaning it renders internally, batch by batch, the way it always did, and needs that same `finally` cleanup it used to have. The fix keeps the cleanup, gated on ownership:

```python
if rendered_pages is None:
    for img in batch_images:
        try:
            img.close()
        except Exception:
            pass
```

Pre-rendered images are the caller's to free once, at the end. Self-rendered images are freed after each batch, same as before the refactor touched anything. Get that gate backwards and either every page image for the whole work order sits in memory across the entire classification loop, or images the embedding stage still needs get closed out from under it.

## An advisory model still needs an integrity check

The classifier already refused to load its ONNX model without a matching `.sha256` hash file. The embedding model didn't have that check at first, on the reasoning that it's advisory: nothing acts on its output automatically, so a compromised model can't directly cause harm. That reasoning doesn't hold up. An attacker able to swap the `.onnx` file can just as easily delete the hash file next to it, and a poisoned embedding model could push blank or duplicate flags in either direction, toward hiding a page that should get flagged or toward burying a reviewer in false positives until they stop trusting the flags. So the inference server now refuses to load the embedding model at all if its hash file is missing, the same policy as the classifier, no exception for "it's just advisory."

## What shipped

29 files, roughly 2,260 lines added. Blank detection defaults to a cosine similarity of 0.92 against the templates; duplicate detection defaults to 0.97, set high on purpose because near-identical scans of the same page typically land at 0.99 or above, while merely similar pages (a fax and a clean copy of the same form, say) sit around 0.93 to 0.96. Both defaults are marked in the config as starting points to calibrate against real work orders once templates exist. The feature defaults off, and if the server is unreachable or a batch fails after retries, the whole embedding stage returns `None` and the pipeline runs exactly as it did before this PR existed. 303 tests passing by the end, one more than the 302 the branch shipped with. The number that matters more is four: real bugs a second pair of eyes caught before any of them touched a real page.
