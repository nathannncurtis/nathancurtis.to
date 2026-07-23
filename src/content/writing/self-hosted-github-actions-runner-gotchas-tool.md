---
title: "Self-Hosted GitHub Actions Runner Gotchas: Tool-Cache Permissions, Missing pwsh, and an Artifact-Quota Wall"
date: "May 2026"
readTime: "5 min"
tags: ["GitHub Actions", "CI/CD", "Windows", "PowerShell"]
---

I rebuilt the same 180-line release workflow five times in 77 minutes. Every one of the first four fixed a real problem and created a new one.

## The quota wall

The pipeline builds one of the office's internal Windows tools: a Coil-bundled Python app, signed with Azure Trusted Signing, packaged into an interactive and a silent installer with Inno Setup, then copied to a network share where our update agent picks it up. The original shape was two jobs. `build` ran on `windows-latest` because it ships with signtool, Inno Setup, and Python already installed. `deploy` ran on our self-hosted runner because that's the only machine with access to the share. The bridge between them was `actions/upload-artifact` and `actions/download-artifact`.

That bridge kept breaking. GitHub Actions artifact storage sits on a small org-wide quota, and we'd tripped it more than once. Worse, the usage number that reports against that quota is stale for 6-12 hours after you delete old artifacts, so even a cleanup doesn't buy you an immediate way out. Every trip meant a broken release until the number caught up on its own.

## Collapsing to one job

My first fix was to stop crossing the artifact boundary at all. The self-hosted runner already had share access. If it could also run Coil, Azure signing, and Inno, there was no reason to split the job in the first place. I dropped `build`/`deploy` down to a single `release` job on `[self-hosted, internal]` and deleted the three upload/download steps outright:

```diff
 jobs:
-  build:
-    runs-on: windows-latest
+  release:
+    runs-on: [self-hosted, internal]
```

GitHub Release attachments use a separate, much bigger quota, so the final publish step was untouched. Artifact storage was now never touched at all. Problem solved, I thought, for about fifteen minutes.

## The runner isn't windows-latest

Moving everything onto the self-hosted runner meant everything now ran in an environment I hadn't actually tested: a bare Windows machine set up for one job, not GitHub's fully-provisioned image.

First break: a step that injects a logging API key into a source file before Coil bundles it, using `shell: pwsh` and `-Encoding utf8NoBOM`. `pwsh` is PowerShell 7. The self-hosted runner only has Windows PowerShell 5.1, and `-Encoding utf8NoBOM` doesn't exist in 5.1. I switched the shell back to `powershell` and replaced the encoding flag with the underlying .NET call it's shorthand for:

```powershell
$content = (Get-Content app_logging.py -Raw) -replace '__SEQ_API_KEY__', $env:SEQ_API_KEY
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText("$pwd\app_logging.py", $content, $utf8NoBom)
```

Second break, five minutes later: `actions/setup-python@v5` failed outright. The action tries to write into the runner's tool-cache directory, and the service account the runner runs as doesn't have permission there. This isn't a self-hosted-runner limitation in general, it's specific to how our runner's service account was provisioned, but the action gives you no fallback when it can't write. I dropped the action and installed Python 3.12.7 per-user instead, with an idempotency check by path so a warm runner no-ops in about two seconds:

```powershell
$pyDir = Join-Path $env:LOCALAPPDATA 'Programs\Python\Python312'
$pyExe = Join-Path $pyDir 'python.exe'
if (-not (Test-Path $pyExe)) {
  Invoke-WebRequest -Uri $url -OutFile $installer -UseBasicParsing
  Start-Process -FilePath $installer -ArgumentList @('/quiet','InstallAllUsers=0','PrependPath=1') -Wait
}
$pyDir | Out-File -FilePath $env:GITHUB_PATH -Append -Encoding utf8
```

No admin rights needed, and writing to `$GITHUB_PATH` instead of relying on the user `PATH` meant I didn't need to wait on the runner service to restart before it picked anything up.

## Splitting again, on purpose

By the third fix, the single-job version worked, but it bothered me. Every future dependency this workflow needed, I'd have to hand-install on the self-hosted runner myself, one gotcha at a time, because that runner isn't a maintained image the way `windows-latest` is.

The actual fix wasn't collapsing the jobs. It was picking a different bridge. `build` went back to `windows-latest`, where signtool, Inno, and Python are already there and already correct. `deploy` went back to the self-hosted runner, doing only the one thing that requires it: the network-share copy. The bridge between them is the GitHub Release itself, downloaded on the self-hosted side with `Invoke-RestMethod` and `Invoke-WebRequest`, both built into PowerShell 5.1, no `gh` CLI or third-party action required. Release assets sit on the large quota, not the small one, so the original problem stays solved without pretending the self-hosted runner is something it isn't.

Five commits, one workflow file, 04:59 to 06:16 on the same morning. The lesson wasn't any single PowerShell flag. It was that "just run it all on the one runner that has access" sounds like a simplification and is actually a bet that the runner matches an environment you never provisioned to match anything.
