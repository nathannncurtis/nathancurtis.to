---
title: "Testing Swift You Can't Run: A Python Oracle And A Swiftc Harness"
date: "June 2026"
readTime: "6 min"
tags: ["Swift", "Testing", "Python"]
---

## No Mac, no simulator, no Xcode

I was porting the office's Android field-service app to iOS. The Android app is Kotlin and Jetpack Compose; the port is Swift and SwiftUI, targeting iOS 26 and the new Liquid Glass APIs. The problem: the environment I was writing it in has no Xcode, no simulator, no way to build or run a SwiftUI app at all. I could write the Swift files, but I could not press the play button and watch them work.

That's fine for UI code, which needs eyes on it anyway and would wait for the human at a real Mac. It's not fine for the pure logic underneath the UI: barcode parsing, money-field sanitizing, status-note formatting, sign-in derivation. That logic has to match the Android original exactly, or the port isn't a port, it's a rewrite with the same UI skin and different behavior. I needed a way to prove the Swift was correct without ever compiling the app.

## Two mirrors, one spec

The fix was to write every pure-logic function twice: once in Swift, under `App/Logic/`, using nothing but Foundation, and once in Python, under `app_logic/`. Same behavior, two languages. Then I wrote a set of JSON fixture files, one per function, each a list of input/expected-output pairs pulled straight from reading the Kotlin source. `tests/fixtures/barcode_parse_cases.json`, `money_cases.json`, `served_to_cases.json`, and so on.

The Python side is checked the normal way: pytest asserts the Python oracle against the fixtures. That's the easy half. It proves the *Python* reimplementation is right, but the app doesn't ship Python. It ships Swift I can't run.

## Compiling Swift without Xcode

The other half is a tiny command-line harness, `tools/swiftcheck/main.swift`. It reads a JSON array of request objects from stdin, dispatches each one to the real logic functions, and writes a JSON array of results to stdout:

```swift
switch op {
case "clean":
    return BarcodeParser.cleanScanPayload(s("raw"), isQR: req["isQR"] as? Bool ?? false)
case "hash":
    return Int(OrderHash.hash(s("s")))
case "mockIndex":
    return OrderHash.mockContextIndex(workOrder: s("wo"), pseudoFacility: s("pf"))
...
}
```

A pytest fixture (`swift_eval` in `conftest.py`) compiles `App/Logic/*.swift` together with that harness using `swiftc -O`, producing a standalone binary, and then feeds it the same fixture JSON the Python tests use. `test_swift_parity.py` runs the identical assertions against the compiled output. If `swiftc` isn't installed, the whole file skips instead of failing, so the suite degrades gracefully on machines without the Swift toolchain.

That's the part that made the exercise worth doing: it compiles the actual files that ship in the app, runs them, and compares the output to a spec derived from the Android source, instead of testing a paraphrase written in a different language. No simulator required, because none of this touches SwiftUI, VisionKit, or anything else that needs a UI runtime. `swiftc` and Foundation are enough.

## The JVM hash problem

One function doesn't have an obvious Swift equivalent: the Android app picks which of four canned mock records to show for a demo order by hashing the order's ID with Kotlin's `String.hashCode()` and taking it mod 4. `String.hashCode()` is a JVM-specific algorithm, not something Foundation provides, and there's no "just call it" option in Swift.

So I implemented it by hand: `h = 31*h + codeUnit`, iterating UTF-16 code units, wrapped to 32-bit two's complement.

```swift
static func hash(_ s: String) -> Int32 {
    var h: Int32 = 0
    for unit in s.utf16 {
        h = 31 &* h &+ Int32(unit)
    }
    return h
}
```

To know this was right, I needed real JVM output to check it against, not just internal agreement between my own Swift and Python. `tests/fixtures/hash_cases.json` pins actual `String.hashCode()` values: `"hello"` hashes to `99162322`, `"abc"` to `96354`, and so on. Both the Swift and the Python implementations are asserted against those exact numbers. Getting `"hello"` to come out to `99162322` from three completely different runtimes (JVM, CPython, compiled Swift) is a good way to catch an off-by-one in the overflow handling or a sign error in the modulo. `mockIndex` then floor-mods that hash by 4, and `mock_context_cases.json` checks the full pipeline: a sample order/facility pair has to land on mock variant 2 in both languages, same as it would on Android.

## What it's actually worth

The barcode parser has a similar kind of subtlety worth flagging: 1D labels carry a leading character that scanners read inconsistently, sometimes as `.`, sometimes as `8`, for the same physical label. The Android code drops it unconditionally before parsing; the port has to drop it too, and a fixture case with a `"."`-prefixed and an `"8"`-prefixed variant of the same barcode, asserted to parse identically, is what actually pins that behavior down instead of leaving it as a comment.

None of this replaces a real device test. It doesn't touch the camera, the scanner UI, or Liquid Glass rendering. What it buys is confidence that by the time the code reaches a Mac, the boring, easy-to-get-subtly-wrong parts, the regex, the money-field truncation, the hash, are already proven against a written spec and a second independent implementation. 44 files, 1709 lines, and the only thing that had to wait for Xcode was the UI.
