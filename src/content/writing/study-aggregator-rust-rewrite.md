---
title: "Rewriting a DICOM Parser in Rust for a 100–400× Speedup"
date: "April 2026"
readTime: "8 min"
tags: ["Rust", "Python", "Performance"]
---

## The problem

Study Aggregator is a tool I built for processing medical imaging files (DICOM). You point it at a folder, a ZIP archive, or a CD full of x-rays, and it pulls out patient names, dates, study descriptions, and series counts. The output gets copied to the clipboard as a formatted report.

The original version was pure Python. It used pydicom to parse each file, walked directories with os.walk, and handled ZIP extraction with the standard library. It worked. For a folder with 50 files, it was fine. For a 4GB encrypted ZIP with thousands of nested DICOMs, it was taking several minutes on the office machines and eating hundreds of megabytes of RAM.

The bottleneck wasn't a single thing. It was three things compounding:

1. **pydicom parsed the entire file.** Every pixel data element, every private tag, every sequence. Study Aggregator only needs 15 metadata tags. The parser was doing 100x the work required.
2. **os.walk is single-threaded.** On network shares with deep directory trees, the walk alone could take 30+ seconds before any parsing started.
3. **ZIP extraction wrote to disk.** The Python code extracted every file to a temp directory, then parsed the extracted files. For a 4GB ZIP, that meant writing 4GB to disk before reading any of it back.

## Why Rust, and why as a subprocess

The rewrite target was clear: the parsing hot path needed to go native. Python is fine for the GUI, the clipboard logic, and the user prompts. But iterating over bytes in a tight loop to extract DICOM tags is exactly the kind of work where Python's per-instruction overhead adds up.

I considered three approaches:

**PyO3/maturin bindings.** This would have given me a Python-callable Rust module. The problem is deployment. Study Aggregator ships as a standalone .exe built with Coil (my Python bundler). Adding a compiled Rust extension into that pipeline would have meant cross-compiling maturin wheels, managing the .pyd file in the bundle layout, and debugging import resolution on machines where I can't install anything. It would have worked eventually, but the integration surface was large.

**CFFI with a shared library.** Simpler than PyO3 but the same deployment headache: a .dll that needs to end up in the right place relative to the Python bundle.

**Subprocess with JSON IPC.** The Rust engine compiles to a standalone .exe. The Python GUI launches it, passes the input path as an argument, reads progress updates from stderr (one JSON line per update), and reads the final result from stdout (one JSON blob). No shared memory, no import resolution, no deployment coupling. If the engine binary exists next to the Python bundle, it works.

I went with the subprocess approach. The tradeoff is startup latency (spawning a process costs ~10ms) and serialization overhead (JSON encoding/decoding the results). For a tool that processes files for seconds to minutes, 10ms of startup is noise. And the JSON result is a few KB of metadata, not a large payload.

The real advantage is that I can develop, test, and release the Rust engine independently. `cargo build --release` produces a binary. I copy it into the distribution folder. Done.

## The Rust engine

The engine has four main modules:

### Zero-copy DICOM parsing (dicom.rs)

Each DICOM file gets memory-mapped with memmap2. No read calls, no buffering, no copying bytes into a Vec. The OS maps the file into the process's address space and the parser walks the bytes directly.

```rust
pub fn extract_tags(path: &Path) -> Option<StudyInfo> {
    let file = File::open(path).ok()?;
    let mmap = unsafe { Mmap::map(&file) }.ok()?;
    let mut info = extract_tags_from_bytes(&mmap[..])?;
    info.source_path = Some(path.to_string_lossy().into_owned());
    Some(info)
}
```

The parser only extracts the 15 tags Study Aggregator actually needs (patient name, DOB, study date, etc.). It builds a HashSet of wanted tag IDs and skips everything else. When it hits the pixel data tag (0x7FE0, 0x0010), it stops. Most of the file is pixel data, so this means the parser typically reads less than 1% of the file's bytes.

DICOM files in the wild are messy. The parser handles:

- **Implicit vs. explicit VR.** The spec says file meta (group 0x0002) is always explicit VR little-endian, but the dataset can be either. The parser auto-detects by checking if the bytes after a tag look like a valid two-character VR code.
- **Missing preamble.** Some files skip the 128-byte preamble and "DICM" magic. The parser falls back to checking if the first two bytes are a valid DICOM group (0x0002 or 0x0008).
- **Undefined-length sequences.** Nested sequences with 0xFFFFFFFF length get skipped by scanning for the sequence delimiter tag.
- **Truncated files.** Bounds checks on every read. If the file ends mid-element, parsing stops and returns whatever was found so far.

### Parallel directory walking (main.rs)

Directory traversal uses jwalk, which walks the filesystem across multiple threads. On a network share with 10,000+ files across hundreds of subdirectories, this cuts the walk time from 30+ seconds to under 5.

File parsing is parallelized with rayon. Each file gets processed independently, and results are collected into a shared map:

```rust
let results: Vec<StudyInfo> = files
    .par_iter()
    .filter_map(|path| {
        processed.fetch_add(1, Ordering::Relaxed);
        // ... progress reporting ...
        dicom::extract_tags(path)
    })
    .collect();
```

### Streaming ZIP extraction (zip_handler.rs)

The old Python version extracted the entire ZIP to disk, then parsed the extracted files. The Rust engine streams entries from the ZIP and parses each one in memory. For a 4GB ZIP, memory usage is proportional to the largest single DICOM file (usually a few MB), not the archive size.

Encrypted ZIPs (both AES and traditional PKZIP encryption) are handled by detecting the encryption type from entry flags, then prompting for a password through the Python GUI via stderr/stdin. The engine also handles nested ZIPs (archives inside archives) up to a configurable depth.

### Patient merging (patient.rs)

After extraction, the engine groups studies by patient using a combination of patient ID and normalized name matching. Name normalization strips punctuation, collapses whitespace, and lowercases. If two entries share a patient ID but have different names, the engine flags a conflict rather than silently merging.

## The result

On the office machines (Intel i5, spinning disk, Windows 10), the rewrite brought processing times down by roughly 100 to 400x depending on the input:

- A folder of 200 DICOM files: **~8 seconds → ~0.05 seconds**
- A 1.2GB encrypted ZIP with ~2,000 files: **~3 minutes → ~4 seconds**
- A 4.8GB ZIP with nested archives: **~7 minutes → ~12 seconds**

The spread (100x vs 400x) depends mostly on the input type. Folders on local disk see the largest speedup because jwalk parallelizes the walk and mmap eliminates read overhead. Large ZIPs see a smaller speedup because the ZIP library's decompression is the bottleneck, not the DICOM parsing.

Memory usage dropped from "the entire ZIP extracted to disk" to "the largest single DICOM file in memory at a time." On the 4.8GB ZIP, peak memory went from ~5GB (temp extraction) to ~15MB.

## What I'd do differently

The subprocess IPC is fine for this use case, but if I were building something with tighter integration (a real-time viewer, for example), I'd use PyO3 with maturin and eat the deployment complexity. The JSON serialization and process spawn overhead would matter in a tighter loop.

I also wrote the DICOM parser from scratch rather than using a Rust DICOM crate (like dicom-rs). This was deliberate: I needed to handle non-conformant files that a spec-compliant parser would reject, and I only needed 15 tags, not a full DICOM toolkit. But it means I own the parser bugs. I've since opened a conversation with the dicom-rs maintainers about contributing the VR fallback logic upstream as a lenient parsing mode ([#521](https://github.com/Enet4/dicom-rs/issues/521)). If that lands, future projects like this could use the established crate instead of rolling a custom parser.
