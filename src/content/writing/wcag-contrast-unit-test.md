---
title: "Making \"Does This Look Right\" A Unit Test"
date: "June 2026"
readTime: "7 min"
tags: ["iOS", "SwiftUI", "Accessibility", "Testing"]
---

For most of Steddi's life, "is this text legible" was a question I answered by looking at the phone. Toggle dark mode, toggle the grey palette, squint at the settings screen, decide it looked fine. That's a bad way to catch a contrast bug, because it only catches the one you happen to be looking at, in the one theme you happen to have open, at the one moment you remember to check.

The fix wasn't a better eye. It was turning "does this look right" into arithmetic.

## The 48 lines that started it

The commit that kicked this off is small: a new file, `ContrastRatio.swift`, 48 lines, no dependents yet. It's the WCAG 2.x relative-luminance and contrast-ratio formulas, written over Steddi's existing `RGBColor` type and kept deliberately free of UIKit:

```swift
enum ContrastRatio {
    static let aaBody: Double = 4.5
    static let aaLarge: Double = 3.0

    static func linearize(_ channel: Double) -> Double {
        channel <= 0.03928 ? channel / 12.92 : pow((channel + 0.055) / 1.055, 2.4)
    }

    static func relativeLuminance(_ c: RGBColor) -> Double {
        0.2126 * linearize(c.r) + 0.7152 * linearize(c.g) + 0.0722 * linearize(c.b)
    }

    static func ratio(_ a: RGBColor, _ b: RGBColor) -> Double {
        let l1 = relativeLuminance(a)
        let l2 = relativeLuminance(b)
        let hi = max(l1, l2)
        let lo = min(l1, l2)
        return (hi + 0.05) / (lo + 0.05)
    }
}
```

Plus `darken(_:by:)` and `lighten(_:by:)`, two channel-wise mixes toward black and white. That's the whole commit. But the point of it wasn't the math. WCAG's contrast formula isn't new, and I didn't invent it. The point was making it a pure function I could call from a test target, so a claim like "this text is legible" stops being a vibe and starts being a number I can assert on.

## What it grew into

Once the ratio function existed, the rest of the theme system had somewhere to plug in. `SteddiTheme.swift` picked it up for `textSafeAccent`, which takes the user's chosen brand accent (lavender, gold, sage, coral, ocean, slate) and shifts it toward black or white by the minimum amount needed to clear a contrast target, preserving hue so the color still reads as itself. The generalized version of that shift, `ContrastRatio.legible(_:onSurface:target:cap:)`, does a 24-iteration bisection to find that minimum shift, enough precision that nobody has to hand-tune a hex value again.

The same file added `contrastingForeground(on:)`, which answers a narrower question: given an arbitrary fill, should the label on top of it be near-black or near-white? The threshold is a specific number, not a guess:

```swift
static let foregroundFlipLuminance: Double = 0.17912878474779
```

That's `sqrt(1.05 * 0.05) - 0.05`, the luminance at which black and white text contrast a fill equally. Above it, black wins; below it, white wins. And instead of pure `#000`/`#FFF`, the endpoints are `near.black = RGBColor(0.09, 0.08, 0.07)` and `near.white = RGBColor(0.98, 0.97, 0.96)`, close enough to pure to clear AA everywhere, warm enough not to glare against Steddi's dark and light surfaces.

## The bugs it actually caught

None of this matters as an abstraction exercise; it matters because of what it found once it existed. `ThemeContrastTests.swift` is 46 tests now, and a chunk of them are regression tests that pin down a bug and prove the fix, not just the current behavior.

The one I like best is the grey palette's inverted text hierarchy. `textSecondary` in the grey theme was authored at RGB `(0.80, 0.80, 0.81)`, darker than `textMuted` at `0.88`. Nobody would catch that by eye; "secondary" and "muted" look similar enough in isolation that the inversion is invisible until you're staring at both side by side. The ratio math doesn't care how similar they look. It just says secondary contrasted worse than muted on every surface, which is backwards, and it was also below the 4.5 AA floor outright. The test that pins the fix:

```swift
@Test("grey text hierarchy holds: contrast(primary) > contrast(secondary) > contrast(muted) on every surface")
```

Another one: the primary CTA style used to be `.buttonStyle(.glassProminent).tint(accent)`, which forces a hardcoded white label regardless of what fill sits under it. White on the brand accents lands at 2.41–3.47:1, fine for a large glyph, a clean fail for body text. Same story for the destructive button: white on `warmRed` measures 3.79:1, which clears the 3.0 large-text floor but fails the 4.5 body floor the rest of the app holds semantic fills to. Swapping in `contrastingForeground(on:)` for both moved the primary CTA's label to 5.3–7.6:1 across every accent and the destructive button's to ~5.55:1.

The subtlest one is the onboarding theme card. The old model contrasted the copy against the *raw* accent color and picked near-black. But the real rendered surface is that accent tinted through Liquid Glass over a dark backdrop, measured on device at roughly the accent at 0.82 opacity composited over near-black, which is darker than the raw accent the model assumed. So the near-black copy the old code chose landed at only 4.2–4.5:1 on the real surface for the default lavender accent, at or under the AA floor, with zero margin, on the app's default theme. The fix pins a 5.0-with-margin bar instead of a bare 4.5 floor specifically because this bug had already snuck under the floor once.

## Why the compile-time framing matters

None of these are exotic bugs. They're the kind of thing a screenshot review would either miss (the grey inversion, because it's subtle) or catch by luck (the CTA labels, if I happened to preview the right accent that day). Turning the WCAG formula into 110 lines of pure Swift means none of that depends on luck or attention: the theme's palette, its semantic colors, its accent options, and its onboarding surfaces get checked against the actual arithmetic every time the test suite runs, not every time I remember to look.

The file is still just `ContrastRatio.swift`: no UIKit import, no view code, nothing that can't run on a Linux CI box if it had to. Forty-six tests sit on top of it now, and every one of them is really asking the same question the original 48-line commit made askable in the first place: is this color pair actually legible, or does it just look fine to me right now.
