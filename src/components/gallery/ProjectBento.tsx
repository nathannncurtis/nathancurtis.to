import { motion } from "motion/react";
import {
  FileText,
  Activity,
  FileCode2,
  GitCommit,
  RefreshCw,
  HardDrive,
  ArrowUpRight,
  Github,
} from "lucide-react";

/* ============================================================
   ProjectBento v2
   ------------------------------------------------------------
   - Asymmetric 12-col grid (3 distinct rows, no uniform sizing)
   - Every cell is bespoke, not a template
   - Screenshot slot containers built into each cell layout
   - mdview + Study Agg = dual-hero treatment, top row
   - Coil / Commit Summ / Vault Sync = small tiles, middle row
   - File Processor = full-width featured band anchored on "20M+"
   ============================================================ */

/* ------ shared: screenshot placeholder ------ */
function Screenshot({
  accent,
  icon: Icon,
  label,
  className = "",
  orientation = "landscape",
}: {
  accent: string;
  icon: React.ElementType;
  label: string;
  className?: string;
  orientation?: "landscape" | "portrait";
}) {
  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{
        background: `
          linear-gradient(135deg, ${accent}12, transparent 55%),
          radial-gradient(ellipse at 30% 20%, ${accent}18, transparent 65%),
          repeating-linear-gradient(45deg, rgba(255,255,255,0.012) 0 12px, transparent 12px 24px),
          var(--bg-raised)
        `,
      }}
    >
      {/* faux window chrome top bar */}
      <div
        className="absolute top-0 left-0 right-0 h-6 flex items-center gap-1.5 px-3"
        style={{
          background: "rgba(0,0,0,0.25)",
          borderBottom: `1px solid ${accent}20`,
        }}
      >
        <div className="w-2 h-2 rounded-full" style={{ background: "#C97B5E80" }} />
        <div className="w-2 h-2 rounded-full" style={{ background: "#E9A14B80" }} />
        <div className="w-2 h-2 rounded-full" style={{ background: "#5CB8B880" }} />
      </div>

      {/* center content */}
      <div className="absolute inset-0 flex items-center justify-center pt-6">
        <div className="flex flex-col items-center gap-2.5">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{
              background: `${accent}18`,
              border: `1px solid ${accent}40`,
              boxShadow: `0 0 30px ${accent}12`,
            }}
          >
            <Icon size={22} style={{ color: accent }} />
          </div>
          <span
            className="text-[9px] font-mono tracking-[0.2em] uppercase"
            style={{ color: "var(--fg-muted)" }}
          >
            {label}
          </span>
        </div>
      </div>

      {/* corner orientation tag */}
      <span
        className="absolute bottom-2 right-3 text-[8px] font-mono tracking-wider uppercase opacity-50"
        style={{ color: accent }}
      >
        {orientation}
      </span>
    </div>
  );
}

/* ------ shared: hover lift wrapper ------ */
function Cell({
  children,
  accent,
  className = "",
}: {
  children: React.ReactNode;
  accent: string;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.45 }}
      className={`group relative rounded-2xl overflow-hidden ${className}`}
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        transition: "border-color 0.35s ease, box-shadow 0.35s ease, transform 0.35s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = `${accent}50`;
        e.currentTarget.style.boxShadow = `0 16px 50px ${accent}18, 0 0 0 1px ${accent}25`;
        e.currentTarget.style.transform = "translateY(-3px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--border)";
        e.currentTarget.style.boxShadow = "none";
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      {children}
    </motion.div>
  );
}

function GithubLink({ accent }: { accent: string }) {
  return (
    <div
      className="inline-flex items-center gap-1.5 text-[10px] font-mono tracking-wide opacity-0 group-hover:opacity-100 transition-opacity duration-300"
      style={{ color: accent }}
    >
      <Github size={11} />
      View on GitHub
      <ArrowUpRight size={11} />
    </div>
  );
}

/* ============================================================
                    INDIVIDUAL CELLS
   ============================================================ */

function MdviewHero() {
  const accent = "#E9A14B";
  return (
    <Cell accent={accent} className="md:col-span-7 md:row-span-2">
      <div className="flex flex-col md:flex-row h-full">
        {/* Screenshot slot — dominant */}
        <div className="md:w-[58%] relative h-64 md:h-auto">
          <Screenshot
            accent={accent}
            icon={FileText}
            label="rendered markdown"
            className="absolute inset-0"
          />
          {/* accent left edge */}
          <div
            className="absolute top-0 bottom-0 left-0 w-[3px]"
            style={{ background: `linear-gradient(180deg, ${accent}, transparent)` }}
          />
        </div>

        {/* Text side */}
        <div className="md:w-[42%] p-7 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <span className="font-mono text-[10px] tracking-[0.2em] uppercase" style={{ color: accent }}>
                01 / flagship
              </span>
            </div>
            <h3 className="font-heading text-3xl md:text-4xl font-normal mb-2 tracking-tight" style={{ color: "var(--fg)" }}>
              mdview
            </h3>
            <p className="text-sm leading-relaxed mb-5" style={{ color: "var(--fg-secondary)" }}>
              Native cross-platform markdown viewer in Zig. DirectWrite on Windows, Cairo on Linux, CoreText on macOS. No webview, no runtime — one codebase, three platforms.
            </p>
            <div className="flex items-baseline gap-3 mb-1">
              <span className="font-mono text-2xl" style={{ color: accent }}>~285KB</span>
              <span className="text-[11px] uppercase tracking-wider" style={{ color: "var(--fg-muted)" }}>standalone binary</span>
            </div>
          </div>
          <div className="flex items-center justify-between mt-6">
            <div className="flex gap-1.5 flex-wrap">
              {["Zig", "DirectWrite", "Cairo", "CoreText"].map((t) => (
                <span
                  key={t}
                  className="text-[10px] px-2 py-0.5 rounded font-mono"
                  style={{ background: `${accent}12`, color: accent, border: `1px solid ${accent}25` }}
                >
                  {t}
                </span>
              ))}
            </div>
            <GithubLink accent={accent} />
          </div>
        </div>
      </div>
    </Cell>
  );
}

function StudyAggHero() {
  const accent = "#C97B5E";
  return (
    <Cell accent={accent} className="md:col-span-5 md:row-span-2">
      <div className="flex flex-col h-full">
        {/* Big stat banner top */}
        <div
          className="relative px-7 pt-7 pb-5"
          style={{
            background: `linear-gradient(135deg, ${accent}12, transparent 70%)`,
          }}
        >
          <div className="flex items-center gap-2 mb-3">
            <span className="font-mono text-[10px] tracking-[0.2em] uppercase" style={{ color: accent }}>
              02 / performance
            </span>
          </div>
          <div className="flex items-baseline gap-3 mb-1">
            <span
              className="font-mono text-5xl md:text-6xl font-medium tracking-tight"
              style={{
                background: `linear-gradient(135deg, ${accent}, #E9A14B)`,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              100–400×
            </span>
          </div>
          <p className="text-[11px] uppercase tracking-wider mb-3" style={{ color: "var(--fg-muted)" }}>
            DICOM parser speedup
          </p>
          <h3 className="font-heading text-2xl md:text-3xl font-normal" style={{ color: "var(--fg)" }}>
            Study Aggregator
          </h3>
        </div>

        {/* Screenshot slot — bottom */}
        <div className="flex-1 relative border-t" style={{ borderColor: `${accent}20`, minHeight: "180px" }}>
          <Screenshot
            accent={accent}
            icon={Activity}
            label="patient report"
            className="absolute inset-0"
          />
        </div>

        {/* Metadata footer */}
        <div
          className="px-7 py-3 flex items-center justify-between border-t"
          style={{ borderColor: `${accent}20`, background: "rgba(0,0,0,0.2)" }}
        >
          <div className="flex gap-1.5 flex-wrap">
            {["Rust", "Python", "rayon", "memmap2"].map((t) => (
              <span
                key={t}
                className="text-[10px] px-2 py-0.5 rounded font-mono"
                style={{ background: `${accent}12`, color: accent, border: `1px solid ${accent}25` }}
              >
                {t}
              </span>
            ))}
          </div>
          <GithubLink accent={accent} />
        </div>
      </div>
    </Cell>
  );
}

function SmallTile({
  num,
  name,
  tagline,
  stat,
  statLabel,
  tags,
  accent,
  icon: Icon,
  screenshotLabel,
}: {
  num: string;
  name: string;
  tagline: string;
  stat: string;
  statLabel: string;
  tags: string[];
  accent: string;
  icon: React.ElementType;
  screenshotLabel: string;
}) {
  return (
    <Cell accent={accent} className="md:col-span-4 md:row-span-1">
      <div className="flex h-full">
        {/* Small screenshot slot left */}
        <div className="w-[38%] relative">
          <Screenshot
            accent={accent}
            icon={Icon}
            label={screenshotLabel}
            className="absolute inset-0"
            orientation="portrait"
          />
        </div>

        {/* Content right */}
        <div className="flex-1 p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-[10px] tracking-[0.2em] uppercase" style={{ color: accent }}>
                {num}
              </span>
              <ArrowUpRight
                size={13}
                className="opacity-0 group-hover:opacity-100 transition-all duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                style={{ color: accent }}
              />
            </div>
            <h3 className="font-heading text-lg font-medium mb-1 leading-tight" style={{ color: "var(--fg)" }}>
              {name}
            </h3>
            <p className="text-xs leading-snug mb-2" style={{ color: "var(--fg-secondary)" }}>
              {tagline}
            </p>
          </div>
          <div>
            <div className="flex items-baseline gap-2 mb-2">
              <span className="font-mono text-sm font-medium" style={{ color: accent }}>
                {stat}
              </span>
              <span className="text-[9px] uppercase tracking-wider" style={{ color: "var(--fg-muted)" }}>
                {statLabel}
              </span>
            </div>
            <div className="flex gap-1 flex-wrap">
              {tags.map((t) => (
                <span
                  key={t}
                  className="text-[9px] px-1.5 py-0.5 rounded font-mono"
                  style={{ background: `${accent}10`, color: accent, border: `1px solid ${accent}20` }}
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Cell>
  );
}

function FileProcessorFeatured() {
  const accent = "#5CB8B8";
  return (
    <Cell accent={accent} className="md:col-span-12">
      <div className="relative min-h-[220px] flex flex-col md:flex-row">
        {/* Full-bleed screenshot area */}
        <div className="md:w-[55%] relative min-h-[220px]">
          <Screenshot
            accent={accent}
            icon={HardDrive}
            label="job queue"
            className="absolute inset-0"
          />
          {/* gradient fade to content side */}
          <div
            className="hidden md:block absolute top-0 bottom-0 right-0 w-32"
            style={{
              background: "linear-gradient(270deg, var(--bg-card), transparent)",
            }}
          />
        </div>

        {/* Featured stat content */}
        <div className="md:w-[45%] p-8 flex flex-col justify-center relative">
          <div
            className="absolute top-0 right-0 w-64 h-64 rounded-full pointer-events-none"
            style={{
              background: `radial-gradient(circle, ${accent}15, transparent 65%)`,
              transform: "translate(30%, -30%)",
            }}
          />
          <div className="relative">
            <span className="font-mono text-[10px] tracking-[0.2em] uppercase mb-3 block" style={{ color: accent }}>
              06 / battle-tested
            </span>
            <div className="flex items-baseline gap-4 mb-3">
              <span
                className="font-mono text-6xl md:text-7xl font-medium tracking-tight leading-none"
                style={{
                  background: `linear-gradient(135deg, ${accent}, var(--accent))`,
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                20M+
              </span>
              <span className="text-xs uppercase tracking-wider" style={{ color: "var(--fg-muted)" }}>
                pages<br />to date
              </span>
            </div>
            <h3 className="font-heading text-2xl font-normal mb-2" style={{ color: "var(--fg)" }}>
              File Processor
            </h3>
            <p className="text-sm mb-4 leading-relaxed" style={{ color: "var(--fg-secondary)" }}>
              Network-aware PDF ↔ TIFF ↔ JPEG converter. Runs daily in production across network shares with job management and error recovery.
            </p>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex gap-1.5 flex-wrap">
                {["Python", "PyQt5", "Multiprocessing"].map((t) => (
                  <span
                    key={t}
                    className="text-[10px] px-2 py-0.5 rounded font-mono"
                    style={{ background: `${accent}12`, color: accent, border: `1px solid ${accent}25` }}
                  >
                    {t}
                  </span>
                ))}
              </div>
              <GithubLink accent={accent} />
            </div>
          </div>
        </div>
      </div>
    </Cell>
  );
}

export default function ProjectBento() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-12 auto-rows-[150px] gap-4">
      <MdviewHero />
      <StudyAggHero />

      <SmallTile
        num="03"
        name="Coil"
        tagline="Python → standalone .exe. No spec files, no hooks."
        stat="PyPI"
        statLabel="published"
        tags={["Python", "C", "CLI"]}
        accent="#4A9A9A"
        icon={FileCode2}
        screenshotLabel="CLI output"
      />
      <SmallTile
        num="04"
        name="Commit Summarizer"
        tagline="Local-LLM commit summaries to Slack. On-prem, zero egress."
        stat="Ollama"
        statLabel="qwen2.5:3b"
        tags={["Python", "Webhooks"]}
        accent="#A78BFA"
        icon={GitCommit}
        screenshotLabel="Slack post"
      />
      <SmallTile
        num="05"
        name="Vault Sync"
        tagline="Self-hosted real-time Obsidian sync. WebSocket + polling fallback."
        stat="WS"
        statLabel="real-time"
        tags={["TypeScript", "FastAPI"]}
        accent="#7DB4E8"
        icon={RefreshCw}
        screenshotLabel="plugin UI"
      />

      <FileProcessorFeatured />
    </div>
  );
}
