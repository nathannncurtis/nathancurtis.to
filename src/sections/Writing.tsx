import { useState, useEffect, type ReactNode } from "react";
import { motion, AnimatePresence } from "motion/react";

// ── types ──────────────────────────────────────────────────

interface Post {
  slug: string;
  title: string;
  date: string;
  readTime: string;
  tags: string[];
  body: string;
}

// ── load markdown files via vite glob ──────────────────────

const mdFiles = import.meta.glob("../content/writing/*.md", {
  query: "?raw",
  eager: true,
}) as Record<string, { default: string }>;

function parseFrontmatter(raw: string): Post | null {
  const normalized = raw.replace(/\r\n/g, "\n");
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return null;

  const meta: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    meta[key] = val;
  }

  let tags: string[] = [];
  const tagsMatch = match[1].match(/tags:\s*\[([^\]]*)\]/);
  if (tagsMatch) {
    tags = tagsMatch[1].split(",").map((t) => t.trim().replace(/"/g, ""));
  }

  const slug = meta.title
    ? meta.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
    : "untitled";

  return {
    slug,
    title: meta.title || "Untitled",
    date: meta.date || "",
    readTime: meta.readTime || "",
    tags,
    body: match[2].trim(),
  };
}

const allPosts: Post[] = Object.values(mdFiles)
  .map((mod) => parseFrontmatter(mod.default))
  .filter((p): p is Post => p !== null)
  .sort((a, b) => {
    const dateOrder = [
      "April 2026", "March 2026", "February 2026", "January 2026",
      "December 2025", "November 2025", "October 2025",
      "October 2024",
    ];
    return dateOrder.indexOf(a.date) - dateOrder.indexOf(b.date);
  });

const FEATURED_COUNT = 3;
const featuredPosts = allPosts.slice(0, FEATURED_COUNT);
const archivePosts = allPosts.slice(FEATURED_COUNT);

// group archive by year
const archiveByYear: Record<string, Post[]> = {};
for (const p of archivePosts) {
  const year = p.date.split(" ").pop() || "Other";
  if (!archiveByYear[year]) archiveByYear[year] = [];
  archiveByYear[year].push(p);
}
const archiveYears = Object.keys(archiveByYear).sort((a, b) => Number(b) - Number(a));

// ── syntax highlighting ────────────────────────────────────

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
    const commentMatch = line.match(/^(\s*)(\/\/|#|--)(.*)/);
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

    const regex = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\/\/.*$|\b[A-Za-z_][A-Za-z0-9_]*\b|0x[0-9A-Fa-f_]+|\d[\d_]*|[^\w\s"'`]+|\s+)/g;
    const parts: ReactNode[] = [];
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
      } else if (tok === "?" || tok === "=>") {
        parts.push(<span key={key++} style={{ color: "#C97B5E" }}>{tok}</span>);
      } else {
        parts.push(<span key={key++}>{tok}</span>);
      }
    }

    return <div key={lineIdx}>{parts.length > 0 ? parts : "\u00a0"}</div>;
  });
}

// ── markdown renderer ──────────────────────────────────────

function inlineFormat(text: string): string {
  return text
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" style="color: var(--accent-light); text-decoration: underline; text-underline-offset: 3px">$1</a>')
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color: var(--fg); font-weight: 500">$1</strong>')
    .replace(/`(.+?)`/g, '<code style="background: var(--bg-card); border: 1px solid var(--border); padding: 1px 6px; border-radius: 4px; font-size: 13px; color: var(--accent-light)">$1</code>');
}

function renderMarkdown(body: string) {
  const blocks = body.split("\n\n");
  const elements: ReactNode[] = [];
  let i = 0;

  while (i < blocks.length) {
    const block = blocks[i].trim();
    if (!block) { i++; continue; }

    if (block.startsWith("## ")) {
      elements.push(
        <h2 key={i} className="font-heading text-2xl md:text-3xl font-normal mt-12 mb-4" style={{ color: "var(--fg)" }}>
          {block.slice(3)}
        </h2>
      );
    } else if (block.startsWith("### ")) {
      elements.push(
        <h3 key={i} className="font-heading text-xl md:text-2xl font-normal mt-10 mb-3" style={{ color: "var(--fg)" }}>
          {block.slice(4)}
        </h3>
      );
    } else if (block.startsWith("```")) {
      // collect until closing ```
      let codeContent = block;
      while (!codeContent.slice(3).includes("```") && i + 1 < blocks.length) {
        i++;
        codeContent += "\n\n" + blocks[i];
      }
      const lines = codeContent.split("\n");
      const lang = lines[0].slice(3);
      const lastFence = codeContent.lastIndexOf("```");
      const code = codeContent.slice(codeContent.indexOf("\n") + 1, lastFence).trimEnd();

      elements.push(
        <pre key={i} className="my-6 p-5 rounded-xl overflow-x-auto text-[13px] leading-[1.75] font-mono"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--fg-secondary)" }}>
          {lang && <div className="text-[10px] uppercase tracking-wider mb-3" style={{ color: "var(--accent)" }}>{lang}</div>}
          <code>{highlightCode(code, lang)}</code>
        </pre>
      );
    } else if (/^\d+\.\s/.test(block)) {
      const items = block.split(/\n(?=\d+\.\s)/);
      elements.push(
        <ol key={i} className="my-4 space-y-3 list-decimal list-outside ml-5">
          {items.map((item, j) => (
            <li key={j} className="text-[15px] leading-[1.85] pl-1" style={{ color: "var(--fg-secondary)" }}
              dangerouslySetInnerHTML={{ __html: inlineFormat(item.replace(/^\d+\.\s/, "")) }} />
          ))}
        </ol>
      );
    } else if (block.startsWith("- ")) {
      const items = block.split("\n- ");
      items[0] = items[0].slice(2);
      elements.push(
        <ul key={i} className="my-4 space-y-2">
          {items.map((item, j) => (
            <li key={j} className="flex items-start gap-3">
              <span className="mt-[10px] w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "var(--accent)" }} />
              <span className="text-[15px] leading-[1.85]" style={{ color: "var(--fg-secondary)" }}
                dangerouslySetInnerHTML={{ __html: inlineFormat(item) }} />
            </li>
          ))}
        </ul>
      );
    } else {
      elements.push(
        <p key={i} className="text-[15px] leading-[1.85] my-4" style={{ color: "var(--fg-secondary)" }}
          dangerouslySetInnerHTML={{ __html: inlineFormat(block) }} />
      );
    }
    i++;
  }
  return elements;
}

// ── components ─────────────────────────────────────────────

function PostCard({ post, expanded, onToggle, featured = false }: {
  post: Post;
  expanded: boolean;
  onToggle: () => void;
  featured?: boolean;
}) {
  return (
    <motion.div
      className="relative rounded-2xl overflow-hidden transition-all duration-300"
      style={{
        background: expanded
          ? "linear-gradient(135deg, rgba(74,154,154,0.04), transparent 60%)"
          : "var(--bg-card)",
        border: `1px solid ${expanded ? "var(--border-accent)" : "var(--border)"}`,
      }}
    >
      <button
        onClick={(e) => {
          const el = e.currentTarget.parentElement!;
          const rect = el.getBoundingClientRect();
          const offsetFromViewport = rect.top;
          onToggle();
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
          if (!expanded) e.currentTarget.parentElement!.style.borderColor = "var(--border-hover)";
        }}
        onMouseLeave={(e) => {
          if (!expanded) e.currentTarget.parentElement!.style.borderColor = "var(--border)";
        }}
      >
        <div className="flex items-center gap-3 mb-2">
          <span className="text-[11px] font-mono" style={{ color: "var(--accent)" }}>{post.date}</span>
          <span className="text-[11px] font-mono" style={{ color: "var(--fg-muted)" }}>· {post.readTime}</span>
        </div>
        <h3
          className={`font-heading font-normal mb-3 ${featured ? "text-xl md:text-2xl" : "text-lg"}`}
          style={{ color: "var(--fg)" }}
        >
          {post.title}
        </h3>
        <div className="flex gap-2 flex-wrap">
          {post.tags.map((tag) => (
            <span key={tag} className="text-[11px] px-2.5 py-1 rounded-lg font-mono"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)", color: "var(--fg-muted)" }}>
              {tag}
            </span>
          ))}
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
            className="overflow-hidden"
          >
            <div className="px-7 pb-10 pt-2" style={{ borderTop: "1px solid var(--border)" }}>
              {renderMarkdown(post.body)}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── main component ─────────────────────────────────────────

export default function Writing() {
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);
  const [showAllArchive, setShowAllArchive] = useState(false);

  return (
    <section id="writing" className="relative min-h-screen flex items-center justify-center px-8 py-24">
      <div className="max-w-3xl mx-auto w-full">
        {/* Header */}
        <div className="text-center mb-16">
          <motion.span className="inline-block text-[11px] font-mono tracking-[0.2em] mb-4" style={{ color: "var(--accent-light)" }}>
            06
          </motion.span>
          <motion.h2 className="font-heading text-4xl md:text-5xl lg:text-6xl font-normal" style={{ color: "var(--fg)" }}>
            Writing
          </motion.h2>
          <motion.div
            initial={{ scaleX: 0 }}
            transition={{ duration: 0.3, delay: 0.15 }}
            className="h-[2px] w-12 mx-auto mt-6 rounded-full"
            style={{ background: "linear-gradient(90deg, var(--accent), var(--accent-light))" }}
          />
        </div>

        {/* Featured posts */}
        <div className="space-y-4 mb-12">
          {featuredPosts.map((post) => (
            <PostCard
              key={post.slug}
              post={post}
              expanded={expandedSlug === post.slug}
              onToggle={() => setExpandedSlug(expandedSlug === post.slug ? null : post.slug)}
              featured
            />
          ))}
        </div>

        {/* Archive */}
        {archivePosts.length > 0 && (
          <div>
            <div className="flex items-center gap-4 mb-6">
              <div className="h-px flex-1" style={{ background: "var(--border)" }} />
              <span className="text-[11px] font-mono tracking-[0.2em]" style={{ color: "var(--fg-muted)" }}>
                ARCHIVE
              </span>
              <div className="h-px flex-1" style={{ background: "var(--border)" }} />
            </div>

            {archiveYears.map((year) => (
              <div key={year} className="mb-6">
                <h4 className="text-xs font-mono tracking-[0.2em] mb-3" style={{ color: "var(--fg-muted)" }}>
                  {year}
                </h4>
                <div className="space-y-2">
                  {archiveByYear[year].map((post) => {
                    const isExpanded = expandedSlug === post.slug;
                    return (
                      <motion.div
                        key={post.slug}
                        className="rounded-xl overflow-hidden transition-all duration-300"
                        style={{
                          background: isExpanded
                            ? "linear-gradient(135deg, rgba(74,154,154,0.04), transparent 60%)"
                            : "var(--bg-card)",
                          border: `1px solid ${isExpanded ? "var(--border-accent)" : "var(--border)"}`,
                        }}
                      >
                        <button
                          onClick={(e) => {
                            const el = e.currentTarget.parentElement!;
                            const rect = el.getBoundingClientRect();
                            const offsetFromViewport = rect.top;
                            setExpandedSlug(isExpanded ? null : post.slug);
                            requestAnimationFrame(() => {
                              const newRect = el.getBoundingClientRect();
                              const drift = newRect.top - offsetFromViewport;
                              if (Math.abs(drift) > 1) {
                                window.scrollBy({ top: drift, behavior: "instant" });
                              }
                            });
                          }}
                          className="w-full px-5 py-4 text-left cursor-pointer flex items-center justify-between gap-4"
                          onMouseEnter={(e) => {
                            if (!isExpanded) e.currentTarget.parentElement!.style.borderColor = "var(--border-hover)";
                          }}
                          onMouseLeave={(e) => {
                            if (!isExpanded) e.currentTarget.parentElement!.style.borderColor = "var(--border)";
                          }}
                        >
                          <div className="flex-1 min-w-0">
                            <h3 className="font-heading text-base font-normal truncate" style={{ color: "var(--fg)" }}>
                              {post.title}
                            </h3>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <div className="hidden md:flex gap-1.5">
                              {post.tags.slice(0, 2).map((tag) => (
                                <span key={tag} className="text-[10px] px-2 py-0.5 rounded font-mono"
                                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)", color: "var(--fg-muted)" }}>
                                  {tag}
                                </span>
                              ))}
                            </div>
                            <span className="text-[11px] font-mono" style={{ color: "var(--fg-muted)" }}>
                              {post.date.split(" ")[0]}
                            </span>
                          </div>
                        </button>

                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
                              className="overflow-hidden"
                            >
                              <div className="px-5 pb-10 pt-2" style={{ borderTop: "1px solid var(--border)" }}>
                                {renderMarkdown(post.body)}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
