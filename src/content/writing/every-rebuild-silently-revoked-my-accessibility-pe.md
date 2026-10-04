---
title: "Every Rebuild Silently Revoked My Accessibility Permission"
date: "October 2026"
readTime: "6 min"
tags: ["macOS", "Swift", "Code Signing"]
---

I dictate with Superwhisper on my Mac, and it doesn't work inside a Remote Desktop session. Superwhisper delivers text by putting it on the clipboard and posting a synthetic Cmd+V, and the Windows guest on the other end receives a bare `v`. So I wrote a small Swift login agent that sits on a `CGEvent` tap, swallows that paste when the remote client is frontmost, and types the text as keystrokes instead.

The tap needs Accessibility permission. The first commit got the signing wrong and the prompting wrong, and both were fixed in a follow-up.

## The grant follows the signature

This was the signing step of `build.sh` in the first commit:

```sh
codesign --force --sign - --identifier "$IDENT" "$APP"
```

The comment at the top of the same file said why: "The stable --identifier keeps the grant across rebuilds so you only approve it once."

With `--sign -` it doesn't. TCC binds the Accessibility grant to the code signature, and an ad-hoc signature's designated requirement is its cdhash, which changes on every build. To TCC each build is a different program, and the grant I gave the last one doesn't cover it. The build succeeds, the agent starts, finds it isn't trusted, logs this and exits:

```
no Accessibility permission yet -- exiting so launchd respawns us
```

The README in that same commit disagreed with the build script. Its setup section said "expect to re-tick after rebuilding," and its debugging section had my workaround: run the binary from a terminal that already holds Accessibility, and it inherits that grant. That's fine for iterating. It does nothing for the installed agent, which launchd starts, and `install.sh` runs `build.sh` first, so every install was a new signature.

The follow-up signs with a certificate when the keychain has one:

```sh
SIGN_ID="$(security find-identity -v -p codesigning 2>/dev/null \
    | grep -oE '"[^"]*"' | tr -d '"' | head -1)"
if [ -z "$SIGN_ID" ]; then
    SIGN_ID="-"
    echo "warning: no code-signing identity found; falling back to ad-hoc." >&2
    echo "         the Accessibility grant will need re-approving after each build." >&2
fi
```

```sh
echo "signing as: $SIGN_ID"
codesign --force --sign "$SIGN_ID" --identifier "$IDENT" "$APP"
```

`security find-identity -v -p codesigning` lists the valid codesigning identities with their names in double quotes, and the pipeline takes the first name. A certificate-backed signature keeps the designated requirement stable across rebuilds, so the grant is given once. With no identity the script falls back to ad-hoc and warns on stderr that the grant will need re-approving after each build.

## A running process never sees the grant

The first commit already had this part right. `AXIsProcessTrusted()` caches its answer for the lifetime of the process. The obvious design is to start up, see the permission is missing, and poll until the box is ticked. That loop reports "denied" forever. Only a fresh process sees the grant.

So the agent doesn't wait. If it isn't trusted it logs why and calls `exit(0)`, and the launchd job has `KeepAlive` set, so launchd starts a new one, which checks again from scratch. Nobody has to relaunch anything by hand after ticking the box.

## The dialog that kept coming back

Here's the first version of that check:

```swift
private func requireAccessibility() {
    let promptKey = kAXTrustedCheckOptionPrompt.takeUnretainedValue()
    if AXIsProcessTrustedWithOptions([promptKey: true] as CFDictionary) { return }

    Log.warn("no Accessibility permission yet -- exiting so launchd respawns us")
    Log.warn("System Settings > Privacy & Security > Accessibility -- add SuperwhisperRDPShim")
    exit(0)
}
```

The prompt option makes macOS put up its approval dialog when the process isn't trusted. That's right once. But this function runs on every launch, and launchd was relaunching the agent as often as its throttle allowed, which my comment above the function put at about 10 seconds. Each new process asked again, so the dialog kept coming back until the box was ticked.

The second version asks once and records that it asked:

```swift
if AXIsProcessTrusted() { return }

let askedBefore = UserDefaults.standard.bool(forKey: "HasPromptedForAccessibility")
if !askedBefore {
    UserDefaults.standard.set(true, forKey: "HasPromptedForAccessibility")
    let promptKey = kAXTrustedCheckOptionPrompt.takeUnretainedValue()
    _ = AXIsProcessTrustedWithOptions([promptKey: true] as CFDictionary)
    Log.warn("requested Accessibility permission (asking once; will retry silently)")
}
```

The plain `AXIsProcessTrusted()` check comes first and never prompts. The flag is written before the prompting call, so the dialog can't go up without the record of it. Every later launch skips the block, logs the same two lines and exits.

With the respawns silent there was no reason for them to be frequent, so the plist that `install.sh` writes got one more key:

```xml
<key>ThrottleInterval</key>   <integer>30</integer>
```

The flag has a cost. If the grant is lost some other way, the agent won't ask again, because it already has. The README has the reset:

```sh
tccutil reset Accessibility com.nathan.swshim
defaults delete com.nathan.swshim HasPromptedForAccessibility
```

## Quit has to unload the job

`KeepAlive` mattered once more in the next commit, which added a menu bar item with a Quit entry. If Quit called `exit()`, launchd would restart the process and the icon would come straight back. So Quit unloads the job:

```swift
@objc private func quit() {
    let label = "gui/\(getuid())/com.nathan.swshim"
    let task = Process()
    task.executableURL = URL(fileURLWithPath: "/bin/launchctl")
    task.arguments = ["bootout", label]
    try? task.run()

    DispatchQueue.main.asyncAfter(deadline: .now() + 1) { NSApp.terminate(nil) }
}
```

The one-second fallback is for when the binary was started from a terminal. There's no launchd job to boot out, `bootout` does nothing, and the process still needs to go. The agent comes back at next login.

## What the fix left behind

The signing and prompting fix was 57 additions and 12 deletions across four files, and it left three stale lines that are still in the repo. The README's layout section still describes `build.sh` as "builds + ad-hoc signs the .app". The doc comment on `requireAccessibility()` still says launchd throttles respawns to ~10s, and the plist sets 30. And the header of `build.sh` still credits the stable `--identifier`, a few lines above the newer comment that credits the certificate.
