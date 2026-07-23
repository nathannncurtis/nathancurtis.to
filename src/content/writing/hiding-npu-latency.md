---
title: "Hiding NPU Latency: Re-Transcribing in the Background While the Key Is Still Held"
date: "July 2026"
readTime: "4 min"
tags: ["Python", "Concurrency", "Performance"]
---

## The gap between key-up and text

WhisperPTT is a push-to-talk dictation tool: hold a key, speak, release, and the transcription gets typed into whatever window has focus. The backend is a small localhost HTTP server. `/start` opens the mic, `/stop` closes it, runs the audio through Whisper on the NPU, and replies with the text.

That worked, but the whole thing was gated on one blocking call. You'd release the key and then wait for a multi-second Whisper pass on audio that had, in some cases, been sitting in memory for several seconds already doing nothing. The recording itself was free. The transcription was not, and it only started after you'd stopped talking.

## Transcribe while the key is still down

The fix was to stop treating `/stop` as the moment transcription begins and start treating it as the moment transcription finishes. A background worker thread now re-transcribes the growing recording every `PARTIAL_INTERVAL` (1.5) seconds while the key is still held:

```python
def _partial_worker(state: _State, stop_evt: threading.Event) -> None:
    sample_rate = state.settings.sample_rate
    last_n = 0
    while not stop_evt.wait(PARTIAL_INTERVAL):
        recorder = state.recorder
        if recorder is None or not recorder.recording:
            break
        audio = recorder.snapshot()
        if (len(audio) - last_n) / sample_rate < PARTIAL_MIN_NEW_S:
            continue
        with state.asr_lock:
            if stop_evt.is_set():
                break
            text = state.transcriber.transcribe(audio)
        state.partial = (len(audio), text)
        last_n = len(audio)
```

`Recorder.snapshot()` is the piece that makes this safe: it takes the lock the mic callback also uses, concatenates whatever chunks have arrived so far, and returns a copy without touching the live stream. Recording keeps running underneath it. `PARTIAL_MIN_NEW_S` (0.5s) just stops the worker from re-running Whisper on a few hundred milliseconds of new audio every cycle if someone's talking fast.

## Deciding whether the cache is still good

The interesting part is what happens at `/stop`. By the time the key comes up, the background worker has probably already transcribed almost everything. The question is whether "almost" is close enough:

```python
with state.asr_lock:
    n_cached, cached = state.partial
    tail_s = (len(audio) - n_cached) / state.settings.sample_rate
    if cached and tail_s <= PARTIAL_REUSE_TAIL_S:
        state.logger.info("live transcript reused (tail=%.2fs)", tail_s)
        raw = cached
    else:
        raw = state.transcriber.transcribe(audio)
```

`tail_s` is how much audio arrived after the last background pass finished. If it's under `PARTIAL_REUSE_TAIL_S` (0.6s), that's assumed to be trailing silence between the last word and the key release, not new speech, and the cached transcript is reused outright. No final Whisper call. If someone kept talking right up to the release, `tail_s` will be bigger than 0.6s and the code falls back to a full pass on the complete audio, logging that the cache went stale so the threshold is tunable from the logs later.

`state.asr_lock` is what keeps this honest. The worker and the `/stop` handler both call `state.transcriber.transcribe()`, and the NPU pipeline isn't meant to be hit concurrently, so the lock serializes them. `/stop` sets `partial_stop` before pulling the lock, which lets a worker pass that's mid-transcribe finish, then has the worker check `stop_evt.is_set()` right after acquiring the lock so it can bail instead of writing a `partial` result nobody will read. Whichever side gets there first, the other waits, not races.

## What the logs said

The existing per-utterance log line already reported `whisper=%.2fs`, the time spent inside the Whisper call for that utterance. After this change, on the common case (key held for a couple seconds, brief pause before release), that number reads `whisper=0.00s`. Release-to-text latency collapses to whatever the LLM cleanup pass costs, because the transcription itself already happened before the key came up. On the case where someone talks straight through the release, it falls back to the old behavior: a real Whisper call on the full utterance, logged as `live transcript stale`.

Two other small pieces made this land cleanly: `config.ini`'s logging level went from `INFO` to `DEBUG` so the per-pass background transcript log (`live: %.1fs transcribed in background -> %d chars`) actually shows up while tuning `PARTIAL_INTERVAL` and the reuse threshold, and `/cancel` sets `partial_stop` too, so an aborted recording doesn't leave the worker thread spinning after the mic's already gone.
