import { useState } from "react";
import { motion } from "motion/react";

const skills = [
  "Python", "Swift", "Rust", "C", "C++", "C#", "TypeScript", "JavaScript", "Go",
  "PowerShell", "Shell", "PHP", "SwiftUI", "PyQt5", "Electron", "React",
  "AG Grid", "SQL", "Docker", "Active Directory", "Group Policy",
  "DNS/DHCP", "RAID", "SSH",
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

          {/* Skills */}
          <motion.div
            transition={{ duration: 0.3, delay: 0.1 }}
            className="lg:col-span-2"
          >
            <span className="text-xs font-mono tracking-[0.25em] mb-6 inline-block font-medium" style={{ color: "var(--accent-light)" }}>
              TECHNOLOGIES
            </span>
            <div className="flex flex-wrap gap-2.5">
              {skills.map((skill, i) => (
                <motion.span
                  key={skill}
                  transition={{ duration: 0.2, delay: i * 0.03 }}
                  onMouseEnter={() => setHoveredSkill(skill)}
                  onMouseLeave={() => setHoveredSkill(null)}
                  className="text-sm px-4 py-2 rounded-xl font-mono cursor-default transition-all duration-250"
                  style={{
                    background: hoveredSkill === skill
                      ? "linear-gradient(135deg, var(--accent-glow-strong), var(--accent-glow))"
                      : "rgba(255,255,255,0.03)",
                    border: `1px solid ${hoveredSkill === skill ? "var(--border-accent)" : "var(--border)"}`,
                    color: hoveredSkill === skill ? "var(--accent-light)" : "var(--fg-secondary)",
                    transform: hoveredSkill === skill ? "translateY(-2px)" : "translateY(0)",
                    boxShadow: hoveredSkill === skill ? "0 4px 16px var(--accent-glow-strong)" : "none",
                  }}
                >
                  {skill}
                </motion.span>
              ))}
            </div>
          </motion.div>
        </div>

      </div>
    </section>
  );
}
