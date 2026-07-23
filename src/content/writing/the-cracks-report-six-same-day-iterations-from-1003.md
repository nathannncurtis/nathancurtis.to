---
title: "The Cracks Report: Six Same-Day Iterations From 1003 False Positives To One"
date: "June 2026"
readTime: "7 min"
tags: ["Python", "SQL Server", "Data Quality"]
---

Part of the office's business is producing records: paper, CDs, X-ray discs, whatever a law firm asked for. Almost all of it ships UPS. The one that doesn't is the failure mode that matters, an order gets invoiced with a physical deliverable, and then nobody ever puts it in a box. I built a "cracks" report to find those: orders invoiced more than N days ago, with something tangible billed, that never show up in the UPS ledger. It sounds like a simple join. It took six passes in one day to get the definition of "tangible" right.

## Guess one: trust the invoice text

The invoice line items already had a content classifier, rules-based, no model, built from a live sample of real invoice text. It buckets each line into `cd_or_flash`, `paper`, `misc`, or `no_physical_deliverable` by matching titles like "CD", "Page Count", "Documents made available online" against a small set of regexes. The first cracks gate just asked: does this order's classified content include anything physical?

Run against 14 days of invoices, that produced 1003 candidates. The report exists to catch a handful of orders that fell through the cracks, and instead it flagged nearly everything. The classifier wasn't wrong about content, it was answering the wrong question. An invoice line for "Page Count" tells you paper was billed. It doesn't tell you paper was mailed.

## The "decisive" line that also missed the point

The obvious next move: some invoices have an explicit line like "Documents made available online" or "electronic records." That should be decisive, even when the same invoice also carries processing lines like Bate Stamping or OCR, which describe work done to the pages, not how they left the building. I added `delivered_electronically()`, a regex over line titles, and made it override the content classification:

```python
def is_physical_shipment(lines: list[InvoiceLine]) -> bool:
    if delivered_electronically(lines):
        return False
    return has_physical_deliverable(classify_order(lines))
```

That single change took the 14-day list from 1003 to 69. Ninety-three percent of the noise was orders that had gone out electronically the whole time. It felt like the fix.

It wasn't, and the reason took about five minutes to see once I looked at real orders again: almost everything also goes out online now, but a client can get both an online copy and a physical one. An "online" line on the invoice tells you electronic delivery happened. It says nothing about whether physical delivery also happened. Gating on that line meant a genuinely missed physical shipment could hide behind an unrelated online-delivery line on the same invoice.

## Sales tax was already answering the question

The fix wasn't a smarter regex. It was noticing that the database already recorded the answer, just not in the invoice line text. Tangible records are taxable in the relevant state; an online-only delivery isn't. `TaxableAmount` on the invoice header is a direct, structured signal for "something physical was billed," and it doesn't care what else is on the invoice.

I reverted the electronic-line gate entirely and switched to reading `TaxableAmount` off each invoice header in `recently_invoiced_stops`, then gating cracks on that instead of content inference:

```python
candidates = [
    s for s in invoiced
    if s.taxable and s.stop_id not in shipped and (today - s.invoiced_on).days >= threshold_days
]
```

Content classification stayed in the code, but demoted to a display column, useful for showing a human what's probably in the box, useless as the gate. The list settled at 134. I checked one online-only order by hand and confirmed its taxable amount was zero, correctly excluded, where the old text-based gate would have had to trust an invoice-line pattern to get the same answer.

## The long tail of real exceptions

134 was still too high, and the rest of the day was chasing specific reasons a taxable, unshipped order wasn't actually a crack:

- **Credit-and-reinvoice.** An order billed for paper, then credited (a negative taxable amount) and rebilled as electronic, should net to zero tax across its invoices, not read as two separate signals. Switching the gate to net taxable summed per stop dropped the list to 39.
- **COD holds and standing hand-delivery clients.** Some orders are billed and then deliberately held until the client pays ("ON COD DESK" in the status notes, or a firm-name suffix marking COD customers). A couple of clients never ship UPS at all, they take hand deliveries as a standing arrangement. Excluding both took it to 10.
- **Billing style beat tax alone.** A taxable service fee on an otherwise fully electronic order could trip the tax gate by itself. Adding a second condition, tangible billing style AND net taxable > 0, along with excluding a tax-exempt category of client that delivers non-UPS, fixed that and caught a tax-exempt segment that was also inflating the count. 10 stayed 10 here but for the right reasons; the next fix took it to 9.
- **Content veto as a backstop.** Even tangible-style and taxable, one order turned out to be a taxable upload, records delivered as a file, where the taxable line was for something like an uploaded disc image rather than a shipped disc. If every invoice line is actually electronic or fee-only, the content classifier can veto the tax gate. Down to 9.
- **Delivered-by-courier and a sort-order bug.** Reviewing the final 6 by hand found 5 were already delivered, just not by UPS. A "delivered to client" status note now excludes those. The sixth turned out to be a real gap in the ingest job itself: it was sorting work orders lexically, which floats certain letter-prefixed order numbers to the top of the range and can miss a numeric one that was invoiced more recently. Rebuilding the incremental ingest around invoice date instead of the work-order string fixed that. After both fixes, one order remained. A real crack.

Along the way I also added a dismiss/restore feature: a "not an issue" button on any flagged item, backed by a small table, surviving the daily recompute until someone restores it. That's not detection logic, it's an escape valve for the long tail I'd never fully code for, and it's the reason I stopped chasing edge cases indefinitely instead of adding a seventh, eighth, and ninth refinement.

## Where it landed

Incremental ingest runs every 15 minutes off the invoice-date index. The cracks recompute, which started as a daily job, changed to every 2 hours (`CRACKS_REFRESH_HOURS`) so the report tracks the live ledger through the day instead of showing yesterday's snapshot. Six iterations to get from a naive text match to a tax-based structural signal, plus the exceptions that signal needed. One number stuck around at the end of that day: 1.
