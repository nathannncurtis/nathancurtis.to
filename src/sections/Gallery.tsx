import { motion } from "motion/react";
import GallerySection from "../components/gallery/GallerySection";
import { StatsBand, StatsCards } from "../components/gallery/StatsVariants";
import CategorizedSkills from "../components/gallery/CategorizedSkills";
import TiltedProjects from "../components/gallery/TiltedProjects";
import ProjectBento from "../components/gallery/ProjectBento";

export default function Gallery() {
  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      {/* Gallery header */}
      <header className="relative py-24 px-8 border-b" style={{ borderColor: "var(--border)" }}>
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[500px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(ellipse, var(--accent-glow) 0%, transparent 70%)" }}
        />
        <div className="max-w-6xl mx-auto relative">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <span
              className="inline-block text-[11px] font-mono tracking-[0.25em] mb-5"
              style={{ color: "var(--accent-light)" }}
            >
              DESIGN EXPLORATION
            </span>
            <h1
              className="font-heading text-5xl md:text-6xl lg:text-7xl font-normal mb-6 tracking-tight"
              style={{ color: "var(--fg)" }}
            >
              Gallery
            </h1>
            <p className="text-base md:text-lg leading-[1.8] max-w-2xl" style={{ color: "var(--fg-secondary)" }}>
              Seven concepts built at real fidelity, each using the same style tokens as the live site.
              Browse, compare, and pick what you want promoted into the main flow.
            </p>
            <div className="mt-6 flex items-center gap-3">
              <a
                href="/"
                className="inline-flex items-center gap-2 text-xs font-mono tracking-wide px-4 py-2 rounded-lg transition-colors"
                style={{
                  border: "1px solid var(--border-hover)",
                  color: "var(--fg-secondary)",
                }}
              >
                ← back to site
              </a>
              <span className="text-[11px] font-mono" style={{ color: "var(--fg-muted)" }}>
                /?gallery
              </span>
            </div>
          </motion.div>
        </div>
      </header>

      {/* Sections */}
      <GallerySection
        num="01"
        title="Stats Strip"
        intent="A band of big mono numbers that proves scale at a glance — 20M+ pages, 100–400× speedup, ~285KB binary. Receipts, not adjectives. Highest impact-per-line-of-code on the page."
        slot="new band between About and FeaturedSteddi"
        effort="low"
      >
        <div className="space-y-8">
          <div>
            <p className="text-[11px] font-mono tracking-[0.15em] mb-4 uppercase" style={{ color: "var(--accent-light)" }}>
              Variant A — minimal band
            </p>
            <StatsBand />
          </div>
          <div>
            <p className="text-[11px] font-mono tracking-[0.15em] mb-4 uppercase" style={{ color: "var(--accent-light)" }}>
              Variant B — separate cards
            </p>
            <StatsCards />
          </div>
        </div>
      </GallerySection>

      <GallerySection
        num="02"
        title="Project Bento Grid — with screenshot slots"
        intent="The replacement for the current accordion Projects section, now merged with the screenshot gallery concept. Asymmetric hierarchy, bespoke treatment per cell, real screenshot containers built in. mdview and Study Aggregator get hero treatment; File Processor gets a full-width featured card anchored on the 20M+ pages stat. Screenshot areas are placeholder containers ready for real assets."
        slot="replaces current Projects.tsx entirely"
        effort="high"
      >
        <ProjectBento />
      </GallerySection>

      <GallerySection
        num="03"
        title="Categorized Skills"
        intent="The current Resume skills list is a flat 24-pill wrap. Grouping by category with accent colors gives the eye structure and makes range readable at a glance. Each group has a one-line why-it-matters."
        slot="replaces skill pills block in Resume.tsx"
        effort="low"
      >
        <CategorizedSkills />
      </GallerySection>

      <GallerySection
        num="04"
        title="Tilted Project Cards (parked)"
        intent="Wires up the TiltCard component you already wrote but never hooked up. Kept for reference — will revisit once the bento (02) lands and we can decide whether to apply tilt to the new bento cells instead."
        slot="pending bento decision"
        effort="low"
      >
        <TiltedProjects />
      </GallerySection>

      {/* Footer */}
      <footer className="py-20 px-8 text-center border-t" style={{ borderColor: "var(--border)" }}>
        <p className="text-sm mb-4" style={{ color: "var(--fg-secondary)" }}>
          Tell me which concepts to promote and I'll wire them into the main site.
        </p>
        <a
          href="/"
          className="inline-flex items-center gap-2 text-xs font-mono tracking-wide px-4 py-2 rounded-lg"
          style={{
            border: "1px solid var(--border-hover)",
            color: "var(--fg-secondary)",
          }}
        >
          ← back to site
        </a>
      </footer>
    </div>
  );
}
