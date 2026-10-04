---
title: "UPS Says Delivered. It Was Delivered Back to Us."
date: "October 2026"
readTime: "7 min"
tags: ["Python", "UPS API", "Data Quality"]
---

The office ships records to law firms by UPS, and I keep a ledger of every package: a service that polls the UPS Tracking API and stores the raw JSON for each box in SQLite. In September I turned on the other direction. When UPS picks a box up, hits an exception, or delivers it, the ledger posts a note onto each order line that shipped in that box, in the vendor's job system. Pickup and exception notes are internal. The delivery note is the one a client can see:

```
Delivered by UPS 06/05/2026 4:01 PM. Signed for by Sam at Front Desk.
```

(The signer names and order numbers in this post are made up, and I've left the tracking numbers out. The codes, wording and scan times for the returned boxes are what UPS sent.)

The cutover was September 1, so boxes shipped in August had no notes. I backfilled the month. The first pass staged 2,954 notes; 798 got through before the vendor's API started answering `429`, and 2,156 bounced. I added a backoff, paced the posts at four a second, and reran it. With the 236 notes September had already produced, the log stood at 3,190 notes, 0 failed.

Then I opened one order to spot-check it, one I already knew was in trouble. UPS had reported that the receiver had moved and that the box would be returned to the sender.

## The order that looked wrong

The first thing I noticed was that the "receiver has moved" note was on the order twice, and I thought the backfill might have run twice. It hadn't. The real problem was a few notes further down: Delivered by UPS, signed for by Pat at Front Desk.

Pat works at our front desk.

Here is the part of UPS's response for that box that matters:

```json
"currentStatus": {"description": "Returned to Sender", "code": "034"},
"deliveryDate": [{"type": "DEL", "date": "20260827"}],
"deliveryTime": {"type": "DEL", "endTime": "105433"},
"deliveryInformation": {"receivedBy": "PAT", "location": "Front Desk"},
"activity": [
  {"date": "20260827", "time": "105433",
   "status": {"type": "D", "code": "UA", "description": "Package was returned to the sender "}},
  {"date": "20260827", "time": "101052",
   "status": {"type": "I", "code": "OT", "description": "Out For Delivery Today"}}
]
```

UPS records a return to sender as a delivery. The box goes out for delivery at 10:10, someone signs for it at 10:54, and the activity gets type `D` with a `DEL` delivery date and a signer. All of that is true. The address it was delivered to is ours.

My event code had one rule for deliveries:

```python
# delivered
for at, typ, code, desc, city in scans:
    if typ == "D":
        events.append(Event(
            "delivered", _ts_key(at), at, code=code, text=desc,
            signer=signer, location=location, city=city, **common,
        ))
```

Type `D` means delivered. I had decided that in August, looking at the 120 real packages in the ledger at the time.

## How far it went

I wrote a read-only script that joined every posted `delivered` row back to its stored UPS JSON and looked for a `D` scan with return wording or the `UA` code:

```
4 mis-posted delivered notes:
  OPP123456-02   Delivered by UPS 08/10/2026 12:05 PM. Signed for by Pat at Front Desk.
  OPP234567-03   Delivered by UPS 08/27/2026 10:54 AM. Signed for by Pat at Front Desk.
  OPP234567-08   Delivered by UPS 08/27/2026 10:54 AM. Signed for by Pat at Front Desk.
  OPP234567-11   Delivered by UPS 08/27/2026 10:54 AM. Signed for by Pat at Front Desk.
```

Two boxes, two orders, four notes. One of the boxes carried three lines of the same order, and each line got its own note. No other posted delivery matched.

The ledger had the same bug on the read side. It set `delivered_at` from any `DEL` date, so seven packages in the database had a delivery time for a box that had come back to us. Two of those seven were the ones with posted notes.

The thing that posted the four notes couldn't take them back. The vendor's API has one endpoint to add a note and two to read them. There is no update and no delete, and the ledger is read-only against the vendor's database by design. I fixed the four myself.

## Fix one: name the return

A `D` scan with return wording, or the `UA` code UPS put on this one, becomes its own event kind:

```python
_RETURN_WORDS = ("returned to the sender", "returned to sender", "return to sender", "returned to shipper")

def is_return_scan(desc: str | None, code: str | None = None) -> bool:
    d = (desc or "").lower()
    return any(w in d for w in _RETURN_WORDS) or (code or "").upper() == "UA"
```

A `returned` event posts an internal note saying the package came back to the office and was not delivered to the client. It never carries the signer. The ledger's parser got its own version of the check, so a return is stored as an exception with no `delivered_at`. Two new tests, both built from the JSON above. That commit went in at 8:59.

## Fix two: only the exact word

Twelve minutes later I committed a second one, because the first fix had the same shape as the original mistake. I had seen one return, written down its wording and blocked it. The exception-code table had already shown me how well I guess UPS's vocabulary. I had filled in codes like `RF` and `RS` by guessing, and the dry run for the backfill logged `unknown UPS exception code` for `A7`, `A8`, `MF`, `C6`, `ZO` and five others. That's ten codes in one month of real traffic that my table didn't have.

So the delivery path now works the other way around. A scan produces a client-visible note only if UPS's description is exactly the word "delivered":

```python
def is_plain_delivery(desc: str | None) -> bool:
    return (desc or "").strip().lower() == "delivered"
```

```python
if is_return_scan(desc, code, city, origin_city):
    events.append(Event("returned", ...))
elif is_plain_delivery(desc):
    events.append(Event("delivered", ...))
else:
    log.warning("writeback: unfamiliar UPS D scan %r (code %s) for %s; posting as internal note",
                desc, code, pkg.get("trackingNumber"))
    events.append(Event("delivery_other", ...))
```

Anything else UPS files under `D` posts internally with UPS's own text, and logs a warning so I find out about it. "Delivered to UPS Access Point" is the case in the test.

`is_return_scan` also grew a third condition. The tracking response includes the origin address, and each scan has a city. If a `D` scan's city equals the origin city, it's a return, whatever the description says:

```python
return bool(city and origin_city and city.strip().lower() == origin_city.strip().lower())
```

That one is there for the day UPS rewords the return scan to a plain `DELIVERED`. It also means a real delivery to a firm in the office's own city posts as an internal "returned" note, and the client never sees it.

Before deploying I ran the new derivation over every package in the ledger that had stored UPS JSON:

```
{'picked_up': 1863, 'delivered': 1817, 'exception': 137, 'returned': 7}
```

1,817 plain deliveries, 7 returns, and no `delivery_other` at all. Seven is also the number of packages the wording check had already corrected in the ledger.

## The duplicate I noticed first

The doubled "receiver has moved" note was a separate bug. Exceptions were keyed by `(code, date)` so that a second, different exception on the same box would still post. UPS repeats the same exception on consecutive days, and each day made a new key. The key is now just the code. An audit of all 3,190 notes found five order lines with the same exception note on them more than once, all internal.

The suite went from 126 tests to 130 that morning: one for the `429` backoff, two built from the real return JSON, one for the exact-match rule and the city rule. The August report now lists both boxes as returning to us, still in exception.
