import { motion } from "motion/react";

const stats = [
  { num: "20M+", label: "pages processed in production" },
  { num: "100–400×", label: "DICOM parser speedup (Rust engine)" },
  { num: "~285KB", label: "cross-platform native binary" },
  { num: "3", label: "platforms, one Zig codebase" },
  { num: "5", label: "languages shipped to prod" },
];

export default function Stats() {
  return (
    <section className="relative px-8 py-16">
      <div
        className="max-w-5xl mx-auto relative py-14 px-6 rounded-2xl overflow-hidden"
        style={{
          background: "linear-gradient(135deg, var(--bg-card), rgba(74,154,154,0.02))",
          border: "1px solid var(--border)",
        }}
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: "radial-gradient(ellipse at center, var(--accent-glow) 0%, transparent 60%)",
          }}
        />
        <div className="relative grid grid-cols-2 md:grid-cols-5 gap-8">
          {stats.map((s, i) => (
            <motion.div
              key={s.num}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.06 }}
              className="text-center"
            >
              <div
                className="font-mono text-2xl md:text-3xl lg:text-4xl font-medium mb-2 tracking-tight"
                style={{
                  background: "linear-gradient(135deg, var(--accent-light), var(--accent))",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                {s.num}
              </div>
              <div className="text-[11px] tracking-[0.1em] uppercase font-medium" style={{ color: "var(--fg-muted)" }}>
                {s.label}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
