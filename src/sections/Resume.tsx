import { useState } from "react";
import { motion } from "motion/react";

const skillGroups = [
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


const duties = [
  "Design and maintain automation pipelines for document processing, OCR, file conversion, and batch imaging",
  "Develop desktop apps and internal tools (PyQt5, Electron) for production operations across network shares",
  "Administer Active Directory, Group Policy, DNS/DHCP, NAS storage, and firewall rules",
  "Perform full maintenance kits on Kyocera production printers and integrate into imaging pipelines",
  "Build internal dashboards and data-driven interfaces (AG Grid, SQL) for operational visibility",
  "Diagnose and resolve cross-layer failures spanning software, infrastructure, hardware, and network",
  "Design cross-departmental workflows that reduce manual handoffs and improve throughput",
];

export default function Resume() {
  const [hoveredSkill, setHoveredSkill] = useState<string | null>(null);

  return (
    <section
      id="resume"
      className="relative min-h-screen flex items-center justify-center px-8 py-24"
    >
      <div className="max-w-5xl mx-auto w-full">
        {/* Header */}
        <div className="text-center mb-16">
          <motion.span
            className="inline-block text-[11px] font-mono tracking-[0.2em] mb-4"
            style={{ color: "var(--accent-light)" }}
          >
            03
          </motion.span>
          <motion.h2
            transition={{ duration: 0.3 }}
            className="font-heading text-4xl md:text-5xl lg:text-6xl font-normal"
            style={{ color: "var(--fg)" }}
          >
            Experience
          </motion.h2>
          <motion.div
            initial={{ scaleX: 0 }}
            transition={{ duration: 0.3, delay: 0.15 }}
            className="h-[2px] w-12 mx-auto mt-6 rounded-full"
            style={{ background: "linear-gradient(90deg, var(--accent), var(--accent-light))" }}
          />
        </div>

        {/* Two-column: role + skills */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 lg:gap-16 mb-16">
          {/* Current role */}
          <motion.div
            transition={{ duration: 0.3 }}
            className="lg:col-span-3 relative rounded-2xl p-8 md:p-10 overflow-hidden"
            style={{
              background: "linear-gradient(135deg, var(--accent-glow), rgba(255,255,255,0.02))",
              border: "1px solid var(--border-accent)",
            }}
          >
            <div className="absolute top-0 left-8 right-8 h-px" style={{
              background: "linear-gradient(90deg, transparent, var(--accent), transparent)",
            }} />

            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
              <div>
                <h3 className="font-heading text-xl md:text-2xl font-normal" style={{ color: "var(--fg)" }}>
                  Process Development Specialist
                </h3>
                <p className="text-sm mt-2" style={{ color: "var(--fg-secondary)" }}>
                  Litigation Support Company
                </p>
              </div>
              <span
                className="text-[10px] font-mono tracking-[0.25em] px-4 py-2 rounded-lg w-fit shrink-0 font-medium"
                style={{
                  background: "linear-gradient(135deg, var(--accent-glow-strong), var(--accent-glow))",
                  color: "var(--accent-light)",
                  border: "1px solid var(--border-accent)",
                }}
              >
                CURRENT
              </span>
            </div>

            <div className="space-y-4">
              {duties.map((duty, i) => (
                <motion.div
                  key={i}
                  transition={{ duration: 0.3, delay: i * 0.03 }}
                  className="flex items-start gap-4"
                >
                  <span
                    className="mt-[10px] w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: "var(--accent)" }}
                  />
                  <p className="text-[15px] leading-[1.8]" style={{ color: "var(--fg-secondary)" }}>
                    {duty}
                  </p>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Skills — categorized */}
          <motion.div
            transition={{ duration: 0.3, delay: 0.1 }}
            className="lg:col-span-2"
          >
            <span className="text-xs font-mono tracking-[0.25em] mb-6 inline-block font-medium" style={{ color: "var(--accent-light)" }}>
              TECHNOLOGIES
            </span>
            <div className="space-y-4">
              {skillGroups.map((g, gi) => (
                <motion.div
                  key={g.label}
                  transition={{ duration: 0.3, delay: gi * 0.05 }}
                >
                  <div className="flex items-center gap-2.5 mb-2.5">
                    <div
                      className="w-[3px] h-5 rounded-full shrink-0"
                      style={{ background: g.accent }}
                    />
                    <div>
                      <h4
                        className="text-xs font-mono font-medium tracking-wide"
                        style={{ color: g.accent }}
                      >
                        {g.label}
                      </h4>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 ml-[15px]">
                    {g.items.map((skill) => {
                      const isHovered = hoveredSkill === `${g.label}-${skill}`;
                      return (
                        <span
                          key={skill}
                          onMouseEnter={() => setHoveredSkill(`${g.label}-${skill}`)}
                          onMouseLeave={() => setHoveredSkill(null)}
                          className="text-xs px-3 py-1.5 rounded-lg font-mono cursor-default transition-all duration-250"
                          style={{
                            background: isHovered ? `${g.accent}18` : "rgba(255,255,255,0.03)",
                            border: `1px solid ${isHovered ? `${g.accent}40` : "var(--border)"}`,
                            color: isHovered ? g.accent : "var(--fg-secondary)",
                            transform: isHovered ? "translateY(-2px)" : "translateY(0)",
                            boxShadow: isHovered ? `0 4px 14px ${g.accent}20` : "none",
                          }}
                        >
                          {skill}
                        </span>
                      );
                    })}
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>

      </div>
    </section>
  );
}
