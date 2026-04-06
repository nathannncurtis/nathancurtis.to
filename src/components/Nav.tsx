import { useState, useEffect } from "react";
import { motion, useScroll, useSpring, AnimatePresence } from "motion/react";
import { Menu } from "lucide-react";
import XIcon from "./icons/x-icon";

const links = [
  { label: "About", href: "#about" },
  { label: "Projects", href: "#projects" },
  { label: "Experience", href: "#resume" },
  { label: "Poetry", href: "#poetry" },
  { label: "Contact", href: "#contact" },
];

export default function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("");

  // Scroll progress
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 100, damping: 30, restDelta: 0.001 });

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 80);

      // Detect active section
      const sections = links.map((l) => l.href.slice(1));
      let current = "";
      for (const id of sections) {
        const el = document.getElementById(id);
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.top <= 200) current = id;
        }
      }
      setActiveSection(current);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <motion.header
        initial={{ y: -80 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.5, delay: 0.6, ease: "easeOut" }}
        className="fixed top-0 left-0 right-0 z-50 transition-all duration-500"
        style={{
          background: scrolled ? "rgba(12, 16, 20, 0.85)" : "transparent",
          backdropFilter: scrolled ? "blur(16px) saturate(1.4)" : "none",
          borderBottom: scrolled ? "1px solid var(--border)" : "1px solid transparent",
        }}
      >
        {/* Scroll progress bar */}
        <motion.div
          style={{ scaleX, transformOrigin: "left" }}
          className="absolute bottom-0 left-0 right-0 h-px"
          initial={false}
        >
          <div className="h-full w-full" style={{
            background: "linear-gradient(90deg, var(--accent), var(--accent-light))",
            opacity: 0.6,
          }} />
        </motion.div>

        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <a href="#" className="font-heading text-sm font-normal tracking-wide" style={{ color: "var(--fg)" }}>
            nathan curtis
          </a>

          <nav className="hidden md:flex items-center gap-8">
            {links.map((link) => {
              const isActive = activeSection === link.href.slice(1);
              return (
                <a
                  key={link.href}
                  href={link.href}
                  className="relative text-[11px] tracking-[0.12em] uppercase font-medium transition-colors duration-200"
                  style={{ color: isActive ? "var(--accent-light)" : "var(--fg-muted)" }}
                  onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.color = "var(--fg)"; }}
                  onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.color = "var(--fg-muted)"; }}
                >
                  {link.label}
                  {isActive && (
                    <motion.div
                      layoutId="nav-active"
                      className="absolute -bottom-1 left-0 right-0 h-px"
                      style={{ background: "var(--accent)" }}
                      transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
                    />
                  )}
                </a>
              );
            })}
          </nav>

          <button
            onClick={() => setOpen(!open)}
            className="md:hidden p-2 -mr-2"
            style={{ color: "var(--fg)" }}
            aria-label="Toggle menu"
          >
            {open ? <XIcon size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </motion.header>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-10 md:hidden"
            style={{ background: "rgba(12, 16, 20, 0.98)" }}
          >
            {links.map((link, i) => (
              <motion.a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06, duration: 0.3 }}
                className="text-base tracking-[0.15em] uppercase font-heading font-medium"
                style={{ color: "var(--fg-secondary)" }}
              >
                {link.label}
              </motion.a>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
