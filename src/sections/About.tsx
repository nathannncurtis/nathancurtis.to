import { useRef } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import { Workflow } from "lucide-react";
import CpuIcon from "../components/icons/cpu-icon";
import TerminalIcon from "../components/icons/terminal-icon";
import RouterIcon from "../components/icons/router-icon";
import GearIcon from "../components/icons/gear-icon";
import LayoutDashboardIcon from "../components/icons/layout-dashboard-icon";

const capabilities = [
  {
    title: "Native & Systems Programming",
    desc: "Cross-platform native apps in Zig, Rust, and C++. Performance-sensitive hot paths — DICOM parsing, native text rendering, memory-mapped I/O — where the wrong tool costs you orders of magnitude.",
    icon: CpuIcon,
  },
  {
    title: "Automation & Workflows",
    desc: "Batch OCR, PDF compression, image classification, file conversion. Built around the actual hardware and legacy software they have to survive in.",
    icon: TerminalIcon,
  },
  {
    title: "Systems & Infrastructure",
    desc: "Active Directory, DNS/DHCP, NAS deployment, firewalls, network segmentation. The stuff that has to work before anything else can.",
    icon: RouterIcon,
  },
  {
    title: "Production Hardware",
    desc: "Printer diagnostics, maintenance kits, scanner configuration. Hardware integration into imaging workflows.",
    icon: GearIcon,
  },
  {
    title: "Tooling & Interfaces",
    desc: "Dashboards, desktop tools, stat tracking. Built for people who don't care how it works, just that it does.",
    icon: LayoutDashboardIcon,
  },
  {
    title: "Operational Glue",
    desc: "Connecting systems that weren't designed to talk to each other, stabilizing processes that keep breaking, replacing manual handoffs.",
    icon: Workflow,
  },
];

const aboutText = [
  "I build internal tools. The kind that connect systems no one designed to talk to each other, replace the manual glue holding production workflows together, and survive environments where \"just use a SaaS\" isn't an option.",
  "I'm usually the person diagnosing why something broke before I'm the one building the fix. The reason that works is I can trace problems across software, infrastructure, hardware, and people. Not just the layer that happens to be \"my job.\"",
];

export default function About() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const bgY = useTransform(scrollYProgress, [0, 1], [60, -60]);

  return (
    <section
      ref={ref}
      id="about"
      className="relative min-h-screen flex items-center justify-center px-8 py-24 overflow-hidden"
    >
      {/* Section-specific ambient glow */}
      <motion.div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full pointer-events-none"
        style={{
          y: bgY,
          background: "radial-gradient(circle, var(--accent-glow) 0%, transparent 70%)",
        }}
      />

      <div className="relative z-10 max-w-6xl mx-auto w-full">
        {/* Header */}
        <div className="text-center mb-16">
          <motion.span
            className="inline-block text-[11px] font-mono tracking-[0.2em] mb-4"
            style={{ color: "var(--accent-light)" }}
          >
            01
          </motion.span>
          <motion.h2
            transition={{ duration: 0.3 }}
            className="font-heading text-4xl md:text-5xl lg:text-6xl font-normal"
            style={{ color: "var(--fg)" }}
          >
            What I Do
          </motion.h2>
          <motion.div
            initial={{ scaleX: 0 }}
            transition={{ duration: 0.3, delay: 0.15 }}
            className="h-[2px] w-12 mx-auto mt-6 rounded-full"
            style={{ background: "linear-gradient(90deg, var(--accent), var(--accent-light))" }}
          />
        </div>

        {/* Two-column layout: prose left, cards right */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-20 items-start">
          {/* Prose */}
          <div className="space-y-6 lg:sticky lg:top-32">
            {aboutText.map((para, i) => (
              <motion.p
                key={i}
                transition={{ duration: 0.3, delay: i * 0.03 }}
                className="text-base md:text-[17px] leading-[1.9]"
                style={{ color: "var(--fg-secondary)" }}
              >
                {para}
              </motion.p>
            ))}
          </div>

          {/* Capability cards */}
          <div className="space-y-4">
            {capabilities.map((cap, i) => {
              const Icon = cap.icon;
              return (
                <motion.div
                  key={cap.title}
                  transition={{ duration: 0.3, delay: i * 0.03 }}
                  whileHover={{
                    x: 6,
                    transition: { duration: 0.2 },
                  }}
                  className="group flex items-start gap-5 p-5 rounded-xl cursor-default transition-all duration-300"
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "var(--border-accent)";
                    e.currentTarget.style.boxShadow = "0 4px 24px var(--accent-glow)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--border)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                >
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 transition-all duration-300 group-hover:scale-110"
                    style={{
                      background: "linear-gradient(135deg, var(--accent-glow-strong), var(--accent-glow))",
                      border: "1px solid var(--border-accent)",
                    }}
                  >
                    <Icon size={18} color="var(--accent-light)" />
                  </div>
                  <div>
                    <h3 className="font-heading text-[15px] font-medium mb-1.5" style={{ color: "var(--fg)" }}>
                      {cap.title}
                    </h3>
                    <p className="text-sm leading-[1.75]" style={{ color: "var(--fg-secondary)" }}>
                      {cap.desc}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
