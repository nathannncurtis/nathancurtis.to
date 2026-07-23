---
title: "The Pathlib Join Bug That Silently Broke Fleet-Wide App Discovery"
date: "May 2026"
readTime: "6 min"
tags: ["Python", "pathlib", "Windows", "Debugging"]
---

An app just disappeared from the fleet dashboard. Not crashed, not flagged, not erroring anywhere in the logs. Just gone, on every machine in the office except mine.

## The catalog

I run a small internal agent on every machine at the office. It phones home on a heartbeat, and part of that heartbeat is figuring out what's installed and at what version. The server holds a catalog: one row per app, with an `install_path` field that's supposed to be relative to `%LOCALAPPDATA%`, something like `Programs\Vendor\AppName`. The agent reads that field and does the obvious thing:

```python
install_path = LOCALAPPDATA / app.get("install_path", "")
version_file = install_path / app.get("version_file", "version.txt")
if not version_file.is_file():
    missing.append(app_name)
    continue
```

If `version_file` isn't there, the app gets marked missing and drops out of that machine's report. Simple, and it had worked fine for months.

## The paste

Someone editing the catalog through the admin UI copied a path out of Windows Explorer's address bar and pasted it into `install_path`. Explorer gives you the full absolute path, so what landed in the field looked like `C:\Users\<them>\AppData\Local\Programs\Vendor\AppName` instead of the relative `Programs\Vendor\AppName` the field expected. The form had no validation on that field at all. It saved. Nothing complained.

On their own machine, the app kept reporting fine, because the absolute path they'd pasted happened to *be* their own real install path. Everywhere else, it vanished. That's what made it hard to spot: the person who broke it had no way to see it was broken.

## What pathlib actually does with an absolute right-hand side

The bug is in that first line. `Path.__truediv__` (and `.joinpath()`) has a documented rule: if the argument you're joining in is itself absolute, the left-hand path is discarded entirely and you get the right-hand path back, verbatim.

```python
>>> from pathlib import Path
>>> Path(r"C:\Users\alice\AppData\Local") / r"C:\Users\bob\AppData\Local\Programs\Vendor\AppName"
WindowsPath('C:/Users/bob/AppData/Local/Programs/Vendor/AppName')
```

`LOCALAPPDATA` never entered into it. Every agent on every machine, regardless of who was logged in, ended up checking for a version file at one literal path that only existed on the laptop of the person who'd made the edit. No exception, no warning, `Path.is_file()` on a path that doesn't exist just returns `False`, same as any other missing file. It reads exactly like the app was uninstalled everywhere.

## The fix

Two things needed to happen: forgive the specific mistake that had already occurred, and stop the class of mistake from recurring.

```python
_LOCALAPPDATA_ABS_RE = re.compile(
    r"^[A-Za-z]:[\\/]+Users[\\/]+[^\\/]+[\\/]+AppData[\\/]+Local[\\/]+(.+)$"
)
_ABS_PATH_RE = re.compile(r"^([A-Za-z]:[\\/]|\\\\)")

def _normalize_install_path(raw: str) -> str:
    p = (raw or "").strip()
    if not p:
        raise HTTPException(status_code=400, detail="install_path is required")
    m = _LOCALAPPDATA_ABS_RE.match(p)
    if m:
        return m.group(1).replace("/", "\\").strip("\\")
    if _ABS_PATH_RE.match(p):
        raise HTTPException(
            status_code=400,
            detail="install_path must be relative to %LOCALAPPDATA%, not an absolute path.",
        )
    return p.replace("/", "\\").strip("\\")
```

An absolute path that happens to fall under *any* user's `AppData\Local` gets its prefix stripped and the tail kept, on the assumption that's exactly this mistake happening again. Any other absolute path, or a UNC path, gets rejected outright with a 400 instead of silently corrupting the row. The regex doesn't care whose username shows up in the path; it matches the shape, strips everything up through `Local\`, and keeps the rest.

I wrote a dozen or so unit tests directly against that function: relative paths pass through unchanged, forward slashes collapse to backslashes, an absolute `AppData\Local` path from one user normalizes the same as one from a different user, a bare `C:\Program Files\...` path gets rejected, a UNC share gets rejected, empty and whitespace-only input both raise. Cheap tests, but they're the difference between "this can't happen again" and "I think this can't happen again."

## The other bug in the same commit

While I was in that code I fixed something related but separate: once a silent-install attempt for a given agent, app, and version reached a terminal state, a unique constraint on `(agent_id, app_id, target_version)` meant re-pushing it silently no-opped forever. The enqueue routine saw the existing row and skipped, regardless of whether it had succeeded, failed, or was still running. I added a `force` flag that resets a *terminal* row in place, state back to queued, attempt count back to zero, timestamps cleared, while leaving anything still `queued` or `in_flight` untouched even under force, so a re-push button can't stomp on work the agent is mid-way through.

Neither bug threw an exception. Neither showed up in a log line marked `ERROR`. Both were "the code did exactly what it was told, and what it was told was wrong." That's the pattern worth remembering: `Path.is_file()` returning `False` and a unique-constraint skip both look identical to "nothing happened," and the only way to catch either is to know what *should* have happened and go looking for the gap.
