---
title: "The .env File That Got Mangled Three Different Ways"
date: "May 2026"
readTime: "6 min"
tags: ["Docker Compose", "GitHub Actions", "Windows", "DevOps"]
---

I built a small FastAPI ticketing tool for the office: it polls an IMAP inbox, turns emails into tickets, and serves a web UI over SQLite. Deployment target was a QNAP NAS we already run a couple of other internal services on. Deployment mechanism was a GitHub Actions workflow on a self-hosted Windows runner, writing a `.env` from a single GitHub secret and bringing the stack up with Docker Compose. The NAS is ARM64. The runner is Windows. Getting one string of key=value pairs to survive that trip intact took three separate fixes, each one a different way the same file got corrupted in transit.

## The build, first

The first problem wasn't the env file, it was the architecture. My first pass installed QEMU/binfmt on the runner (`docker run --privileged --rm tonistiigi/binfmt --install arm64`), built the image under emulation, saved it to a tarball, scp'd the tarball to the NAS, and `docker load`ed it there. It worked but it was slow and it meant babysitting a `.tar` file through the whole pipeline.

The fix was to stop building locally at all. Setting `DOCKER_HOST: ssh://nas` for the job points every `docker` command at the NAS's own daemon over SSH, so `docker build --platform linux/arm64` compiles the image natively where it's going to run. No QEMU, no save/scp/load dance, no local Docker Desktop dependency on the runner at all. That part was a clean win and it's the part I got right first.

## Fix one: carriage returns

Getting the actual secret onto disk was the part that kept breaking. The workflow reads a `TICKETING_ENV` secret and writes it to `.env` with PowerShell. My first version was one line: `Set-Content -Path .env -Value $env:TICKETING_ENV -Encoding ascii`. Windows text APIs default to CRLF, so that's what landed in the file. Docker Compose's `env_file` parser reads CRLF lines fine but doesn't strip the trailing `\r` off the value, so a variable like `IMAP_PASSWORD` came out one invisible carriage-return character longer than it should have been. The container's IMAP client failed to authenticate against a password that, printed to a terminal, looked completely correct.

The fix was to stop trusting `Set-Content` and write the file by hand:

```powershell
$body = $env:TICKETING_ENV.Replace("`r`n", "`n").Replace("`r", "`n")
[System.IO.File]::WriteAllText(
    (Join-Path (Get-Location) ".env"),
    $body,
    (New-Object System.Text.UTF8Encoding $false)
)
```

Normalize every line ending to LF first, then write it with an explicit encoding that won't add a byte-order mark. Same commit also moved the final `docker compose up -d` off the runner and onto the NAS itself, over `ssh nas "cd ... && docker compose up -d"`, so Compose reads the LF-clean copy that got scp'd there rather than whatever the runner's environment might do to it. Belt and suspenders, but by that point I didn't trust either side alone.

## Fix two: a stale value winning by default

While I was in there I also pinned `APP_PORT` on the NAS-side file after every deploy, deleting any `APP_PORT=` line already present and appending a fresh one. This one is a dotenv semantics quirk, not a Windows encoding problem: if the secret ever contained a leftover `APP_PORT` from an earlier port assignment, the last occurrence in the file wins, silently, with no error. I'd already been bitten once by a port collision with another service on the same NAS, so I wasn't going to leave that resolution to chance a second time.

## Fix three: the dollar sign

The last one was the strangest. The Compose documentation says values in `env_file` are not interpolated, only values in the `environment:` block are. In practice, this version of Compose substitutes `$VAR` references it finds inside `env_file` values anyway. A password like `N3ptune$47` doesn't survive that: Compose sees `$47` as a reference to an environment variable named `47`, finds nothing, and substitutes an empty string. The container gets `IMAP_PASSWORD=N3ptune`, seven characters short, and fails auth again, differently than before.

The fix is one `.Replace()` call, doubling every literal `$` to `$$` before the file ever gets written, because `$$` is Compose's documented escape for a literal dollar sign:

```powershell
$body = $env:TICKETING_ENV.Replace("`r`n", "`n").Replace("`r", "`n").Replace('$', '$$')
```

## What stuck

Three unrelated bugs, one symptom each time: a service that authenticates fine locally and fails silently once it's carried through this pipeline. CRLF added a character. A stale port line won a naming conflict. A dollar sign got read as a variable reference. None of them threw an error anywhere in the workflow logs, because from Compose's point of view every one of those files was syntactically valid. The only proof was the container crashlooping or failing to authenticate, and the only way to find the difference was diffing what went into the secret against what came out the other end inside the container.

The env file is nine lines now. Getting it there intact took a `.Replace` chain with three calls on it.
