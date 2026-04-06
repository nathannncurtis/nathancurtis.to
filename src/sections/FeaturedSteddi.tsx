import { motion } from "motion/react";
import ExternalLinkIcon from "../components/icons/external-link-icon";
import TargetIcon from "../components/icons/target-icon";
import LocateIcon from "../components/icons/locate-icon";
import PlugConnectedIcon from "../components/icons/plug-connected-icon";
import PaintIcon from "../components/icons/paint-icon";
import RefreshIcon from "../components/icons/refresh-icon";
import SlidersIcon from "../components/icons/sliders-horizontal-icon";

const STEDDI_ACCENT = "#9B8EC4";

const features = [
  { label: "Custom Navigation Engine", icon: TargetIcon },
  { label: "MapKit + OSRM", icon: LocateIcon },
  { label: "CarPlay Integration", icon: PlugConnectedIcon },
  { label: "Solar-Based Theming", icon: PaintIcon },
  { label: "Smart Rerouting", icon: RefreshIcon },
  { label: "6 Accent Colors", icon: SlidersIcon },
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
              className="absolute -inset-10 rounded-full pointer-events-none"
              style={{ background: `radial-gradient(circle, ${STEDDI_ACCENT}18, transparent 70%)` }}
            />
            <img
              src="/assets/steddi/hero-phone.png"
              alt="Steddi navigation"
              className="relative z-10 w-56 md:w-72"
              style={{
                filter: `drop-shadow(0 30px 60px rgba(0,0,0,0.4)) drop-shadow(0 0 60px ${STEDDI_ACCENT}18)`,
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
              Built from scratch in Swift and SwiftUI with MapKit. No third-party map SDKs, no branding, no compromises. Learns your routes, only reroutes when it actually matters, and sweats the details most apps ignore: sunset-synced themes, weather-reactive UI, haptics tuned to turns. Privacy-first, offline-ready, and shipping when it's genuinely ready — not before.
            </p>

            <div className="flex flex-wrap gap-2 mb-8 justify-center md:justify-start">
              {features.map((f) => {
                const Icon = f.icon;
                return (
                  <span
                    key={f.label}
                    className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-mono"
                    style={{
                      background: `${STEDDI_ACCENT}12`,
                      border: `1px solid ${STEDDI_ACCENT}25`,
                      color: STEDDI_ACCENT,
                    }}
                  >
                    <Icon size={13} color={STEDDI_ACCENT} />
                    {f.label}
                  </span>
                );
              })}
            </div>

            <a
              href="https://steddi.io"
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-2.5 text-sm font-semibold transition-all duration-200 hover:gap-3.5"
              style={{ color: STEDDI_ACCENT }}
            >
              Visit steddi.io
              <ExternalLinkIcon size={14} className="transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

