---
title: "Deploying a Modern Logging Server to a NAS from the Past: Seq on a QNAP with a 2015 Kernel"
date: "June 2026"
readTime: "6 min"
tags: ["Docker", "CI/CD", "Self-Hosting"]
---

We wanted centralized logging for the internal Windows apps at the office. Each app already writes local logs with a rotating file handler, but those only help if you're sitting at the machine that broke. So: a small self-hosted [Seq](https://datalust.co/seq) server as a secondary sink, running in Docker on the office's QNAP NAS.

Seq itself is normally a five-minute `docker run`. The NAS is the problem. It's running a QNAP firmware build whose Linux kernel is 4.2.8, a kernel from 2015. Everything that follows is what it took to get a 2026 logging server running on it.

## The runtime pin

Seq 2024 and later ships on .NET 8. .NET 8's CoreCLR won't initialize on kernels much older than 5.x, it just fails to start. I confirmed 2023.4, which runs on .NET 7, works fine on this box, and pinned the image to it:

```yaml
# Pinned to 2023.4 because the NAS runs kernel 4.2.8 and Seq 2024+
# uses .NET 8, which fails to initialize CoreCLR on this kernel.
# 2023.4 is the newest version that runs.
image: ghcr.io/<our-org>/seq-server:2023.4
```

That means no automatic Seq updates going forward. Fine trade for keeping the thing on hardware we're not about to replace.

## Networking that shouldn't have been hard

With 2023.4 running, `docker ps` showed port 5341 published, but `curl localhost:5341` from the NAS itself returned connection refused. Docker's bridge-network port publishing just wasn't reachable, even locally. Iptables NAT wasn't doing its job through the SonicWall in front of this LAN on a kernel this old. I switched the compose service to `network_mode: host` so the container shares the NAS's network namespace directly, with no port-publish translation involved.

Host networking meant Seq's own listen config now mattered, since there's no Docker port mapping to hide behind. Seq's default bind is port 80, which collides with QNAP's own web UI, so I set `SEQ_API_LISTENURIS` to bind 5341 explicitly. First attempt:

```
SEQ_API_LISTENURIS: "http://+:5341"
```

Seq threw `UriFormatException` on startup. `http://+:5341` is valid syntax for .NET's `HttpListener` wildcard binding, but Seq parses each entry in that variable with a plain `new Uri(s)`, and the standard `System.Uri` parser has no idea what to do with a bare `+`. Swapping to `http://0.0.0.0:5341` binds the same set of interfaces and parses cleanly. Caught it in testing before it ever reached the deploy; a one-character diff, but worth writing down because the two forms look interchangeable if you've only ever used one of them.

## A hardcoded port I didn't expect

Seq worked, until it didn't fully. `GET /` on 5341 came back as a JSON 404 instead of the bundled UI. Seq treats any port listed in `api.ingestionPorts` as ingestion-only. Log events in, nothing else out. The defaults are `[5341, 45341]`. I overrode both array indices to push 5341 out of that list, using .NET's `__N` env-var array syntax, and verified the change landed both via the env var and by editing `Seq.json` on disk directly. Made no difference. The 404 kept coming.

Turned out the ingestion-only behavior for 5341 is hardcoded at the listener level, below whatever `api.ingestionPorts` controls. No config knob reaches it. The fix was to stop fighting it: move the UI to an arbitrary port that isn't in any default list. I picked 8341. It serves UI, API, and ingestion together, no special-casing, no override needed. The four apps that write to Seq just needed one URL changed.

## The deploy pipeline, three tries in

The deploy side went through its own arc. First pass drove the NAS's Docker daemon remotely over SSH (`DOCKER_HOST=ssh://nas`) from an internal self-hosted runner, so the NAS needed nothing but Docker and SSH. No git, no runner, no env file on it. That relied on a wrapper script to fix the NAS's restrictive default SSH `PATH`, and QNAP firmware updates have a habit of wiping exactly that kind of thing.

Next pass had the runner pull and `docker save` the image to a tar, scp it over with the compose file and env, then `load` and `compose up` on the NAS by invoking Container Station's `docker` binary at its absolute path. That sidestepped the PATH problem entirely, at the cost of shipping a full image tarball on every deploy.

The version I landed on splits the work in two jobs. A `stage` job on a plain `ubuntu-latest` cloud runner re-hosts the upstream `datalust/seq:2023.4` image into our own GHCR namespace with a manifest copy:

```yaml
- name: Re-host upstream image into GHCR (all platforms incl arm64)
  run: |
    docker buildx imagetools create \
      -t ${{ env.GHCR_IMAGE }}:${{ env.TAG }} \
      -t ${{ env.GHCR_IMAGE }}:latest \
      ${{ env.UPSTREAM }}
```

`imagetools create` copies manifests, not layers, so the `linux/arm64` variant the NAS needs comes along for free without a rebuild. The `deploy` job then just ships `docker-compose.yml` and `seq.env` to the NAS and runs `docker login ghcr.io` plus `compose pull` and `compose up -d`, still via Container Station's docker at its absolute path over plain SSH. No local Docker engine on the runner, no dependency on Docker Hub reachability from the NAS, no PATH wrapper to babysit. The seq-up healthcheck still gets paused before the pull and resumed with `if: always()`, so a bad deploy still pages instead of going quiet.

Four commits earlier this was `datalust/seq:2023.4` straight off Docker Hub with a hand-typed PATH fix on a Windows runner. Now it's a two-job pipeline that re-hosts the image once and lets the NAS pull it like any other registry client. Same pinned tag the whole time: 2023.4, because a kernel from 2015 doesn't get a vote on which .NET version it runs.
