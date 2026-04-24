---
title: "Four Apps, One Bundler, and the EDR Alert That Made Everything Better"
date: "April 2026"
readTime: "8 min"
order: 1
tags: [windows, python, security, coil, tooling]
---

Microsoft Defender started flagging four of my internal Python apps. None of them were malicious. All of them deserved it.

## The trigger

Defender for Endpoint tagged four of my internal Windows apps under three MITRE ATT&CK techniques: T1059.006 (Python execution), T1053.005 (Scheduled Task persistence), and T1036.005 (Masquerading).

Not malware. But from an EDR's perspective? Fair. These apps were shelling out to `schtasks`, `tasklist`, `taskkill`, and `powershell`. They were running binaries named things like `reg.exe` and `unreg.exe`. They were installing into `%APPDATA%\Roaming` — a path beloved by actual malware for persistence. The behavioral signature was "generic commodity RAT" whether I liked it or not.

The goal was straightforward: make the apps look legitimate and behave cleanly, without changing anything a user would notice.

## The four apps

Quick context on what got hardened:

- A Send-To shortcut that extracts structured data out of PDFs.
- A system-tray hotkey app that swaps the active AutoHotkey script based on which role the user picks.
- A PyQt5 tray app plus Send-To shortcut that searches an indexed file database for records.
- A PyQt5 GUI backed by a Rust engine that parses imaging data and produces a printable summary.

All four deploy to internal Windows clients, auto-update from a network share, and serve the same end-user base. Which means: one hardening pattern, applied four times.

## The hardening pass

Every app got the same retrofit. Not because I love repetition, but because the smell was the same in each case and the fix was the same too.

**Install location moved from `%APPDATA%\Roaming\<App>\` to `%LOCALAPPDATA%\Programs\<Vendor>\<App>\`.** Stops looking like malware persistence. Matches the Squirrel.Windows / Electron per-user install convention — VS Code, Slack, and GitHub Desktop all install here.

**Binary renames away from system-binary-adjacent names.** `reg.py` and `unreg.py` became `<app>_setup_helper.py` and `<app>_uninstall_helper.py`. The T1036.005 masquerading signal goes away entirely.

**All shell-outs replaced with native APIs.** This was the big one:

- `schtasks` → Task Scheduler COM API (`Schedule.Service`)
- `powershell` (used only for shortcut creation) → `WScript.Shell` COM
- `tasklist`/`taskkill` → named-pipe liveness probe at `\\.\pipe\<Vendor>.<AppName>.Alive`
- `reg` CLI → the `winreg` stdlib

Zero LOLBIN telemetry from the runtime. Every one of those CLI invocations was a row in someone's SIEM. Now they don't exist.

**Subprocess supervision via Windows Job Objects** (`KILL_ON_JOB_CLOSE`) for apps that spawn long-running children — the hotkey app with AHK, the imaging tool with the Rust engine. When the parent dies for any reason, the kernel kills everything in the Job. No orphan AHK firing hotkeys forever. No zombie engine deadlocked on a pipe write. This is kernel-enforced and effectively impossible to bypass, which makes it strictly better than an `atexit` handler that only runs if Python exits cleanly.

**psutil orphan-cleanup at startup** to handle pre-Job-Object orphans left behind by earlier installs. Multi-signal pattern matching — exe path plus cmdline args plus script names — so a user's personal AHK install doesn't get swept up.

**Unified logging via `RotatingFileHandler`** (5 MB × 3) at the install dir. Every `except Exception: pass` replaced with `logger.exception(...)`. I had put this off for too long. The EDR alert was what made me finally do it.

**Inno Setup installer rewritten with four-layer legacy cleanup** — `[InstallDelete]`, `[Registry] deletekey uninsdeletekey`, `[Code]` block calling `schtasks /Delete`, `[UninstallDelete]` sweep — so existing users migrate cleanly. Plus a native Win32 `TerminateProcess` block via kernel32 externals for fast install-time shutdown of pystray-based trays. Pystray doesn't respond to `WM_CLOSE`, and without this the installer would hang for 30 seconds waiting for a graceful exit that was never coming.

**EV-cert-ready signing pipeline.** Every build script and CI file got an "EV CERT MIGRATION" banner so the eventual cert swap is one line per app, the day the cert lands.

## The upstream Coil story

This is where it got interesting.

[Coil](https://github.com/nathannncurtis/coil) is my Python-to-Windows-exe bundler. All four apps use it. The hardening pass exposed a pile of Coil quirks that every project was working around independently — boilerplate at the top of every `.py` file, manual post-build cleanup scripts, hand-maintained dependency lists despite an `auto = true` flag that was supposed to handle that.

Rather than permanently bake those workarounds into the four apps, the work pivoted upstream.

### Per-entry VERSIONINFO stamping

Task Manager was showing every bundled exe as "Python" instead of the app's real name. Root cause: a language-ID mismatch. The built-in stamper was writing at `LANG_NEUTRAL`, but `python.exe` shipped its own resource at `en-US`, and Windows preferred the inherited one. Fixed upstream. All four apps now show their actual names.

### Dependency resolver via `importlib.metadata.packages_distributions()`

Every project had a hand-maintained `include = ["pywin32", "windows-toasts", ...]` list despite Coil having an `auto = true` flag. The resolver was missing pywin32 because its submodules were being mis-identified as PyPI packages — there's no `win32pipe` on PyPI. The fix was to walk distributions properly. Every `include = []` list downstream is now empty.

### `.pth` file processing and DLL directory registration

Every pywin32-using file had a 15-line shim at the top doing `sys.path` manipulation and `os.add_dll_directory` calls. This is the kind of thing that gets copy-pasted across a codebase and then nobody remembers why it's there. Moved into Coil's runtime. ~150 lines gone just for the shim. `import win32pipe` just works now.

### Clean-exit semantics on `__main__` return

Every helper script had a trailing `sys.exit(0)` because otherwise Coil's launcher would drop into a Python REPL and hang Inno Setup's `waituntilterminated`. Embarrassing bug; the fix needed a small detour through `os._exit` to bypass CPython's init-phase fatal-error handling. Gone.

### Per-entry PE subsystem control via `coil.toml`

I had a custom `set_console.py` post-build helper that manually rewrote the PE subsystem byte for entries that needed Console mode. This should obviously just be a config field. Now it is.

### Expanded default exclude list

Every `build.bat` had a 15-line `if exist ... del` tail cleaning up `__pycache__/`, `coil.toml`, `*.iss`, `*.log`, `tests/`, `memory/`, and so on. Coil now excludes these by default. Zero cleanup code in the build scripts.

### Comments VERSIONINFO field

I was folding developer attribution into `LegalCopyright` because that was the only string field Coil exposed. Wrong field. Now there's a `comments` field and attribution lives there, in Properties → Details, where it belongs.

### Explicit-override resolver semantics

Subtle bug: `field = ""` per-entry was silently ignored instead of overriding shared values. Which meant you couldn't explicitly blank out an inherited field. Fixed.

Coil went from 0.1.1 to 0.2.4 over the course of this work. Each PR was one concern, test-covered, and reviewed before merge.

## The cleanup pass

After Coil 0.2.4 shipped, all four apps got a follow-up commit: empty the `include = []` list, delete the pywin32 shim, restore normal `import win32pipe`-style imports, drop trailing `sys.exit(0)`, add `[build.versioninfo]` per-entry stamping, move attribution from `legal_copyright` to `comments`.

Every file deleted is one less thing to maintain. The four apps got measurably smaller and simpler in the process.

## Things worth pulling out

A few lessons from this I'd want to remember:

**EDR alerts are a forcing function for code quality.** Most of the hardening list reads like generic "Windows app best practices." None of it would have happened without something forcing it. An EDR alert is a great something.

**Job Objects are an underused Windows feature.** Most Python-on-Windows code doesn't touch them. For any process that spawns children that would be harmful as orphans, they're the kernel-enforced version of cleanup. You can't forget to call them. You can't bypass them with a hard kill. They just work.

**Native Win32 beats LOLBINs even at install time.** An installer shelling out to `taskkill` is "expected behavior" in the sense that nobody will blame you for it — but it still emits EDR telemetry. Pure Win32 calls via Inno Setup's external-DLL imports work just as well, take milliseconds rather than seconds, and leave no signal.

**The cascade matters.** The hardening exposed Coil bugs. Fixing Coil eliminated downstream boilerplate. Each Coil release made the next downstream cleanup smaller. The whole project got better as it went instead of accreting. This is the opposite of how most refactors feel, and it's worth noticing when it happens.

## Outcomes

Four apps, all hardened and clean, installers ready for the EV-cert tagging round once the cert lands. Coil went from 0.1.1 to 0.2.4 over the course of this work — ten PRs across three PyPI releases. Test suite sits at 312/0 green. Three open issues closed (#10, #11, #14) with code rather than documentation. Zero EDR alerts from post-hardening builds — validated locally, full validation pending production rollout.

The alert was annoying at 8 AM on a Tuesday. By the time it was resolved, four apps were better, one bundler was better, and the next ten apps I write will inherit everything.
