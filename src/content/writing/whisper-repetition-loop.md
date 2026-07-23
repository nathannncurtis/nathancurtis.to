---
title: "The Day Whisper Said Synergy 250 Times"
date: "July 2026"
readTime: "5 min"
tags: ["Speech Recognition", "Python", "Debugging"]
---

## The transcript that wouldn't stop

whisper-ptt is a push-to-talk dictation tool I built for myself: hold a key, speak, release, and the text types into whatever field has focus. It runs on OpenVINO against the NPU, with a background thread continuously re-transcribing while you talk so the final pass on key-release is fast.

One 41-second dictation came back with the word "synergy" roughly 250 times in a row. I never said "synergy" once. This is a known failure mode for Whisper's decoder: it's autoregressive, so once it emits a token that makes the next token identical more likely than not, it can lock into a loop and just keep emitting the same word (or short phrase) until it hits the max-token limit. medium.en did it to me on real dictation, not a synthetic stress test.

## Why a length check wasn't the fix

My first instinct was something like "if the transcript is unusually long for the audio duration, truncate it." That's fragile: it needs a length model per speaking rate, and a legitimately long, fast utterance would get chopped along with a broken one. The actual signature of the failure is much narrower: the same 1-3 word unit repeated back to back, at least three times, which never happens in real speech. Nobody says "so I was thinking so I was thinking so I was thinking" three times running. That gave me something regex could actually detect instead of something needing a length heuristic per speaking rate.

The pattern:

```python
_REPEAT_RE = re.compile(r"\b(\w+(?:\s+\w+){0,2})(?:[\s,]+\1\b){2,}", re.IGNORECASE)

def _collapse_repeats(text: str) -> str:
    while True:
        collapsed = _REPEAT_RE.sub(r"\1", text)
        if collapsed == text:
            return text
        text = collapsed
```

Group 1 captures a one-to-three-word unit. The rest of the pattern requires that exact unit to repeat at least twice more, back-referenced with `\1`, separated by whitespace or commas. Three total occurrences minimum before it collapses to one. I run it in a loop to a fixpoint rather than a single `.sub()` call, because a decoder loop that alternates between two phrases ("synergy synergy the synergy synergy the synergy") won't fully collapse in one pass; each iteration eats one more layer until nothing changes.

I dropped it into the postprocessing pipeline right after whitespace collapsing and before the final strip/capitalize steps, and verified it against the actual 250-repeat "synergy" text from the failed dictation, not a hand-written test string. It collapsed clean.

## The other half: a silent tail shouldn't cost a re-transcribe

The same commit fixed something unrelated that I noticed while chasing the repetition bug. whisper-ptt already ran a background worker that re-transcribes the growing audio buffer every 1.5 seconds while you're still holding the key (`PARTIAL_INTERVAL`), specifically so the key-release pass has little left to do. But the reuse condition only looked at how much *time* had passed since the last cached pass (`PARTIAL_REUSE_TAIL_S`, 0.6 seconds), not at whether that trailing time actually contained speech.

If you finish talking and keep the key down for a beat (which I do constantly, mid-thought), that trailing silence pushed the tail past 0.6 seconds and threw away the cached transcript entirely, forcing a full re-transcribe of the whole 41-second clip. On medium.en that cost 13 seconds of NPU time at release, on top of whatever silence you'd already waited through.

The fix reuses the existing speech-vs-noise gate (`_speech_stats`, the same 100ms-window RMS check used to decide whether an utterance is worth transcribing at all) on just the tail segment:

```python
tail = audio[n_cached:]
tail_s = len(tail) / state.settings.sample_rate
tail_peak = _speech_stats(tail, state.settings.sample_rate)[1]
tail_silent = tail_peak < max(state.settings.silence_rms, 3 * floor)
if cached and (tail_s <= PARTIAL_REUSE_TAIL_S or tail_silent):
    raw = cached
```

Now a stale cache is only forced when the new audio in the tail actually has energy in it. Silence, no matter how long, reuses the cached background pass.

## Same bug, different layer

The repetition loop and the silent-tail cache are unrelated causes but the same shape of mistake: I'd built a check that measured the wrong thing (transcript length, elapsed time) as a proxy for the thing that actually mattered (repeated content, speech energy). Both fixes replace a proxy with a direct measurement of the property that actually distinguishes good from bad. The regex checks for actual repetition instead of guessing at length. The tail check measures actual audio energy instead of guessing from elapsed time.

The postprocessing step is four lines. It sits in a codebase that already logs `rms`, `peak`, and `floor` for every utterance for exactly this kind of tuning. Next time Whisper decides to loop on a word, the log will show it, and the fixpoint loop will already have eaten it before the text hits the keyboard.
