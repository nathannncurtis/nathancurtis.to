import { motion } from "motion/react";
import { FileText, Activity, GitCommit } from "lucide-react";
import TiltCard from "../TiltCard";

// Three sample project rows to demo the tilt effect
const demo = [
  {
    num: "01",
    name: "mdview",
    tagline: "Native cross-platform markdown viewer in Zig",
    tags: ["Zig", "DirectWrite", "Cairo", "CoreText"],
    icon: FileText,
    accent: "#E9A14B",
  },
  {
    num: "02",
    name: "Study Aggregator",
    tagline: "Rust DICOM engine — 100–400× faster",
    tags: ["Rust", "Python", "DICOM", "rayon"],
    icon: Activity,
    accent: "#C97B5E",
  },
  {
    num: "03",
    name: "Commit Summarizer",
    tagline: "Local-LLM commit summaries to Slack",
    tags: ["Python", "Ollama", "Webhooks"],
    icon: GitCommit,
    accent: "#A78BFA",
  },
];

export default function TiltedProjects() {
  return (
    <div className="space-y-4">
      <p className="text-xs font-mono mb-4" style={{ color: "var(--fg-muted)" }}>
        ▸ hover the cards — subtle 3D response instead of flat border color change
      </p>
      {demo.map((p, i) => {
        const Icon = p.icon;
        return (
          <motion.div
            key={p.num}
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.3, delay: i * 0.05 }}
          >
            <TiltCard
              intensity={4}
              className="rounded-2xl"
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
              }}
            >
              <div className="px-7 py-6 flex items-center gap-5">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                  style={{
                    background: `${p.accent}15`,
                    border: `1px solid ${p.accent}30`,
                    boxShadow: `0 0 20px ${p.accent}10`,
                  }}
                >
                  <Icon size={18} style={{ color: p.accent }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1.5">
                    <span className="font-mono text-xs font-medium" style={{ color: p.accent }}>
                      {p.num}
                    </span>
                    <h3 className="font-heading text-lg font-medium" style={{ color: "var(--fg)" }}>
                      {p.name}
                    </h3>
                  </div>
                  <p className="text-sm" style={{ color: "var(--fg-secondary)" }}>
                    {p.tagline}
                  </p>
                </div>
                <div className="hidden md:flex gap-2">
                  {p.tags.map((t) => (
                    <span
                      key={t}
                      className="text-[11px] px-2.5 py-1 rounded-lg font-mono"
                      style={{
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid var(--border)",
                        color: "var(--fg-muted)",
                      }}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </TiltCard>
          </motion.div>
        );
      })}
    </div>
  );
}
