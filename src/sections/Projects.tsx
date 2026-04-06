import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { HardDrive, Activity, GitCommit } from "lucide-react";
import ExternalLinkIcon from "../components/icons/external-link-icon";
import DownChevron from "../components/icons/down-chevron";
import CodeIcon from "../components/icons/code-icon";
import FileDescriptionIcon from "../components/icons/file-description-icon";
import RefreshIcon from "../components/icons/refresh-icon";

const projects = [
  {
    id: "mdview-zig",
    num: "01",
    name: "mdview",
    tagline: "Native cross-platform markdown viewer in Zig",
    icon: FileDescriptionIcon,
    github: "https://github.com/nathannncurtis/mdview-zig",
    problem: "Every markdown viewer ships a full browser engine to render a few hundred lines of text. 200MB of webview for what should be a static renderer — cold starts measured in seconds, RAM in hundreds of megabytes.",
    approach: "Written in Zig with platform-native text rendering: DirectWrite on Windows, Cairo + Pango on Linux, CoreText on macOS. No webview, no runtime. File watching, syntax highlighting, scroll memory, and drag-and-drop — all in a single ~285KB standalone binary.",
    outcome: "Cross-platform releases for Windows (installer + portable), Linux (.deb + standalone), and macOS (Apple Silicon). Registers as the system default .md handler. Rewrite of an earlier Rust/WebView2 version that dropped the 200MB browser dependency entirely.",
    tags: ["Zig", "DirectWrite", "Cairo", "CoreText"],
    accent: "#E9A14B",
  },
  {
    id: "study-aggregator",
    num: "02",
    name: "Study Aggregator",
    tagline: "Rust DICOM engine — 100–400x faster",
    icon: Activity,
    github: "https://github.com/nathannncurtis/Study-Aggregator",
    problem: "DICOM studies come in from CDs, ZIPs, and network drives in every format imaginable — implicit VR, missing preambles, truncated files, nested password-protected archives. The pydicom-based version was taking minutes on multi-gigabyte input and churning RAM on large ZIPs.",
    approach: "Rewrote the parsing hot path as a native Rust engine called via subprocess from the existing PyQt5 GUI, with progress and results streamed as JSON lines on stderr/stdout. Zero-copy memory-mapped DICOM parsing (memmap2), parallel directory walking (jwalk) and per-file parsing (rayon), streaming ZIP extraction so multi-GB archives don't balloon memory.",
    outcome: "Shipped as v4.0. Roughly 100–400x faster than the previous implementation on typical office hardware — multi-minute jobs now finish in seconds. Handles non-conformant DICOMs the old version couldn't touch.",
    tags: ["Rust", "Python", "DICOM", "memmap2", "rayon"],
    accent: "#C97B5E",
  },
  {
    id: "coil",
    num: "03",
    name: "Coil",
    tagline: "Python-to-executable compiler",
    icon: CodeIcon,
    github: "https://github.com/nathannncurtis/coil",
    problem: "Every tool for turning Python into an executable is painful. Hidden imports, missing DLLs, spec files, hook scripts, cryptic errors. Nobody should have to deal with that.",
    approach: "Custom C bootloader that loads an embedded Python runtime, resolves the entry point, and launches the app. Auto-detects dependencies, bundles everything into a standalone directory or portable .exe. No spec files, no hook scripts.",
    outcome: "Published on PyPI as coil-compiler. Used internally to ship Study Aggregator, md-pdf-cli, and other tools as standalone Windows executables.",
    tags: ["Python", "C", "CLI", "PyPI"],
    accent: "#4A9A9A",
  },
  {
    id: "commit-summarizer",
    num: "04",
    name: "Commit Summarizer",
    tagline: "Local-LLM commit summaries to Slack",
    icon: GitCommit,
    github: "https://github.com/nathannncurtis/commit-summarizer",
    problem: "Non-technical stakeholders want to know what engineering is shipping, but nobody wants to read diffs and nobody wants commit data leaving the network to a third-party LLM API.",
    approach: "Webhook service that verifies GitHub push events (HMAC-SHA256), pipes commit metadata through a local Ollama model, and posts the plain-English summary to a Slack channel. Runs entirely on-prem — no data leaves the network.",
    outcome: "Gives non-engineering stakeholders visibility into code changes with zero SaaS dependency and zero data egress.",
    tags: ["Python", "Ollama", "Webhooks", "Self-hosted"],
    accent: "#A78BFA",
  },
  {
    id: "obsidian-vault-sync",
    num: "05",
    name: "Obsidian Vault Sync",
    tagline: "Self-hosted real-time vault sync",
    icon: RefreshIcon,
    github: "https://github.com/nathannncurtis/obsidian-vault-sync",
    problem: "Obsidian's first-party sync is a subscription and routes notes through their servers. Self-hosted alternatives were either file-sync layers that didn't propagate changes in real time, or heavy general-purpose tools that weren't vault-aware.",
    approach: "Two-part stack: a FastAPI server that stores the vault on disk and pushes changes over WebSocket, and a TypeScript Obsidian plugin that subscribes. Polling fallback when WebSocket is unavailable. Token auth, file-hash reconciliation, Dockerized server.",
    outcome: "Runs on a home server and keeps vaults in sync across devices in real time with no third-party service in the loop.",
    tags: ["TypeScript", "Python", "FastAPI", "WebSocket", "Docker"],
    accent: "#7DB4E8",
  },
  {
    id: "file-processor",
    num: "06",
    name: "File Processor",
    tagline: "Network-aware batch converter",
    icon: HardDrive,
    github: "https://github.com/nathannncurtis/File-Processor",
    problem: "Production workflows need to convert large volumes of PDFs to TIFF/JPEG across network shares, reliably, without anyone babysitting it.",
    approach: "Multiprocessing with a PyQt5 GUI, configurable job queue, automatic CPU core rebalancing, and concurrent execution across network directories.",
    outcome: "Runs daily in production. Has processed over 20 million pages to date across PDF-to-TIFF, PDF-to-JPEG, and JPEG-to-TIFF pipelines with job management and error recovery.",
    tags: ["Python", "PyQt5", "Multiprocessing", "Network I/O"],
    accent: "#5CB8B8",
  },
];

export default function Projects() {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <section
      id="projects"
      className="relative min-h-screen flex items-center justify-center px-8 py-24"
    >
      <div className="max-w-4xl mx-auto w-full">
        {/* Header */}
        <div className="text-center mb-16">
          <motion.span
            className="inline-block text-[11px] font-mono tracking-[0.2em] mb-4"
            style={{ color: "var(--accent-light)" }}
          >
            02
          </motion.span>
          <motion.h2
            transition={{ duration: 0.3 }}
            className="font-heading text-4xl md:text-5xl lg:text-6xl font-normal"
            style={{ color: "var(--fg)" }}
          >
            Projects
          </motion.h2>
          <motion.div
            initial={{ scaleX: 0 }}
            transition={{ duration: 0.3, delay: 0.15 }}
            className="h-[2px] w-12 mx-auto mt-6 rounded-full"
            style={{ background: "linear-gradient(90deg, var(--accent), var(--accent-light))" }}
          />
        </div>

        <div className="space-y-4">
          {projects.map((project, i) => {
            const isOpen = expanded === project.id;
            const Icon = project.icon;

            return (
              <motion.div
                key={project.id}
                transition={{ duration: 0.3, delay: i * 0.03 }}
                className="relative rounded-2xl overflow-hidden transition-all duration-300"
                style={{
                  background: isOpen
                    ? `linear-gradient(135deg, ${project.accent}08, transparent 60%)`
                    : "var(--bg-card)",
                  border: `1px solid ${isOpen ? project.accent + "40" : "var(--border)"}`,
                  boxShadow: isOpen ? `0 8px 40px ${project.accent}12` : "none",
                }}
              >
                {/* Accent line on left when open */}
                {isOpen && (
                  <motion.div
                    className="absolute left-0 top-0 bottom-0 w-[3px]"
                    style={{ background: project.accent }}
                    initial={{ scaleY: 0 }}
                    animate={{ scaleY: 1 }}
                    transition={{ duration: 0.3 }}
                  />
                )}

                {/* Header */}
                <button
                  onClick={() => setExpanded(isOpen ? null : project.id)}
                  className="w-full px-7 py-6 flex items-center gap-5 text-left cursor-pointer transition-colors duration-200"
                  onMouseEnter={(e) => {
                    if (!isOpen) e.currentTarget.parentElement!.style.borderColor = "var(--border-hover)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isOpen) e.currentTarget.parentElement!.style.borderColor = isOpen ? project.accent + "40" : "var(--border)";
                  }}
                >
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-all duration-300"
                    style={{
                      background: isOpen ? `${project.accent}20` : "rgba(255,255,255,0.04)",
                      border: `1px solid ${isOpen ? project.accent + "50" : "var(--border)"}`,
                      boxShadow: isOpen ? `0 0 20px ${project.accent}15` : "none",
                    }}
                  >
                    <Icon size={18} color={isOpen ? project.accent : "var(--fg-muted)"} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1.5">
                      <span className="font-mono text-xs font-medium" style={{ color: project.accent }}>
                        {project.num}
                      </span>
                      <h3 className="font-heading text-lg font-medium" style={{ color: "var(--fg)" }}>
                        {project.name}
                      </h3>
                    </div>
                    <p className="text-sm" style={{ color: "var(--fg-secondary)" }}>
                      {project.tagline}
                    </p>
                  </div>

                  <div className="hidden md:flex gap-2 mr-4">
                    {project.tags.map((tag) => (
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

                  <motion.div
                    animate={{ rotate: isOpen ? 180 : 0 }}
                    transition={{ duration: 0.25 }}
                    className="shrink-0"
                  >
                    <DownChevron size={18} color={isOpen ? project.accent : "var(--fg-dim)"} />
                  </motion.div>
                </button>

                {/* Expanded detail */}
                <AnimatePresence>
                  {isOpen && (
                    <motion.div
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="px-7 pb-7 pt-4" style={{ borderTop: `1px solid ${project.accent}20` }}>
                        {/* Screenshot — when available */}
                        {project.screenshot && (
                          <motion.div
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.4 }}
                            className="mb-8 rounded-xl overflow-hidden"
                            style={{
                              border: `1px solid ${project.accent}25`,
                              boxShadow: `0 8px 30px rgba(0,0,0,0.3), 0 0 40px ${project.accent}08`,
                            }}
                          >
                            <img
                              src={project.screenshot}
                              alt={`${project.name} screenshot`}
                              className="w-full h-auto block"
                              style={{ maxHeight: "400px", objectFit: "cover", objectPosition: "top" }}
                            />
                          </motion.div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                          {[
                            { label: "Problem", text: project.problem },
                            { label: "Approach", text: project.approach },
                            { label: "Outcome", text: project.outcome },
                          ].map((block, bi) => (
                            <motion.div
                              key={block.label}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.35, delay: bi * 0.1 }}
                            >
                              <p
                                className="text-xs tracking-[0.15em] uppercase mb-3 font-mono font-medium"
                                style={{ color: project.accent }}
                              >
                                {block.label}
                              </p>
                              <p className="text-[15px] leading-[1.85]" style={{ color: "var(--fg-secondary)" }}>
                                {block.text}
                              </p>
                            </motion.div>
                          ))}
                        </div>

                        <div className="flex items-center justify-between mt-8 pt-5" style={{ borderTop: `1px solid ${project.accent}15` }}>
                          <div className="flex gap-2 md:hidden flex-wrap">
                            {project.tags.map((tag) => (
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
                          {project.github ? (
                            <a
                              href={project.github}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="group inline-flex items-center gap-2.5 text-sm font-semibold transition-all duration-200 hover:gap-3.5 ml-auto"
                              style={{ color: project.accent }}
                            >
                              View on GitHub
                              <ExternalLinkIcon size={14} className="transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                            </a>
                          ) : (
                            <span
                              className="inline-flex items-center gap-2 text-sm font-mono ml-auto"
                              style={{ color: "var(--fg-dim)" }}
                            >
                              Private repo
                            </span>
                          )}
                        </div>
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
