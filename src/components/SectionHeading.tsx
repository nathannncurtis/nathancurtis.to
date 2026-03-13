import { motion } from "motion/react";

interface Props {
  index: string;
  title: string;
  subtitle?: string;
}

export default function SectionHeading({ index, title, subtitle }: Props) {
  return (
    <div className="text-center mb-20">
      <motion.span
        initial={{ opacity: 0, y: 8 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.4 }}
        className="inline-block text-[11px] font-mono tracking-[0.2em] mb-4"
        style={{ color: "var(--accent-light)" }}
      >
        {index}
      </motion.span>
      <motion.h2
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, delay: 0.05 }}
        className="font-heading text-4xl md:text-5xl lg:text-6xl font-normal leading-tight"
        style={{ color: "var(--fg)" }}
      >
        {title}
      </motion.h2>
      {/* Animated accent line */}
      <motion.div
        initial={{ scaleX: 0, opacity: 0 }}
        whileInView={{ scaleX: 1, opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, delay: 0.15, ease: "easeOut" }}
        className="h-[2px] w-12 mx-auto mt-6 rounded-full"
        style={{
          background: "linear-gradient(90deg, var(--accent), var(--accent-light))",
        }}
      />
      {subtitle && (
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4, delay: 0.15 }}
          className="mt-6 text-base md:text-lg leading-relaxed max-w-xl mx-auto"
          style={{ color: "var(--fg-secondary)" }}
        >
          {subtitle}
        </motion.p>
      )}
    </div>
  );
}
