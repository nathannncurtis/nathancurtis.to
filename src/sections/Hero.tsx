import { useRef, useState, useCallback } from "react";
import { motion, useScroll, useTransform, AnimatePresence } from "motion/react";
import { Mail, Github, ChevronDown, ArrowRight } from "lucide-react";

interface Ripple {
  id: number;
  x: number;
  y: number;
}

const headlineWords = [
  { text: "I", highlight: false },
  { text: "fix", highlight: false },
  { text: "broken", highlight: false },
  { text: "systems", highlight: false },
  { text: "and", highlight: false },
  { text: "build", highlight: false },
  { text: "the", highlight: false },
  { text: "tools", highlight: false },
  { text: "that", highlight: false },
  { text: "keep", highlight: true },
  { text: "them", highlight: true },
  { text: "running.", highlight: true },
];

function MagneticLink({ children, href, className, style, target, rel, onMouseEnter, onMouseLeave: onMLProp }: {
  children: React.ReactNode;
  href: string;
  className?: string;
  style?: React.CSSProperties;
  target?: string;
  rel?: string;
  onMouseEnter?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
  onMouseLeave?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
}) {
  const ref = useRef<HTMLAnchorElement>(null);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    el.style.transform = `translate(${x * 0.15}px, ${y * 0.25}px)`;
  }, []);

  const onMouseLeave = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
    const el = ref.current;
    if (el) el.style.transform = "translate(0, 0)";
    onMLProp?.(e);
  }, [onMLProp]);

  return (
    <a
      ref={ref}
      href={href}
      target={target}
      rel={rel}
      className={className}
      style={{ ...style, transition: "transform 0.2s ease-out" }}
      onMouseMove={onMouseMove}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {children}
    </a>
  );
}

export default function Hero() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [0, 150]);
  const opacity = useTransform(scrollYProgress, [0, 0.6], [1, 0]);

  const [ripples, setRipples] = useState<Ripple[]>([]);
  const nextId = useRef(0);

  const handleClick = useCallback((e: React.MouseEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest("a, button")) return;
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const id = nextId.current++;
    setRipples((prev) => [...prev, { id, x: e.clientX - rect.left, y: e.clientY - rect.top }]);
    setTimeout(() => setRipples((prev) => prev.filter((r) => r.id !== id)), 2200);
  }, []);

  return (
    <section
      ref={ref}
      onClick={handleClick}
      className="relative min-h-screen flex items-center justify-center px-8 overflow-hidden cursor-default"
    >
      {/* Click ripples — wobbly water rings */}
      <div className="absolute inset-0 pointer-events-none z-[2]">
        <svg className="absolute inset-0 w-full h-full overflow-visible">
          <defs>
            <filter id="ripple-warp">
              <feTurbulence type="turbulence" baseFrequency="0.015" numOctaves="3" seed="2" result="turbulence" />
              <feDisplacementMap in="SourceGraphic" in2="turbulence" scale="6" xChannelSelector="R" yChannelSelector="G" />
            </filter>
          </defs>
          <AnimatePresence>
            {ripples.map((r) =>
              [0, 1, 2].map((ring) => (
                <motion.circle
                  key={`${r.id}-${ring}`}
                  cx={r.x}
                  cy={r.y}
                  r={1}
                  fill="none"
                  stroke="var(--accent-light)"
                  strokeWidth={ring === 0 ? 1.2 : 0.8}
                  filter="url(#ripple-warp)"
                  initial={{ r: 1, opacity: 0.3 - ring * 0.06 }}
                  animate={{ r: 50, opacity: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{
                    duration: 1.4 + ring * 0.25,
                    delay: ring * 0.1,
                    ease: [0.15, 0.5, 0.3, 1],
                  }}
                />
              ))
            )}
          </AnimatePresence>
        </svg>
      </div>

      <motion.div style={{ y, opacity }} className="relative z-10 text-center max-w-4xl mx-auto">
        {/* Status badge */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9, filter: "blur(8px)" }}
          animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
          transition={{ delay: 0.15, duration: 0.6, ease: "easeOut" }}
          className="inline-flex items-center gap-2.5 px-5 py-2.5 rounded-full mb-10"
          style={{
            background: "linear-gradient(135deg, var(--accent-glow-strong), var(--accent-glow))",
            border: "1px solid var(--border-accent)",
            boxShadow: "0 0 30px var(--accent-glow)",
          }}
        >
          <div className="relative w-2 h-2">
            <div className="absolute inset-0 rounded-full animate-ping" style={{ background: "var(--accent)", opacity: 0.4 }} />
            <div className="absolute inset-0 rounded-full" style={{ background: "var(--accent)" }} />
          </div>
          <span className="text-xs font-mono tracking-wider" style={{ color: "var(--accent-light)" }}>
            Process Development Specialist
          </span>
        </motion.div>

        {/* Name */}
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="text-sm tracking-[0.3em] uppercase font-medium mb-8"
          style={{ color: "var(--fg-muted)" }}
        >
          Nathan Curtis
        </motion.p>

        {/* Headline — word by word */}
        <h1 className="font-heading text-5xl md:text-6xl lg:text-7xl xl:text-8xl font-normal leading-[1.02] mb-8 tracking-tight">
          {headlineWords.map((word, i) => (
            <motion.span
              key={i}
              initial={{ opacity: 0, y: 20, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ delay: 0.4 + i * 0.05, duration: 0.4, ease: "easeOut" }}
              className="inline-block mr-[0.25em]"
              style={
                word.highlight
                  ? {
                      background: "linear-gradient(135deg, var(--accent-light), var(--accent), var(--accent-warm))",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      paddingBottom: "0.15em",
                    }
                  : { color: "var(--fg)" }
              }
            >
              {word.text}
            </motion.span>
          ))}
        </h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.0, duration: 0.5 }}
          className="text-lg md:text-xl leading-[1.8] mb-14 max-w-2xl mx-auto"
          style={{ color: "var(--fg-secondary)" }}
        >
          Automation, infrastructure, production hardware, and cross-departmental workflow design; all in one person.
        </motion.p>

        {/* CTAs — magnetic */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.15, duration: 0.4 }}
          className="flex items-center justify-center gap-4 flex-wrap"
        >
          <MagneticLink
            href="mailto:nathan@nathancurtis.to"
            className="group inline-flex items-center gap-3 px-8 py-3.5 rounded-xl text-sm font-semibold tracking-wide"
            style={{
              background: "linear-gradient(135deg, var(--accent), var(--accent-muted))",
              color: "#fff",
              boxShadow: "0 0 40px rgba(155,119,61,0.3), 0 4px 12px rgba(0,0,0,0.4)",
            }}
          >
            <Mail size={16} />
            Get in touch
            <ArrowRight size={14} className="transition-transform duration-200 group-hover:translate-x-1" />
          </MagneticLink>
          <MagneticLink
            href="https://github.com/nathannncurtis"
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center gap-3 px-8 py-3.5 rounded-xl text-sm font-semibold tracking-wide"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid var(--border-hover)",
              color: "var(--fg-secondary)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--border-accent)";
              e.currentTarget.style.background = "var(--accent-glow)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--border-hover)";
              e.currentTarget.style.background = "rgba(255,255,255,0.04)";
            }}
          >
            <Github size={16} />
            GitHub
          </MagneticLink>
        </motion.div>
      </motion.div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.8, duration: 0.8 }}
        className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3"
      >
        <span className="text-[10px] font-mono tracking-[0.2em] uppercase" style={{ color: "var(--fg-dim)" }}>
          Scroll
        </span>
        <motion.a
          href="#about"
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          className="block"
        >
          <ChevronDown size={18} style={{ color: "var(--fg-dim)" }} />
        </motion.a>
      </motion.div>
    </section>
  );
}
