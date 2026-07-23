---
title: "Gating Global Hotkeys To One Vendor's App, Without Its Cooperation"
date: "April 2026"
readTime: "6 min"
tags: ["AutoHotkey", "Windows", "Win32 API", "Automation"]
---

We have a tray app that swaps the active AutoHotkey script based on which role a records clerk is working: mail, fax, field pickup, customer service. Each role script binds a handful of hotkeys to typing out a template, things like `+!n` for "Received CNR via: E-Fax" or `^!f` for the field-pickup intake block. It's a fast way to log repetitive intake work without touching a mouse.

The problem is that AHK hotkeys are global by default. They don't know what window is in front of them unless you tell them to care. So a clerk finishes typing a template in the vendor's records app, alt-tabs to check something in Outlook, and if a finger lands on the wrong combination out of habit, a multi-line template gets typed into an email or a Chrome search box instead. Nothing catastrophic, just a mess to clean up and a minor loss of trust in the tool every time it happens.

## Why not just check the window title

The obvious fix is `#HotIf WinActive("some title")`. I didn't use it because the vendor's app title changes with the record open, the tab selected, sometimes the window state. Matching on a moving target means either a fragile regex or hotkeys that silently stop working the next time the vendor ships a UI tweak I don't control. I wanted something the vendor couldn't casually break.

The next thought was checking whether the foreground exe was code-signed and matching on the signer. That would have been the clean answer, except the vendor's binaries aren't signed at all. No certificate to match against.

## The field Task Manager already reads

Every Windows exe can carry a VERSIONINFO resource: product name, file description, company name, the fields you see in Explorer's Properties dialog or Task Manager's "Publisher" column. The vendor doesn't sign their exes, but they do stamp `CompanyName` into that resource. That's the hook.

The implementation is three Win32 calls into `version.dll`, done straight from AutoHotkey with `DllCall`, no subprocess and no PowerShell shell-out:

```ahk
_ReadCompanyName(path) {
    size := DllCall("version\GetFileVersionInfoSizeW", "Str", path, "Ptr", 0, "UInt")
    if (size == 0)
        return ""

    buf := Buffer(size, 0)
    if !DllCall("version\GetFileVersionInfoW", "Str", path, "UInt", 0, "UInt", size, "Ptr", buf, "Int")
        return ""

    transPtr := 0
    transLen := 0
    if !DllCall("version\VerQueryValueW", "Ptr", buf, "Str", "\VarFileInfo\Translation",
                "Ptr*", &transPtr, "UInt*", &transLen, "Int")
        return ""
    ...
```

`GetFileVersionInfoSizeW` and `GetFileVersionInfoW` pull the whole resource block into a buffer. `VerQueryValueW` against `\VarFileInfo\Translation` gets you the language ID and codepage the strings are stored under, because `CompanyName` isn't a fixed path, it's namespaced per locale as `\StringFileInfo\{lang:04X}{codepage:04X}\CompanyName`. Query that formatted path and you get a UTF-16 string back. `IsVendorApp()` then does a case-insensitive `InStr` on the result against the vendor's name.

Each hotkey press calls `WinGetProcessPath("A")` to get the foreground exe's path, so the check runs per keystroke, not once at startup. That could have been slow. It isn't, because the result gets cached in a `Map` keyed by path:

```ahk
GetCompanyName(path) {
    global _CompanyNameCache
    if (_CompanyNameCache.Has(path))
        return _CompanyNameCache[path]
    result := _ReadCompanyName(path)
    _CompanyNameCache[path] := result
    return result
}
```

First hit on a given exe costs about 5 ms of DllCall overhead. Every hit after that is a Map lookup. A clerk alt-tabbing between the same three or four windows all day never pays the cost twice.

Wiring it into the four role scripts (`keys_cs.ahk`, `keys_fax.ahk`, `keys_fp.ahk`, `keys_mail.ahk`) is one line each, right after the shared include:

```ahk
#Include "common.ahk"

#HotIf IsVendorApp()
```

Everything below that directive in the file is now scoped to the gate. No per-hotkey changes needed.

## Being honest about what this actually protects against

`CompanyName` is a string in a resource section. Nothing stops another exe from carrying the same string, deliberately or by coincidence. This isn't a security boundary, and I wrote that into the commit message so future-me doesn't mistake it for one. The threat model is "clerk alt-tabs and a habitual keypress lands somewhere it shouldn't," not "attacker forges a window to steal hotkey input." For that narrower job, an unforgeable check would be solving a problem I don't have at the cost of a signing infrastructure the vendor doesn't support.

It's also read-only file I/O against a documented Win32 API, the same one Task Manager and Explorer already call to render the Publisher column and the Details tab. This app had already gone through a hardening pass to strip out shell-outs to `schtasks`, `tasklist`, and `powershell` after an EDR flagged it for exactly that kind of behavior. Adding a `DllCall` into `version.dll` doesn't reopen that door.

The last piece was making the gate visible after the fact. The role-activation log line, which already went to our structured logging pipeline, picked up one new field:

```python
logger.info(
    "Role activated",
    extra={
        "active_role": role,
        "previous_role": previous_role,
        "ahk_script": AHK_SCRIPTS[role],
        "ahk_pid": ahk_process.pid,
        "publisher_gate": "vendor-app",
    },
)
```

If a clerk ever reports a hotkey doing nothing, that field tells me the gate was active and expecting the vendor's app, without needing to reproduce the exact window state to find out. Shipped as 1.6.5.
