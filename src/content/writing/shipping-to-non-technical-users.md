---
title: "Shipping Desktop Tools to People Who Don't Know What a Terminal Is"
date: "March 2026"
readTime: "5 min"
tags: ["Deployment", "Windows", "Inno Setup"]
---

## The audience

The tools I build are used by people who process documents, manage case files, and operate scanners. They don't know what Python is. They don't know what a terminal is. They know how to double-click an icon and right-click a folder. That's the interface contract.

For the people using these tools, that's the reality. I personally prefer a TUI over a GUI any day, but the audience here isn't developers. It's office staff running document workflows. For them, if a tool requires opening a command prompt or installing a runtime, it's not getting used. Here's what the deployment pipeline looks like when "just pip install it" isn't an option.

## The installer

Every tool ships as a single setup .exe built with [Inno Setup](https://jrsoftware.org/isinfo.php). Inno Setup is a free, scriptable installer compiler that's been around since 1997. The scripting language takes some getting used to, but once you have a working .iss file, it produces the same installer every time. Reliable and battle-tested.

The installer handles:

- **Per-user or system-wide install.** Per-user installs to `%APPDATA%` and don't need admin rights. System-wide installs to `%PROGRAMFILES%` and do. Default to per-user because most users don't have admin.
- **File association.** Study Aggregator registers itself as a handler for DICOM-related files and adds a right-click context menu entry on folders and ZIP files.
- **Start menu and desktop shortcuts.** Optional, but users expect them.
- **Uninstaller.** Inno Setup generates one automatically. Clean removal, no leftover files.

The installer script is a .iss file. Once it's set up, you don't touch it unless the install layout changes.

## Context menu integration

The most important UX decision I made was adding right-click context menu entries. Study Aggregator and File Processor both register context menu items on folders and specific file types.

For Windows, this means writing registry entries during install:

- `HKCU\Software\Classes\Directory\shell\MyApp` for folders
- `HKCU\Software\Classes\.zip\shell\MyApp` for file types

The value points to the executable with a `"%1"` argument placeholder. When the user right-clicks a folder and selects your tool, Windows launches it with the folder path as the first argument.

This is the difference between "open the app, click browse, navigate to the folder, click open" and "right-click, click." Four steps become two. For tools that process hundreds of folders a day, that matters.

## Auto-updates

Study Aggregator checks for updates by polling the GitHub Releases API every 10 minutes via a scheduled task. If a new version is available, it shows a Windows notification with an "Update Now" button. Clicking it downloads the new installer and runs it silently.

The update check is a single HTTPS request:

```python
response = requests.get(
    "https://api.github.com/repos/user/repo/releases/latest"
)
latest = response.json()["tag_name"].lstrip("v")
current = open("version.txt").read().strip()

if latest != current:
    show_update_notification(latest, latest_asset_url)
```

The key decisions:

- **Don't auto-install.** Show a notification and let the user choose when to update. Forcing an update while someone is in the middle of processing files is hostile.
- **Don't check on every launch.** A scheduled task on an interval (every 10 minutes in my case) is cleaner. Checking on launch adds startup latency and fails when there's no network.
- **Keep version.txt in the install directory.** Simple, portable, no registry dependency.

## The network share deploy

For org-internal tools, there's a second distribution channel: a network share. The CI pipeline (GitHub Actions with a self-hosted runner) builds the installer, signs it, and copies it to a known UNC path. The update checker on office machines polls that path instead of GitHub.

This means the update pipeline is: push a tag, CI builds and deploys, machines pick it up within 24 hours. No manual distribution, no walking around with USB drives, no emailing setup files.

## What matters

None of this is technically interesting. Inno Setup is ancient. Registry entries are basic. Polling for updates is the simplest possible approach.

But it works for the audience. The tools install like any other Windows app. They update themselves. They integrate into the workflow (right-click a folder, get a result). Nobody has to learn anything new.

That's the job. Not making it clever. Making it invisible.
