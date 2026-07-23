---
title: "One Engine, One CUDA Stream: Why Your GPU Sat at 10% Utilization Under Load"
date: "May 2026"
readTime: "6 min"
tags: ["Python", "OCR", "CUDA", "Concurrency"]
---

## The symptom

The office runs an inference server that OCRs scanned pages with RapidOCR on a GPU box (an RTX 5000 Ada). A batch feature feeds it pages through four concurrent worker threads, one page at a time each. During a 32-page run, `nvidia-smi` showed GPU utilization sitting at 5-10%. Four threads should have kept a GPU busy. Something was serializing work that looked, from the Python side, like it was running in parallel.

The number that made the bug obvious: an isolated OCR call took about 0.3 seconds. The same call, with all four worker threads in flight, took about 2.6 seconds per page. Roughly nine times slower under "concurrency" than alone. That ratio doesn't come from GPU contention. It comes from four threads taking turns.

## Why one engine can't do two things at once

RapidOCR wraps three ONNX Runtime sessions: detection, classification, recognition. The server builds exactly one `RapidOCR` instance at startup and every request calls `predict()` on it. On CPU that's fine, ONNX Runtime's CPU execution provider handles concurrent calls reasonably well. On CUDA, an `InferenceSession` binds to a CUDA stream, and by default that's the single default stream for the process. Every `predict()` call, regardless of which thread issues it, queues its GPU work on that one stream. The four FastAPI executor threads were real OS threads doing real work, but the GPU only had one lane to run kernels in. Thread count was a red herring; stream count was the actual concurrency limit, and it was 1.

## The fix: a pool, not a bigger executor

The obvious wrong fix is "add more threads." The actual fix is more engines. Each `RapidOCR` instance owns its own session trio, so each instance gets its own CUDA stream. Four instances means four streams means four pages of GPU work genuinely overlapping.

`OcrModelLoader` grew a `gpu_instances` parameter (env var `OCR_GPU_INSTANCES`, default 1) that sizes a pool built at `load()` time:

```python
engines: List[object] = []
for _ in range(self.gpu_instances):
    engines.append(self._construct_engine(RapidOCR, use_gpu))
self._install_engines(engines)
```

`predict()` checks an engine out of a `queue.Queue`, uses it, and returns it in a `finally` so a raise inside inference can't shrink the pool:

```python
engine = self._engine_pool.get()
try:
    np_img = _pil_to_bgr(image)
    raw, _elapsed = engine(np_img)
finally:
    self._engine_pool.put(engine)
```

Default of 1 keeps the pre-pool behavior byte-for-byte: one engine, one queue slot, effectively the same serialization as before. In production this got set to 4, matching the number of concurrent work orders the batch feature is meant to run.

Bumping the pool alone wasn't enough. The FastAPI executor's thread ceiling in `routers/ocr.py` had been hardcoded to 4 with a comment explaining that a bigger pool bought nothing when there was only one engine to serialize on anyway. True at the time, wrong now. That got pulled out into its own `OCR_EXECUTOR_WORKERS` env var so the executor can be sized to actually feed a bigger engine pool instead of leaving it starved.

## What review caught before it shipped

Sizing two independent knobs (`GPU_INSTANCES` for the engine pool, `EXECUTOR_WORKERS` for the thread pool) invites a specific mismatch: what happens when the executor has more threads than the pool has engines? Extra worker threads just park on the blocking `queue.get()`, waiting for an engine that isn't there yet. That's fine by itself. It stops being fine once you add a request timeout.

The router wraps each OCR call in `asyncio.wait_for` so a pathological page can't hang a request forever. If that timeout fires, the caller gets a 504 and the async future is cancelled. But cancelling the future does nothing to the underlying thread, which is still blocked inside a synchronous `queue.get()` with no way to interrupt it. When an engine eventually frees up, the parked thread claims it and runs a full `predict()` to completion, GPU work done entirely for a response nobody will ever read. The fix wasn't code, it was a comment: an explicit operator note in `routers/ocr.py` telling whoever tunes these values to keep the two knobs equal, since a smaller executor just idles engines (harmless) while a larger one wastes GPU cycles on abandoned requests (not harmless).

The second thing review caught was a genuine edge case in `_install_engines`. Passing it an empty list used to be silently accepted, which meant `_engine_pool` would exist but have nothing in it, and the first `predict()` call would block on `queue.get()` forever. There was already a correct way to express "no engine available": stub mode, which short-circuits `predict()` before the queue is ever touched. So an empty list now raises `ValueError` outright, pointing at stub mode as the real way to get that behavior:

```python
if not engines:
    raise ValueError(
        "_install_engines requires at least one engine; an empty "
        "pool would deadlock predict() at queue.get(). Use stub-mode "
        "via require_real=False if you need a no-op loader."
    )
```

## The legacy alias

One existing test poked `loader._engine` directly to inject a fake engine, from before pooling existed. Rather than rewrite it, `_install_engines` keeps `self._engine` around as an alias pointing at the pool's first entry. For the default `gpu_instances=1` case that alias is exactly right, since there's only one engine to point at. For `gpu_instances > 1` it's informational only: `predict()` always goes through the pool, never through `self._engine` directly, so the alias can't drift out of sync with what's actually serving requests.

## Test coverage that came out of this

The malformed-engine test got migrated onto `_install_engines()` since that's the real entry point now. New tests cover the empty-list rejection, a mid-loop construction failure (the third of four engines raising during `load()`, asserting that `_engine`, `_engine_pool`, `is_loaded`, and `backend` all land in the same not-loaded shape that `app.py`'s lifespan handler keys off of), and every branch of the executor's env-var parsing: unset, empty string, non-integer, zero, negative, and a normal positive value. Test count went from 36 to 39.

None of this needed a GPU to verify. The pool's checkout-and-return contract, the empty-pool rejection, and the failure-mode bookkeeping are all pure Python behavior, tested against a fake `RapidOCR`-shaped stand-in that sleeps on command so a test can prove two calls actually overlapped instead of just trusting that they did.
