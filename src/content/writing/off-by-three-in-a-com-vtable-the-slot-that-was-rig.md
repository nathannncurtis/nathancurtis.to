---
title: "Off by Three in a COM Vtable: The Slot That Was Right Hid the Five That Weren't"
date: "October 2026"
readTime: "6 min"
tags: ["Zig", "Win32", "DirectWrite"]
---

mdview is my markdown viewer, written in Zig. On Windows it draws text with DirectWrite and Direct2D. The Linux and macOS backends `@cImport` their system headers, but `dwrite.h` is a C++ header (`IDWriteTextLayout : public IDWriteTextFormat`) and `@cImport` only translates C. So the Windows backend declares each COM vtable by hand: an `extern struct` of function pointers, with padding arrays standing in for the methods I don't call.

That makes the slot numbers mine to get right. For one interface I had them wrong by three, and the two calls I was making through it both worked.

## The table in the first commit

```zig
// IDWriteTextLayout vtable — inherits IDWriteTextFormat. We need GetMetrics (index 60) and SetFontWeight/Style/Size
const IDWriteTextLayout_VTable = extern struct {
    // IUnknown (0-2)
    QueryInterface: *const anyopaque,
    AddRef: *const anyopaque,
    Release: *const fn (*anyopaque) callconv(.C) u32,
    // IDWriteTextFormat (3-24) — skip most
    _pad3_24: [22]*const anyopaque,
    // IDWriteTextLayout (25+)
    SetMaxWidth: *const fn (*anyopaque, f32) callconv(.C) HRESULT, // 25
    SetMaxHeight: *const fn (*anyopaque, f32) callconv(.C) HRESULT, // 26
    _pad27: *const anyopaque, // 27 SetFontCollection
    _pad28: *const anyopaque, // 28 SetFontFamilyName
    SetFontWeight: *const fn (*anyopaque, u32, DWRITE_TEXT_RANGE) callconv(.C) HRESULT, // 29
    SetFontStyle: *const fn (*anyopaque, u32, DWRITE_TEXT_RANGE) callconv(.C) HRESULT, // 30
    _pad31: *const anyopaque, // 31 SetFontStretch
    SetFontSize: *const fn (*anyopaque, f32, DWRITE_TEXT_RANGE) callconv(.C) HRESULT, // 32
    _pad33_59: [27]*const anyopaque, // 33-59
    GetMetrics: *const fn (*anyopaque, *DWRITE_TEXT_METRICS) callconv(.C) HRESULT, // 60
};
```

`IDWriteTextLayout` inherits `IDWriteTextFormat`, so the layout's own methods start wherever the format's end. I padded the format as 22 slots. It has 25.

Every setter in that struct is three slots early. `GetMetrics` is where it should be. The comment on the first line pins it at index 60, and the last pad is 27 slots, 33 through 59, which lands it there. The front pad was three short. The trailing pad is numbered by absolute index, so it made up the difference, and of everything after the front pad only the last field landed on the right slot.

## Why nothing looked broken

In that first commit the renderer called two things through this table, `Release` and `GetMetrics`:

```zig
    // TODO: bold/italic formatting via SetFontWeight/SetFontStyle

    // Get height
    var metrics: DWRITE_TEXT_METRICS = undefined;
    _ = vtable(IDWriteTextLayout_VTable, lay).GetMetrics(lay, &metrics);
```

Slot 2 and slot 60, both correct. `GetMetrics` fills in the height of the laid-out block, and `renderTextBlock` returns that height so the caller can advance `y` for the next block. Headings and paragraphs were measured and stacked properly.

The parser was already doing its half. It walked each block for `**` and `*`, stripped the markers, and filled `bold_ranges` and `italic_ranges` with start and length pairs. Nothing read those ranges, so `**bold**` came out as plain text. The call that would have used them was a TODO, four lines above a call through the same struct that worked.

## What the wrong slots pointed at

Counting the real header, these are the methods my five named setters would have reached:

| Field in my struct | Slot I gave it | Method at that slot |
|---|---|---|
| `SetMaxWidth` | 25 | `GetFontSize` |
| `SetMaxHeight` | 26 | `GetLocaleNameLength` |
| `SetFontWeight` | 29 | `SetMaxHeight` |
| `SetFontStyle` | 30 | `SetFontCollection` |
| `SetFontSize` | 32 | `SetFontWeight` |

None of the four commits before the fix calls any of them. If one had, "make this range bold" would have been a call to `SetMaxHeight`, which takes one float and no range. "Make this range italic" would have passed the integer 2 to a method expecting a font collection pointer. The only way to reach the real `SetFontWeight` was the field I'd named `SetFontSize`, which passes a float where the weight goes.

The calls I eventually wrote discard their result with `_ =`, like the other DirectWrite calls in that function. Against the old table, whatever HRESULT the wrong method returned would have been thrown away.

## The fix

One commit, `fix bold/italic: correct IDWriteTextLayout vtable offsets`, 30 insertions and 17 deletions in `src/main.zig`. The pad goes from 22 to 25 and everything after it moves down three:

```zig
    // IDWriteTextFormat (3-27)
    _pad3_27: [25]*const anyopaque,
    // IDWriteTextLayout (28+)
    SetMaxWidth: *const fn (*anyopaque, f32) callconv(.C) HRESULT, // 28
    SetMaxHeight: *const fn (*anyopaque, f32) callconv(.C) HRESULT, // 29
    _pad30: *const anyopaque, // 30 SetFontCollection
    _pad31: *const anyopaque, // 31 SetFontFamilyName
    SetFontWeight: *const fn (*anyopaque, u32, DWRITE_TEXT_RANGE) callconv(.C) HRESULT, // 32
    SetFontStyle: *const fn (*anyopaque, u32, DWRITE_TEXT_RANGE) callconv(.C) HRESULT, // 33
    _pad34: *const anyopaque, // 34 SetFontStretch
    SetFontSize: *const fn (*anyopaque, f32, DWRITE_TEXT_RANGE) callconv(.C) HRESULT, // 35
    SetUnderline: *const fn (*anyopaque, BOOL, DWRITE_TEXT_RANGE) callconv(.C) HRESULT, // 36
    SetStrikethrough: *const fn (*anyopaque, BOOL, DWRITE_TEXT_RANGE) callconv(.C) HRESULT, // 37
    SetDrawingEffect: *const fn (*anyopaque, ?*anyopaque, DWRITE_TEXT_RANGE) callconv(.C) HRESULT, // 38
    _pad39_59: [21]*const anyopaque, // 39-59
    GetMetrics: *const fn (*anyopaque, *DWRITE_TEXT_METRICS) callconv(.C) HRESULT, // 60
```

The trailing pad shrinks from 27 to 21: three for the corrected front, three more because 36 to 38 are now real fields. `GetMetrics` is still 60, and it's the one field in the struct the diff doesn't touch.

The TODO became two loops:

```zig
    // Apply bold ranges
    const vt_layout = vtable(IDWriteTextLayout_VTable, lay);
    var bi: u32 = 0;
    while (bi < block.bold_count) : (bi += 1) {
        _ = vt_layout.SetFontWeight(lay, 700, .{ .startPosition = block.bold_ranges[bi][0], .length = block.bold_ranges[bi][1] });
    }
    // Apply italic ranges
    var ii: u32 = 0;
    while (ii < block.italic_count) : (ii += 1) {
        _ = vt_layout.SetFontStyle(lay, 2, .{ .startPosition = block.italic_ranges[ii][0], .length = block.italic_ranges[ii][1] });
    }
```

700 is `DWRITE_FONT_WEIGHT_BOLD` and 2 is `DWRITE_FONT_STYLE_ITALIC`.

## Counting the header

The right number is a count of `STDMETHOD` lines under `IDWriteTextFormat` in `dwrite.h`: eight setters, eight matching getters, then nine more from `GetFontCollection` through `GetLocaleName`. That's 25, so slots 3 through 27, and the layout starts at 28.

The one method I'd been calling was the one I'd pinned by its absolute index. Everything I'd placed by counting forward from the top was wrong. Nothing checks a hand-declared vtable. The `vtable` helper is a `@ptrCast`, and Zig will call whatever address is in the field. The only thing the app exercised was whether text laid out, and that goes through slot 60.

Syntax highlighting was committed five minutes after the fix. It colors tokens with `SetDrawingEffect`, slot 38, which the old table didn't declare at all.
