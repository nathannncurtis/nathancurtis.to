---
title: "A Mic-Reactive Waveform Pill in Pure AutoHotkey"
date: "July 2026"
readTime: "6 min"
tags: ["AutoHotkey", "Windows", "UI"]
---

## The text pill wasn't telling me anything

WhisperPTT is my push-to-talk dictation tool: hold a key, an AutoHotkey script hits a local Python server running an OpenVINO Whisper model, the transcript gets cleaned up by a small local LLM, and the result types itself into whatever field has focus. The whole time this is happening, a little floating pill at the bottom of the screen told me what state I was in: `● REC`, then `… transcribing`. Two strings, swapped by `ShowIndicator()`.

It worked, but it was dumb in a specific way: it couldn't tell me anything my microphone already knew. Is it actually picking up my voice? Did I trail off mid-sentence and it's still "recording" against dead air? A static string can't answer that. What I wanted was a little bar graph that moved with the room, the way Wispr Flow's does, without pulling in a UI framework to get it.

## Getting the level out of the recorder

The Python side already ran a `sounddevice` `InputStream` with a callback that appended each chunk to a buffer. The mic level was sitting right there in that callback, uncomputed:

```python
def callback(indata, frames, time_info, status):
    mono = indata[:, 0]
    self.level = float(np.sqrt(np.mean(np.square(mono))))
    with self._lock:
        self._chunks.append(mono.copy())
```

That's RMS: square each sample, average, square root. `self.level` gets overwritten every callback and reset to `0.0` when recording stops, so it's always either "current" or "silent," never stale.

Then one new route in the HTTP server:

```python
if self.path == "/level":
    rec = state.recorder
    level = rec.level if (rec is not None and rec.recording) else 0.0
    return self._reply(200, f"{level:.5f}")
```

Five decimal places because the values are tiny. On my microphone, ordinary speech peaks around 0.02 RMS, so the format needs that resolution or everything below a shout rounds to `0.00000`.

## Drawing a pill AutoHotkey has no native support for

AHK's `Gui` object gives you real windows, buttons, controls. It does not give you a translucent capsule with rounded, per-pixel-alpha bars floating over the desktop without stealing focus. For that I went straight to GDI+ through `DllCall`.

The window itself is a layered window: a `Gui` created with `+E0x80000 +E0x08000000`, which are `WS_EX_LAYERED` and `WS_EX_NOACTIVATE`. Layered means Windows composites it with per-pixel alpha instead of a single window-wide opacity value. No-activate means clicking or showing it never yanks keyboard focus from the app you're dictating into, which was the one property I couldn't compromise on.

Drawing happens off-screen. `WaveInit()` builds a 32-bit top-down DIB section with `CreateDIBSection`, selects it into a memory DC with `CreateCompatibleDC` and `SelectObject`, then hands that DC to GDI+ with `GdipCreateFromHDC`. Every frame, `WaveDraw()` clears the bitmap, fills a rounded pill background, fills nine rounded capsule bars on top of it, then presents the whole bitmap in one call to `UpdateLayeredWindow` with `ULW_ALPHA`. That's the entire rendering pipeline: draw to memory, blit with alpha, repeat.

The rounded rectangle itself doesn't exist as a GDI+ primitive either, so `WaveRoundFill` builds one from four quarter-circle arcs stitched into a path:

```ahk
WaveRoundFill(gfx, x, y, w, h, r, argb) {
    path := 0
    DllCall("gdiplus\GdipCreatePath", "Int", 0, "Ptr*", &path)
    d := r * 2
    DllCall("gdiplus\GdipAddPathArc", "Ptr", path, "Float", x, "Float", y, "Float", d, "Float", d, "Float", 180, "Float", 90)
    DllCall("gdiplus\GdipAddPathArc", "Ptr", path, "Float", x + w - d, "Float", y, "Float", d, "Float", d, "Float", 270, "Float", 90)
    DllCall("gdiplus\GdipAddPathArc", "Ptr", path, "Float", x + w - d, "Float", y + h - d, "Float", d, "Float", d, "Float", 0, "Float", 90)
    DllCall("gdiplus\GdipAddPathArc", "Ptr", path, "Float", x, "Float", y + h - d, "Float", d, "Float", d, "Float", 90, "Float", 90)
    DllCall("gdiplus\GdipClosePathFigure", "Ptr", path)
    brush := 0
    DllCall("gdiplus\GdipCreateSolidFill", "UInt", argb, "Ptr*", &brush)
    DllCall("gdiplus\GdipFillPath", "Ptr", gfx, "Ptr", brush, "Ptr", path)
    ...
}
```

Set `r` to half the height and you get a capsule; the same function draws both the pill background and each bar.

## Making nine bars look alive instead of jittery

A 40ms `SetTimer` drives `WaveFrame()`, so the pill redraws at 25fps. Polling `/level` every frame would mean an HTTP round trip every 40ms, so it only polls every third tick, roughly 120ms, close enough to 8Hz. Between polls the last known level just keeps driving the animation.

The mic RMS feeds a target, and the target gets smoothed rather than applied directly:

```ahk
target := (Wave.mode = "rec") ? Min(1.0, Wave.level / 0.02) : 0.30
Wave.smooth += (target - Wave.smooth) * 0.30
```

That's a one-line exponential moving average. Without it, nine bars snapping straight to a noisy RMS value look like static. With it, they ease toward wherever the mic is now, and the pill reads as breathing rather than flickering.

The per-bar motion under that smoothed envelope comes from two sine waves at incommensurate frequencies, offset per bar index:

```ahk
ph := Wave.t * 6.5 + i * 0.85
pulse := (Sin(ph) + Sin(ph * 0.57 + 1.9)) * 0.25 + 0.5
```

Because 6.5 and 6.5×0.57 never line up on a short cycle, the nine bars never repeat the same shape twice in a way you'd notice, even though it's only two sine calls and no randomness at all. When you're not recording, the LLM cleanup pass still runs, so I kept the pill up but froze the target at a flat 0.30 and swapped the palette from warm coral (`0xFFFF7A66`) to a cool blue-violet (`0xFF9AA8FF`), so a glance tells you which phase you're in before you've read anything.

## What stayed, and why

The old `ShowIndicator`/`HideIndicator` text pill didn't go away. It still fires for the one case the waveform can't handle: the backend isn't running yet, so there's no server to poll and nothing to draw a level for. Startup and error states still get a plain string. Everything downstream of an actual recording, recording, transcribing, streaming words into the field, gets the pill.

One line in `StreamDeltas()` decides when the pill disappears entirely: the moment the first chunk of cleaned text is ready to type, `WaveHide()` fires and the words just start appearing. No animation fading out, no lingering state indicator competing with the thing it was indicating. The pill's whole job is to fill the silence before there's real output, and it knows to get out of the way the instant there is some.
