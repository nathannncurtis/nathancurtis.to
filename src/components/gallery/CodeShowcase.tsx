import { useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "motion/react";

const snippets = [
  {
    lang: "Zig",
    file: "mdview-zig / src/text.zig",
    accent: "#E9A14B",
    code: `// Platform-native text rendering dispatch
pub fn renderText(
    layout: *Layout,
    run: TextRun,
    ctx: *RenderCtx,
) !void {
    return switch (builtin.os.tag) {
        .windows => directwrite.render(layout, run, ctx),
        .linux   => cairo.render(layout, run, ctx),
        .macos   => coretext.render(layout, run, ctx),
        else     => error.UnsupportedPlatform,
    };
}`,
  },
  {
    lang: "Rust",
    file: "Study-Aggregator / engine/src/dicom.rs",
    accent: "#C97B5E",
    code: `// Zero-copy DICOM parse over a memory-mapped file
let file = File::open(&path)?;
let mmap = unsafe { Mmap::map(&file)? };

let study = match parse_dicom(&mmap[..]) {
    Ok(s) => s,
    Err(_) => parse_nonconformant(&mmap[..])?,
};

patients.par_extend(
    study.series
        .par_iter()
        .map(Patient::from_series)
);`,
  },
  {
    lang: "Python",
    file: "commit-summarizer / summarizer.py",
    accent: "#A78BFA",
    code: `# Stream commit summary from local Ollama model
if not hmac_valid(request, WEBHOOK_SECRET):
    return Response(status=401)

summary = ollama.chat(
    model="qwen2.5:3b",
    messages=[{
        "role": "user",
        "content": PROMPT.format(
            commits=serialize(payload["commits"]),
            repo=payload["repository"]["name"],
        ),
    }],
)
post_to_slack(WEBHOOK, summary["message"]["content"])`,
  },
  {
    lang: "TypeScript",
    file: "obsidian-vault-sync / plugin/src/sync.ts",
    accent: "#7DB4E8",
    code: `// Vault sync client — WebSocket with polling fallback
const ws = new WebSocket(\`\${serverUrl}/sync?token=\${token}\`);

ws.addEventListener("message", async (evt) => {
  const change: VaultChange = JSON.parse(evt.data);
  if (change.hash === await localHash(change.path)) return;
  await applyChange(change);
  bumpLocalHash(change.path, change.hash);
});

ws.addEventListener("close", () => startPollingFallback());`,
  },
];

// Tiny heuristic syntax highlighting — good enough for a showcase
function highlight(code: string, lang: string, accent: string) {
  const keywords: Record<string, string[]> = {
    Zig: ["pub", "fn", "return", "switch", "try", "error", "const", "var", "if", "else"],
    Rust: ["let", "match", "unsafe", "fn", "use", "mut", "pub", "struct", "impl", "Ok", "Err"],
    Python: ["if", "not", "return", "import", "def", "class", "for", "in"],
    TypeScript: ["const", "async", "await", "if", "return", "new", "let", "function", "interface"],
  };
  const kw = keywords[lang] || [];
  const lines = code.split("\n");
  return lines.map((line, i) => {
    const parts: ReactNode[] = [];
    // comments
    const commentMatch = line.match(/^(\s*)(\/\/|#)(.*)$/);
    if (commentMatch) {
      return (
        <div key={i}>
          {commentMatch[1]}
          <span style={{ color: "var(--fg-muted)", fontStyle: "italic" }}>
            {commentMatch[2]}
            {commentMatch[3]}
          </span>
        </div>
      );
    }
    // string literals + keyword matching in one pass
    const regex = /("(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`|\b[A-Za-z_][A-Za-z0-9_]*\b|\d+|[^"`\w]+)/g;
    let m;
    let key = 0;
    while ((m = regex.exec(line)) !== null) {
      const tok = m[0];
      if (tok.startsWith('"') || tok.startsWith("`")) {
        parts.push(<span key={key++} style={{ color: "#9EC58F" }}>{tok}</span>);
      } else if (kw.includes(tok)) {
        parts.push(<span key={key++} style={{ color: accent, fontWeight: 500 }}>{tok}</span>);
      } else if (/^\d+$/.test(tok)) {
        parts.push(<span key={key++} style={{ color: "#D4944A" }}>{tok}</span>);
      } else {
        parts.push(tok);
      }
    }
    return <div key={i}>{parts.length ? parts : "\u00a0"}</div>;
  });
}

export default function CodeShowcase() {
  const [active, setActive] = useState(0);
  const current = snippets[active];

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
      }}
    >
      {/* Tab bar */}
      <div
        className="flex items-center gap-1 px-3 py-2 border-b"
        style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.2)" }}
      >
        <div className="flex gap-1.5 mr-4">
          <div className="w-3 h-3 rounded-full" style={{ background: "#C97B5E" }} />
          <div className="w-3 h-3 rounded-full" style={{ background: "#E9A14B" }} />
          <div className="w-3 h-3 rounded-full" style={{ background: "#5CB8B8" }} />
        </div>
        {snippets.map((s, i) => (
          <button
            key={s.lang}
            onClick={() => setActive(i)}
            className="relative px-3 py-1.5 text-[11px] font-mono tracking-wide rounded-md transition-all duration-200 cursor-pointer"
            style={{
              color: active === i ? s.accent : "var(--fg-muted)",
              background: active === i ? `${s.accent}12` : "transparent",
            }}
          >
            {s.lang}
            {active === i && (
              <motion.div
                layoutId="code-tab-underline"
                className="absolute -bottom-[9px] left-3 right-3 h-[2px] rounded-full"
                style={{ background: s.accent }}
                transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
              />
            )}
          </button>
        ))}
      </div>

      {/* File header */}
      <div
        className="px-5 py-2.5 text-[11px] font-mono flex items-center justify-between border-b"
        style={{ color: "var(--fg-muted)", borderColor: "var(--border)" }}
      >
        <span>{current.file}</span>
        <span style={{ color: current.accent }}>● {current.lang}</span>
      </div>

      {/* Code body */}
      <AnimatePresence mode="wait">
        <motion.pre
          key={active}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.25 }}
          className="px-6 py-6 text-[13px] leading-[1.75] font-mono overflow-x-auto"
          style={{ color: "var(--fg)" }}
        >
          {highlight(current.code, current.lang, current.accent)}
        </motion.pre>
      </AnimatePresence>
    </div>
  );
}
