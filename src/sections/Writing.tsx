import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";

interface Post {
  slug: string;
  title: string;
  date: string;
  readTime: string;
  tags: string[];
  content: string[];
}

const posts: Post[] = [
  {
    slug: "study-aggregator-rust-rewrite",
    title: "Rewriting a DICOM Parser in Rust for a 100–400× Speedup",
    date: "April 2026",
    readTime: "8 min",
    tags: ["Rust", "Python", "Performance"],
    content: [
      `## The problem`,

      `Study Aggregator is a tool I built for processing medical imaging files (DICOM). You point it at a folder, a ZIP archive, or a CD full of x-rays, and it pulls out patient names, dates, study descriptions, and series counts. The output gets copied to the clipboard as a formatted report.`,

      `The original version was pure Python. It used pydicom to parse each file, walked directories with os.walk, and handled ZIP extraction with the standard library. It worked. For a folder with 50 files, it was fine. For a 4GB encrypted ZIP with thousands of nested DICOMs, it was taking several minutes on the office machines and eating hundreds of megabytes of RAM.`,

      `The bottleneck wasn't a single thing. It was three things compounding:`,

      `1. **pydicom parsed the entire file.** Every pixel data element, every private tag, every sequence. Study Aggregator only needs 15 metadata tags. The parser was doing 100x the work required.
2. **os.walk is single-threaded.** On network shares with deep directory trees, the walk alone could take 30+ seconds before any parsing started.
3. **ZIP extraction wrote to disk.** The Python code extracted every file to a temp directory, then parsed the extracted files. For a 4GB ZIP, that meant writing 4GB to disk before reading any of it back.`,

      `## Why Rust, and why as a subprocess`,

      `The rewrite target was clear: the parsing hot path needed to go native. Python is fine for the GUI, the clipboard logic, and the user prompts. But iterating over bytes in a tight loop to extract DICOM tags is exactly the kind of work where Python's per-instruction overhead adds up.`,

      `I considered three approaches:`,

      `**PyO3/maturin bindings.** This would have given me a Python-callable Rust module. The problem is deployment. Study Aggregator ships as a standalone .exe built with Coil (my Python bundler). Adding a compiled Rust extension into that pipeline would have meant cross-compiling maturin wheels, managing the .pyd file in the bundle layout, and debugging import resolution on machines where I can't install anything. It would have worked eventually, but the integration surface was large.`,

      `**CFFI with a shared library.** Simpler than PyO3 but the same deployment headache: a .dll that needs to end up in the right place relative to the Python bundle.`,

      `**Subprocess with JSON IPC.** The Rust engine compiles to a standalone .exe. The Python GUI launches it, passes the input path as an argument, reads progress updates from stderr (one JSON line per update), and reads the final result from stdout (one JSON blob). No shared memory, no import resolution, no deployment coupling. If the engine binary exists next to the Python bundle, it works.`,

      `I went with the subprocess approach. The tradeoff is startup latency (spawning a process costs ~10ms) and serialization overhead (JSON encoding/decoding the results). For a tool that processes files for seconds to minutes, 10ms of startup is noise. And the JSON result is a few KB of metadata, not a large payload.`,

      `The real advantage is that I can develop, test, and release the Rust engine independently. \`cargo build --release\` produces a binary. I copy it into the distribution folder. Done.`,

      `## The Rust engine`,

      `The engine has four main modules:`,

      `### Zero-copy DICOM parsing (dicom.rs)`,

      `Each DICOM file gets memory-mapped with memmap2. No read calls, no buffering, no copying bytes into a Vec. The OS maps the file into the process's address space and the parser walks the bytes directly.`,

      `\`\`\`rust
pub fn extract_tags(path: &Path) -> Option<StudyInfo> {
    let file = File::open(path).ok()?;
    let mmap = unsafe { Mmap::map(&file) }.ok()?;
    let mut info = extract_tags_from_bytes(&mmap[..])?;
    info.source_path = Some(path.to_string_lossy().into_owned());
    Some(info)
}
\`\`\``,

      `The parser only extracts the 15 tags Study Aggregator actually needs (patient name, DOB, study date, etc.). It builds a HashSet of wanted tag IDs and skips everything else. When it hits the pixel data tag (0x7FE0, 0x0010), it stops. Most of the file is pixel data, so this means the parser typically reads less than 1% of the file's bytes.`,

      `DICOM files in the wild are messy. The parser handles:`,

      `- **Implicit vs. explicit VR.** The spec says file meta (group 0x0002) is always explicit VR little-endian, but the dataset can be either. The parser auto-detects by checking if the bytes after a tag look like a valid two-character VR code.
- **Missing preamble.** Some files skip the 128-byte preamble and "DICM" magic. The parser falls back to checking if the first two bytes are a valid DICOM group (0x0002 or 0x0008).
- **Undefined-length sequences.** Nested sequences with 0xFFFFFFFF length get skipped by scanning for the sequence delimiter tag.
- **Truncated files.** Bounds checks on every read. If the file ends mid-element, parsing stops and returns whatever was found so far.`,

      `### Parallel directory walking (main.rs)`,

      `Directory traversal uses jwalk, which walks the filesystem across multiple threads. On a network share with 10,000+ files across hundreds of subdirectories, this cuts the walk time from 30+ seconds to under 5.`,

      `File parsing is parallelized with rayon. Each file gets processed independently, and results are collected into a shared map:`,

      `\`\`\`rust
let results: Vec<StudyInfo> = files
    .par_iter()
    .filter_map(|path| {
        processed.fetch_add(1, Ordering::Relaxed);
        // ... progress reporting ...
        dicom::extract_tags(path)
    })
    .collect();
\`\`\``,

      `### Streaming ZIP extraction (zip_handler.rs)`,

      `The old Python version extracted the entire ZIP to disk, then parsed the extracted files. The Rust engine streams entries from the ZIP and parses each one in memory. For a 4GB ZIP, memory usage is proportional to the largest single DICOM file (usually a few MB), not the archive size.`,

      `Encrypted ZIPs (both AES and traditional PKZIP encryption) are handled by detecting the encryption type from entry flags, then prompting for a password through the Python GUI via stderr/stdin. The engine also handles nested ZIPs (archives inside archives) up to a configurable depth.`,

      `### Patient merging (patient.rs)`,

      `After extraction, the engine groups studies by patient using a combination of patient ID and normalized name matching. Name normalization strips punctuation, collapses whitespace, and lowercases. If two entries share a patient ID but have different names, the engine flags a conflict rather than silently merging.`,

      `## The result`,

      `On the office machines (Intel i5, spinning disk, Windows 10), the rewrite brought processing times down by roughly 100 to 400x depending on the input:`,

      `- A folder of 200 DICOM files: **~8 seconds → ~0.05 seconds**
- A 1.2GB encrypted ZIP with ~2,000 files: **~3 minutes → ~4 seconds**
- A 4.8GB ZIP with nested archives: **~7 minutes → ~12 seconds**`,

      `The spread (100x vs 400x) depends mostly on the input type. Folders on local disk see the largest speedup because jwalk parallelizes the walk and mmap eliminates read overhead. Large ZIPs see a smaller speedup because the ZIP library's decompression is the bottleneck, not the DICOM parsing.`,

      `Memory usage dropped from "the entire ZIP extracted to disk" to "the largest single DICOM file in memory at a time." On the 4.8GB ZIP, peak memory went from ~5GB (temp extraction) to ~15MB.`,

      `## What I'd do differently`,

      `The subprocess IPC is fine for this use case, but if I were building something with tighter integration (a real-time viewer, for example), I'd use PyO3 with maturin and eat the deployment complexity. The JSON serialization and process spawn overhead would matter in a tighter loop.`,

      `I also wrote the DICOM parser from scratch rather than using a Rust DICOM crate (like dicom-rs). This was deliberate: I needed to handle non-conformant files that a spec-compliant parser would reject, and I only needed 15 tags, not a full DICOM toolkit. But it means I own the parser bugs. I've since opened a conversation with the dicom-rs maintainers about contributing the VR fallback logic upstream as a lenient parsing mode ([#521](https://github.com/Enet4/dicom-rs/issues/521)). If that lands, future projects like this could use the established crate instead of rolling a custom parser.`,
    ],
  },
  {
    slug: "mdview-zig-rewrite",
    title: "Dropping a 200MB WebView for 285KB of Zig",
    date: "April 2026",
    readTime: "7 min",
    tags: ["Zig", "Rust", "Native GUI"],

    content: [
      `## Why rewrite a working app`,

      `mdview started as a Rust project using WebView2 to render markdown. It worked well on Windows. Dark theme, borderless floating window, file watching, syntax highlighting. The binary was about 1.1MB, which is small for a desktop app. But it had a hard dependency on WebView2, which is a ~200MB runtime that ships with Windows 10+ but not with every version of every OS.`,

      `I wanted mdview to work on Linux and macOS too. WebView2 is Windows-only. I could have used a cross-platform webview wrapper like Tauri's wry, but then I'd be shipping a browser engine on every platform just to render some formatted text. That felt wrong. Markdown is headings, paragraphs, code blocks, and lists. You don't need a DOM, a JavaScript engine, and a compositor for that.`,

      `So I rewrote it in Zig with platform-native text rendering. No webview, no runtime, no dependencies. The result is a ~285KB binary on all three platforms.`,

      `## The platform abstraction`,

      `The core challenge is that every OS has a completely different text rendering stack:`,

      `- **Windows**: DirectWrite + Direct2D
- **Linux**: Cairo + Pango (via X11)
- **macOS**: CoreText + CoreGraphics (via Cocoa)`,

      `Zig handles this cleanly with comptime platform switching. The entire platform layer is selected at compile time with no runtime cost:`,

      `\`\`\`zig
pub const platform = switch (builtin.os.tag) {
    .windows => @import("win32.zig"),
    .linux   => @import("linux.zig"),
    .macos   => @import("macos.zig"),
    else     => @compileError("Unsupported platform"),
};
\`\`\``,

      `Each platform module implements the same interface: create a window, set up a render context, draw text runs, handle input events. The shared code (markdown parsing, scroll state, file watching) calls into \`platform.*\` and doesn't know or care which OS it's running on.`,

      `The build system links the right libraries per-platform:`,

      `\`\`\`zig
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
\`\`\``,

      `## Why Zig and not Rust`,

      `The Rust version worked. The question wasn't "can Rust do this" but "what's the right tool for this specific rewrite."`,

      `Zig's advantages for this project came down to three things:`,

      `**C interop without bindings.** DirectWrite, Cairo, and CoreText are all C or C-compatible APIs. In Rust, you'd use crate wrappers (directwrite-rs, cairo-rs, core-text-rs) that add abstraction layers, version churn, and dependency trees. In Zig, you \`@cImport\` the system headers directly. No bindings crate, no build.rs, no pkg-config wrangling. The API you call is the API the OS documents.`,

      `**Cross-compilation out of the box.** \`zig build -Dtarget=x86_64-linux-gnu\` on a Windows machine produces a Linux binary. No Docker, no VM, no cross-compilation toolchain to install. The CI builds all three platforms from a single Ubuntu runner.`,

      `**Tiny binaries.** Zig's standard library is minimal compared to Rust's. With \`-Doptimize=ReleaseSmall\`, the binary is ~285KB. The Rust version was 1.1MB without the webview, and that's already lean for Rust. For a tool that people download to view text files, binary size signals intent.`,

      `## What was hard`,

      `**CoreText on macOS** was the most difficult platform. DirectWrite and Cairo/Pango have similar mental models: you create a text layout object, set constraints, and ask for line breaks. CoreText works differently. You create an attributed string, generate a framesetter, then extract line origins and glyph runs from a frame. The coordinate system is flipped (origin at bottom-left). Every measurement needs to be inverted.`,

      `**Unicode** is always hard. Markdown files contain emoji, CJK characters, combining marks, and zero-width joiners. Each platform's text shaping engine handles these differently. Getting consistent behavior across all three required testing with a corpus of edge-case markdown files and accepting that "consistent" sometimes means "consistently imperfect."`,

      `**File watching** works completely differently per OS. Windows has ReadDirectoryChangesW, Linux has inotify, macOS has FSEvents. I ended up polling with stat() on a timer because the cross-platform file watching complexity wasn't worth it for a tool that checks one file every 500ms.`,

      `## The numbers`,

      `- Rust + WebView2: ~1.1MB binary + ~200MB runtime dependency, Windows only
- Zig native: ~285KB binary, no dependencies, Windows + Linux + macOS`,

      `Startup is near-instant on all platforms. Memory usage sits around 8-15MB depending on the document size. The old WebView2 version used 60-80MB because it was running a full browser compositor.`,

      `## Would I use Zig again`,

      `For this kind of project, yes. Platform-native GUI, C API interop, small binary, cross-compilation. Zig fits perfectly here.`,

      `For a project with complex data structures, async networking, or a large ecosystem of libraries to lean on, I'd still reach for Rust. Zig's package ecosystem is small and the language is still pre-1.0. You're signing up to own more of the stack yourself.`,

      `That's a tradeoff, not a flaw. For mdview, owning the stack was the point.`,
    ],
  },
  {
    slug: "subprocess-ipc-pattern",
    title: "When to Shell Out to a Native Binary Instead of Using FFI",
    date: "April 2026",
    readTime: "5 min",
    tags: ["Architecture", "Rust", "Python"],
    content: [
      `## Three ways to call native code from Python`,

      `When your Python application needs to call into native code, you have three options:`,

      `1. **FFI bindings** (PyO3, cffi, ctypes). Your native code compiles to a shared library (.so/.dll/.pyd) and Python calls functions in it directly. Fastest option. Tightest coupling.
2. **Subprocess IPC.** Your native code compiles to a standalone executable. Python spawns it, passes input via arguments or stdin, reads output from stdout/stderr. Slowest startup. Zero coupling.
3. **Shared memory / sockets.** Your native code runs as a long-lived process. Python communicates via Unix sockets, named pipes, or mapped memory. Best for persistent services. Most complex.`,

      `I've shipped option 2 in production and I'd pick it again in the same situation. Here's the decision framework.`,

      `## The case for subprocess`,

      `Study Aggregator is a DICOM processing tool. The GUI is Python (PyQt5). The parsing engine is Rust. The engine compiles to a standalone .exe. The GUI launches it as a subprocess, reads progress from stderr as JSON lines, and reads the final result from stdout as a JSON blob.`,

      `\`\`\`python
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
\`\`\``,

      `This looks crude compared to a clean Python API backed by PyO3. But the deployment story is why it wins.`,

      `Study Aggregator ships as a standalone .exe built with Coil (a Python bundler). The Rust engine is a separate binary that sits next to it in the distribution folder. If the engine binary exists, it works. There's no .pyd to resolve, no shared library search path, no import machinery to debug, no maturin wheel to cross-compile.`,

      `The build script is two commands:`,

      `\`\`\`python
# Build the Rust engine
subprocess.run(["cargo", "build", "--release"], cwd="engine/")

# Bundle the Python app
subprocess.run(["coil", "build", "."])

# Copy engine into distribution
shutil.copy("engine/target/release/study-agg-engine.exe", "dist/")
\`\`\``,

      `Compare that to a PyO3 build: configure maturin, build a wheel for the target platform, ensure the .pyd ends up in the right place relative to the frozen Python bundle, handle the case where the Rust toolchain isn't installed on the build machine. It works, but the integration surface is large.`,

      `## When subprocess is wrong`,

      `**Tight loops.** Process spawn costs ~10ms on Windows. If you're calling native code thousands of times per second, that overhead kills you. FFI has sub-microsecond call overhead.`,

      `**Shared state.** If Python and the native code need to read/write the same data structures in memory, subprocess means serializing everything to JSON or protobuf on every call. FFI lets you pass pointers directly.`,

      `**Latency-sensitive paths.** Real-time audio, game rendering, anything where 10ms of startup is unacceptable. Subprocess is a batch-oriented pattern.`,

      `## When subprocess wins`,

      `**Deployment complexity matters more than call overhead.** If your app ships as a frozen bundle, an installer, or runs on machines you can't install dev tools on, the "just copy the binary" story is hard to beat.`,

      `**The native code runs once per invocation.** Study Aggregator's engine processes an entire directory of files in one call. The 10ms spawn cost is noise against seconds of processing.`,

      `**You want to develop independently.** The Rust engine has its own tests, its own CI, its own release cycle. I can build and test it without touching Python. That separation is valuable when the two codebases move at different speeds.`,

      `**Crash isolation.** If the Rust engine segfaults (it hasn't, but hypothetically), the Python GUI stays alive and can show an error dialog. With FFI, a segfault in the native code takes the entire process down.`,

      `## The protocol`,

      `If you go with subprocess, design the protocol deliberately. Don't just dump text to stdout and parse it with regex.`,

      `- **Progress on stderr, results on stdout.** This keeps them on separate streams so you can read progress incrementally without buffering the result.
- **JSON lines for progress.** One JSON object per line. The GUI reads lines as they arrive and updates the progress bar. No custom parsing.
- **Single JSON blob for the result.** The engine writes the final result to stdout after all progress updates are done. The GUI reads it after the process exits.
- **Exit code for success/failure.** Don't encode errors in JSON. Use exit code 0 for success, non-zero for failure. The error message goes to stderr.`,

      `This is a simple, debuggable, language-agnostic protocol. You can test the engine from the command line without the GUI. You can swap the GUI for a different frontend without touching the engine.`,
    ],
  },
  {
    slug: "legacy-database-mutations",
    title: "Bulk-Updating a Legacy Database Without Breaking the Vendor's App",
    date: "March 2026",
    readTime: "5 min",
    tags: ["C#", "SQL Server", "Production"],
    content: [
      `## The situation`,

      `You have a production SQL Server database. It's owned by a vendor application that's been running for years. You need to bulk-update thousands of records across multiple related tables. The vendor doesn't expose an API for this. The only supported way to make changes is through the vendor's GUI, one record at a time.`,

      `Doing 10,000 records one-at-a-time through a GUI is not an option. So you write a tool that talks to the database directly. The catch: you don't own the schema, you don't have documentation for it, and if you break something, the vendor's application stops working and you get to explain why.`,

      `## Reverse-engineering the schema`,

      `Step one is understanding what you're touching. SQL Server makes this easier than most databases because you can query the system catalog:`,

      `\`\`\`sql
-- Find all tables that reference a specific column name
SELECT t.TABLE_NAME, c.COLUMN_NAME, c.DATA_TYPE
FROM INFORMATION_SCHEMA.COLUMNS c
JOIN INFORMATION_SCHEMA.TABLES t ON c.TABLE_NAME = t.TABLE_NAME
WHERE c.COLUMN_NAME LIKE '%Attorney%'
ORDER BY t.TABLE_NAME
\`\`\``,

      `The vendor's naming conventions (once you spot them) tell you a lot. Tables prefixed with the same word are usually related. Columns named "ID" with matching names across tables are foreign keys, even when the schema doesn't declare them as such. Columns named "Additional1" through "Additional10" are the extensibility mechanism the vendor built when they realized customers would need custom fields.`,

      `Those "Additional" columns are exactly what the tool updates. The vendor intended them to be user-configurable through their GUI. The tool just does it at scale.`,

      `## The safety model`,

      `The tool uses a three-layer safety approach:`,

      `**1. Preview before commit.** Every bulk operation runs a SELECT first to show exactly which records will be affected and what the old values are. The user reviews the preview before any UPDATE runs. No blind writes.`,

      `**2. Transaction wrapping.** Every batch of updates runs inside a transaction. If any single update fails, the entire batch rolls back. You don't end up with 5,000 records updated and 5,000 in the old state.`,

      `\`\`\`csharp
using var transaction = connection.BeginTransaction();
try
{
    foreach (var record in batch)
    {
        var cmd = new SqlCommand(updateQuery, connection, transaction);
        cmd.Parameters.AddWithValue("@value", record.NewValue);
        cmd.Parameters.AddWithValue("@id", record.Id);
        cmd.ExecuteNonQuery();
    }
    transaction.Commit();
}
catch
{
    transaction.Rollback();
    throw;
}
\`\`\``,

      `**3. Parameterized queries only.** Every value goes through SqlCommand parameters. Never string interpolation, never concatenation. This isn't just about SQL injection (though that matters). It's about data types. A parameter with a DateTime value will always be handled correctly by the driver. A string-interpolated date might work on your machine and break on a server with different locale settings.`,

      `## What I learned`,

      `**Test against a restored backup, not production.** This sounds obvious but the temptation to "just try one record" in production is real. Restore a backup to a test instance. Run the tool against that. Verify the results in the vendor's GUI. Then run against production.`,

      `**Log every mutation.** Every UPDATE the tool runs gets logged with the table, the record ID, the column, the old value, and the new value. If something goes wrong six months later, you can trace exactly what changed and when.`,

      `**Respect the vendor's constraints.** Just because a column allows 500 characters doesn't mean the vendor's GUI can display 500 characters. Just because a column is nullable doesn't mean the vendor's application handles nulls. Stay within the bounds of what the GUI would allow, even when the database technically allows more.`,

      `**The vendor will upgrade the schema.** It happened twice. Both times, columns moved and table names changed. The tool broke. The fix was to make the column mappings configurable instead of hardcoded. Now a schema change is a config file update, not a code change.`,
    ],
  },
  {
    slug: "self-hosted-2fa",
    title: "Why I Self-Hosted Our Office's 2FA Codes",
    date: "March 2026",
    readTime: "5 min",
    tags: ["PHP", "Docker", "Security"],
    content: [
      `## The problem with shared 2FA`,

      `The office had a dozen services protected by TOTP two-factor authentication. The codes lived under one shared Google account, synced to Google Authenticator on everyone's phone. When someone left the company, you had to make sure they removed the account from their device. When someone accidentally deleted the app or the account, codes were gone. New hires needed the shared Google credentials to set up Authenticator on their phone, which meant passing around login info for a security-critical account.`,

      `It worked until it didn't. The shared account model made onboarding slow, offboarding risky, and accidental deletion a constant threat. There was no access control (everyone saw every code), no audit trail, and no way to recover if someone wiped their phone.`,

      `## Why not a SaaS`,

      `1Password, Authy, and similar services solve this problem. They also mean handing your TOTP secrets to a third party. For an office that handles sensitive client data, that's a conversation with compliance that nobody wants to have. The secrets stay on our network.`,

      `## The build`,

      `I forked [token2/TOTPVault](https://github.com/token2/TOTPVault), an open-source TOTP manager, and rebuilt most of it. The original had the basics (store secrets, show codes) but was missing everything needed for a team environment.`,

      `What I added:`,

      `- **Password authentication.** The original had no auth. Now it's email + password with bcrypt hashing and login rate limiting (5 failed attempts = 15-minute lockout).
- **Admin roles and approval flow.** Admins invite users via email. New accounts require admin approval before activation. No self-registration.
- **Teams.** Codes are assigned to teams (Production, IT, Sales, etc.). Users see only the codes shared with their team. Admins see everything.
- **AES-256-GCM encryption at rest.** TOTP secrets are encrypted in the database. The encryption key lives in the server config, not in the database. Compromising the database alone doesn't expose the secrets.
- **Activity logging.** Every code view is logged with who, what, and when. Audit trail for compliance.
- **Google Authenticator import.** Export your QR codes from Google Authenticator, drop the screenshot into the import page, and the tool reads the QR codes and bulk-imports the secrets. This made the migration from "one person's phone" to the vault a 5-minute process.
- **SMTP email.** Invite links, password resets, and approval notifications all go through the office mail server.`,

      `## Deployment on a QNAP NAS`,

      `The whole thing runs in two Docker containers on the office NAS: one for the PHP app (Apache), one for MariaDB. No cloud, no external dependencies.`,

      `The QNAP NAS has some quirks. The Docker socket is at \`/var/run/system-docker.sock\` instead of the default path. The kernel can't build Docker images, so images have to be built on a development machine and loaded onto the NAS via \`docker save\` and \`docker load\`. Not elegant, but it works and the deployment is a known quantity.`,

      `\`\`\`python
# Build on dev machine, deploy to NAS
docker build --platform linux/arm64 -t totpvault-app .
docker save totpvault-app -o totpvault-app.tar
scp totpvault-app.tar admin@NAS_IP:/share/totpvault-app.tar

# On the NAS
docker load < totpvault-app.tar
docker compose down && docker compose up -d
\`\`\``,

      `## The security model`,

      `The threat model is simple: the secrets must not leave the network, and access must be auditable.`,

      `- Secrets are AES-256-GCM encrypted in MariaDB. The key is in a config file on the NAS filesystem, not in the database.
- Passwords are bcrypt. Sessions are HttpOnly, SameSite=Lax.
- CSRF tokens on every form. Rate limiting on login.
- Users can't self-register. Admin sends an invite, user sets a password, admin approves the account. Three-step process, no shortcuts.
- Every code view is logged. If someone accessed a code they shouldn't have, the activity log shows it.`,

      `## What it replaced`,

      `A shared Google account with Google Authenticator synced to every phone in the office. No access control, no audit trail, no protection against accidental deletion, and a shared credential that had to be revoked every time someone left.`,

      `Now there's a web dashboard that the team accesses from their desk, with team-scoped visibility, encrypted storage, and a paper trail. Onboarding is an email invite. Offboarding is disabling the account. The dashboard shows the current code and the next upcoming code, so nobody's scrambling to type it in before it rotates.`,

      `It's not a complex system. It's PHP, MySQL, and Docker on a NAS. But it solved a real problem that was costing the office time every week, and it did it without sending secrets to anyone else's servers.`,
    ],
  },
  {
    slug: "shipping-to-non-technical-users",
    title: "Shipping Desktop Tools to People Who Don't Know What a Terminal Is",
    date: "March 2026",
    readTime: "5 min",
    tags: ["Deployment", "Windows", "Inno Setup"],
    content: [
      `## The audience`,

      `The tools I build are used by people who process documents, manage case files, and operate scanners. They don't know what Python is. They don't know what a terminal is. They know how to double-click an icon and right-click a folder. That's the interface contract.`,

      `For the people using these tools, that's the reality. I personally prefer a TUI over a GUI any day, but the audience here isn't developers. It's office staff running document workflows. For them, if a tool requires opening a command prompt or installing a runtime, it's not getting used. Here's what the deployment pipeline looks like when "just pip install it" isn't an option.`,

      `## The installer`,

      `Every tool ships as a single setup .exe built with [Inno Setup](https://jrsoftware.org/isinfo.php). Inno Setup is a free, scriptable installer compiler that's been around since 1997. The scripting language takes some getting used to, but once you have a working .iss file, it produces the same installer every time. Reliable and battle-tested.`,

      `The installer handles:`,

      `- **Per-user or system-wide install.** Per-user installs to \`%APPDATA%\` and don't need admin rights. System-wide installs to \`%PROGRAMFILES%\` and do. Default to per-user because most users don't have admin.
- **File association.** Study Aggregator registers itself as a handler for DICOM-related files and adds a right-click context menu entry on folders and ZIP files.
- **Start menu and desktop shortcuts.** Optional, but users expect them.
- **Uninstaller.** Inno Setup generates one automatically. Clean removal, no leftover files.`,

      `The installer script is a .iss file. Once it's set up, you don't touch it unless the install layout changes.`,

      `## Context menu integration`,

      `The most important UX decision I made was adding right-click context menu entries. Study Aggregator and File Processor both register context menu items on folders and specific file types.`,

      `For Windows, this means writing registry entries during install:`,

      `- \`HKCU\\Software\\Classes\\Directory\\shell\\MyApp\` for folders
- \`HKCU\\Software\\Classes\\.zip\\shell\\MyApp\` for file types`,

      `The value points to the executable with a \`"%1"\` argument placeholder. When the user right-clicks a folder and selects your tool, Windows launches it with the folder path as the first argument.`,

      `This is the difference between "open the app, click browse, navigate to the folder, click open" and "right-click, click." Four steps become two. For tools that process hundreds of folders a day, that matters.`,

      `## Auto-updates`,

      `Study Aggregator checks for updates by polling the GitHub Releases API every 10 minutes via a scheduled task. If a new version is available, it shows a Windows notification with an "Update Now" button. Clicking it downloads the new installer and runs it silently.`,

      `The update check is a single HTTPS request:`,

      `\`\`\`python
response = requests.get(
    "https://api.github.com/repos/user/repo/releases/latest"
)
latest = response.json()["tag_name"].lstrip("v")
current = open("version.txt").read().strip()

if latest != current:
    show_update_notification(latest, latest_asset_url)
\`\`\``,

      `The key decisions:`,

      `- **Don't auto-install.** Show a notification and let the user choose when to update. Forcing an update while someone is in the middle of processing files is hostile.
- **Don't check on every launch.** A scheduled task on an interval (every 10 minutes in my case) is cleaner. Checking on launch adds startup latency and fails when there's no network.
- **Keep version.txt in the install directory.** Simple, portable, no registry dependency.`,

      `## The network share deploy`,

      `For org-internal tools, there's a second distribution channel: a network share. The CI pipeline (GitHub Actions with a self-hosted runner) builds the installer, signs it, and copies it to a known UNC path. The update checker on office machines polls that path instead of GitHub.`,

      `This means the update pipeline is: push a tag, CI builds and deploys, machines pick it up within 24 hours. No manual distribution, no walking around with USB drives, no emailing setup files.`,

      `## What matters`,

      `None of this is technically interesting. Inno Setup is ancient. Registry entries are basic. Polling for updates is the simplest possible approach.`,

      `But it works for the audience. The tools install like any other Windows app. They update themselves. They integrate into the workflow (right-click a folder, get a result). Nobody has to learn anything new.`,

      `That's the job. Not making it clever. Making it invisible.`,
    ],
  },
  {
    slug: "coil-python-compiler",
    title: "Building a Python Compiler Because the Existing Ones Were All Broken",
    date: "February 2026",
    readTime: "6 min",
    tags: ["Python", "C", "Tooling"],
    content: [
      `## The problem with shipping Python`,

      `Python is a great language to build tools in. It's a terrible language to distribute tools in. If you want to hand someone a .exe and have it work, your options are PyInstaller, cx_Freeze, Nuitka, or py2exe. All of them share the same problem: they're complicated, fragile, and slow to debug when they break.`,

      `cx_Freeze was what I used for years. It worked until it didn't. Hidden imports, missing DLLs, setup scripts that break between versions, and cryptic errors that require reading cx_Freeze's source to diagnose. I spent more time fighting the build tool than writing the tools it was supposed to package.`,

      `So I wrote Coil. The pitch is simple: point it at a project directory, get a standalone .exe back. No spec files, no hook scripts, no per-file configuration.`,

      `## How it works`,

      `Coil's build pipeline has four stages:`,

      `**1. Scanning.** Coil walks your project, parses every .py file's AST to extract imports, and resolves them against the installed environment. It detects GUI frameworks automatically (PyQt5, tkinter, etc.) so it knows whether to build a console or windowed app.`,

      `\`\`\`python
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
\`\`\``,

      `**2. Runtime preparation.** Coil downloads and embeds a standalone Python runtime (the embeddable zip distribution from python.org). This means the target machine doesn't need Python installed. The runtime gets cached so subsequent builds don't re-download.`,

      `**3. Dependency installation.** Coil installs your project's dependencies into a clean isolated environment (not your system site-packages). It hashes the dependency list and caches the result, so identical dependency sets across projects share a single cached install.`,

      `**4. Packaging.** Two modes: **bundled** produces a directory with the runtime, dependencies, your code, and a launcher. **Portable** takes that directory, zips it, and appends it to a custom C bootloader to produce a single .exe.`,

      `## The bootloader`,

      `The portable mode is where it gets interesting. Coil ships a 15KB bootloader written in C and compiled with \`zig cc\`. When you run the .exe, the bootloader:`,

      `1. Reads a 12-byte trailer from the end of its own PE file
2. The trailer contains the zip offset, a build hash, and a magic number (\`0x434F494C\`, which is "COIL" in ASCII)
3. Extracts the embedded zip to a cache directory (\`%LOCALAPPDATA%\\coil\\AppName\\<hash>\\)
4. Uses a named mutex to prevent concurrent extraction races
5. Validates extraction via a marker file
6. Launches the real application and forwards the exit code
7. Cleans up old cached builds (keeps the last 3)`,

      `\`\`\`c
/* Trailer format (last 12 bytes of file):
 *   [4 bytes: zip offset as uint32]
 *   [4 bytes: build hash as uint32]
 *   [4 bytes: magic 0x434F494C "COIL"]
 */

#define COIL_MAGIC      0x434F494C
#define COIL_MAX_CACHED 3
#define COIL_MARKER     L".coil_ready"
\`\`\``,

      `The bootloader is compiled with \`zig cc\` targeting x86_64-windows-gnu. I chose Zig's C compiler over MSVC because it produces smaller binaries, cross-compiles trivially, and doesn't require Visual Studio to be installed. The bootloader binary is ~15KB.`,

      `## The meta angle`,

      `Here's the part I find interesting: I built Coil to ship my other tools. Study Aggregator's build script calls \`coil build\`. md-pdf-cli is packaged with Coil. The tools I build for production at work are distributed as Coil-built executables.`,

      `I built a compiler because the existing ones kept breaking, and now it's a dependency of my own projects. That's either engineering or yak-shaving depending on your perspective. Given that it's been running reliably for months and is published on [PyPI](https://pypi.org/project/coil-compiler/), I'm calling it engineering.`,

      `## Tradeoffs`,

      `Coil is not a general-purpose Python compiler. It's optimized for the kind of tools I build: desktop utilities, CLI apps, and internal tools that need to run on Windows machines where you can't install Python.`,

      `It doesn't do code compilation (Nuitka's approach of compiling Python to C). Your .py files ship as-is inside the package. It doesn't do tree-shaking at the module level. It doesn't support cross-platform builds yet (though the architecture supports it).`,

      `What it does do is take a directory of Python code and produce something that runs on a clean Windows machine in under 30 seconds, every time, without configuration. That was the bar, and it clears it.`,
    ],
  },
  {
    slug: "20-million-pages",
    title: "What Breaks When You Process 20 Million Pages",
    date: "January 2026",
    readTime: "5 min",
    tags: ["Python", "Production", "Lessons"],
    content: [
      `## The tool`,

      `File Processor is a batch document converter. It takes PDFs and converts them to TIFF or JPEG across network shares. It has a PyQt5 GUI with a configurable job queue, handles multiple concurrent conversion profiles, and rebalances CPU cores at runtime as jobs start and finish.`,

      `It's been running daily in a production environment for over two years. As of writing, it has processed over 20 million pages. Here's what I've learned from keeping it alive at that scale.`,

      `## Files lie about what they are`,

      `A PDF is not always a PDF. Some files have a .pdf extension but are actually TIFF files that someone renamed. Some are corrupted halfway through. Some have pages that are 0x0 pixels. Some have embedded fonts that reference character maps that don't exist.`,

      `At page one million, you think you've seen everything. By page ten million, you've learned that every assumption you made about file formats has an exception sitting in a network folder somewhere waiting to crash your overnight job.`,

      `The fix is boring: wrap every single file operation in error handling that logs the failure, skips the file, and keeps going. Never let one broken file kill a batch of ten thousand. This sounds obvious but it took three production failures before I got the granularity right.`,

      `## Network shares are not local disks`,

      `The tool reads from and writes to network shares (SMB/CIFS on Windows). Network I/O is fundamentally different from local disk I/O in ways that matter at scale:`,

      `- **Latency spikes.** A local read takes microseconds. A network read takes milliseconds, sometimes seconds if the server is under load. Multiply that by thousands of files and a 2-second network hiccup becomes a 30-minute delay.
- **Connection drops.** Network shares disconnect silently. The file handle you opened five seconds ago might be dead. Every file operation needs retry logic.
- **Locking.** Other users and processes are reading the same shares. File locks appear and disappear unpredictably. You can't assume exclusive access to anything.`,

      `The original version used simple sequential file I/O. The current version opens files with retry logic, validates the connection before starting a batch, and checkpoints progress so a network failure doesn't restart the entire job.`,

      `## CPU core management is a real problem`,

      `File Processor runs multiple conversion profiles concurrently. Each profile gets allocated a number of CPU cores for its multiprocessing workers. The total cores used across all profiles can't exceed the physical core count.`,

      `When a profile finishes, its cores should be available for remaining profiles. When a new profile starts, cores need to be taken from profiles that have more than they need. This is runtime core rebalancing, and getting it wrong means either wasting CPU (cores sitting idle) or oversubscribing (too many workers, context switching kills throughput).`,

      `The rebalancer runs on a 10-second timer. It checks which profiles are active, calculates fair shares based on remaining work, and adjusts worker counts. It's about 50 lines of code and it took three rewrites to get right.`,

      `## Logging is survival`,

      `At 20 million pages, you can't debug by reproducing the problem. The file that caused the crash was processed three weeks ago and has since been moved or deleted. The only evidence is what you logged at the time.`,

      `Every file processed gets a log entry with the input path, output path, page count, processing time, and any warnings. Every error gets a full stack trace. The log files are large but searchable, and they've saved me more than any test suite.`,

      `## What I'd build differently today`,

      `The conversion engines (PDF-to-TIFF, PDF-to-JPEG, JPEG-to-TIFF) shell out to external tools via subprocess. This works but it means spawning a new process for every file, which adds overhead and makes error handling harder. If I rebuilt this today, I'd use pikepdf and Pillow directly in-process for most conversions and only shell out for edge cases that need Ghostscript.`,

      `The GUI and the processing logic are tightly coupled. The PyQt5 UI runs in the main thread and communicates with worker threads via signals. This works but it means the tool can't run headless. A clean separation (processing engine as a CLI, GUI as a frontend) would have made it easier to run on servers and to test.`,

      `But it processes 20 million pages and counting, so I'm not rewriting it any time soon.`,
    ],
  },
  {
    slug: "reverse-engineering-tdd",
    title: "Reverse-Engineering a Proprietary Binary Format to Automate CD Label Printing",
    date: "October 2024",
    readTime: "5 min",
    tags: ["Python", "Reverse Engineering", "Automation"],
    content: [
      `## The problem`,

      `The office uses Epson disc printers to print labels on CDs before they go out to clients. The workflow was entirely manual: someone opens Epson Total Disc Maker, types in the case number, facility name, patient info, and work order number, formats the label, and hits print. Every disc. By hand.`,

      `At volume, this was eating hours per day. The data already existed in a structured format upstream. The question was whether the label generation could be automated without going through the Epson GUI.`,

      `## Figuring out the format`,

      `Epson Total Disc Maker saves labels as .tdd files. There's no public documentation on the format. The Epson software is the only thing that's supposed to read and write them.`,

      `So I made a blank label in the GUI, saved it, and opened it in a hex editor. The .tdd format turned out to be simpler than expected: it's XML with a PNG thumbnail and a base64-encoded JPEG logo embedded in it. The label text fields are stored as plain text at specific positions within the XML structure.`,

      `The approach: take a blank .tdd file as a template, read it as raw bytes, and insert field values at the correct byte offsets. Each insertion shifts all subsequent offsets, so the code tracks the cumulative offset delta as it fills in each field.`,

      `\`\`\`python
# Read the blank template as raw bytes
with open("blank.tdd", "rb") as f:
    data = bytearray(f.read())

# Insert fields at known byte offsets
# Each insertion shifts everything after it
offset_delta = 0
for field_name, value, position in fields:
    adjusted_pos = position + offset_delta
    encoded = normalize_text(value).encode("utf-8")
    data[adjusted_pos:adjusted_pos] = encoded
    offset_delta += len(encoded)
\`\`\``,

      `Unicode was a headache. The label data coming in had smart quotes, en dashes, and other characters that the Epson format doesn't handle well. The solution was a normalization pass that converts everything to ASCII equivalents before insertion.`,

      `XML special characters (&, <, >, quotes) also needed escaping since the .tdd content is XML under the hood. A bare ampersand in a patient name would corrupt the entire label file.`,

      `## The pipeline`,

      `The label data arrives as a PDF with a specific page structure. Each page contains one field: page 1 is the facility, page 2 is the case number, and so on through page 8. The script extracts text from each page using PyMuPDF, maps it to the corresponding label field, and generates the .tdd file.`,

      `The whole thing runs as a folder watcher on a server. A network folder is monitored for incoming PDFs. When one appears, the script waits for it to finish writing (stability check: compare file size and mtime over a 2-second window), processes it, writes the .tdd to an output folder, and deletes the source PDF.`,

      `Recovery is built in. If the monitoring loop crashes, it restarts with linear backoff (5s, 10s, 15s, up to 30s between retries). On startup, it sweeps the folder for any PDFs that arrived while it was down. A periodic 10-second sweep catches anything the filesystem watcher missed.`,

      `## The result`,

      `The Epson Total Disc Maker software doesn't need to be installed on the server at all. The script generates valid .tdd files directly from the template. The output files get opened and printed on a separate machine that has the Epson software.`,

      `What used to be minutes of manual data entry per disc is now automatic. The label appears in the output folder within seconds of the PDF arriving. Nobody touches the Epson GUI except to hit print.`,

      `## The takeaway`,

      `Proprietary formats are often simpler than they look. The .tdd format seemed opaque until I opened it in a hex editor and realized it was just XML with some embedded media. No compression, no encryption, no obfuscation. Just an undocumented structure that the vendor never expected anyone to look at.`,

      `A hex editor, a blank template, and the willingness to compare "before" and "after" files is usually enough to reverse-engineer a format like this. Fill in a field in the GUI, save, diff the bytes. Repeat for each field. Map the offsets. Write the generator.`,
    ],
  },
];

const langKeywords: Record<string, string[]> = {
  zig: ["pub", "fn", "const", "var", "return", "switch", "if", "else", "for", "while",
    "break", "continue", "try", "catch", "defer", "comptime", "inline", "null", "undefined",
    "true", "false", "error", "orelse", "unreachable", "struct", "enum", "union"],
  c: ["int", "void", "char", "return", "if", "else", "for", "while", "do", "switch",
    "case", "break", "continue", "struct", "typedef", "static", "const", "extern",
    "BOOL", "DWORD", "WORD", "BYTE", "HANDLE", "WCHAR", "TRUE", "FALSE", "NULL"],
  csharp: ["using", "var", "new", "try", "catch", "throw", "foreach", "in", "if", "else",
    "return", "void", "class", "public", "private", "static", "readonly"],
  sql: ["SELECT", "FROM", "JOIN", "ON", "WHERE", "LIKE", "ORDER", "BY", "AND", "OR",
    "INSERT", "UPDATE", "DELETE", "CREATE", "ALTER", "DROP", "TABLE", "INTO", "VALUES",
    "SET", "AS", "IN", "NOT", "NULL", "GROUP", "HAVING", "UNION", "DISTINCT"],
  rust: ["pub", "fn", "let", "mut", "match", "unsafe", "use", "mod", "struct", "impl", "enum",
    "if", "else", "for", "while", "return", "Some", "None", "Ok", "Err", "self", "Self",
    "const", "static", "where", "trait", "type", "as", "in", "ref", "move", "true", "false"],
  python: ["def", "class", "import", "from", "if", "else", "elif", "for", "while", "return",
    "with", "as", "in", "not", "and", "or", "is", "None", "True", "False", "try", "except",
    "raise", "yield", "async", "await", "lambda", "pass", "break", "continue"],
  typescript: ["const", "let", "var", "function", "return", "if", "else", "for", "while",
    "import", "export", "from", "async", "await", "new", "this", "class", "interface",
    "type", "extends", "implements", "true", "false", "null", "undefined"],
};

const langTypes: Record<string, string[]> = {
  zig: ["std", "builtin", "f32", "u8", "u16", "u32", "u64", "i32", "i64", "bool",
    "Allocator", "File", "Build"],
  c: ["ZipLocalHeader", "HINSTANCE", "LPWSTR", "MAX_PATH", "WINAPI"],
  csharp: ["SqlCommand", "SqlConnection", "SqlTransaction", "DateTime"],
  sql: ["TABLE_NAME", "COLUMN_NAME", "DATA_TYPE", "INFORMATION_SCHEMA"],
  rust: ["Option", "Result", "Vec", "String", "Path", "PathBuf", "File", "Mmap",
    "StudyInfo", "HashSet", "HashMap", "u8", "u16", "u32", "u64", "usize",
    "i32", "i64", "bool", "str", "AtomicU64", "Ordering", "Instant", "Args"],
  python: ["str", "int", "float", "bool", "list", "dict", "tuple", "set"],
  typescript: ["string", "number", "boolean", "void", "any", "never"],
};

function highlightCode(code: string, lang: string) {
  const kw = langKeywords[lang.toLowerCase()] || [];
  const types = langTypes[lang.toLowerCase()] || [];

  return code.split("\n").map((line, lineIdx) => {
    // full-line comments
    const commentMatch = line.match(/^(\s*)(\/\/|#)(.*)/);
    if (commentMatch) {
      return (
        <div key={lineIdx}>
          {commentMatch[1]}
          <span style={{ color: "#556270", fontStyle: "italic" }}>
            {commentMatch[2]}{commentMatch[3]}
          </span>
        </div>
      );
    }

    // tokenize
    const regex = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\/\/.*$|\b[A-Za-z_][A-Za-z0-9_]*\b|0x[0-9A-Fa-f_]+|\d[\d_]*|[^\w\s"'`]+|\s+)/g;
    const parts: JSX.Element[] = [];
    let m;
    let key = 0;

    while ((m = regex.exec(line)) !== null) {
      const tok = m[0];

      if (tok.startsWith('"') || tok.startsWith("'") || tok.startsWith("`")) {
        parts.push(<span key={key++} style={{ color: "#9EC58F" }}>{tok}</span>);
      } else if (tok.startsWith("//")) {
        parts.push(<span key={key++} style={{ color: "#556270", fontStyle: "italic" }}>{tok}</span>);
      } else if (kw.includes(tok)) {
        parts.push(<span key={key++} style={{ color: "#C97B5E", fontWeight: 500 }}>{tok}</span>);
      } else if (types.includes(tok)) {
        parts.push(<span key={key++} style={{ color: "#E9A14B" }}>{tok}</span>);
      } else if (/^0x[0-9A-Fa-f_]+$/.test(tok) || /^\d[\d_]*$/.test(tok)) {
        parts.push(<span key={key++} style={{ color: "#D4944A" }}>{tok}</span>);
      } else if (tok.startsWith(".") && tok.length > 1) {
        parts.push(<span key={key++} style={{ color: "#7DB4E8" }}>{tok}</span>);
      } else if (tok === "?" || tok === "=>") {
        parts.push(<span key={key++} style={{ color: "#C97B5E" }}>{tok}</span>);
      } else {
        parts.push(<span key={key++}>{tok}</span>);
      }
    }

    return <div key={lineIdx}>{parts.length > 0 ? parts : "\u00a0"}</div>;
  });
}

function renderMarkdown(text: string) {
  // headers
  if (text.startsWith("## ")) {
    return (
      <h2
        className="font-heading text-2xl md:text-3xl font-normal mt-12 mb-4"
        style={{ color: "var(--fg)" }}
      >
        {text.slice(3)}
      </h2>
    );
  }
  if (text.startsWith("### ")) {
    return (
      <h3
        className="font-heading text-xl md:text-2xl font-normal mt-10 mb-3"
        style={{ color: "var(--fg)" }}
      >
        {text.slice(4)}
      </h3>
    );
  }

  // code blocks
  if (text.startsWith("```")) {
    const lines = text.split("\n");
    const lang = lines[0].slice(3);
    const code = lines.slice(1, -1).join("\n");
    return (
      <pre
        className="my-6 p-5 rounded-xl overflow-x-auto text-[13px] leading-[1.75] font-mono"
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          color: "var(--fg-secondary)",
        }}
      >
        {lang && (
          <div
            className="text-[10px] uppercase tracking-wider mb-3"
            style={{ color: "var(--accent)" }}
          >
            {lang}
          </div>
        )}
        <code>{highlightCode(code, lang)}</code>
      </pre>
    );
  }

  // numbered lists
  if (/^\d+\.\s/.test(text)) {
    const items = text.split(/\n(?=\d+\.\s)/);
    return (
      <ol className="my-4 space-y-3 list-decimal list-outside ml-5">
        {items.map((item, i) => {
          const content = item.replace(/^\d+\.\s/, "");
          return (
            <li
              key={i}
              className="text-[15px] leading-[1.85] pl-1"
              style={{ color: "var(--fg-secondary)" }}
              dangerouslySetInnerHTML={{ __html: inlineFormat(content) }}
            />
          );
        })}
      </ol>
    );
  }

  // unordered lists
  if (text.startsWith("- ")) {
    const items = text.split("\n- ");
    items[0] = items[0].slice(2);
    return (
      <ul className="my-4 space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-3">
            <span
              className="mt-[10px] w-1.5 h-1.5 rounded-full shrink-0"
              style={{ background: "var(--accent)" }}
            />
            <span
              className="text-[15px] leading-[1.85]"
              style={{ color: "var(--fg-secondary)" }}
              dangerouslySetInnerHTML={{ __html: inlineFormat(item) }}
            />
          </li>
        ))}
      </ul>
    );
  }

  // paragraph
  return (
    <p
      className="text-[15px] leading-[1.85] my-4"
      style={{ color: "var(--fg-secondary)" }}
      dangerouslySetInnerHTML={{ __html: inlineFormat(text) }}
    />
  );
}

function inlineFormat(text: string): string {
  return text
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" style="color: var(--accent-light); text-decoration: underline; text-underline-offset: 3px">$1</a>')
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color: var(--fg); font-weight: 500">$1</strong>')
    .replace(/`(.+?)`/g, '<code style="background: var(--bg-card); border: 1px solid var(--border); padding: 1px 6px; border-radius: 4px; font-size: 13px; color: var(--accent-light)">$1</code>');
}

export default function Writing() {
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);

  return (
    <section
      id="writing"
      className="relative min-h-screen flex items-center justify-center px-8 py-24"
    >
      <div className="max-w-3xl mx-auto w-full">
        <div className="text-center mb-16">
          <motion.span
            className="inline-block text-[11px] font-mono tracking-[0.2em] mb-4"
            style={{ color: "var(--accent-light)" }}
          >
            06
          </motion.span>
          <motion.h2
            className="font-heading text-4xl md:text-5xl lg:text-6xl font-normal"
            style={{ color: "var(--fg)" }}
          >
            Writing
          </motion.h2>
          <motion.div
            initial={{ scaleX: 0 }}
            transition={{ duration: 0.3, delay: 0.15 }}
            className="h-[2px] w-12 mx-auto mt-6 rounded-full"
            style={{ background: "linear-gradient(90deg, var(--accent), var(--accent-light))" }}
          />
        </div>

        <div className="space-y-4">
          {posts.map((post) => {
            const isOpen = expandedSlug === post.slug;

            return (
              <motion.div
                key={post.slug}
                className="relative rounded-2xl overflow-hidden transition-all duration-300"
                style={{
                  background: isOpen
                    ? "linear-gradient(135deg, rgba(74,154,154,0.04), transparent 60%)"
                    : "var(--bg-card)",
                  border: `1px solid ${isOpen ? "var(--border-accent)" : "var(--border)"}`,
                }}
              >
                <button
                  onClick={(e) => {
                    const el = e.currentTarget.parentElement!;
                    const rect = el.getBoundingClientRect();
                    const offsetFromViewport = rect.top;
                    setExpandedSlug(isOpen ? null : post.slug);
                    requestAnimationFrame(() => {
                      const newRect = el.getBoundingClientRect();
                      const drift = newRect.top - offsetFromViewport;
                      if (Math.abs(drift) > 1) {
                        window.scrollBy({ top: drift, behavior: "instant" });
                      }
                    });
                  }}
                  className="w-full px-7 py-6 text-left cursor-pointer"
                  onMouseEnter={(e) => {
                    if (!isOpen) e.currentTarget.parentElement!.style.borderColor = "var(--border-hover)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isOpen) e.currentTarget.parentElement!.style.borderColor = "var(--border)";
                  }}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-[11px] font-mono" style={{ color: "var(--accent)" }}>
                      {post.date}
                    </span>
                    <span className="text-[11px] font-mono" style={{ color: "var(--fg-muted)" }}>
                      · {post.readTime}
                    </span>
                  </div>
                  <h3
                    className="font-heading text-xl md:text-2xl font-normal mb-3"
                    style={{ color: "var(--fg)" }}
                  >
                    {post.title}
                  </h3>
                  <div className="flex gap-2 flex-wrap">
                    {post.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-[11px] px-2.5 py-1 rounded-lg font-mono"
                        style={{
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid var(--border)",
                          color: "var(--fg-muted)",
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </button>

                <AnimatePresence>
                  {isOpen && (
                    <motion.div
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
                      className="overflow-hidden"
                    >
                      <div
                        className="px-7 pb-10 pt-2"
                        style={{ borderTop: "1px solid var(--border)" }}
                      >
                        {post.content.map((block, i) => (
                          <div key={i}>{renderMarkdown(block)}</div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
