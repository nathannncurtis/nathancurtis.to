---
title: "A Network Share as a Database: Building CRDT-Like Merge for a Serverless Desktop App"
date: "June 2026"
readTime: "7 min"
tags: ["Python", "Distributed Systems", "SQLite"]
---

The tool in question is a desktop app that tracks work orders headed out to facilities and polls a backend database for new notes on each one. Every install has its own local SQLite file: what you're watching, what's baselined, what's unread. It works fine for one person.

The feature I needed to add was "shared profiles": a workspace a group of coworkers can all subscribe to, so if one person adds a work order to the team's list, everyone watching that profile picks it up. There's no server for this app and no message queue, and I wasn't going to add one just for this. What the office already has is a writable network share everyone can reach. So the entire shared-state layer had to live as JSON files on that share, with no lock service and no single writer coordinating anything.

That commit added one new module, `profiles.py`, at 1,149 lines, plus changes to `store.py`, `poller.py`, `emails.py`, and `config.py`: five files, 1,621 insertions, 53 deletions. All of it is about making a folder on a network drive behave like a small, mergeable database.

## One writer per file avoids most of the problem

Each profile is a folder: `<id>/profile.json` for metadata and membership, `<id>/orders/<username>.json` for the work orders that one person added, `<id>/removed.json` for team-wide untrack tombstones, and an `attachments/` tree for shared `.eml`/`.msg` files.

The orders files are the trick that makes most of this easy. Only one process ever writes `orders/nathan.json`: mine. So it needs no lock at all. A profile's effective order set is just the union of everyone's own orders file, scanned off disk. Two people adding work orders at the same moment never touch the same file, so there's nothing to reconcile there.

The two places where two people really can fight over the same bytes are `profile.json` (member list) and `removed.json` (tombstones). Those get an actual lock.

## I locked it wrong the first time

The lock is a plain file at `<profile>/.lock`, created with `O_CREAT | O_EXCL` so the filesystem itself decides who won a race to create it. A holder that crashes mid-edit leaves an orphaned marker behind, so something has to reclaim stale locks eventually.

My first version of that reclaim logic just deleted a marker once it looked "too old" and moved on to acquire it fresh, without checking whether the marker belonged to a holder that was still alive and simply slow. Writing to a member list over the network share is not instant. A holder mid-write could look stale to an impatient second client, get its lock deleted out from under it, and now two processes think they hold the lock and both read-modify-write the same `profile.json`. Whichever one commits last wins, and the other one's edit disappears with no error. A lost-update race, caught in review before it ever ran against real data.

The fix: every holder writes a private token into the marker on acquire (`user|pid|random-hex`), and release only removes the marker if the token on disk still matches its own:

```python
finally:
    # Remove ONLY the marker we wrote (token match), never another holder's.
    try:
        with open(lock, "r", encoding="utf-8") as fh:
            owned = fh.read().strip() == token
    except OSError:
        owned = False
    if owned:
        try:
            os.remove(lock)
        except OSError:
            pass
```

And a stale marker is only ever reclaimed after 60 seconds (`PROFILES_LOCK_STALE_SECONDS`), far longer than the 4-second hard ceiling on any single share operation (`PROFILES_SHARE_TIMEOUT_SECONDS`). If an op can't finish in 4 seconds it times out on its own; 60 seconds of silence means the holder is actually gone, not just slow.

## Merging without a clock

With no server, there's no authority to say which of two conflicting edits happened "first." Every add and every tombstone gets stamped with `datetime.now().isoformat(timespec="microseconds")`, and conflicts resolve by comparing `(timestamp, username)` tuples. A work order survives a team-wide untrack only if some add op is strictly greater than the newest tombstone for that key; a tie goes to the add, not the removal:

```python
for key, o in adds.items():
    t = tombs.get(key)
    if t is not None and not (add_ops[key] > t):
        continue
    out.append({...})
```

It's a modest version of the idea. There's no vector clock and no causal history, only last-writer-wins on one field per key. But the shape matches what a CRDT does: merge by a deterministic function of two replicas' facts, and every machine lands on the same answer without asking a coordinator first.

## A shared list exposed a watermark bug

Before this feature, the poller kept one global watermark: the highest note id it had ever seen, so an incremental poll could ask the database for anything newer. That was fine when every work order arrived through one person adding it fresh. Once a work order can show up already carrying months of history because a coworker just subscribed you to their profile, baselining that one busy work order pushes the single global watermark past whatever a quieter work order's last note actually was. The quiet one's next new note would land below the new global floor and never surface, because the query was `WHERE lineitem > watermark` against a floor that had just jumped ahead of it. Nothing errors. The note just never gets read.

The fix replaces the single `watermark` row in the `meta` table with one `watermark:<workorder>` row per work order, each advancing independently. Migrating existing installs without replaying every work order's whole history as unread on the first post-upgrade poll meant seeding each new per-WO row floored at the old global value, not at zero.

## Nothing waits forever

Every blocking share call, `os.path.isdir`, a scan, a read, a lock acquire, runs inside a hard 4-second deadline. Each call gets its own single-use `ThreadPoolExecutor(max_workers=1)` rather than sharing one pool, because the share is hit concurrently by FastAPI's own thread pool (about 40 workers) plus a dedicated sync thread. A shared single-worker pool would serialize all of that traffic and make ordinary concurrency look like a dead share: spurious 503s while the drive is perfectly healthy. On timeout the call is abandoned in place; the OS unwinds the SMB call on its own time, and `pool.shutdown(wait=False)` never blocks waiting for it.

## Nobody's identity is verified

The username behind every write is whatever `getpass.getuser()` returns, unverified, on a share writable by anyone in the office. So nothing read off disk is trusted at face value: usernames get renormalized through the same regex used to name the file, work order and facility tokens are re-checked against a strict pattern before they're shown anywhere, and every profile id is checked to stay lexically inside the share root before it's ever joined into a path. A directory scan skips anything that's a symlink or a junction, so a planted reparse point on a world-writable drive can't redirect a read or a write outside a profile's own folder.

The whole feature landed as one commit, 1,621 lines, against a folder on a drive letter the entire office already had mapped. Nobody had to stand up a service to run it.
