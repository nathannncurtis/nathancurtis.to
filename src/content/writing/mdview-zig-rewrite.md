---
title: "Dropping a 200MB WebView for 285KB of Zig"
date: "April 2026"
readTime: "7 min"
tags: ["Zig", "Rust", "Native GUI"]
---

## Why rewrite a working app

mdview started as a Rust project using WebView2 to render markdown. It worked well on Windows. Dark theme, borderless floating window, file watching, syntax highlighting. The binary was about 1.1MB, which is small for a desktop app. But it had a hard dependency on WebView2, which is a ~200MB runtime that ships with Windows 10+ but not with every version of every OS.

I wanted mdview to work on Linux and macOS too. WebView2 is Windows-only. I could have used a cross-platform webview wrapper like Tauri's wry, but then I'd be shipping a browser engine on every platform just to render some formatted text. That felt wrong. Markdown is headings, paragraphs, code blocks, and lists. You don't need a DOM, a JavaScript engine, and a compositor for that.

So I rewrote it in Zig with platform-native text rendering. No webview, no runtime, no dependencies. The result is a ~285KB binary on all three platforms.

## The platform abstraction

The core challenge is that every OS has a completely different text rendering stack:

- **Windows**: DirectWrite + Direct2D
- **Linux**: Cairo + Pango (via X11)
- **macOS**: CoreText + CoreGraphics (via Cocoa)

Zig handles this cleanly with comptime platform switching. The entire platform layer is selected at compile time with no runtime cost:

```zig
pub const platform = switch (builtin.os.tag) {
    .windows => @import("win32.zig"),
    .linux   => @import("linux.zig"),
    .macos   => @import("macos.zig"),
    else     => @compileError("Unsupported platform"),
};
```

Each platform module implements the same interface: create a window, set up a render context, draw text runs, handle input events. The shared code (markdown parsing, scroll state, file watching) calls into `platform.*` and doesn't know or care which OS it's running on.

The build system links the right libraries per-platform:

```zig
if (resolved.os.tag == .windows) {
    exe_mod.linkSystemLibrary("d2d1", .{});
    exe_mod.linkSystemLibrary("dwrite", .{});
    exe_mod.linkSystemLibrary("user32", .{});
} else if (resolved.os.tag == .linux) {
    exe_mod.linkSystemLibrary("x11", .{});
    exe_mod.linkSystemLibrary("cairo", .{});
    exe_mod.linkSystemLibrary("pangocairo-1.0", .{});
} else if (resolved.os.tag == .macos) {
    exe_mod.linkFramework("Cocoa", .{});
    exe_mod.linkFramework("CoreText", .{});
    exe_mod.linkFramework("CoreGraphics", .{});
}
```

## Why Zig and not Rust

The Rust version worked. The question wasn't "can Rust do this" but "what's the right tool for this specific rewrite."

Zig's advantages for this project came down to three things:

**C interop without bindings.** DirectWrite, Cairo, and CoreText are all C or C-compatible APIs. In Rust, you'd use crate wrappers (directwrite-rs, cairo-rs, core-text-rs) that add abstraction layers, version churn, and dependency trees. In Zig, you `@cImport` the system headers directly. No bindings crate, no build.rs, no pkg-config wrangling. The API you call is the API the OS documents.

**Cross-compilation out of the box.** `zig build -Dtarget=x86_64-linux-gnu` on a Windows machine produces a Linux binary. No Docker, no VM, no cross-compilation toolchain to install. The CI builds all three platforms from a single Ubuntu runner.

**Tiny binaries.** Zig's standard library is minimal compared to Rust's. With `-Doptimize=ReleaseSmall`, the binary is ~285KB. The Rust version was 1.1MB without the webview, and that's already lean for Rust. For a tool that people download to view text files, binary size signals intent.

## What was hard

**CoreText on macOS** was the most difficult platform. DirectWrite and Cairo/Pango have similar mental models: you create a text layout object, set constraints, and ask for line breaks. CoreText works differently. You create an attributed string, generate a framesetter, then extract line origins and glyph runs from a frame. The coordinate system is flipped (origin at bottom-left). Every measurement needs to be inverted.

**Unicode** is always hard. Markdown files contain emoji, CJK characters, combining marks, and zero-width joiners. Each platform's text shaping engine handles these differently. Getting consistent behavior across all three required testing with a corpus of edge-case markdown files and accepting that "consistent" sometimes means "consistently imperfect."

**File watching** works completely differently per OS. Windows has ReadDirectoryChangesW, Linux has inotify, macOS has FSEvents. I ended up polling with stat() on a timer because the cross-platform file watching complexity wasn't worth it for a tool that checks one file every 500ms.

## The numbers

- Rust + WebView2: ~1.1MB binary + ~200MB runtime dependency, Windows only
- Zig native: ~285KB binary, no dependencies, Windows + Linux + macOS

Startup is near-instant on all platforms. Memory usage sits around 8-15MB depending on the document size. The old WebView2 version used 60-80MB because it was running a full browser compositor.

## Would I use Zig again

For this kind of project, yes. Platform-native GUI, C API interop, small binary, cross-compilation. Zig fits perfectly here.

For a project with complex data structures, async networking, or a large ecosystem of libraries to lean on, I'd still reach for Rust. Zig's package ecosystem is small and the language is still pre-1.0. You're signing up to own more of the stack yourself.

That's a tradeoff, not a flaw. For mdview, owning the stack was the point.
