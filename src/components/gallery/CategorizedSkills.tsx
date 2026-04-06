import { useState } from "react";
import { motion } from "motion/react";

const groups = [
  {
    label: "Systems",
    accent: "#5CB8B8",
    desc: "Low-level, native, performance-sensitive",
    items: ["Rust", "Zig", "C", "C++"],
  },
  {
    label: "Application Languages",
    accent: "#4A9A9A",
    desc: "Where most product work lives",
    items: ["Python", "Swift", "C#", "TypeScript", "JavaScript", "Go", "PHP"],
  },
  {
    label: "Frameworks & UI",
    accent: "#D4944A",
    desc: "Desktop, web, mobile",
    items: ["React", "SwiftUI", "PyQt5", "Electron", "FastAPI", "AG Grid"],
  },
  {
    label: "Shell & Data",
    accent: "#A78BFA",
    desc: "Automation and persistence",
    items: ["PowerShell", "Shell", "SQL", "Docker"],
  },
  {
    label: "Infrastructure",
    accent: "#6A7A8A",
    desc: "The layer that has to work first",
    items: ["Active Directory", "Group Policy", "DNS/DHCP", "RAID", "SSH"],
  },
];

export default function CategorizedSkills() {
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <div className="space-y-5">
      {groups.map((g, gi) => (
        <motion.div
          key={g.label}
          initial={{ opacity: 0, x: -12 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4, delay: gi * 0.06 }}
          className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-5 md:gap-8 items-start p-5 rounded-xl"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
          }}
        >
          {/* Left: label */}
          <div className="flex items-start gap-3">
            <div
              className="w-[3px] h-8 rounded-full shrink-0 mt-1"
              style={{ background: g.accent }}
            />
            <div>
              <h3
                className="font-heading text-lg font-medium"
                style={{ color: g.accent }}
              >
                {g.label}
              </h3>
              <p className="text-xs mt-0.5" style={{ color: "var(--fg-muted)" }}>
                {g.desc}
              </p>
            </div>
          </div>

          {/* Right: pills */}
          <div className="flex flex-wrap gap-2">
            {g.items.map((item) => {
              const isHovered = hovered === `${g.label}-${item}`;
              return (
                <span
                  key={item}
                  onMouseEnter={() => setHovered(`${g.label}-${item}`)}
                  onMouseLeave={() => setHovered(null)}
                  className="text-xs px-3 py-1.5 rounded-lg font-mono cursor-default transition-all duration-250"
                  style={{
                    background: isHovered ? `${g.accent}18` : "rgba(255,255,255,0.03)",
                    border: `1px solid ${isHovered ? `${g.accent}40` : "var(--border)"}`,
                    color: isHovered ? g.accent : "var(--fg-secondary)",
                    transform: isHovered ? "translateY(-2px)" : "translateY(0)",
                    boxShadow: isHovered ? `0 4px 14px ${g.accent}20` : "none",
                  }}
                >
                  {item}
                </span>
              );
            })}
          </div>
        </motion.div>
      ))}
    </div>
  );
}
