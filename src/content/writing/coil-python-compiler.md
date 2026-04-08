---
title: "Building a Python Compiler Because the Existing Ones Were All Broken"
date: "February 2026"
readTime: "6 min"
tags: ["Python", "C", "Tooling"]
---

## The problem with shipping Python

Python is a great language to build tools in. It's a terrible language to distribute tools in. If you want to hand someone a .exe and have it work, your options are PyInstaller, cx_Freeze, Nuitka, or py2exe. All of them share the same problem: they're complicated, fragile, and slow to debug when they break.

cx_Freeze was what I used for years. It worked until it didn't. Hidden imports, missing DLLs, setup scripts that break between versions, and cryptic errors that require reading cx_Freeze's source to diagnose. I spent more time fighting the build tool than writing the tools it was supposed to package.

So I wrote Coil. The pitch is simple: point it at a project directory, get a standalone .exe back. No spec files, no hook scripts, no per-file configuration.

## How it works

Coil's build pipeline has four stages:

**1. Scanning.** Coil walks your project, parses every .py file's AST to extract imports, and resolves them against the installed environment. It detects GUI frameworks automatically (PyQt5, tkinter, etc.) so it knows whether to build a console or windowed app.

```python
def extract_imports(source: str) -> set[str]:
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return set()

    modules: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                root = alias.name.split(".")[0]
                modules.add(root)
        elif isinstance(node, ast.ImportFrom):
            if node.module is not None and node.level == 0:
                root = node.module.split(".")[0]
                modules.add(root)
    return modules
```

**2. Runtime preparation.** Coil downloads and embeds a standalone Python runtime (the embeddable zip distribution from python.org). This means the target machine doesn't need Python installed. The runtime gets cached so subsequent builds don't re-download.

**3. Dependency installation.** Coil installs your project's dependencies into a clean isolated environment (not your system site-packages). It hashes the dependency list and caches the result, so identical dependency sets across projects share a single cached install.

**4. Packaging.** Two modes: **bundled** produces a directory with the runtime, dependencies, your code, and a launcher. **Portable** takes that directory, zips it, and appends it to a custom C bootloader to produce a single .exe.

## The bootloader

The portable mode is where it gets interesting. Coil ships a 15KB bootloader written in C and compiled with `zig cc`. When you run the .exe, the bootloader:

1. Reads a 12-byte trailer from the end of its own PE file
2. The trailer contains the zip offset, a build hash, and a magic number (`0x434F494C`, which is "COIL" in ASCII)
3. Extracts the embedded zip to a cache directory (`%LOCALAPPDATA%\coil\AppName\<hash>\)
4. Uses a named mutex to prevent concurrent extraction races
5. Validates extraction via a marker file
6. Launches the real application and forwards the exit code
7. Cleans up old cached builds (keeps the last 3)

```c
/* Trailer format (last 12 bytes of file):
 *   [4 bytes: zip offset as uint32]
 *   [4 bytes: build hash as uint32]
 *   [4 bytes: magic 0x434F494C "COIL"]
 */

#define COIL_MAGIC      0x434F494C
#define COIL_MAX_CACHED 3
#define COIL_MARKER     L".coil_ready"
```

The bootloader is compiled with `zig cc` targeting x86_64-windows-gnu. I chose Zig's C compiler over MSVC because it produces smaller binaries, cross-compiles trivially, and doesn't require Visual Studio to be installed. The bootloader binary is ~15KB.

## The meta angle

Here's the part I find interesting: I built Coil to ship my other tools. Study Aggregator's build script calls `coil build`. md-pdf-cli is packaged with Coil. The tools I build for production at work are distributed as Coil-built executables.

I built a compiler because the existing ones kept breaking, and now it's a dependency of my own projects. That's either engineering or yak-shaving depending on your perspective. Given that it's been running reliably for months and is published on [PyPI](https://pypi.org/project/coil-compiler/), I'm calling it engineering.

## Tradeoffs

Coil is not a general-purpose Python compiler. It's optimized for the kind of tools I build: desktop utilities, CLI apps, and internal tools that need to run on Windows machines where you can't install Python.

It doesn't do code compilation (Nuitka's approach of compiling Python to C). Your .py files ship as-is inside the package. It doesn't do tree-shaking at the module level. It doesn't support cross-platform builds yet (though the architecture supports it).

What it does do is take a directory of Python code and produce something that runs on a clean Windows machine in under 30 seconds, every time, without configuration. That was the bar, and it clears it.
