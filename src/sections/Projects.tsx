import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ExternalLink, ChevronDown, FileCode2, Layers, HardDrive, Activity } from "lucide-react";

const projects = [
  {
    id: "coil",
    num: "01",
    name: "Coil",
    tagline: "Python-to-executable compiler",
    icon: FileCode2,
    github: "https://github.com/nathannncurtis/coil",
    problem: "Every tool for turning Python into an executable is painful. Hidden imports, missing DLLs, spec files, hook scripts, cryptic errors. Nobody should have to deal with that.",
    approach: "Point it at a project directory, get a standalone .exe back. No spec files, no hook scripts. Auto-detects entry points and dependencies, bundles an embedded Python runtime.",
    outcome: "Published on PyPI as coil-compiler. Supports portable and bundled build modes, GUI auto-detection, and cached builds.",
    tags: ["Python", "C", "CLI", "PyPI"],
    accent: "#4A9A9A",
  },
  {
    id: "feather",
    num: "02",
    name: "Feather",
    tagline: "Lightweight bulk image optimizer",
    icon: Layers,
    github: "https://github.com/nathannncurtis/Feather",
    problem: "Thousands of scanned images need to shrink before archival or transfer. Manual resizing doesn't scale and oversized files create bottlenecks everywhere.",
    approach: "Desktop app that dynamically resizes and compresses TIFF/JPEG in bulk. Multithreaded with memory management for large batches.",
    outcome: "Used internally to process large volumes of scanned documents across network directories.",
    tags: ["Python", "PyQt5", "Pillow", "Multithreading"],
    accent: "#D4944A",
  },
  {
    id: "file-processor",
    num: "03",
    name: "File Processor",
    tagline: "Network-aware batch converter",
    icon: HardDrive,
    github: "https://github.com/nathannncurtis/File-Processor",
    problem: "Production workflows need to convert large volumes of PDFs to TIFF/JPEG across network shares, reliably, without anyone babysitting it.",
    approach: "Multiprocessing with a PyQt5 GUI, configurable job queue, automatic CPU core rebalancing, and concurrent execution across network directories.",
    outcome: "Runs daily in production. Handles PDF-to-TIFF, PDF-to-JPEG, and JPEG-to-TIFF pipelines with job management and error recovery.",
    tags: ["Python", "PyQt5", "Multiprocessing", "Network I/O"],
    accent: "#5CB8B8",
  },
  {
    id: "study-aggregator",
    num: "04",
    name: "Study Aggregator",
    tagline: "DICOM medical imaging processor",
    icon: Activity,
    github: "https://github.com/nathannncurtis/Study-Aggregator",
    problem: "DICOM studies come in from CDs, ZIPs, and network drives in every format imaginable. Staff need organized patient reports fast from messy real-world data.",
    approach: "Reads DICOM from directories, encrypted/unencrypted ZIPs (nested 10 levels deep), and optical drives. Merges patient studies with conflict detection. Outputs via clipboard or PDF.",
    outcome: "Distributed via installer with auto-update. Used daily in production. Handles extensionless DICOM, AES-encrypted archives, and mixed-format directories.",
    tags: ["Python", "DICOM", "Multithreading", "Inno Setup"],
    accent: "#6A7A8A",
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
                    <Icon size={18} style={{ color: isOpen ? project.accent : "var(--fg-muted)" }} />
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
                    <ChevronDown size={18} style={{ color: isOpen ? project.accent : "var(--fg-dim)" }} />
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
                              <ExternalLink size={14} className="transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
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
