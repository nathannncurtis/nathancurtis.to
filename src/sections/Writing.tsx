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
];

const langKeywords: Record<string, string[]> = {
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
                  onClick={() => setExpandedSlug(isOpen ? null : post.slug)}
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
