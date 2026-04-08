---
title: "When to Shell Out to a Native Binary Instead of Using FFI"
date: "April 2026"
readTime: "5 min"
tags: ["Architecture", "Rust", "Python"]
---

## Three ways to call native code from Python

When your Python application needs to call into native code, you have three options:

1. **FFI bindings** (PyO3, cffi, ctypes). Your native code compiles to a shared library (.so/.dll/.pyd) and Python calls functions in it directly. Fastest option. Tightest coupling.
2. **Subprocess IPC.** Your native code compiles to a standalone executable. Python spawns it, passes input via arguments or stdin, reads output from stdout/stderr. Slowest startup. Zero coupling.
3. **Shared memory / sockets.** Your native code runs as a long-lived process. Python communicates via Unix sockets, named pipes, or mapped memory. Best for persistent services. Most complex.

I've shipped option 2 in production and I'd pick it again in the same situation. Here's the decision framework.

## The case for subprocess

Study Aggregator is a DICOM processing tool. The GUI is Python (PyQt5). The parsing engine is Rust. The engine compiles to a standalone .exe. The GUI launches it as a subprocess, reads progress from stderr as JSON lines, and reads the final result from stdout as a JSON blob.

```python
proc = subprocess.Popen(
    [engine_path, input_path],
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
)

# Read progress updates from stderr
for line in proc.stderr:
    update = json.loads(line)
    progress_bar.setValue(update["percent"])

# Read final result from stdout
result = json.loads(proc.stdout.read())
```

This looks crude compared to a clean Python API backed by PyO3. But the deployment story is why it wins.

Study Aggregator ships as a standalone .exe built with Coil (a Python bundler). The Rust engine is a separate binary that sits next to it in the distribution folder. If the engine binary exists, it works. There's no .pyd to resolve, no shared library search path, no import machinery to debug, no maturin wheel to cross-compile.

The build script is two commands:

```python
# Build the Rust engine
subprocess.run(["cargo", "build", "--release"], cwd="engine/")

# Bundle the Python app
subprocess.run(["coil", "build", "."])

# Copy engine into distribution
shutil.copy("engine/target/release/study-agg-engine.exe", "dist/")
```

Compare that to a PyO3 build: configure maturin, build a wheel for the target platform, ensure the .pyd ends up in the right place relative to the frozen Python bundle, handle the case where the Rust toolchain isn't installed on the build machine. It works, but the integration surface is large.

## When subprocess is wrong

**Tight loops.** Process spawn costs ~10ms on Windows. If you're calling native code thousands of times per second, that overhead kills you. FFI has sub-microsecond call overhead.

**Shared state.** If Python and the native code need to read/write the same data structures in memory, subprocess means serializing everything to JSON or protobuf on every call. FFI lets you pass pointers directly.

**Latency-sensitive paths.** Real-time audio, game rendering, anything where 10ms of startup is unacceptable. Subprocess is a batch-oriented pattern.

## When subprocess wins

**Deployment complexity matters more than call overhead.** If your app ships as a frozen bundle, an installer, or runs on machines you can't install dev tools on, the "just copy the binary" story is hard to beat.

**The native code runs once per invocation.** Study Aggregator's engine processes an entire directory of files in one call. The 10ms spawn cost is noise against seconds of processing.

**You want to develop independently.** The Rust engine has its own tests, its own CI, its own release cycle. I can build and test it without touching Python. That separation is valuable when the two codebases move at different speeds.

**Crash isolation.** If the Rust engine segfaults (it hasn't, but hypothetically), the Python GUI stays alive and can show an error dialog. With FFI, a segfault in the native code takes the entire process down.

## The protocol

If you go with subprocess, design the protocol deliberately. Don't just dump text to stdout and parse it with regex.

- **Progress on stderr, results on stdout.** This keeps them on separate streams so you can read progress incrementally without buffering the result.
- **JSON lines for progress.** One JSON object per line. The GUI reads lines as they arrive and updates the progress bar. No custom parsing.
- **Single JSON blob for the result.** The engine writes the final result to stdout after all progress updates are done. The GUI reads it after the process exits.
- **Exit code for success/failure.** Don't encode errors in JSON. Use exit code 0 for success, non-zero for failure. The error message goes to stderr.

This is a simple, debuggable, language-agnostic protocol. You can test the engine from the command line without the GUI. You can swap the GUI for a different frontend without touching the engine.
