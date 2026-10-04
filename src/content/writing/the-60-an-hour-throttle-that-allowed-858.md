---
title: "The 60-an-Hour Throttle That Allowed 858"
date: "October 2026"
readTime: "8 min"
tags: ["Python", "SQLite", "Security", "Concurrency"]
---

The office is getting an upload portal: a public site where people outside the office send us files, plus a staff page where clerks generate the upload links. The staff page sits behind one shared password, so it has a throttle. An address gets 10 passwords tested in its first ten minutes, then one a minute. That's 60 an hour once the burst is spent, and I wrote that ceiling down in five places, from the docstring to the PR description.

Before launch, every round of that branch went to a reviewer whose job was to break it with probe scripts and bring back numbers. The number that came back for the 60-an-hour limit was 858.

## The slot was two statements

The limiter is a SQLite table of events and two helpers:

```python
def _count(bucket: str, window_min: int) -> int:
    row = db.query_one(
        "SELECT COUNT(*) AS n FROM rate_events WHERE bucket = ? AND created_at >= ?",
        (bucket, db.ts_in(minutes=-window_min)),
    )
    return row["n"] if row else 0


def record(bucket: str) -> None:
    db.execute(
        "INSERT INTO rate_events(bucket, created_at) VALUES (?,?)", (bucket, db.utcnow())
    )
```

The route asked the question, then recorded the attempt a few lines later:

```python
if ratelimit.staff_unlock_limited(ip):
    ...
    return _unlock_page(
        request,
        error="Too many wrong passwords from this location. Wait a minute and try again.",
        status=429,
    )
ratelimit.record_staff_unlock_try(ip)
if not hmac.compare_digest(password.encode("utf-8"), staff_password().encode("utf-8")):
```

`staff_unlock_limited` comes down to a `_count` compared against the limit. `record_staff_unlock_try` is a `record`. Connections are thread-local, and the route is a sync `def`, which Starlette runs in a 40-thread pool. Posts that arrive together read the minute's slot as empty before any of them has inserted, and every one that does gets a password compare.

The probe, from one fixed address:

| concurrency | tested per 1-minute slot | sustained |
|---|---|---|
| 1 | 1 | 60/hour |
| 8 | 4.7 | 282/hour |
| 40 | 14.3 | 858/hour |
| 120 | 14.1 | 846/hour |

It stops climbing past 40 because the pool only has 40 threads.

I had written that slot earlier the same day, to replace a flat refusal. The flat version refused everything after ten wrong passwords in ten minutes, which meant one person's typos paused the whole office, because every clerk reaches the portal through one tunnel address. So I changed "refuse" to "slow to one a minute" and justified it as "the same ceiling a flat refusal gives (~60-70 an hour either way)". The reviewer ran the identical probe against the flat refusal at concurrency 40 and got 0 tested. The flat refusal only reads a count, so there is no write for it to race. Past the burst, my change had raised the sustained ceiling from 0 to about 850 an hour.

The burst half raced the same way one level up. It counted failure rows, and the failure row is written after the compare, so one wave of 40 got 31 tested attempts in a window sized for 10.

## One statement

The fix makes the check and the write one statement:

```python
def _claim(bucket: str, limit: int, window_min: int) -> int | None:
    return db.execute_conditional(
        "INSERT INTO rate_events(bucket, created_at) SELECT ?, ? WHERE "
        "(SELECT COUNT(*) FROM rate_events WHERE bucket = ? AND created_at >= ?) < ?",
        (bucket, db.utcnow(), bucket, db.ts_in(minutes=-window_min), limit),
    )
```

`execute_conditional` returns `cur.lastrowid` if `cur.rowcount == 1` and `None` otherwise, so the caller learns whether its row landed without asking a second question. SQLite admits one writer at a time. Because the INSERT is the first statement in its transaction, the sub-select runs after the write lock is taken and sees the newest committed rows. The database is in WAL mode with `busy_timeout=30000`, so a caller that loses the lock waits for it instead of erroring.

I didn't want to take that argument on faith a second time, so the next reviewer was told to run it past the concurrency I'd tried and across processes too:

| concurrency | 1 | 8 | 40 | 120 | 250 |
|---|---|---|---|---|---|
| tested/slot | 1.0 | 1.0 | 1.0 | 1.0 | 1.0 |
| per hour | 60 | 60 | 60 | 60 | 60 |

Then separate interpreters on one WAL file, in 4x4, 8x8, 16x4 and 2x20 shapes. The number granted, the rows in the table and the limit were equal every time, with zero `SQLITE_BUSY` errors. A correct password hands its slot back with a `DELETE` by row id, so a morning of clerks unlocking legitimately doesn't spend the guessing budget.

The slot doesn't favor the clerk, though. It's shared and nothing arbitrates it. Measured with the atomic slot in place, 12,846 attacker requests over 150 seconds took both slots that opened, and a clerk retrying the correct password every 2 seconds got in zero times out of 75. The docstring says that now. It used to say a clerk racing an attacker "may need a few tries".

## The cap that hid the attacker

The same commit fixed a second finding, and that fix is the one that went wrong.

The staff API had been writing an audit row for every rejected key. A run of 2,000 wrong keys wrote 2,000 rows at 489 rows a second, which is 42 million a day into a table that isn't pruned for seven years. So I sampled: one audit row a minute per address, and ten a minute per action across all addresses. The second ceiling was there because at that point the address came from a request header, and a per-address rule bounds nothing when the caller picks the address.

The next round measured what a ceiling across all addresses does. Seventy seconds, an attacker flooding with a rotating header, and 35 genuine first-attempt failures, each from its own address:

```
branch 1d595e2                              pre-fix 2d913f7
  attacker requests   : 4354                  attacker requests   : 4549
  genuine failures    :   35                  genuine failures    :   35
  ...that LEFT A ROW  :    0                  ...that LEFT A ROW  :   35
```

Holding the ceiling costs about ten requests a minute, and while it's held a real clerk's failed unlock leaves no row. The code I'd replaced flooded the table but recorded everything. Mine recorded none of the real failures for as long as someone kept ten requests a minute going.

The replacement rule was to rate-limit rows and never drop an event. One detailed row a minute per address, and everything held back gets counted and delivered on summary rows written at thresholds that grow by half each time: 13 rows for a 2,000-event burst, 38 for 42 million.

That version had its own hole. It kept the cross-address ceiling as an admin setting, off by default, and the guard that stopped one address from burning that whole budget could be deleted with all 336 tests still green. With the ceiling set to ten and one address sending 200 rejected keys, 9 of 20 other addresses got audited with the guard and 0 of 20 without it. A test pins it now.

## The address was the bug

Every one of these controls keys on the caller's address, and at that point `client_ip()` returned the first entry of `X-Forwarded-For` while uvicorn ran with `--forwarded-allow-ips '*'`. A reviewer made 200 consecutive guesses against the admin login while rotating the header and was never throttled. The same value decided whether a sign-in needed its emailed confirmation link.

Where the address couldn't be forged, it was a constant. The admin panel is published on a host port, so docker-proxy re-originates every connection from the bridge gateway and every caller has the same address. I'd added an address-wide counter of distinct usernames to catch spraying. With one address for everybody, ten made-up usernames and no credentials locked every admin out for rolling ten-minute windows. I dropped that counter.

The header fix is short. `client_ip()` returns `request.client.host` and never reads a header. uvicorn trusts exactly one peer, the proxy's static address. Trusting the subnet would include the bridge gateway, which is the `'*'` again. The proxy overwrites the header:

```
header_up X-Forwarded-For {client_ip}
```

With the address no longer something a caller could choose, the sampler had nothing left to defend against. The cross-address ceiling, the LRU map that counted what was held back, the summary rows and the admin setting all existed for a caller who could mint addresses. I replaced them with this:

```python
def audit_once_per_minute(kind: str, ip: str) -> bool:
    return _claim(_bucket(f"{kind}_audit", ip), 1, 1) is not None
```

It's the same `INSERT ... SELECT` from the first fix, with a limit of one. Four tests pin it. The PR added 153 lines and deleted 1,262.
