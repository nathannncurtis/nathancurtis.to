import { motion } from "motion/react";
import { ExternalLink } from "lucide-react";

const STEDDI_ACCENT = "#9B8EC4";

const features = [
  "Custom Navigation Engine",
  "MapKit + OSRM",
  "CarPlay Integration",
  "Solar-Based Theming",
  "Smart Rerouting",
  "6 Accent Colors",
];

export default function FeaturedSteddi() {
  return <VariantHero />;
}

/* ============================================
   VARIANT 1: Hero-style — full-width showcase
   ============================================ */
function VariantHero() {
  return (
    <section className="relative px-8 py-32 overflow-hidden">
      {/* Background glow */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] rounded-full pointer-events-none"
        style={{ background: `radial-gradient(circle, ${STEDDI_ACCENT}10, transparent 65%)` }}
      />

      <div className="max-w-5xl mx-auto relative z-10">
        <div className="text-center mb-6">
          <motion.span
            className="inline-block text-[11px] font-mono tracking-[0.2em] mb-4"
            style={{ color: STEDDI_ACCENT }}
          >
            FEATURED PROJECT
          </motion.span>
        </div>

        <div className="flex flex-col md:flex-row items-center gap-16">
          {/* Phone mockup */}
          <div className="relative flex-shrink-0">
            <div
              className="absolute -inset-8 rounded-full pointer-events-none"
              style={{ background: `radial-gradient(circle, ${STEDDI_ACCENT}12, transparent 70%)` }}
            />
            <img
              src="/assets/steddi/nav.png"
              alt="Steddi navigation"
              className="relative z-10 w-56 md:w-64"
              style={{
                borderRadius: "36px",
                border: "8px solid #1C1C1E",
                outline: "2px solid #38383A",
                boxShadow: `0 40px 80px rgba(0,0,0,0.4), 0 0 80px ${STEDDI_ACCENT}10`,
              }}
            />
          </div>

          {/* Content */}
          <div className="flex-1 text-center md:text-left">
            <div className="flex items-center gap-4 mb-4 justify-center md:justify-start">
              <img
                src="/assets/steddi/icon.png"
                alt="Steddi icon"
                className="w-14 h-14 rounded-2xl"
                style={{ boxShadow: `0 4px 20px ${STEDDI_ACCENT}20` }}
              />
              <div>
                <h3 className="font-heading text-4xl md:text-5xl" style={{ color: "var(--fg)" }}>
                  Steddi
                </h3>
                <p className="text-sm" style={{ color: "var(--fg-secondary)" }}>
                  iOS navigation for daily commuters
                </p>
              </div>
            </div>

            <p className="text-lg leading-relaxed mb-6" style={{ color: "var(--fg-secondary)" }}>
              A navigation app that learns your preferred routes and only suggests reroutes when the time savings actually matter. Built with Swift, SwiftUI, and MapKit — zero external map dependencies, zero logos.
            </p>

            <div className="flex flex-wrap gap-2 mb-8 justify-center md:justify-start">
              {features.map((f) => (
                <span
                  key={f}
                  className="text-xs px-3 py-1.5 rounded-lg font-mono"
                  style={{
                    background: `${STEDDI_ACCENT}12`,
                    border: `1px solid ${STEDDI_ACCENT}25`,
                    color: STEDDI_ACCENT,
                  }}
                >
                  {f}
                </span>
              ))}
            </div>

            <a
              href="https://steddi.io"
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-2.5 text-sm font-semibold transition-all duration-200 hover:gap-3.5"
              style={{ color: STEDDI_ACCENT }}
            >
              Visit steddi.io
              <ExternalLink size={14} className="transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

