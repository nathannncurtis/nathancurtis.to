---
title: "Shipping Desktop Tools to People Who Don't Know What a Terminal Is"
date: "March 2026"
readTime: "5 min"
tags: ["Deployment", "Windows", "Inno Setup"]
---

## The interface contract

The people who use my tools process documents, manage case files, and run scanners. They don't know what Python is. They don't know what a terminal is. They know two gestures: double-click an icon, right-click a folder. That is the entire interface I'm allowed to use.

I'd personally rather live in a TUI, and for me that's the faster tool by a mile. But the audience isn't me and it isn't developers. It's office staff running document workflows all day, and for them a tool that requires a command prompt or a runtime install is a tool that never gets opened once. So the whole deployment story bends around those two gestures and nothing else. Here's what that looks like when "just pip install it" was never on the table.

## Make it install like everything else

Every tool ships as a single setup .exe built with [Inno Setup](https://jrsoftware.org/isinfo.php). It's free, scriptable, and has been compiling Windows installers since 1997. The scripting language takes some getting used to, but a working .iss file produces the same installer every time, and then you stop thinking about it.

The installer does what a user already expects an installer to do:

- **Per-user by default.** Installs to a per-user location with no admin rights required, because most of these users don't have admin. System-wide is available for the machines that want it.
- **File and folder associations.** Study Aggregator registers as a handler for the file types it reads and adds a right-click entry on folders and ZIP files.
- **Shortcuts.** Start menu and desktop, optional, because people look for them.
- **A real uninstaller.** Inno generates one automatically. Clean removal, nothing left behind.

None of this is clever, and that's the point. The tool should be indistinguishable from any other app the user has ever installed.

## Right-click is the whole product

The single most important decision in any of these tools is the right-click menu. Study Aggregator and File Processor both register context-menu entries on folders and on the file types they handle.

On Windows that's a couple of registry keys written at install time:

- `HKCU\Software\Classes\Directory\shell\MyApp` for folders
- `HKCU\Software\Classes\.zip\shell\MyApp` for a file type

The command points at the executable with a `"%1"` placeholder, and when the user picks the entry, Windows launches the tool with the folder or file path as its first argument.

That one registry key changes the entire shape of the work. Without it, using the tool is: open the app, click Browse, navigate to the folder, click Open, click Go. With it: right-click the folder, click the entry. Five steps become two. For someone processing a handful of folders a day, that's a nicety. For someone doing hundreds, it's the difference between a tool they use and a tool they quietly stop opening because the ceremony isn't worth it. The context menu is where these tools actually live. Everything else is plumbing that gets them there.

## Updates that don't interrupt

The tools have to update themselves, because the users won't do it manually. The rules I settled on:

- **Never check on launch.** It adds startup latency and fails when there's no network, at the exact moment someone is trying to get work done.
- **Never auto-install.** Show a notification and let the user pick the moment. Forcing an update on someone halfway through a batch of files is hostile.
- **Keep the version marker dumb.** A `version.txt` in the install directory. No registry entry to go stale.

The first version of this was a per-app scheduled task that polled the GitHub Releases API every ten minutes and raised a Windows notification with an "Update Now" button:

```python
response = requests.get(
    "https://api.github.com/repos/user/repo/releases/latest"
)
latest = response.json()["tag_name"].lstrip("v")
current = open("version.txt").read().strip()

if latest != current:
    show_update_notification(latest, latest_asset_url)
```

It worked. But every app scheduling its own task means a pile of near-identical tasks all doing the same thing, and that per-app Scheduled Task is exactly what later got these apps flagged by Defender (a story for a different post). It's since collapsed into a single per-machine agent that checks every installed app against a known location and fires the toast. The user sees the same behavior; there's one mechanism now instead of one per app. The principle held; the plumbing got simpler.

For org-internal tools the source is a network share instead of GitHub. CI builds the installer, signs it, and drops it plus a version marker on a known UNC path, and the agent picks it up from there. Push a tag, and the office machines are current within a day. No walking around with a USB stick, no emailing setup files.

## What matters

None of this is technically interesting. Inno Setup is ancient. Registry entries are basic. Polling for a new version is the dumbest mechanism that could possibly work.

But it fits the audience. The tools install like any other Windows app, they update themselves without nagging, and they show up in the right-click menu where the work already happens. Nobody has to learn anything new to get their job done.

That's the job. Not making it clever. Making it invisible.
