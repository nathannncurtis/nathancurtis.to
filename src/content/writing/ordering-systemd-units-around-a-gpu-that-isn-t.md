---
title: "Ordering systemd Units Around a GPU That Isn't Ready Yet"
date: "July 2026"
readTime: "6 min"
tags: ["systemd", "Linux", "GPU", "Reliability"]
---

The office runs a classifier service on a GPU box: it resolves its compute device once, at startup, with `torch.cuda.is_available()`. If CUDA is up, it loads onto the GPU. If not, it falls back to `CPUExecutionProvider` and keeps running, just slower. That fallback is the right behavior for a server that also does OCR and can't afford to block on a GPU that might not show up. It also turned into a trap, because "keeps running" looks exactly like success in every log line except the one that says which device it picked.

## The bug, twice

On July 16th the classifier came up on CPU after a reboot. Not a crash, not an error, just the resolver reading `torch.cuda.is_available() == False` before the CUDA runtime had finished initializing, and quietly locking in that answer for the life of the process. A restart fixed it. I chalked it up to a boot-order race and moved on.

On July 20th it happened again, and this time it should not have been possible. `nvidia-smi` was healthy, `/dev/nvidia0` existed, the driver was fully up by every check I had been using to decide "is the GPU ready." The classifier still started on CPU. That's the recurrence that mattered, because it meant my mental model of "ready" was wrong, not just my timing.

## Why /dev/nvidia0 isn't enough

`/dev/nvidia0` is created when the base NVIDIA kernel module attaches to the card. `torch.cuda.is_available()` doesn't just need the card attached, it needs `/dev/nvidia-uvm`, the device node for the Unified Virtual Memory module that CUDA's runtime actually talks to. The uvm module can lag the base module at boot. So a check that gates on `/dev/nvidia0` alone will pass while the thing CUDA needs still isn't there. That's the exact gap the July 20th race walked through: driver present, uvm not yet, classifier's Python process asks the question a few seconds too early, gets `False`, and never asks again.

Two fixes, at two different layers.

**Ordering.** The unit now declares `After=` and `Wants=` on `nvidia-persistenced.service`, the daemon that loads and holds the driver at boot. That narrows the race window but doesn't close it, because `nvidia-persistenced` coming up doesn't guarantee `nvidia-uvm` has too.

**Waiting on the right node.** `ExecStartPre` now polls for `/dev/nvidia-uvm` specifically, not `/dev/nvidia0`:

```
ExecStartPre=/bin/bash -c 'for i in $(seq 1 60); do [ -e /dev/nvidia0 ] && [ -e /dev/nvidia-uvm ] && exit 0; sleep 2; done; echo "CUDA device node /dev/nvidia-uvm absent after 120s; classifier starting on CPU" >&2; exit 0'
```

A bare `[ -e ... ]` test, not `nvidia-smi`, because `nvidia-smi` doesn't work inside this unit's sandbox at all, even with systemd's `+` root-prefix escape. The device nodes are visible because the unit doesn't set `PrivateDevices`, so a plain file-existence check is the only probe that actually works from inside the sandbox.

That script always exits 0. This box also serves OCR requests, and a GPU that's genuinely absent, or never comes up, must degrade to CPU rather than block the whole service from starting. The point isn't to force GPU-or-nothing, it's to give CUDA a fair 120 seconds before the classifier commits to an answer it can't take back. `TimeoutStartSec` went up to 240 to cover that window; the previous, shorter probe had gotten killed mid-loop by systemd's 90-second default start timeout, which is its own way of losing the race.

## Making the failure loud instead of silent

The fixes above shrink the race but I didn't want to bet the whole story on "shrink it enough." The real problem on July 16th and 20th wasn't that CPU fallback happened, it's that nobody noticed until someone happened to look. So `deploy.sh` now reads the classifier's own "Inference server ready" log line after every deploy and checks whether it says `device=cuda` or `device=cpu`:

```bash
if grep -q "device=cuda" <<<"$ready_line"; then
  log "post-deploy: classifier on GPU (device=cuda)"
else
  log "WARNING: classifier came up on CPU, not the GPU: ${ready_line}"
  log "WARNING: check the GPU (nvidia-smi + '[ -e /dev/nvidia-uvm ]') and run"
  log "WARNING:   sudo systemctl restart $SVC"
fi
```

It doesn't abort the deploy. CPU is a valid degraded mode, not a failure state, and I don't want a flaky GPU turning into an outage for the OCR path. It just makes sure a raced classifier can't ship silently on CPU again, the way it did twice before anyone noticed. `rollback.sh` got the matching half: the new drop-in unit file is snapshotted before every deploy (or sentinel-marked if this is its first install) so a rollback either restores the previous drop-in or removes it cleanly, instead of leaving orphaned config behind.

## What I'd take from this

The bug was never really about GPUs. It was about writing a readiness check for a resource ("the GPU is up") and picking the wrong artifact to represent it ("a device file exists"). `/dev/nvidia0` and `/dev/nvidia-uvm` both looked like reasonable proxies for "CUDA is usable," and only one of them actually was. The first fix I shipped, back on the 16th, used the wrong proxy and I didn't find out until the same failure mode came back four days later wearing a healthier-looking driver.

The fix that stuck wasn't just "wait longer." It was picking the specific device node the code I was gating actually depends on, then adding a second, independent check after deploy that reads the classifier's own claim about its device and complains if it's the wrong one. One layer prevents the race. The other layer catches it if the first layer is ever wrong again, which, given how confidently it was wrong the first time, felt like the more important half.
