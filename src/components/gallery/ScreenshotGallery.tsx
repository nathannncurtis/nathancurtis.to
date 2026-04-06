import { motion } from "motion/react";
import { FileText, Activity, FileCode2, GitCommit, RefreshCw, HardDrive } from "lucide-react";

const items = [
  { name: "mdview", caption: "live markdown rendering", accent: "#E9A14B", icon: FileText, ratio: "portrait" },
  { name: "Study Aggregator", caption: "DICOM report output", accent: "#C97B5E", icon: Activity, ratio: "landscape" },
  { name: "Commit Summarizer", caption: "Slack summary post", accent: "#A78BFA", icon: GitCommit, ratio: "landscape" },
  { name: "Coil", caption: "CLI build output", accent: "#4A9A9A", icon: FileCode2, ratio: "portrait" },
  { name: "Vault Sync", caption: "Obsidian plugin UI", accent: "#7DB4E8", icon: RefreshCw, ratio: "landscape" },
  { name: "File Processor", caption: "job queue GUI", accent: "#5CB8B8", icon: HardDrive, ratio: "portrait" },
];

export default function ScreenshotGallery() {
  return (
    <div>
      <p className="text-xs font-mono mb-5" style={{ color: "var(--fg-muted)" }}>
        ▸ placeholders — real screenshots would drop into these containers
      </p>

      <div className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory" style={{ scrollbarWidth: "thin" }}>
        {items.map((item, i) => {
          const Icon = item.icon;
          const width = item.ratio === "portrait" ? "w-[280px]" : "w-[440px]";
          return (
            <motion.div
              key={item.name}
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.06 }}
              className={`${width} shrink-0 snap-start rounded-2xl overflow-hidden group cursor-pointer`}
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                transition: "all 0.3s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = `${item.accent}40`;
                e.currentTarget.style.transform = "translateY(-3px)";
                e.currentTarget.style.boxShadow = `0 20px 50px ${item.accent}15`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--border)";
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              {/* Placeholder screenshot area */}
              <div
                className="relative h-[280px] flex items-center justify-center overflow-hidden"
                style={{
                  background: `
                    linear-gradient(135deg, ${item.accent}08, transparent 60%),
                    repeating-linear-gradient(45deg, rgba(255,255,255,0.01) 0 10px, transparent 10px 20px),
                    var(--bg-raised)
                  `,
                }}
              >
                <div
                  className="absolute inset-0 opacity-40"
                  style={{
                    background: `radial-gradient(circle at 50% 40%, ${item.accent}15, transparent 60%)`,
                  }}
                />
                <div className="relative flex flex-col items-center gap-3">
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center"
                    style={{
                      background: `${item.accent}15`,
                      border: `1px solid ${item.accent}40`,
                    }}
                  >
                    <Icon size={24} style={{ color: item.accent }} />
                  </div>
                  <span className="text-[10px] font-mono tracking-[0.2em] uppercase" style={{ color: "var(--fg-muted)" }}>
                    screenshot slot
                  </span>
                </div>
              </div>

              {/* Caption bar */}
              <div className="px-5 py-4 border-t" style={{ borderColor: "var(--border)" }}>
                <div className="flex items-baseline justify-between">
                  <h4 className="font-heading text-base font-medium" style={{ color: "var(--fg)" }}>
                    {item.name}
                  </h4>
                  <span className="text-[10px] font-mono uppercase tracking-[0.15em]" style={{ color: item.accent }}>
                    {item.ratio}
                  </span>
                </div>
                <p className="text-xs mt-1" style={{ color: "var(--fg-secondary)" }}>
                  {item.caption}
                </p>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
