---
title: "The Reaper That Learned to Check for a Pulse"
date: "July 2026"
readTime: "7 min"
tags: ["Python", "SQLite", "Concurrency"]
---

At the office we run a queue of document-processing jobs backed by SQLite. Workers pull the next job, claim it, do the work, and mark it done. If a worker dies mid-job, something has to notice the orphaned claim and put the job back in the queue. That something is `reap_stale_claims`, and for most of its life it judged staleness by one signal: how long ago the claim was made.

That was wrong, and it took a 3.5 GB job with 28,111 pages to prove it.

## The bug

`reap_stale_claims` ran on a timer with a default window of 30 minutes, controlled by an environment variable. Its query was simple:

```sql
UPDATE jobs SET status='queued', claimed_by=NULL, claimed_at=NULL,
    held_gate=NULL WHERE status='claimed' AND claimed_at < ?
```

Any claim older than the cutoff got requeued, no questions asked. For the overwhelming majority of jobs this was fine, because most jobs finish in minutes. But one job was a single, unusually large collection: 3.5 GB across 28,111 pages, and processing it in one attempt took roughly six hours. Six hours is a lot more than 30 minutes. Every time the reaper ran during that window, it saw a claim well past the cutoff and requeued it, because age was the only thing it knew how to check.

Requeuing handed the same job to the next idle worker. Now two workers were grinding through the same 28,111 pages at once. The job burned through four attempts before it finally finished, and one of the abandoned attempts had already published a broken partial result (an 18-page fallback with no real content) directly into the delivery folder, which meant fixing the duplicate processing wasn't enough; the output needed cleanup too.

There was a second, quieter cost. The reap query also cleared `held_gate` on any row it touched. `held_gate` tracks which semaphore-style resource a job's worker currently holds (these gates cap concurrent access to constrained resources). Clearing it on a row whose worker was still alive and still physically holding that resource desynced the semaphore's in-use counter the next time it reconciled. I'd seen "leaked gate" symptoms before without a clear cause. This was a plausible explanation: the reaper had been quietly lying to the semaphore about who held what.

## Age isn't staleness

The fix had to answer a different question than "how old is this claim." It had to answer "is the process that made this claim still running." That meant checking the actual PID.

```python
def _claim_owner_alive(pid, claimed_at) -> bool:
    global _psutil_missing_logged
    if not pid or not claimed_at:
        return False
    try:
        import psutil
    except ImportError:
        if not _psutil_missing_logged:
            _psutil_missing_logged = True
            logger.warning(
                "psutil unavailable -- stale-claim reaping is age-only and can "
                "requeue claims held by LIVE long-running workers (duplicate "
                "processing). Install psutil in the queue venv."
            )
        return False
    try:
        proc = psutil.Process(int(pid))
        if not proc.is_running():
            return False
        # +1.0 s slop: create_time and claimed_at come from different clocks.
        return proc.create_time() <= float(claimed_at) + 1.0
    except psutil.NoSuchProcess:
        return False
    except psutil.AccessDenied:
        return False
    except Exception:
        return False
```

Three ways a claim now counts as dead: the PID no longer exists, the PID belongs to a process that started after the claim was made, or inspecting the PID raises `AccessDenied`. The recycled-PID case is the one I almost got wrong. It's not enough that the PID resolves to a running process, since PIDs get reused constantly on a long-lived machine. The process has to predate the claim, with a one-second slop because `claimed_at` and `create_time()` come from different clocks. `AccessDenied` counts as dead too, because every worker here runs under the same account; a PID we can't inspect belongs to some other principal, not ours.

If psutil isn't installed, `_claim_owner_alive` returns `False` for everything, reproducing the old age-only behavior exactly, plus a one-time warning so nobody's surprised by it later.

## A ceiling for the truly hung

Liveness alone isn't a complete answer, because a worker can be alive and still be useless: hung on a lock, wedged in a library call, never coming back. So a claim past the age window is only *kept* if its owner is verifiably alive AND the claim hasn't crossed a second, much longer threshold: a hard ceiling, default 24 hours, also environment-configurable. Past that ceiling, even a live claimer gets reaped as a last resort.

In practice this ceiling barely matters day to day, because the workers restart nightly at 04:00 regardless. A hung worker survives at most until the next restart, at which point its PID is gone and the ordinary liveness check reaps its claim on the very next reaper cycle. The 24-hour ceiling exists for the gap between "should have restarted" and "actually restarted," not as the main defense.

The reap query changed shape to support the two-pass decision: select every claim past the age cutoff, decide per-row whether it's a hard-ceiling breach or a dead owner or neither, then issue one `UPDATE ... WHERE wo IN (...)` for whatever survived the filter, instead of one blanket update on age alone.

## The engine-stop wrinkle

One more place called the reaper: the endpoint that stops the whole engine. It calls `reap_stale_claims(stale_after_secs=0.0)`, meaning "consider every currently-claimed row, right now," because workers just got killed and their claims would otherwise sit un-retryable until the next start. With liveness checking in place, that zero-second window stopped being a blunt instrument. It now only reaps claims whose PID is actually gone, meaning the workers this endpoint just killed. A worker started outside the engine's own process tree keeps its claim across an engine stop instead of getting force-requeued into a duplicate run.

## Testing three kinds of PID

The new test file pins the cases that matter: an exited PID (chosen far above any range a real process would occupy) gets reaped; the test process's own PID with `claimed_at` backdated to before that process existed reads as recycled and gets reaped; the same PID with `claimed_at` set just after its own `create_time()` reads as genuinely alive and is left alone past the stale window; that same live claim still gets reaped once the hard ceiling is set below its age; and a fresh claim under the stale window is never touched regardless of liveness.

Two existing tests needed fixes for the same reason. The semaphore-recovery test was exercising a dead worker's gate getting recovered, but its claim had been stamped with the live test process's own PID by the normal claim path. The new liveness check correctly refused to reap it, which broke a test that was never really testing what it claimed to test. The engine-stop test had the identical problem: it needed a genuinely dead PID to represent the worker that stop actually killed, plus a new inverse case proving a live, externally-launched worker survives the stop instead of losing its claim.

None of this is exotic. It's the same lesson that shows up whenever you build a system to detect failure: age is a proxy for "something might be wrong," not proof of it. The proxy is cheap and it's usually right, which is exactly why it's dangerous. It took one job that legitimately ran six hours to turn a safety net into the thing that caused duplicate work.
