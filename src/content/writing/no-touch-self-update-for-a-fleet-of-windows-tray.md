---
title: "No-Touch Self-Update For A Fleet Of Windows Tray Agents, With Rollback Built In From Day One"
date: "April 2026"
readTime: "7 min"
tags: ["Windows", "Python", "Reliability", "Tooling"]
---

I run a small tray agent on every internal Windows machine at the office. It heartbeats to a server, shows toast notifications when one of a handful of internal apps needs updating, and otherwise stays out of the way. The agent itself never had a way to update itself. Every new version meant walking around (virtually) and re-running the installer by hand. That's fine for four machines. It stops being fine somewhere past ten.

So I built self-update for the agent, and the part I actually spent my time on wasn't the happy path. It was making sure a bad build couldn't strand a machine.

## The mechanism

Each heartbeat, the agent already gets back a catalog of the apps it tracks. I added the agent's own package, `notify-agent`, as a row in that same catalog, plus one new field on the response: `self_update_enabled`. The server decides who gets to self-update by reading a `NOTIFIER_SELF_UPDATE_HOSTS` environment variable, a CSV of machine names, or `*` for everyone, and checking it per request against the machine name on the heartbeat. No database migration, no per-machine config table. Flip an env var, restart the container, done.

When the agent sees a catalog version newer than its own `AGENT_VERSION`, and the flag is set, it runs `check_and_apply_update()`:

1. Copies a versioned zip (`agent-versions-<X.Y.Z>.zip`) from the update share to a local staging directory under `%LOCALAPPDATA%`, not `%TEMP%`. I'd already learned the hard way, hardening these same apps a few weeks earlier, that `%TEMP%` writes are the kind of thing EDR tools single out.
2. Extracts it to `versions/.staging-<X.Y.Z>/`, a hidden sibling of the real `versions/` directory, on the same volume as the final destination.
3. Runs `WinVerifyTrust` on the staged `agent.exe` and aborts on anything but a clean result.
4. Renames the staging directory to `versions/<X.Y.Z>/` with `os.replace()`. That's atomic, because both paths live on the same volume.
5. Spawns the launcher detached and returns `True`, which tells the agent's main loop to exit.

The launcher already had logic to scan `versions/` and start whichever subdirectory has the newest semver folder name. That logic didn't need to change at all. Self-update just gives it a new folder to find.

```python
verify_status = _winverify_trust(staged_agent)
if verify_status != 0:
    logger.error(
        "Staged agent.exe failed Authenticode verify — aborting",
        extra={
            "staged_agent": str(staged_agent),
            "wintrust_status_hex": f"0x{verify_status:08x}",
        },
    )
    shutil.rmtree(staging_version_dir, ignore_errors=True)
    return False
```

The trust model right now is two layers: the update share only ever gets written to by CI, and `WinVerifyTrust` confirms the staged binary carries a valid, unrevoked Authenticode signature. What it doesn't check yet is *whose* signature. Any trusted-root-signed exe would currently pass. I left that as a TODO rather than pretend it was done. Pinning the certificate subject is a real gap, just not the one that was going to strand a machine.

## The failure mode I actually cared about

The scary case isn't "the update fails." A failed copy or a bad zip just aborts and logs; the agent keeps running the version it already has. The scary case is a new version that installs cleanly, launches, and then crashes or hangs a few seconds in, over and over, on every machine that pulled it, with nobody standing in front of any of them.

So the rollback story had to live in the launcher, not the agent, because a broken agent build might not survive long enough to roll itself back.

Two files carry the state:

- The launcher writes `last_attempt.json` (version string, an attempt count, a timestamp) *before* it spawns the agent, not after. If the process dies before writing anything else, the record of the attempt still exists.
- The agent writes `versions/<X.Y.Z>/.ran_clean` once it's been alive and heartbeating successfully for five minutes.

On its next run, the launcher gathers every version directory with a real `agent.exe` in it, sorted newest-first, and walks down the list. A version with `.ran_clean` present is always trusted. A version without it, that also matches the `last_attempt.json` version and has already failed twice, gets skipped in favor of the next-newest. Two strikes, not one: the first failure might just be a user logging off before the five-minute window closed, not an actual crash.

```python
for ver_tuple, ver_str, agent_exe in candidates:
    ran_clean = (agent_exe.parent / ".ran_clean").is_file()
    if ran_clean:
        new_count = last_count + 1 if last_ver == ver_str else 1
        return agent_exe, ver_str, new_count

    if last_ver == ver_str and last_count >= ROLLBACK_FAIL_THRESHOLD:
        logger.warning("Demoting candidate version — failed to mark ran_clean...")
        continue

    new_count = last_count + 1 if last_ver == ver_str else 1
    return agent_exe, ver_str, new_count
```

If every candidate gets exhausted this way, meaning everything installed is broken, the launcher gives up and runs the newest one anyway. Bricking the tray silently is worse than running a version that might crash; at least a crashing agent leaves logs and stops heartbeating, which is visible on the server's dashboard as a machine that's gone quiet. That gap is the actual failure signal. Nobody has to notice a version number; they notice a missing heartbeat.

I also had to make sure self-update didn't yank the process out from under a user who just clicked a toast. The agent tracks pending acknowledgments, delivered, clicked, dismissed notifications not yet flushed to the server, and `check_and_apply_update` refuses to proceed if any are still pending, deferring one heartbeat cycle so the click has time to reach the server first.

## What shipped where

v0.5.8 shipped the self-update *code*, but distributed the normal way, by hand, through the existing toast-driven install flow. That was deliberate: it let me confirm the whole install layout (`versions/<X.Y.Z>/`, `version.txt` at the install root for the server's `discover_installed` check, the launcher's directory scan) actually matches what self-update expects, before trusting any machine to pull code onto itself without a human in the loop. v0.5.9 is the first version meant to be pulled silently, and only by machines already enrolled via the hostname allowlist.

The release workflow got one addition: after signing, it zips `agent/dist/bundle/` into `agent-versions-<X.Y.Z>.zip` and uploads it to the same update share as the installer, so the artifact self-update reaches for is built by the same CI run, from the same signed output, as everything else.

Rollback only works if something writes state before the thing that might crash. `last_attempt.json` before the spawn, `.ran_clean` after the process proves itself: that ordering is the whole mechanism. Get it backwards and a version with two crashes in a row looks indistinguishable from a version that never ran at all.
