---
title: "Smart App Control Blocked an Exe and Ran Its Byte-Identical Copy"
date: "October 2026"
readTime: "8 min"
tags: ["Windows", "Code Signing", "Debugging"]
---

At the office we run a document pipeline across two Windows machines: a queue host, and a worker box that pulls orders, OCRs them and assembles each one into a PDF with a bundled `qpdf.exe`. The worker box had been fine for about a week. Then one morning at 08:11:13 two orders failed in the same second with this:

```
Pipelined OCR failed: qpdf assembly failed (pipelined path): qpdf failed (exit 3236495362):
```

Nothing comes after the colon. That's where qpdf's stderr goes, and it was empty.

## Two wrong guesses

Both orders had been stuck for 13 hours behind an unrelated outage overnight (one log line reads `failed <order> in 47340.2s`), and both came out of it together. So my first explanation was that two big orders hit PDF assembly at the same instant and the memory spike killed both qpdf runs. I called it transient and requeued them.

While I was in there I checked the disk, and `Get-PSDrive` over ssh said the C: drive had 0 GB free. That would also explain a dead qpdf. It was wrong:

```powershell
$d = [System.IO.DriveInfo]::new("C")
"free {0} GB of {1}" -f [int]($d.AvailableFreeSpace/1GB), [int]($d.TotalSize/1GB)
# free 73 GB of 235
```

By 08:15 three more orders had failed, each on a different worker process, with the same exit code and the same empty stderr. That ruled out the memory spike.

## Running qpdf by hand

I ran the binary at its installed path:

```powershell
& C:\node\resources\binaries\windows\qpdf\qpdf.exe --version 2>&1; Write-Output "exit: $LASTEXITCODE"
# exit: -1058471934
```

No version string and no error. PowerShell prints the code as a signed integer and Python prints it unsigned, but -1058471934 and 3236495362 are the same 32 bits: `0xC0E90002`. The incident note from that morning says `0xC0EA0002`, which is wrong. I found that when I ran `hex(3236495362)` to write this.

A code that starts with `0xC` is an NTSTATUS error, so Windows ended the process and qpdf never got far enough to complain. `ntstatus.h` in the Windows SDK has this one:

```c
// An Application Control policy has blocked this file.
#define STATUS_SYSTEM_INTEGRITY_POLICY_VIOLATION ((NTSTATUS)0xC0E90002L)
```

I didn't look it up that morning, so I got to the same sentence the long way.

The folder looked normal. `qpdf.exe` was 137,603 bytes, `qpdf30.dll` was 8,669,184, and every file was dated August 6. `certutil -hashfile` read both and printed SHA-256 hashes, so the files were readable.

That left corruption or a security policy, and one command separates them:

```powershell
Copy-Item C:\node\resources\binaries\windows\qpdf C:\node\tmp\qpdftest -Recurse -Force
& C:\node\tmp\qpdftest\qpdf.exe --version 2>&1; Write-Output "tmp-copy exit: $LASTEXITCODE"
```

```
qpdf version 12.3.2
Run qpdf --copyright to see copyright and license information.
tmp-copy exit: 0
```

A copy of a corrupt file is a corrupt file, and this copy ran. So the bytes were fine, and I assumed something was objecting to the path.

## Same path, fresh copy

I renamed the original folder aside and copied the working copy into the path that had been failing:

```powershell
Rename-Item C:\node\resources\binaries\windows\qpdf qpdf.quarantined-2026-08-26
Copy-Item C:\node\tmp\qpdftest C:\node\resources\binaries\windows\qpdf -Recurse
& C:\node\resources\binaries\windows\qpdf\qpdf.exe --version
# qpdf version 12.3.2
# original-path exit: 0
```

The same bytes at the same path now ran. A hash rule would have blocked the copy in the temp folder. A path rule would have blocked it once it was back at the original path. In the incident note I wrote that the block was per file instance: Windows had condemned those particular files, and a new file with the same contents started clean.

That was 08:16, five and a half minutes after the first failure. I requeued the failed orders (eight across the two rounds) and the first delivery came through at 08:17.

## The second blocked exe

Next I looped over the bundled exes on the box and ran each with `--version` to see what else was dead. One was, and this time PowerShell printed more than an exit code:

```
Program 'CoverPdf.exe' failed to run: An Application Control policy has blocked this file
```

That's the cover-page renderer, a different binary in a different folder, and the sentence is the one from `ntstatus.h`. I don't know why PowerShell printed it for this exe and only an exit code for qpdf. My guess is that for qpdf the blocked file was `qpdf30.dll`, so the exe started and died at load, but I replaced the whole folder at once and never checked. From Python it makes no difference. `subprocess` gets the return code and an empty stderr, and our log printed the code in decimal.

The same swap fixed `CoverPdf.exe`: rename the original aside, copy a fresh one in. The queue host's own qpdf ran normally.

That loop's output had a line I didn't read until I was writing this. The loop recursed into the quarantined folder too, and the original `qpdf.exe`, the one that had been failing since 08:11, exited 0 from there at 08:17. Nothing about the file had changed except the name of the folder it sat in.

So "per file instance" doesn't hold either. Either the block belonged to that file at that path, or it had already lifted by 08:16 and the copy test proved less than I thought. `CoverPdf.exe` argues against the second: it was still being blocked at 08:17:19, and a fresh copy at the same path ran less than thirty seconds later. I can't tell you what the rule is.

## Which policy

The Code Integrity event log names the policy, but the service account I ssh in as isn't an admin:

```
Get-WinEvent : Attempted to perform an unauthorized operation.
```

From an elevated prompt on the box:

```powershell
Get-WinEvent -LogName "Microsoft-Windows-CodeIntegrity/Operational" -MaxEvents 20 |
  Where-Object Id -in 3077,3033 | Format-List TimeCreated,Message
```

```
TimeCreated : 8/26/2026 8:17:19 AM
Message     : Code Integrity determined that a process (...\powershell.exe) attempted to load
              ...\cover-render\CoverPdf.exe that did not meet the Enterprise signing level
              requirements or violated code integrity policy (Policy
              ID:{0283ac0f-fff1-49ae-ada1-8a933130cad6}).
```

The newest entries were my own loop from a few minutes earlier. I read "Enterprise signing level" and a policy GUID and decided this was a WDAC policy pushed down from device management, which would mean finding where it was authored and adding an allow rule for our folder. That was wrong too. `citool --list-policies` has the name (trimmed here to the two entries that matter):

```
Policy ID: 0283ac0f-fff1-49ae-ada1-8a933130cad6
Friendly Name: VerifiedAndReputableDesktop
Platform Policy: true
Is Currently Enforced: true

Policy ID: 1283ac0f-fff1-49ae-ada1-8a933130cad6
Friendly Name: VerifiedAndReputableDesktopEvaluation
Platform Policy: true
Is Currently Enforced: false
```

`VerifiedAndReputableDesktop` is Smart App Control. Nobody at the office wrote that policy. It ships with Windows. The evaluation twin sitting next to it unenforced looks like a machine that started in evaluation mode and later switched itself to enforcing, which would fit a box that worked for a week and then didn't. I didn't see it switch, so that part is a guess.

Smart App Control has no allowlist. You can't exclude a folder or approve a file. The only setting is off, under Windows Security, App & browser control. I turned it off on the worker box and on the queue host.

Then I ran the quarantined original as the check:

```
previously-blocked original exit: 0
```

I recorded that as verified. It verifies nothing, because the same file had exited 0 ten minutes earlier with Smart App Control still on.

## What I do now

Convert the exit code to hex and look it up. 3236495362 is `0xC0E90002`, and the header comment for it is the diagnosis.

After that, a Windows exe that dies instantly with an NTSTATUS and no output gets the copy test before anything else. Copy it somewhere and run the copy. If the copy runs, the program isn't the problem.

The day before, a `WerFault` dialog with `0xc0000142` had come up on the same box in the middle of a different outage. I looked at it for a minute and moved on. It may have been the first block. I never checked.

The swap was a workaround, and turning Smart App Control off fixed two machines. The event says `CoverPdf.exe` "did not meet the Enterprise signing level requirements", which points at signing the bundled binaries in the build. That was item five on the follow-up list that morning, and I skipped it.
