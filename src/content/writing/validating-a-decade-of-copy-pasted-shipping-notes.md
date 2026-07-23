---
title: "Validating A Decade Of Copy-Pasted Shipping Notes Before Building On Them"
date: "June 2026"
readTime: "5 min"
tags: ["Python", "SQL Server", "Data Validation"]
---

The office ships physical records to law firms every day: paper, or a CD/flash drive with scans, video, x-rays, whatever the request calls for. One shipping station, one UPS account, and for at least a decade the only record of any of it has been a free-text note typed into an order in our internal case-management system at label-print time. The note looks like this:

```
Shipped.  Tracking # 1Z1234560100000014
```

(that's an illustrative number, not our real account prefix)

I wanted to build a ledger on top of these notes: group the ones that share a tracking number into a package, join that against the invoice to know what shipped, then report on packages that should have shipped and didn't. All of that only works if a decade of copy-pasted notes actually says what everyone assumes it says. So before writing a single reporting query, I wrote the thing that checks the assumption instead of trusting it.

## The parser is the validator

`parse_tracking_note` takes one note's text and returns a structured verdict, not just a tracking number. Every legitimate number starts with a fixed shipper prefix specific to our account, so a well-formed UPS number that doesn't match it gets flagged as `prefix_mismatch` rather than silently accepted or silently dropped. A number with the right prefix but a check digit that doesn't verify gets `checkdigit_fail`. A note that mentions "track" or "shipped" or "UPS" but yields no valid number gets `parse_failed`. Only a note with exactly one valid, correctly-prefixed number is `parsed_ok`.

The check digit is UPS's MOD-10 algorithm: sum the digits in odd positions, add twice the sum of the even-position digits, and the check digit is whatever rounds that total up to the next multiple of ten.

```python
def ups_check_digit(number18: str) -> bool | None:
    if len(number18) != 18 or not number18[:2].upper() == "1Z":
        return None
    body = number18[2:17]
    check = number18[17]
    if not (body.isdigit() and check.isdigit()):
        return None
    odd = sum(int(body[i]) for i in range(0, 15, 2))
    even = sum(int(body[i]) for i in range(1, 15, 2))
    total = odd + even * 2
    computed = (10 - (total % 10)) % 10
    return computed == int(check)
```

That function alone turns "looks like a tracking number" into "is a tracking number," which matters because these notes were typed by hand-adjacent processes for years: barcode scans mostly, but copy-paste and line-wraps happen. A single transposed digit in a hand-verified number now fails loudly instead of quietly pointing at the wrong package.

## Never silently drop

The rule I kept coming back to while writing this: a note that looks like it's about shipping and doesn't parse cleanly has to show up somewhere, not vanish. Two examples of that rule in the code. First, a tracking number that's split across a line wrap or a stray space gets recovered by a looser regex pass, but the result is marked `recovered=True` so the eventual report can quantify exactly how much of the history needed cleanup rather than just silently fixing it and moving on. Second, if a note contains two distinct valid tracking numbers, that's `multiple_tracking`, flagged for a human to look at, not resolved by picking one arbitrarily.

The parser doesn't emit a tracking number and a boolean. It emits a status enum, the list of every candidate number found in the note (good, bad, and recovered), and a tuple of human-readable reasons, specifically so a `parse_failures.csv` and a `parse_summary.md` can be generated straight from a full-history run: counts by outcome, a clean-parse-rate percentage, and a failures-by-year table to see whether the note format drifted in some particular era. That report is the actual deliverable of this first commit. The ledger doesn't get built until someone can look at that report and believe the assumption holds.

## Testing against data that isn't real yet

The production database is read-only from where I develop and I'm not pulling a decade of real notes onto my laptop to iterate against. So the test suite (27 tests total between the parser tests and the backfill tests) runs against hand-built and generated cases instead: a synthetic-corpus generator seeds a batch of clean notes plus deliberately messy ones layered on top (lowercase drift, whitespace splits, a foreign shipper prefix, a corrupted check digit, two numbers in one note, notes that only sound like shipping) so the parse-failure report has something real to prove itself against before it ever touches the production notes.

The read path against the actual database gets its own paranoia, because that database is a live production system with no read replica and a history of unindexed queries causing company-wide slowdowns. Every query in the reader uses `WITH (NOLOCK)`, leads with the indexed work-order column, and binds work-order parameters explicitly as `SQL_VARCHAR`. That last one isn't decoration: the work-order column is `char`, and pyodbc binds a Python string as `nvarchar` by default, which silently forces an implicit conversion on every row and turns what should be an index seek into a full scan of a table that's anything but small. It's the kind of trap that's invisible until a query plan shows it, so instead of waiting to rediscover it, every query in the module binds work-order values as `SQL_VARCHAR` up front.

There's exactly one kind of SQL statement anywhere in this reader: `SELECT`. No `INSERT`, no `UPDATE`, no `DELETE`, nothing that touches the source database at all. That was a design requirement going in, and it's also the easiest thing in the whole project to verify: grep the file for a write statement and come up empty.
