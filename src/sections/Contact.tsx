import { motion } from "motion/react";
import { Mail, Github, ArrowUpRight } from "lucide-react";
import TiltCard from "../components/TiltCard";

const links = [
  { label: "Email", value: "nathan@nathancurtis.to", href: "mailto:nathan@nathancurtis.to", icon: Mail },
  { label: "GitHub", value: "nathannncurtis", href: "https://github.com/nathannncurtis", icon: Github },
];

export default function Contact() {
  return (
    <section
      id="contact"
      className="relative min-h-screen flex items-center justify-center px-8 py-24"
    >
      <div className="max-w-4xl mx-auto w-full text-center">
        <motion.span
          className="inline-block text-[11px] font-mono tracking-[0.2em] mb-4"
          style={{ color: "var(--accent-light)" }}
        >
          05
        </motion.span>
        <motion.h2
          transition={{ duration: 0.3, delay: 0.05 }}
          className="font-heading text-4xl md:text-5xl lg:text-6xl font-normal mb-6"
          style={{ color: "var(--fg)" }}
        >
          Let's talk.
        </motion.h2>
        <motion.div
          initial={{ scaleX: 0 }}
          transition={{ duration: 0.3, delay: 0.15 }}
          className="h-[2px] w-12 mx-auto mt-2 mb-8 rounded-full"
          style={{ background: "linear-gradient(90deg, var(--accent), var(--accent-light))" }}
        />
        <motion.p
          transition={{ duration: 0.3, delay: 0.1 }}
          className="text-base md:text-lg leading-[1.8] mb-16 max-w-lg mx-auto"
          style={{ color: "var(--fg-secondary)" }}
        >
          Broken system, manual process that should be automated, or something that just keeps breaking. I'm interested.
        </motion.p>

        <div className="flex flex-col sm:flex-row justify-center gap-4 max-w-2xl mx-auto">
          {links.map((link, i) => {
            const Icon = link.icon;
            return (
              <motion.div
                key={link.label}
                transition={{ duration: 0.3, delay: i * 0.03 }}
                className="flex-1"
              >
                <TiltCard
                  className="group rounded-2xl cursor-pointer"
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "var(--border-accent)";
                    e.currentTarget.style.boxShadow = "0 8px 32px var(--accent-glow)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--border)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                >
                  <a
                    href={link.href}
                    target={link.label !== "Email" ? "_blank" : undefined}
                    rel={link.label !== "Email" ? "noopener noreferrer" : undefined}
                    className="flex items-center gap-4 px-6 py-5"
                  >
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-all duration-300 group-hover:scale-110"
                      style={{
                        background: "linear-gradient(135deg, var(--accent-glow-strong), var(--accent-glow))",
                        border: "1px solid var(--border-accent)",
                      }}
                    >
                      <Icon size={18} style={{ color: "var(--accent-light)" }} />
                    </div>
                    <div className="text-left">
                      <p className="text-[10px] font-mono tracking-wider" style={{ color: "var(--fg-muted)" }}>{link.label}</p>
                      <p className="text-sm font-medium" style={{ color: "var(--fg)" }}>{link.value}</p>
                    </div>
                    <ArrowUpRight
                      size={14}
                      className="shrink-0 ml-auto opacity-0 group-hover:opacity-100 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                      style={{ color: "var(--accent-light)" }}
                    />
                  </a>
                </TiltCard>
              </motion.div>
            );
          })}
        </div>

        <motion.div
          className="mt-28 pt-6 flex items-center justify-center text-[10px] tracking-[0.15em] font-mono"
          style={{ borderTop: "1px solid var(--border)", color: "var(--fg-dim)" }}
        >
          <span>&copy; {new Date().getFullYear()} Nathan Curtis</span>
        </motion.div>
      </div>
    </section>
  );
}
