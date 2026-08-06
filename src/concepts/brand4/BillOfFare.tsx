import { useRef, useState, useEffect, useMemo, useCallback, type ReactNode, type CSSProperties, type DragEvent } from "react";
import { motion, useMotionValue, useSpring, useTransform, useReducedMotion, MotionConfig, AnimatePresence, animate, type MotionValue } from "motion/react";
import {
  identity,
  verse,
  works,
  music,
  recipes,
  writings,
  photos,
  poemAnnotations,
  type Photo,
  type Release,
  type Track,
} from "../brand/data";

/* ============================================================
   À LA CARTE — one warm page where it's all just there.
   A menu in spirit, not a cage: most things present, a few
   that reward a click or a sideways scroll. Photographs live
   on a pin-up board, not a grid. Loose, eclectic, tasteful.
   ============================================================ */

// Palette is driven by CSS variables so the whole page can flip to a warm
// lamplit "night" with one attribute. The accent orange and the inked SVG
// colors stay literal (orange reads on either ground; SVG paint attributes
// can't resolve var()).
const CREAM = "var(--cream)";
const PAPER = "var(--paper)";
const RULE = "var(--rule)";
const LEADER = "var(--leader)";
const STONE = "var(--stone)";
const INK = "var(--ink)";
const OLIVE = "var(--olive)";
const ACCENT = "#a8551f";
const ACCENT_DEEP = "#5f2e0f";

// modals (the notebook) sit above the page but should stay paper-light even at
// night — re-declaring the vars on their container forces the light values.
const LIGHT_VARS = {
  "--cream": "#f8f4ea", "--paper": "#f4f1e4", "--rule": "#d4d2cb",
  "--leader": "#adaba1", "--stone": "#65635c", "--ink": "#2f2e2a",
  "--olive": "#6c6343", "--body": "#43403a", "--poem": "#3b3833", "--wall": "#e3d7bb", "--crow": "#201d18",
} as unknown as CSSProperties;

const THEME_CSS = `
.bof-root{
  --cream:#f8f4ea; --paper:#f4f1e4; --rule:#d4d2cb; --leader:#adaba1;
  --stone:#65635c; --ink:#2f2e2a; --olive:#6c6343; --body:#43403a;
  --poem:#3b3833; --wall:#e3d7bb; --crow:#201d18; --accent:#a8551f;
  transition: background-color .8s ease, color .8s ease;
  scroll-behavior: smooth;
}
.bof-root *{ transition: background-color .7s ease, color .7s ease, border-color .7s ease; }
.bof-root h1, .bof-root h2, .bof-root h3{ text-wrap: balance; }
.bof-root p{ text-wrap: pretty; }
.bof-root :focus-visible{ outline: 2px solid var(--accent); outline-offset: 3px; border-radius: 2px; }
.bof-root .menu-link{ transition: color .22s ease; }
.bof-root .menu-link:hover{ color: var(--accent); }
.bof-root .menu-row{ transition: background-color .2s ease; }
.bof-root .menu-row:hover{ background-color: color-mix(in srgb, var(--accent) 6%, transparent); }
@media (prefers-reduced-motion: reduce){
  .bof-root, .bof-root *, .bof-root *::before, .bof-root *::after{
    animation-duration:.001ms !important; animation-iteration-count:1 !important;
    transition-duration:.001ms !important; scroll-behavior:auto !important;
  }
}
.bof-root[data-night]{
  --cream:#1b1712; --paper:#14110c; --rule:#3a3328; --leader:#736b5b;
  --stone:#a59c89; --ink:#ece4d2; --olive:#bda572; --body:#cbc1ab;
  --poem:#d8cfb8; --wall:#201910; --crow:#211d18;
}
.bof-root[data-night] .paper-grain{ opacity:.06; mix-blend-mode:overlay; }
.bof-root[data-night] .crow-ring{ filter: drop-shadow(0 0 4px rgba(240,205,120,.75)); }
.bof-root .flight-crow{ filter: drop-shadow(0 11px 9px rgba(20,14,6,.2)); transition: filter .8s ease; }
/* black bird, lamplit edge: a tight bright rim + soft warm halo so the silhouette reads */
.bof-root[data-night] .flight-crow{ filter: drop-shadow(0 0 1.2px rgba(255,236,194,.95)) drop-shadow(0 0 6px rgba(252,222,158,.6)) drop-shadow(0 6px 7px rgba(0,0,0,.5)); }
.bof-root .night-wash{ opacity:0; transition:opacity .9s ease; }
.bof-root[data-night] .night-wash{ opacity:1; }
.bof-root[data-night] .album-photo img{ filter:brightness(1.05) saturate(1.06); }
.bof-root[data-night] .lights-photo{ box-shadow:0 0 30px 2px rgba(120,175,205,.4); }
.bof-root[data-night] .lights-photo img{ filter:brightness(1.16) saturate(1.2) contrast(1.03); }

/* ===== AMBIENT LIFE ===== */
/* motes + the idle sway run as CSS (compositor) animations — OFF the main
   thread — so they never stutter the page. No blur on the motes (blur on a
   fixed, animated layer forces a full repaint every scroll frame); their
   softness comes from the radial gradient instead. */
.bof-root .motes{ transition:opacity .9s ease; }
.bof-root[data-night] .motes{ opacity:1; }
@keyframes moteDrift{
  0%,100%{ transform:translate3d(0,0,0); opacity:var(--op); }
  50%{ transform:translate3d(var(--ax),var(--ay),0); opacity:calc(var(--op) * 1.5); }
}
@keyframes swayRot{
  0%,100%{ transform:rotate(var(--swA)); }
  50%{ transform:rotate(var(--swB)); }
}

/* lamplight breath: the extra warm pool only shows at night, riding the same
   fade-in as .night-wash, then breathing slowly on top of it. */
.bof-root .lamp-breath{ opacity:0; transition:opacity .9s ease; }
.bof-root[data-night] .lamp-breath{ opacity:1; animation:lampBreath 7.5s ease-in-out infinite; }
.bof-root[data-night] .lamp-breath--still{ animation:none; }
@keyframes lampBreath{ 0%,100%{ opacity:.78; } 50%{ opacity:1; } }

/* music glow: while a tape plays at night the lamplight leans into the music.
   This OUTER class only gates day/night (JS drives the inner layer's opacity
   from the VU level, so CSS and the MotionValue never fight over one prop). */
.bof-root .music-glow{ opacity:0; transition:opacity .9s ease; }
.bof-root[data-night] .music-glow{ opacity:1; }

/* the bulb's warm glow also breathes at night (additive to its motion glow) */
.bof-root[data-night] .lamp-bulb-breath{ animation:bulbBreath 7.5s ease-in-out infinite; }
@keyframes bulbBreath{
  0%,100%{ box-shadow:0 0 26px 10px rgba(255,196,110,0.42); }
  50%{ box-shadow:0 0 34px 15px rgba(255,210,128,0.62); }
}

/* pointer-as-light — a warm raking light that tracks the cursor in the room
   surfaces. Faint & multiplied into the paper by day; warmer + screen-blended
   so it actually glows once the lamp is pulled. Opacity/blend here, position
   in JS, keeps it in lock-step with the night toggle with no prop threading. */
.bof-root .pointer-light{ opacity:.5; mix-blend-mode:multiply; transition:opacity .8s ease; }
.bof-root[data-night] .pointer-light{ opacity:.72; mix-blend-mode:screen; }
@media (hover: none), (pointer: coarse){
  /* on touch the static centred glow should be barely-there ambience */
  .bof-root .pointer-light{ opacity:.32; }
  .bof-root[data-night] .pointer-light{ opacity:.5; }
}
@media (prefers-reduced-motion: reduce){
  /* belt-and-braces: even if a static glow renders, keep it gentle */
  .bof-root .pointer-light{ opacity:.34; mix-blend-mode:multiply; }
  .bof-root[data-night] .pointer-light{ opacity:.52; mix-blend-mode:screen; }
}

/* THE DEPARTURE under reduced motion is a plain opacity fade (not vestibular
   motion) — exempt the crow from the global transition reset above so the
   fade-out at verse->works and the fade-in at photos stay gentle, not instant. */
@media (prefers-reduced-motion: reduce){
  .bof-root .flight-crow{ transition-duration:.7s !important; }
}

/* ===== PAPER RESPONDS TO TIME ===== */
/* the burnt corner keeps a faint ember at night — a warm line just inside the
   char edge that slowly breathes. Opacity-only on a static svg layer
   (compositor; the displacement filter renders once, never per-frame).
   Day: fully dark. The base night opacity (.26) IS the resting value, so when
   the prefers-reduced-motion reset above collapses the animation the ember
   still reads as a quiet static glow. */
.bof-root .burnt-ember{ opacity:0; transition:opacity .9s ease; }
.bof-root[data-night] .burnt-ember{ opacity:.26; animation:emberBreath 6.4s ease-in-out infinite; }
@keyframes emberBreath{ 0%,100%{ opacity:.15; } 50%{ opacity:.4; } }

/* the tasting invitation on the cover — the same hand, a quiet hover */
.bof-root .tasting-invite{ transition: opacity .25s ease; }
.bof-root .tasting-invite:hover{ opacity: .74; }

/* ===== TAKE A COPY OF THE MENU (print) ===== */
/* on screen the printed menu simply is not there */
.bof-root .print-menu{ display:none; }
@media print{
  @page{ margin:16mm; }
  /* un-trap the scroll container so the sheet can flow into pages */
  html, body, #root{ height:auto !important; overflow:visible !important; }
  .bof-root{ height:auto !important; overflow:visible !important; background:#fff !important; color:#1c1a16 !important; }
  /* the room steps aside; the menu takes the table */
  .bof-root > *:not(.print-menu){ display:none !important; }
  .bof-root .print-menu{ display:block !important; }
  /* ink over the day/night vars — paper is paper, lamp or no lamp */
  .bof-root .print-menu{
    --cream:#ffffff; --paper:#ffffff; --rule:#d8d3c6; --leader:#b3ac9d;
    --stone:#6b6557; --ink:#1c1a16; --olive:#6c6343; --body:#2e2b25;
    --poem:#26231e; --wall:#ffffff; --crow:#1c1a16;
    print-color-adjust:exact; -webkit-print-color-adjust:exact;
  }
  /* sensible page seams */
  .print-menu h1, .print-menu h2, .print-menu h3, .print-menu h4, .print-menu h5{
    break-after:avoid; page-break-after:avoid;
  }
  .print-menu .pm-stanza, .print-menu .pm-item, .print-menu .pm-release, .print-menu .pm-recipe{
    break-inside:avoid; page-break-inside:avoid;
  }
}
`;

const DISPLAY = "'Cormorant', 'Cormorant Garamond', Georgia, serif";
const ITEM = "'Cormorant Garamond', Georgia, serif";
const LABEL = "'Cormorant SC', 'Cormorant Garamond', serif";
const BODY = "'Spectral', Georgia, serif";
const SCRIPT = "'Tangerine', 'Cormorant Garamond', cursive";

const ease = [0.22, 0.61, 0.36, 1] as const;

// small stable "jitter" from an id so tilts don't change on re-render
const jitter = (s: string, spread: number) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return ((h % 1000) / 1000 - 0.5) * 2 * spread;
};

// ---- paper texture ---------------------------------------------------------
// a faint fibrous tooth held over the whole page so nothing reads as flat
const GRAIN_SVG =
  "<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'>" +
  "<filter id='g'><feTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/>" +
  "<feColorMatrix type='saturate' values='0'/></filter>" +
  "<rect width='100%' height='100%' filter='url(#g)' opacity='0.62'/></svg>";
const GRAIN_URL = `url("data:image/svg+xml,${encodeURIComponent(GRAIN_SVG)}")`;

function PaperGrain() {
  return (
    <div
      aria-hidden
      className="paper-grain"
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 3,
        backgroundImage: GRAIN_URL,
        backgroundSize: "150px 150px",
        opacity: 0.14,
        mixBlendMode: "multiply",
      }}
    />
  );
}

// the lamp's pull-chain — tug it and the room falls into warm lamplight
function LampPull({ night, onToggle }: { night: boolean; onToggle: () => void }) {
  return (
    <div aria-hidden style={{ position: "fixed", top: 0, right: "clamp(18px,6vw,72px)", zIndex: 30, display: "flex", flexDirection: "column", alignItems: "center", pointerEvents: "none" }}>
      {/* ceiling rosette */}
      <div style={{ width: 30, height: 11, background: "linear-gradient(#3b342a,#211c15)", borderRadius: "0 0 6px 6px", boxShadow: "0 2px 5px rgba(0,0,0,0.35)" }} />
      {/* the bulb — glows warm once the lamp is on */}
      <motion.div
        className="lamp-bulb-breath"
        animate={{ opacity: night ? 1 : 0.5, boxShadow: night ? "0 0 30px 12px rgba(255,196,110,0.55)" : "0 0 0 0 rgba(255,196,110,0)" }}
        transition={{ duration: 0.55 }}
        style={{ width: 12, height: 15, marginTop: -2, borderRadius: "48% 48% 44% 44%", background: night ? "radial-gradient(circle at 50% 32%, #fff3cb, #efb152)" : "linear-gradient(#7a715d,#564f41)" }}
      />
      {/* the bead-chain you pull — sways gently, tugs down on click */}
      <motion.div style={{ transformOrigin: "top center", display: "flex", flexDirection: "column", alignItems: "center" }}
        animate={{ rotate: [0, 1.7, 0, -1.7, 0] }} transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}>
        <motion.button onClick={onToggle} title={night ? "back to daylight" : "pull the lamp on"}
          whileTap={{ y: 11 }} whileHover={{ y: 3 }}
          style={{ pointerEvents: "auto", background: "transparent", border: "none", padding: "1px 18px 24px", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <span style={{ width: 3, height: "clamp(46px,10vh,92px)", background: "repeating-linear-gradient(180deg,#d3bd87 0 2px,#7c6638 2px 5px)" }} />
          <span style={{ width: 12, height: 12, borderRadius: "50%", background: "radial-gradient(circle at 35% 30%,#f3e1ad,#9a7e3d)", boxShadow: "0 2px 4px rgba(0,0,0,0.4), inset 0 1px 1px rgba(255,255,255,0.55)" }} />
        </motion.button>
      </motion.div>
    </div>
  );
}

// the warm pool of lamplight + a soft vignette, faded in at night
function NightWash() {
  return (
    <div
      aria-hidden
      className="night-wash"
      style={{
        position: "fixed", inset: 0, zIndex: 4, pointerEvents: "none",
        background:
          "radial-gradient(62% 50% at 90% 1%, rgba(255,198,120,0.16), rgba(255,198,120,0) 60%)," +
          "radial-gradient(125% 100% at 50% 26%, rgba(0,0,0,0) 52%, rgba(8,5,2,0.42) 100%)",
      }}
    />
  );
}

// a hand-inked crow — the motif from "Burnt Orange", perched on the rule.
// Long stout beak flowing off a shallow crown, deep chest, wingtip stepped
// over the tail — corvid, not songbird.
function Crow({ width = 92, flip = false, alive = false, style }: { width?: number; flip?: boolean; alive?: boolean; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 184 150" width={width} aria-hidden style={{ overflow: "visible", display: "block", transform: flip ? "scaleX(-1)" : undefined, ...style }}>
      <path
        fill="#201d18"
        style={{ fill: "var(--crow, #201d18)" }}
        d="M4 52 C 14 47, 26 42.5, 38 40 C 43 29, 53 24, 61 25.5 C 69 27, 75 33, 79 41 C 88 43.5, 98 46, 108 50 C 120 55, 132 61, 143 68 L 148 71 L 145 75 C 154 78.5, 162 82, 170 86 C 175 89, 175 94.5, 169 95.5 C 155 91.5, 140 86, 126 80 C 114 87, 100 93, 84 95 C 66 96.5, 52 91, 46 83 C 42.5 77, 41 71, 40 66 C 36 63, 33 60, 31 57.5 C 20 55, 11 53.5, 4 52 Z"
      />
      {/* folded-wing line */}
      <path d="M78 44 C 100 50, 122 62, 142 74" fill="none" stroke="#473d2f" strokeOpacity="0.38" strokeWidth="1.6" strokeLinecap="round" />
      {/* thin legs + feet on the perch */}
      <g stroke="#201d18" style={{ stroke: "var(--crow, #201d18)" }} strokeWidth="2.6" strokeLinecap="round" fill="none">
        <line x1="60" y1="93" x2="57" y2="126" />
        <line x1="80" y1="94" x2="83" y2="126" />
        <path d="M57 126 L50 132 M57 126 L63 132 M83 126 L76 132 M83 126 L89 132" />
      </g>
      {/* eye — blinks now and then when alive */}
      <motion.circle
        cx="52" cy="34" r="2.4" fill="#e9e2d1"
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
        animate={alive ? { scaleY: [1, 1, 0.1, 1, 1] } : undefined}
        transition={alive ? { duration: 5, times: [0, 0.92, 0.95, 0.98, 1], repeat: Infinity, repeatDelay: 2.4, ease: "easeInOut" } : undefined}
      />
    </svg>
  );
}

// the night bird — the owl from "Rings, Not Stories" (the "who" that echoes).
// Tufted, forward-facing; in the dark it is mostly two cream eyes. It takes the
// crow's perch when the lamp comes on, and blinks the way owls do: slowly.
function Owl({ width = 92, flip = false, alive = false, style }: { width?: number; flip?: boolean; alive?: boolean; style?: CSSProperties }) {
  const blink = alive
    ? { animate: { scaleY: [1, 1, 0.08, 1, 1] }, transition: { duration: 6.5, times: [0, 0.9, 0.94, 0.985, 1] as number[], repeat: Infinity, repeatDelay: 3.1, ease: "easeInOut" as const } }
    : {};
  return (
    <svg viewBox="0 0 184 150" width={width} aria-hidden style={{ overflow: "visible", display: "block", transform: flip ? "scaleX(-1)" : undefined, ...style }}>
      <path
        fill="#201d18"
        style={{ fill: "var(--crow, #201d18)" }}
        d="M50 22 C 55 29, 60 31, 64 29 C 70 25.5, 84 25.5, 90 29 C 94 31, 96 27, 98 22 C 104 30, 108 38, 108 46 C 112 56, 116 74, 114 92 C 112 106, 105 117, 93 121.5 C 85 124.5, 69 124.5, 61 121.5 C 49 117, 42 106, 40 92 C 38 74, 42 56, 46 46 C 46 38, 47 30, 50 22 Z"
      />
      {/* short tail flicked out behind */}
      <path fill="#201d18" style={{ fill: "var(--crow, #201d18)" }} d="M106 98 C 114 104, 120 112, 122 120 C 116 119, 109 115, 104 109 Z" />
      {/* folded-wing seam */}
      <path d="M100 60 C 105 76, 105 94, 98 108" fill="none" stroke="#473d2f" strokeOpacity="0.4" strokeWidth="1.5" strokeLinecap="round" />
      {/* legs + feet gripping the perch */}
      <g stroke="#201d18" style={{ stroke: "var(--crow, #201d18)" }} strokeWidth="2.6" strokeLinecap="round" fill="none">
        <line x1="64" y1="122" x2="62" y2="129" />
        <line x1="82" y1="122" x2="84" y2="129" />
        <path d="M62 129 L56 133 M62 129 L67 134 M84 129 L78 134 M84 129 L90 133" />
      </g>
      {/* the eyes — the whole point of an owl at night; they blink together, slowly */}
      <motion.g style={{ transformBox: "fill-box", transformOrigin: "center" }} {...blink}>
        <circle cx="61" cy="46" r="5.2" fill="#e9e2d1" />
        <circle cx="61.5" cy="46.5" r="1.8" fill="#201d18" />
      </motion.g>
      <motion.g style={{ transformBox: "fill-box", transformOrigin: "center" }} {...blink}>
        <circle cx="85" cy="46" r="5.2" fill="#e9e2d1" />
        <circle cx="84.5" cy="46.5" r="1.8" fill="#201d18" />
      </motion.g>
      <path d="M73 52 L69.5 58.5 L76.5 58.5 Z" fill="#3a3328" />
    </svg>
  );
}

// THE CROW as a travelling companion: it flies in on load, then swoops from
// section to section as you scroll — arcing across the text each time — and
// LANDS ON A LINE, riding it like a wire until it takes off for the next one.
// Each section drops a [data-perch] anchor marking the line it sits on.
const CROW_STATIONS = ["cover", "verse", "works", "photos", "music", "writing", "kitchen", "next"];
// where along each section's perch-line the crow lands (fraction from the left)
// and which way it faces once settled (1 = looks left, -1 = looks right).
// Each crow sits on the EMPTY side — opposite the heading — so it never covers text.
// `alt` = other safe spots along the same line the bird can flit to when
// spooked — each hand-picked to keep the never-covers-text invariant.
const CROW_SPOT: { fx: number; face: 1 | -1; alt: number[] }[] = [
  { fx: 0.76, face: 1, alt: [0.12, 0.3, 0.5] },   // cover   — right end of the nav rule (title is left)
  { fx: 0.82, face: 1, alt: [0.55, 0.65, 0.95] }, // verse   — right (the poem column is on the left)
  { fx: 0.14, face: -1, alt: [0.3, 0.45, 0.04] }, // works   — left (heading is right-aligned)
  { fx: 0.5, face: 1, alt: [0.4, 0.6] },          // photos  — the heading row crowds both flanks
  { fx: 0.5, face: 1, alt: [0.32, 0.6] },         // music   — script aside crowds the right
  { fx: 0.14, face: -1, alt: [0.3, 0.45, 0.04] }, // writing — left (heading is right-aligned)
  { fx: 0.82, face: 1, alt: [0.55, 0.68, 0.95] }, // kitchen — right (heading is left)
  { fx: 0.5, face: 1, alt: [0.62, 0.72] },        // next    — centre (the nest sits at 27%)
];

// a thin "wire" a section offers the crow to land on, set in clear empty space.
// Visible, hairline, fading at the ends so it reads as a perch, not a divider.
// `extra` renders inside the wrapper so small things can sit ON the line too.
function PerchRail({ id, width = "100%", extra }: { id: string; width?: string | number; extra?: ReactNode }) {
  return (
    <div aria-hidden style={{ position: "relative", display: "flex", justifyContent: "center", margin: "clamp(1.7rem,4vw,2.9rem) 0 clamp(1rem,2.4vw,1.7rem)" }}>
      <span data-perch={id} style={{ display: "block", width, height: 1.5, background: "linear-gradient(90deg, transparent, var(--rule) 8%, var(--rule) 92%, transparent)" }} />
      {extra}
    </div>
  );
}

// THE CROW'S COLLECTION — crows steal shiny things and remember faces.
// Counted once per calendar day, kept in localStorage, never explained:
// second visit, a twig on the colophon wire. Third, a button beside it.
// Fifth, a woven nest, and in the nest, glinting: a ring. Rings, not stories.
function CrowCollection() {
  const [visits] = useState<number>(() => {
    try {
      const today = new Date().toDateString();
      const raw = localStorage.getItem("bof-crow-visits");
      const v = raw ? (JSON.parse(raw) as { c: number; d: string }) : null;
      if (!v || typeof v.c !== "number" || typeof v.d !== "string") {
        localStorage.setItem("bof-crow-visits", JSON.stringify({ c: 1, d: today }));
        return 1;
      }
      if (v.d !== today) {
        const c = Math.min(v.c + 1, 99);
        localStorage.setItem("bof-crow-visits", JSON.stringify({ c, d: today }));
        return c;
      }
      return v.c;
    } catch { return 1; }
  });
  if (visits < 2) return null;
  const INK_S = "var(--crow, #201d18)";
  if (visits >= 5) {
    // the nest: woven rim strokes, the button it kept, and the ring
    return (
      <div aria-hidden style={{ position: "absolute", left: "27%", bottom: 0, pointerEvents: "none" }}>
        <svg viewBox="0 0 64 26" width="48" style={{ display: "block" }}>
          {/* back of the rim */}
          <path d="M6 10 C 20 18, 44 18, 58 9" fill="none" stroke={INK_S} strokeOpacity="0.55" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M10 7 C 24 14, 40 14, 54 6" fill="none" stroke={INK_S} strokeOpacity="0.35" strokeWidth="1.2" strokeLinecap="round" />
          {/* what it kept */}
          <g className="crow-ring">
            <circle cx="27" cy="11" r="4.6" fill="none" stroke="#b08d3f" strokeWidth="2" />
            <circle cx="30.2" cy="7.8" r="0.9" fill="#f4e9c8" />
          </g>
          <g transform="rotate(12 40 11)">
            <circle cx="40" cy="11" r="4" fill="none" stroke={INK_S} strokeOpacity="0.75" strokeWidth="1.4" />
            <circle cx="38.8" cy="11" r="0.7" fill={INK_S} fillOpacity="0.75" />
            <circle cx="41.2" cy="11" r="0.7" fill={INK_S} fillOpacity="0.75" />
          </g>
          {/* front of the rim, woven over them */}
          <path d="M4 12 C 18 24, 46 24, 60 11" fill="none" stroke={INK_S} strokeOpacity="0.8" strokeWidth="1.7" strokeLinecap="round" />
          <path d="M9 15 C 22 24, 42 24, 55 14" fill="none" stroke={INK_S} strokeOpacity="0.5" strokeWidth="1.3" strokeLinecap="round" />
          <path d="M14 20 L20 16 M34 22 L40 18 M46 21 L50 16" stroke={INK_S} strokeOpacity="0.4" strokeWidth="1.1" strokeLinecap="round" />
        </svg>
      </div>
    );
  }
  return (
    <div aria-hidden style={{ position: "absolute", left: "27%", bottom: 0, display: "flex", alignItems: "flex-end", gap: 7, pointerEvents: "none" }}>
      {/* a twig it brought */}
      <svg viewBox="0 0 44 14" width="30" style={{ display: "block" }}>
        <path d="M2 12 C 12 10, 24 8, 42 5 M18 9 L26 3 M30 7 L35 2" fill="none" stroke={INK_S} strokeOpacity="0.7" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      {visits >= 3 && (
        <svg viewBox="0 0 14 14" width="11" style={{ display: "block", transform: "rotate(9deg)" }}>
          <circle cx="7" cy="7" r="5.4" fill="none" stroke={INK_S} strokeOpacity="0.75" strokeWidth="1.4" />
          <circle cx="5.5" cy="7" r="0.8" fill={INK_S} fillOpacity="0.75" />
          <circle cx="8.5" cy="7" r="0.8" fill={INK_S} fillOpacity="0.75" />
        </svg>
      )}
    </div>
  );
}

function FlightCrow({ night }: { night: boolean }) {
  const x = useMotionValue(-190);
  const y = useMotionValue(-96);
  const sx = useMotionValue(-1); // facing (scaleX)
  const [flying, setFlying] = useState(true);
  const [beating, setBeating] = useState(false); // brief hard wing-beat, departure take-off only
  const [faded, setFaded] = useState(false); // reduced-motion departure: a quiet fade, no flight
  const reduce = useReducedMotion();
  const reduceRef = useRef(reduce);
  reduceRef.current = reduce;
  // THE CHANGING OF THE GUARD — day belongs to Burnt Orange's crow, night to
  // Rings' owl. Pulling the lamp sends the on-duty bird off the top edge and
  // the other glides down to the same perch.
  const [species, setSpecies] = useState<"crow" | "owl">(night ? "owl" : "crow");
  const speciesRef = useRef(species);
  speciesRef.current = species;
  const swapRef = useRef<null | "out">(null); // "out" = current bird leaving
  const swapToRef = useRef<"crow" | "owl">(species);
  const kickRef = useRef<(() => void) | null>(null); // starts the glide from outside the main effect
  // THE HANDOFF, VISIBLE, ONCE — the first guard change of a visit shows the
  // actual exchange: the off-duty bird exits as a one-shot "ghost" while the
  // arriving bird is already descending from the other side; they cross mid-air.
  // Every later change uses the discreet off-screen swap.
  const handoffDone = useRef(false);
  const handoffRef = useRef<null | ((want: "crow" | "owl") => boolean)>(null);
  const [ghost, setGhost] = useState<null | { species: "crow" | "owl"; x: number; y: number; dir: 1 | -1 }>(null);
  // WILD THINGS DON'T LIKE TO BE TOUCHED — hover and it flits away along its
  // wire (away from your hand, onto a safe alt spot); click and it's gone off
  // the top until you move to another section (or it forgives you, ~18s).
  const spookRef = useRef<null | ((pointerX: number) => void)>(null);
  const fleeRef = useRef<null | (() => void)>(null);

  useEffect(() => {
    const sc = document.querySelector<HTMLElement>(".overflow-y-auto");
    if (!sc) return;
    const w = () => (window.innerWidth < 680 ? 52 : 72);
    const feet = () => (w() * 150) / 184 * 0.86; // feet sit ~86% down the silhouette

    const anchors = new Map<string, Element | null>();
    const reanchor = () => CROW_STATIONS.forEach((id) => anchors.set(id, document.querySelector(`[data-perch="${id}"]`)));
    reanchor();

    const activeStation = () => {
      const line = window.innerHeight * 0.46;
      let active = 0;
      CROW_STATIONS.forEach((id, i) => { const el = document.getElementById(id); if (el && el.getBoundingClientRect().top <= line) active = i; });
      // the final (colophon) section is short and never reaches the trip-line, so
      // land the crow there once you've scrolled to the very bottom
      if (sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 4) active = CROW_STATIONS.length - 1;
      return active;
    };

    // spook/flee state: where the bird flitted to when hovered (per station),
    // and until when it stays off-screen after being clicked
    const spook = { station: -1, fx: null as number | null, last: 0 };
    const flee = { until: 0, tx: 0 };
    let quickUntil = 0; // brief fast-wing getaway after a spook or flee
    let fleeTimer: number | undefined;

    // the LIVE position of a station's line, computed fresh every time — never
    // snapshotted, so the crow can't chase a stale point.
    const targetFor = (i: number) => {
      const a = anchors.get(CROW_STATIONS[i]);
      const W = w();
      if (!a) return { x: -300, y: -300, face: CROW_SPOT[i].face };
      const r = a.getBoundingClientRect();
      const fx = spook.station === i && spook.fx != null ? spook.fx : CROW_SPOT[i].fx;
      return { x: r.left + fx * r.width - W / 2, y: r.top - feet(), face: CROW_SPOT[i].face };
    };

    // ---- THE CROW'S DEPARTURE (once per visit) ------------------------------
    // "and now, as the crow takes flight," — Burnt Orange's last line, enacted.
    // Once the visitor has had Burnt Orange (verse[0]) on screen at the verse
    // station and then scrolls down into works, the crow leaves: up and off the
    // top edge, absent through all of Works, quietly back at Photographs.
    // In-memory only — no storage; a reload resets it.
    let beatTimer: number | undefined;
    const dep = {
      seen: false,   // Burnt Orange has been visible while verse was the station
      done: false,   // the departure already happened this visit
      away: false,   // currently absent (works' perch stays empty)
      boostUntil: 0, // timestamp: the take-off's temporary speed-cap boost
      target: null as { x: number; y: number; face: 1 | -1 } | null,
    };
    // which poem the carousel is showing (0 = Burnt Orange) — read fresh from
    // the DOM, mirroring VerseCarousel's own scrollLeft/slide-width arithmetic.
    const verseEl = document.querySelector<HTMLElement>(".verse-loop");
    const versePoem = () => {
      const a = verseEl?.querySelector("article");
      if (!verseEl || !a) return -1;
      const b = a.getBoundingClientRect().width;
      if (!b) return -1;
      const N = verse.length;
      return ((Math.round(verseEl.scrollLeft / b) % N) + N) % N;
    };
    const noteVerse = (active: number) => { if (!dep.done && active === 1 && versePoem() === 0) dep.seen = true; };
    // THE CALL — the site's entire sound design: one low call at the moment of
    // departure, from whichever bird is on duty (night read off the DOM, in
    // lock-step with the lamp). By day a distant caw; at night the owl's "who".
    // Created lazily; every failure mode (missing file, autoplay refusal, no
    // Audio) is swallowed — the site behaves identically without the files.
    const birdCall = () => {
      const isNight = !!document.querySelector(".bof-root[data-night]");
      try {
        const call = new Audio(isNight ? "/owl-call.mp3" : "/crow-call.mp3");
        call.volume = isNight ? 0.25 : 0.18;
        call.onerror = () => {}; // 404: stay silent, no console spam
        call.play().catch(() => {}); // autoplay policy may refuse: stay silent
      } catch { /* stay silent */ }
    };
    // a loop-back to Burnt Orange can happen without any page scroll — watch the
    // carousel itself so a sideways return still counts as having seen it.
    const onVerseScroll = () => noteVerse(activeStation());
    verseEl?.addEventListener("scroll", onVerseScroll, { passive: true });

    const station = { current: -1 };
    let raf: number | null = null;
    let calmUntil = 0; // during the visible handoff the arriving bird glides slower, so the two cross mid-air

    // ONE continuous glide toward the live target. Every frame it re-reads the
    // active line's CURRENT position and moves a fraction of the remaining
    // distance toward it — pure interpolation, so it strictly converges and can
    // never teleport. Fast scrolling just moves the target; the crow follows it.
    // Stops the moment it arrives (then onScroll rides the line exactly).
    // TIME-NORMALIZED: the fraction and the speed cap scale by real frame time,
    // so 60Hz and 120Hz displays fly the same bird (frame-locked steps jitter).
    let lastT = 0;
    const glide = (now: number) => {
      const dt = lastT ? Math.min(48, now - lastT) : 16.7;
      lastT = now;
      const i = activeStation();
      const cx = x.get(), cy = y.get();
      let t = dep.away && i === 2 && dep.target ? dep.target : targetFor(i);
      // the changing of the guard: the on-duty bird climbs off the top edge…
      if (swapRef.current === "out") {
        const fwd = sx.get() >= 0 ? -1 : 1;
        t = { x: cx + fwd * 140, y: -210, face: (fwd < 0 ? 1 : -1) as 1 | -1 };
        if (cy < -160) {
          // …and the other arrives: swap species while fully off-screen (legal),
          // seat above the live target, and let the normal glide bring it down
          // starting NEXT frame (this frame's cx/cy are stale after the seat).
          swapRef.current = null;
          setSpecies(swapToRef.current);
          const seat = dep.away && i === 2 && dep.target ? dep.target : targetFor(i);
          x.set(seat.x); y.set(-190); sx.set(seat.face);
          raf = requestAnimationFrame(glide);
          return;
        }
      }
      // clicked: driven off — a fixed point above the top edge, until it forgives
      if (performance.now() < flee.until) t = { x: flee.tx, y: -230, face: t.face };
      const dx = t.x - cx, dy = t.y - cy;
      const dist = Math.hypot(dx, dy);
      // ease toward the line, but cap the per-frame move to a max flight speed so
      // a far target produces a smooth bounded glide, never a lurching jump.
      // The owl flies slower — softer, silent.
      const frames = dt / 16.7;
      const maxV = Math.max(22, window.innerHeight * 0.05) * frames
        * (performance.now() < dep.boostUntil ? 2 : 1) // cap doubles briefly at take-off
        * (performance.now() < quickUntil ? 1.7 : 1) // startled: a quick getaway
        * (performance.now() < calmUntil ? 0.45 : 1) // and nearly halves during the visible handoff
        * (speciesRef.current === "owl" ? 0.75 : 1);
      const f = 1 - Math.pow(0.76, frames); // = 0.24 at exactly 60fps
      let mvx = dx * f, mvy = dy * f;
      const sp = Math.hypot(mvx, mvy);
      if (sp > maxV) { const s = maxV / sp; mvx *= s; mvy *= s; }
      x.set(cx + mvx); y.set(cy + mvy);
      const csx = sx.get();
      const faceWant = dist > 26 ? (dx > 0 ? -1 : 1) : t.face; // face the way it flies, then inward
      sx.set(csx + (faceWant - csx) * (1 - Math.pow(0.78, frames)));
      // wings set for the final approach: the last stretch is a clean glide-in,
      // and short hops between nearby lines never flap at all
      setFlying(dist >= 110);
      if (dist < 1.2) { x.set(t.x); y.set(t.y); sx.set(t.face); raf = null; lastT = 0; setFlying(false); return; }
      raf = requestAnimationFrame(glide);
    };

    const onScroll = () => {
      const active = activeStation();
      noteVerse(active);
      const prev = station.current;
      const changed = active !== prev;
      station.current = active;
      if (changed && performance.now() < flee.until) flee.until = 0; // a new section: it returns, warily

      // THE DEPARTURE: Burnt Orange has been read at the verse station and the
      // visitor drops down into works — the crow does NOT make the works perch.
      // It takes off hard, up and off the top edge, and is gone. Once per visit.
      if (changed && prev === 1 && active === 2 && dep.seen && !dep.done) {
        dep.done = true;
        dep.away = true;
        birdCall(); // the site's one sound — the on-duty bird's, quiet, may silently no-op
        if (!reduceRef.current) {
          const fwd = sx.get() >= 0 ? -1 : 1; // the way it faces (sx 1 looks left)
          // off-screen point above the top edge with a slight forward arc; a
          // fixed target is safe — off-screen is a legal crow state.
          dep.target = { x: x.get() + fwd * 180, y: -220, face: fwd < 0 ? 1 : -1 };
          dep.boostUntil = performance.now() + 950; // ~2x speed, departure only
          setBeating(true); // a brief, hard wing-beat as it lifts
          if (beatTimer) clearTimeout(beatTimer);
          beatTimer = window.setTimeout(() => setBeating(false), 800);
        }
      }

      // THE RETURN: photos brings it quietly back from off-screen top; scrolling
      // back up into verse during the absence also ends it (early, same manner).
      if (dep.away && active !== 2) {
        dep.away = false;
        dep.target = null;
        // only reposition while fully OFF-SCREEN (legal) — never teleport in
        // view; if it never finished leaving, the glide just banks to the perch.
        if (!reduceRef.current && y.get() < -100) {
          const t = targetFor(active);
          x.set(t.x); y.set(-190); sx.set(t.face);
        }
      }

      if (reduceRef.current) { // reduced motion: no glide, just sit on the line
        if (raf != null) { cancelAnimationFrame(raf); raf = null; }
        setFaded(dep.away); // departed = fade out in place; returned = fade back in
        if (!dep.away) { const t = targetFor(active); x.set(t.x); y.set(t.y); sx.set(t.face); }
        setFlying(false);
        return;
      }
      if (changed) { // take off toward the new line (start the glide if idle)
        if (raf == null) raf = requestAnimationFrame(glide);
        setFlying(true);
      } else if (raf == null) { // perched: ride the line exactly as it scrolls
        if (dep.away || performance.now() < flee.until) return; // away: parked off-screen — nothing to ride
        const t = targetFor(active);
        x.set(t.x); y.set(t.y);
        const csx = sx.get(); sx.set(csx + (t.face - csx) * 0.3);
      }
    };

    const onResize = () => { reanchor(); onScroll(); };
    // let the guard-change effect start the glide from outside this closure
    kickRef.current = () => { if (raf == null) raf = requestAnimationFrame(glide); setFlying(true); };
    // stage the once-per-visit VISIBLE handoff: the departing bird becomes a
    // one-shot ghost exiting the way it faces, while this element becomes the
    // arriving bird, seated high on the opposite side, gliding down slowly
    // enough that the two cross mid-air. Returns false if the bird isn't
    // visibly perched (no theatre for an empty stage).
    handoffRef.current = (want) => {
      const cx = x.get(), cy = y.get();
      if (cy < 20 || cy > window.innerHeight - 80) return false;
      const exitDir = (sx.get() >= 0 ? -1 : 1) as 1 | -1; // exits the way it faces
      setGhost({ species: speciesRef.current, x: cx, y: cy, dir: exitDir });
      const t = targetFor(activeStation());
      const enterSide = -exitDir;
      x.set(t.x + enterSide * Math.min(280, window.innerWidth * 0.3));
      y.set(-190);
      sx.set(enterSide > 0 ? 1 : -1); // face the direction of travel
      setSpecies(want);
      swapRef.current = null;
      calmUntil = performance.now() + 1300;
      if (raf == null) raf = requestAnimationFrame(glide);
      setFlying(true);
      return true;
    };
    // hover: it flits along its wire to the safe spot farthest from your hand
    spookRef.current = (pointerX) => {
      const now = performance.now();
      if (reduceRef.current || now - spook.last < 1600) return;
      if (swapRef.current || dep.away || now < flee.until) return;
      const i = activeStation();
      const a = anchors.get(CROW_STATIONS[i]);
      if (!a) return;
      spook.last = now;
      const r = a.getBoundingClientRect();
      const cur = spook.station === i && spook.fx != null ? spook.fx : CROW_SPOT[i].fx;
      const options = [...CROW_SPOT[i].alt, CROW_SPOT[i].fx].filter((f) => Math.abs(f - cur) > 0.07);
      if (!options.length) return;
      const away = options.reduce((best, f) =>
        Math.abs(r.left + f * r.width - pointerX) > Math.abs(r.left + best * r.width - pointerX) ? f : best, options[0]);
      spook.station = i;
      spook.fx = away;
      quickUntil = now + 600;
      if (raf == null) raf = requestAnimationFrame(glide);
      setFlying(true);
    };
    // click: driven off entirely — off the top until the section changes, or
    // ~18s pass and it forgives you
    fleeRef.current = () => {
      const now = performance.now();
      if (swapRef.current || dep.away) return;
      if (reduceRef.current) { // no flight under reduced motion: it simply isn't there for a while
        setFaded(true);
        if (fleeTimer) clearTimeout(fleeTimer);
        fleeTimer = window.setTimeout(() => { if (!dep.away) setFaded(false); }, 12000);
        return;
      }
      flee.until = now + 18000;
      flee.tx = x.get() + (sx.get() >= 0 ? -1 : 1) * 220;
      quickUntil = now + 800;
      setBeating(true);
      if (beatTimer) clearTimeout(beatTimer);
      beatTimer = window.setTimeout(() => setBeating(false), 700);
      if (fleeTimer) clearTimeout(fleeTimer);
      fleeTimer = window.setTimeout(() => { flee.until = 0; if (raf == null) raf = requestAnimationFrame(glide); setFlying(true); }, 18100);
      if (raf == null) raf = requestAnimationFrame(glide);
      setFlying(true);
    };
    onScroll();
    sc.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    return () => { kickRef.current = null; handoffRef.current = null; spookRef.current = null; fleeRef.current = null; if (raf != null) cancelAnimationFrame(raf); if (beatTimer) clearTimeout(beatTimer); if (fleeTimer) clearTimeout(fleeTimer); verseEl?.removeEventListener("scroll", onVerseScroll); sc.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onResize); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // pull the lamp: the on-duty bird leaves off the top, the other glides in.
  // The FIRST change of a visit is shown in full: both birds airborne, crossing.
  useEffect(() => {
    const want = night ? "owl" : "crow";
    if (speciesRef.current === want && swapRef.current == null) return;
    swapToRef.current = want;
    if (reduceRef.current) { swapRef.current = null; setSpecies(want); return; } // quiet swap in place
    if (!handoffDone.current) {
      handoffDone.current = true;
      if (handoffRef.current?.(want)) return; // the crossing is staged
    }
    swapRef.current = "out";
    kickRef.current?.();
    // speciesRef/swapRef are refs; only night should re-run this
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [night]);

  const W = typeof window !== "undefined" && window.innerWidth < 680 ? 52 : 72;
  const owl = species === "owl";
  const Bird = owl ? Owl : Crow;
  return (
    <>
    {/* the off-duty bird, exiting: a one-shot ghost so both are briefly in the air */}
    {ghost && (
      <motion.div
        aria-hidden
        className="flight-crow"
        initial={{ x: ghost.x, y: ghost.y }}
        animate={{ x: ghost.x + ghost.dir * 320, y: -240 }}
        transition={{ duration: 1.15, ease: [0.42, 0.05, 0.65, 1] }}
        onAnimationComplete={() => setGhost(null)}
        style={{ position: "fixed", top: 0, left: 0, zIndex: 6, width: W, pointerEvents: "none", willChange: "transform" }}
      >
        <motion.div style={{ scaleX: ghost.dir > 0 ? -1 : 1, originX: 0.5, originY: 1 }}>
          <motion.div
            animate={{ rotate: [0, ghost.species === "owl" ? 4 : 5, -1.5, ghost.species === "owl" ? 4 : 5, 0] }}
            transition={{ duration: ghost.species === "owl" ? 0.42 : 0.32, repeat: Infinity, ease: "easeInOut" }}
          >
            {ghost.species === "owl" ? <Owl width={W} alive /> : <Crow width={W} alive />}
          </motion.div>
        </motion.div>
      </motion.div>
    )}
    <motion.div aria-hidden className="flight-crow" style={{ position: "fixed", top: 0, left: 0, x, y, zIndex: 6, width: W, pointerEvents: "none", willChange: "transform", opacity: faded ? 0 : 1, transition: "opacity .7s ease" }}>
      {/* the only touchable part of the bird — and it hates that. Inert mid-flight
          so it never intercepts the page while crossing text. */}
      <div
        onMouseEnter={(e) => spookRef.current?.(e.clientX)}
        onClick={() => fleeRef.current?.()}
        style={{ position: "absolute", inset: -6, pointerEvents: flying ? "none" : "auto", cursor: "pointer" }}
      />
      <motion.div style={{ scaleX: sx, originX: 0.5, originY: 1 }}>
        <motion.div
          // the owl flies on slower, deeper beats and sits stiller than the crow.
          // In flight the body only ROCKS: no y-bob on top of the glide's own
          // vertical motion (the two stacked read as jitter, not wingbeats).
          animate={flying
            ? { rotate: [0, owl ? 4 : 5, -1.5, owl ? 4 : 5, 0], y: 0 }
            : { rotate: [0, owl ? -0.4 : -0.8, 0], y: [0, owl ? -1.4 : -2.4, 0] }}
          transition={flying
            ? { duration: beating ? 0.16 : owl ? 0.42 : 0.32, repeat: Infinity, ease: "easeInOut" }
            : { duration: owl ? 6.5 : 5.2, repeat: Infinity, ease: "easeInOut" }}
        >
          <Bird width={W} alive />
        </motion.div>
      </motion.div>
    </motion.div>
    </>
  );
}

// a scorched, charred corner of the paper — at night its innermost edge keeps
// a faint ember: a warm line just inside the char that slowly breathes
// (see .burnt-ember in THEME_CSS). Day: fully dark.
function BurntCorner() {
  const corner: CSSProperties = { position: "absolute", right: 0, bottom: 0, width: "clamp(130px,24vw,228px)", height: "clamp(112px,20vw,188px)", pointerEvents: "none" };
  return (
    <>
      <svg viewBox="0 0 260 220" preserveAspectRatio="none" aria-hidden style={corner}>
        <defs>
          <radialGradient id="scorch" cx="100%" cy="100%" r="118%">
            <stop offset="0%" stopColor="#1a0d04" stopOpacity="0.9" />
            <stop offset="26%" stopColor="#3a2210" stopOpacity="0.6" />
            <stop offset="54%" stopColor="#6b4422" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#7a4a24" stopOpacity="0" />
          </radialGradient>
          <filter id="char-rough" x="-25%" y="-25%" width="150%" height="150%">
            <feTurbulence type="fractalNoise" baseFrequency="0.022 0.04" numOctaves="3" seed="7" result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale="20" />
          </filter>
        </defs>
        <g filter="url(#char-rough)">
          <path d="M260 28 C 202 58, 150 100, 120 150 C 100 186, 94 220, 94 220 L260 220 Z" fill="url(#scorch)" />
          <path d="M260 28 C 202 58, 150 100, 120 150 C 100 186, 94 220, 94 220" fill="none" stroke="#150b04" strokeOpacity="0.7" strokeWidth="6.5" strokeLinecap="round" />
          <path d="M260 50 C 212 76, 170 110, 144 154 C 128 184, 122 220, 122 220" fill="none" stroke="#221305" strokeOpacity="0.45" strokeWidth="2.6" />
        </g>
      </svg>
      {/* THE EMBER — a separate svg layer so CSS can animate the whole
          element's opacity (compositor-only; the displacement filter is
          rendered once and never re-evaluated). Same #char-rough filter, same
          turbulence seed and user space, so the glow hugs the same roughened
          geometry as the char stroke it sits just inside of. Colours stay
          literal (SVG paint can't resolve var(); it's night-only anyway).
          No blur: the halo is just a wider, softer second stroke. */}
      <svg viewBox="0 0 260 220" preserveAspectRatio="none" aria-hidden className="burnt-ember" style={corner}>
        <g filter="url(#char-rough)">
          <path d="M260 38 C 206 66, 158 104, 132 152 C 114 184, 108 220, 108 220" fill="none" stroke="#e0511f" strokeOpacity="0.5" strokeWidth="9" strokeLinecap="round" />
          <path d="M260 38 C 206 66, 158 104, 132 152 C 114 184, 108 220, 108 220" fill="none" stroke="#ffb257" strokeOpacity="0.9" strokeWidth="2.4" strokeLinecap="round" />
        </g>
      </svg>
    </>
  );
}

// hand-inked margin marks
function InkUnderline({ width = 150, color = ACCENT, style }: { width?: number; color?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 200 22" width={width} aria-hidden style={{ overflow: "visible", display: "block", ...style }}>
      <path d="M4 11 C 44 5, 92 16, 132 9 C 162 4, 184 11, 196 8" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeOpacity="0.85" />
      <path d="M9 17 C 52 13, 96 20, 138 14 C 166 10, 186 15, 193 13" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.45" />
    </svg>
  );
}

function InkArrow({ width = 62, color = ACCENT, flip = false, style }: { width?: number; color?: string; flip?: boolean; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 100 84" width={width} aria-hidden style={{ overflow: "visible", display: "block", transform: flip ? "scaleX(-1)" : undefined, ...style }}>
      <path d="M8 14 C 44 6, 80 22, 86 60" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" />
      <path d="M72 50 L87 62 L92 44" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function InkStar({ size = 20, color = ACCENT, style }: { size?: number; color?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden style={{ overflow: "visible", display: "block", ...style }}>
      <g stroke={color} strokeWidth="2.4" strokeLinecap="round">
        <line x1="20" y1="6" x2="20" y2="34" />
        <line x1="9" y1="12" x2="31" y2="28" />
        <line x1="31" y1="12" x2="9" y2="28" />
      </g>
    </svg>
  );
}

// a tea/matcha cup ring left on the page — uneven rim, faintly pooled, roughened edge
const MATCHA = "#7c8a3f";
function StainRing({ style }: { style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 200 200" aria-hidden style={{ position: "absolute", pointerEvents: "none", mixBlendMode: "multiply", ...style }}>
      <defs>
        <filter id="stain-rough">
          <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="2" seed="7" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="10" />
        </filter>
      </defs>
      <g filter="url(#stain-rough)">
        <circle cx="100" cy="100" r="78" fill="none" stroke={MATCHA} strokeOpacity="0.34" strokeWidth="5" />
        <circle cx="100" cy="100" r="73" fill={MATCHA} fillOpacity="0.05" />
        <path d="M42 72 A72 72 0 0 1 150 44" fill="none" stroke={MATCHA} strokeOpacity="0.2" strokeWidth="3" />
      </g>
    </svg>
  );
}

// ---- the second tea ring ----------------------------------------------------
// If a visitor genuinely dwells — three and a half minutes of the page actually
// visible — a second, fainter matcha ring quietly appears in the margin beside
// wherever they are, as if the cup were set down again while they read.
// One-shot, once per visit, in memory. No rAF: a visibility-aware timeout that
// only runs while the tab is visible, so it is correct even with rAF frozen.
const DWELL_MS = 210_000; // ~3.5 minutes of genuinely-visible time
let teaRingSpent = false; // once per visit (in-memory; resets on reload)

type TeaRingSpot = { top: number; side: "left" | "right"; inset: number; size: number; rot: number };

function DwellRing() {
  const reduce = useReducedMotion();
  const [spot, setSpot] = useState<TeaRingSpot | null>(null);

  useEffect(() => {
    if (teaRingSpent) return;
    let acc = 0; // visible milliseconds banked so far
    let last = performance.now();
    let timer: number | undefined;

    const place = () => {
      teaRingSpent = true; // spent even if we skip — the moment only comes once
      const sc = document.querySelector<HTMLElement>(".overflow-y-auto");
      if (!sc) return;
      // the widest text column on the page is the music room's 1180px, so the
      // true page margin is whatever lies outside ~1220px centred. No gutter,
      // no ring — at narrow viewports the margins are spoken for.
      const gutter = (sc.clientWidth - 1220) / 2;
      if (gutter < 174) return;
      const size = Math.min(190, Math.round(gutter) - 24); // ~150–190px
      const seed = `tearing-${Date.now().toString(36)}`;
      const side: "left" | "right" = jitter(seed, 1) >= 0 ? "right" : "left";
      const inset = Math.max(12, Math.round((gutter - size) / 2)); // centred in the gutter
      const rot = jitter(seed + "r", 10); // set down slightly askew
      // beside wherever the reader currently is — a little above centre view,
      // where the cup would sit while they linger
      const frac = 0.36 + (jitter(seed + "y", 1) + 1) * 0.09; // 0.36–0.54 down the view
      const clampTop = (t: number) => Math.round(Math.min(sc.scrollHeight - size - 32, Math.max(24, t)));
      let top = clampTop(sc.scrollTop + sc.clientHeight * frac - size / 2);
      // a tea ring belongs on paper — if it would land beside the music room's
      // full-bleed wallpaper, nudge it onto the paper just above (or below)
      const musicEl = document.getElementById("music");
      if (musicEl) {
        const mr = musicEl.getBoundingClientRect();
        const sr = sc.getBoundingClientRect();
        const mTop = mr.top - sr.top + sc.scrollTop;
        const mBot = mTop + mr.height;
        if (top < mBot + 24 && top + size > mTop - 24) {
          const above = mTop - size - 48;
          top = clampTop(above >= 24 ? above : mBot + 48);
        }
      }
      setSpot({ top, side, inset, size, rot });
    };

    // a visibility-aware countdown: the clock only runs while the page is
    // actually visible; hide the tab and it pauses where it stood.
    const arm = () => {
      last = performance.now();
      if (timer != null) window.clearTimeout(timer);
      timer = window.setTimeout(place, Math.max(0, DWELL_MS - acc));
    };
    const onVis = () => {
      if (document.visibilityState === "visible") arm();
      else {
        acc += performance.now() - last;
        if (timer != null) { window.clearTimeout(timer); timer = undefined; }
      }
    };
    if (document.visibilityState === "visible") arm();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      if (timer != null) window.clearTimeout(timer);
    };
  }, []);

  if (!spot) return null;
  return (
    // one-shot framer fade (interaction-class motion, not a loop) up to 0.5 —
    // roughly half the colophon ring's presence. Reduced motion: appears
    // already-set (a still appearance is motionless; skipping it entirely
    // would deny reduced-motion readers the reward).
    <motion.div
      aria-hidden
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 0.5 }}
      transition={{ duration: reduce ? 0 : 4, ease }}
      style={{
        position: "absolute",
        top: spot.top,
        left: spot.side === "left" ? spot.inset : undefined,
        right: spot.side === "right" ? spot.inset : undefined,
        width: spot.size,
        height: spot.size,
        zIndex: 1, // above section backgrounds, below section content (z 1–2 later in DOM) and every fixed overlay
        pointerEvents: "none",
      }}
    >
      <div style={{ width: "100%", height: "100%", transform: `rotate(${spot.rot}deg)` }}>
        {/* reuses the colophon's #stain-rough filter — that ring is always mounted */}
        <StainRing style={{ inset: 0, width: "100%", height: "100%" }} />
      </div>
    </motion.div>
  );
}

// ---- cover leaf-fall -------------------------------------------------------
// A one-time staging on load: one to three burnt-orange leaves drift down the
// cover and settle near its lower edge — the opening image of "Burnt Orange":
// "a single leaf, swayed, paused, before resting gently on the ground."
// Confined to the cover, pointer-events:none, transform/opacity only, finite
// (it does NOT loop). Reduced motion: no fall — one already-settled leaf.

// a hand-drawn leaf: an off-balance ovate blade with a curved midrib, side
// veins, a short stem and a small torn nick — irregular on purpose, not clip-art.
function LeafShape({ fill, vein, width = 30, style }: { fill: string; vein: string; width?: number; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 64 84" width={width} aria-hidden style={{ overflow: "visible", display: "block", ...style }}>
      {/* blade: tip up, widest below middle, one shoulder higher than the other, a small bite on the lower-right edge */}
      <path
        d="M33 3 C 20 16, 9 30, 8 47 C 7 60, 16 70, 30 76 C 33 77, 35 77, 37 76 C 50 71, 58 58, 57 44 C 56 29, 47 16, 36 5 C 35 4, 34 3, 33 3 Z M37 76 C 41 70, 43 64, 42 60 C 40 64, 38 70, 37 76 Z"
        fill={fill}
        fillRule="evenodd"
      />
      {/* curved midrib running off-center toward the higher shoulder */}
      <path d="M33 7 C 30 24, 30 44, 33 73" fill="none" stroke={vein} strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.5" />
      {/* a couple of side veins, uneven */}
      <path d="M32 28 C 24 30, 18 33, 13 40 M32 40 C 41 42, 48 46, 52 53 M32 52 C 25 55, 21 59, 18 65" fill="none" stroke={vein} strokeWidth="1.1" strokeLinecap="round" strokeOpacity="0.34" />
      {/* short stem */}
      <path d="M33 73 C 33 78, 34 80, 36 82" fill="none" stroke={vein} strokeWidth="1.8" strokeLinecap="round" strokeOpacity="0.6" />
    </svg>
  );
}

// each leaf's character: where it rests, its size, its fall path, and timing.
// Resting spots hug the lower-left / center of the cover — well clear of the
// right-aligned bio, the title, the nav rule, and the crow's right-side perch.
const COVER_LEAVES = [
  // the lead leaf — the "single leaf" of the poem; rests lowest, near the left
  { id: "leaf-a", fill: ACCENT,      vein: ACCENT_DEEP, w: 34, restL: "11%", restB: "13%", drift: 26, spin: 64,  delay: 0.35, dur: 5.4, op: 0.9 },
  // a second, smaller, deeper-toned leaf a little to its right, settling sooner
  { id: "leaf-b", fill: ACCENT_DEEP, vein: ACCENT,      w: 26, restL: "23%", restB: "9%",  drift: 20, spin: -52, delay: 1.15, dur: 4.7, op: 0.82 },
  // a third, olive-touched, slightly higher rest near center-left
  { id: "leaf-c", fill: OLIVE,       vein: ACCENT_DEEP, w: 23, restL: "33%", restB: "19%", drift: 30, spin: 78,  delay: 2.0,  dur: 6.1, op: 0.66 },
] as const;

function FallingLeaf({ leaf }: { leaf: (typeof COVER_LEAVES)[number] }) {
  // small per-leaf jitter so tilts/sways aren't mechanically identical
  const j = jitter(leaf.id, 1);
  const restTilt = j * 9;                  // final resting lean
  const swayA = leaf.drift * (0.5 + 0.5 * Math.abs(jitter(leaf.id + "x", 1))); // mid-air drift amplitude
  // the descent: start above the cover, sway side to side, "pause" near the
  // end, then rest. Keyframe times bunch motion early and ease into stillness.
  return (
    <motion.div
      aria-hidden
      style={{ position: "absolute", left: leaf.restL, bottom: leaf.restB, width: leaf.w, willChange: "transform, opacity" }}
      initial={{ y: "-128%", x: -swayA * 0.6, rotate: leaf.spin * -0.5, opacity: 0 }}
      animate={{
        // y travels from above the cover down to the resting spot (anchored by bottom)
        y: ["-128%", "-78%", "-40%", "-8%", "0%", "0%"],
        // sway side to side, narrowing as it falls, drifting to rest
        x: [-swayA * 0.6, swayA, -swayA * 0.7, swayA * 0.35, j * 4, j * 4],
        // slow tumble that settles into a gentle resting lean
        rotate: [leaf.spin * -0.5, leaf.spin * 0.3, leaf.spin * 0.7, restTilt + 6, restTilt, restTilt],
        opacity: [0, leaf.op, leaf.op, leaf.op, leaf.op, leaf.op],
      }}
      transition={{
        duration: leaf.dur,
        delay: leaf.delay,
        ease,
        // bunch the descent early; the "pause" is the long tail between .82 and 1
        times: [0, 0.26, 0.55, 0.82, 0.93, 1],
      }}
    >
      {/* the leaf falls once and rests still — no perpetual loop (perf) */}
      <LeafShape fill={leaf.fill} vein={leaf.vein} width={leaf.w} style={{ filter: "drop-shadow(0 3px 4px rgba(40,20,6,0.18))" }} />
    </motion.div>
  );
}

function CoverLeaves() {
  const reduce = useReducedMotion();
  // overlay clipped to the cover; never intercepts pointer events or the crow.
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 2 }}>
      {reduce ? (
        // reduced motion: skip the fall — one leaf already at rest near the lower-left
        <div style={{ position: "absolute", left: "11%", bottom: "13%", transform: `rotate(${jitter("leaf-a", 1) * 9}deg)`, opacity: 0.9 }}>
          <LeafShape fill={ACCENT} vein={ACCENT_DEEP} width={34} style={{ filter: "drop-shadow(0 3px 4px rgba(40,20,6,0.18))" }} />
        </div>
      ) : (
        COVER_LEAVES.map((leaf) => <FallingLeaf key={leaf.id} leaf={leaf} />)
      )}
    </div>
  );
}

// ===========================================================================
// AMBIENT LIFE — the page kept quietly alive: drifting motes, a breathing
// lamplight, and a tiny idle sway on standing objects. All transform/opacity,
// all slow and low-amplitude, all reduced-motion aware.

// (a) DRIFTING MOTES — a faint scatter of warm dust on slow, looping drifts.
// Few, slow, barely there. Fixed overlay below the crow, above the night wash.
// At night the [data-night] .motes rule lifts their brightness so they read as
// lamplit. Reduced motion: no loop is applied — they sit still and dim.
const MOTE_COUNT = 6;
function Motes() {
  const reduce = useReducedMotion();
  // stable per-mote geometry seeded from an id, so it never reshuffles on render
  const motes = useMemo(
    () =>
      Array.from({ length: MOTE_COUNT }, (_, i) => {
        const id = `mote-${i}`;
        const size = 2.2 + (jitter(id + "s", 1) + 1) * 1.7;          // ~2.2–6px
        const left = 6 + ((jitter(id + "x", 1) + 1) / 2) * 88;        // 6–94 %
        const top = 8 + ((jitter(id + "y", 1) + 1) / 2) * 80;         // 8–88 %
        const dur = 30 + (jitter(id + "d", 1) + 1) * 6;              // ~30–42s
        const delay = -((jitter(id + "p", 1) + 1) * 12);            // staggered phase
        const ax = jitter(id + "ax", 30);                           // drift X (px)
        const ay = -38 - (jitter(id + "ay", 1) + 1) * 24;           // drift up (px)
        const op = 0.05 + (jitter(id + "o", 1) + 1) * 0.03;         // ~0.05–0.11
        return { id, size, left, top, dur, delay, ax, ay, op };
      }),
    []
  );
  // pure CSS (compositor) drift — no framer frameloop, no blur. See @keyframes moteDrift.
  return (
    <div aria-hidden className="motes" style={{ position: "fixed", inset: 0, zIndex: 5, pointerEvents: "none", overflow: "hidden" }}>
      {motes.map((m) => (
        <span
          key={m.id}
          style={{
            position: "absolute",
            left: `${m.left}%`,
            top: `${m.top}%`,
            width: m.size,
            height: m.size,
            borderRadius: "50%",
            background: "radial-gradient(circle at 38% 34%, rgba(255,234,196,0.95), rgba(214,170,108,0.25) 64%, rgba(214,170,108,0) 72%)",
            opacity: m.op,
            ["--op" as string]: m.op,
            ["--ax" as string]: `${m.ax}px`,
            ["--ay" as string]: `${m.ay}px`,
            willChange: reduce ? undefined : "transform, opacity",
            animation: reduce ? undefined : `moteDrift ${m.dur}s ease-in-out ${m.delay}s infinite`,
          } as CSSProperties}
        />
      ))}
    </div>
  );
}

// (b) LAMPLIGHT BREATH — a second warm pool that very slowly breathes ONLY at
// night. It layers on top of NightWash (same [data-night] fade-in hook) and
// never animates the opacity NightWash itself owns, so the two can't fight.
// The breathing keyframe is killed by the prefers-reduced-motion reset already
// in THEME_CSS; we also tag it --still under reduced motion as a belt.
function LampBreath() {
  const reduce = useReducedMotion();
  return (
    <div
      aria-hidden
      className={reduce ? "lamp-breath lamp-breath--still" : "lamp-breath"}
      style={{
        position: "fixed", inset: 0, zIndex: 4, pointerEvents: "none",
        background: "radial-gradient(58% 46% at 90% 1%, rgba(255,206,132,0.13), rgba(255,206,132,0) 62%)",
        mixBlendMode: "screen",
      }}
    />
  );
}

// (b2) MUSIC GLOW — at night, while a tape plays, the lamplight leans into the
// music. The VU analyser level (already a MotionValue driven by useVuLevel's
// rAF loop — no new loop, no React state per frame) directly drives the
// opacity of one extra warm pool in the lamp corner, at very low gain.
// Two layers so nothing fights: the OUTER div's opacity is CSS-gated by
// [data-night] (.music-glow — 0 by day, .9s fade, same as .night-wash) while
// the INNER motion.div's opacity is the audio-derived MotionValue. The
// existing .lamp-breath keyframe is untouched; this is its own element.
// When playback stops, useVuLevel's settle-to-zero animation takes the glow
// to 0 for free; ejecting/day mode fade the outer gate out over .9s.
// Reduced motion: this is live audio feedback (like the VU needles, which
// also keep moving under reduce), not looping decoration — so it stays on,
// at HALF gain, while the global reduced-motion CSS stills everything else.
function MusicGlow({ levelL, levelR }: { levelL: MotionValue<number>; levelR: MotionValue<number> }) {
  const reduce = useReducedMotion();
  const gain = reduce ? 0.06 : 0.12;
  // average the two (slightly detuned) channels so the glow is steadier than
  // either needle; scale way down and clamp low — felt, never pointed at
  const glow = useTransform([levelL, levelR], ([l, r]: number[]) => Math.min(0.14, ((l + r) / 2) * gain));
  return (
    <div aria-hidden className="music-glow" style={{ position: "fixed", inset: 0, zIndex: 4, pointerEvents: "none" }}>
      <motion.div
        style={{
          position: "absolute", inset: 0,
          opacity: glow,
          background: "radial-gradient(64% 52% at 90% 1%, rgba(255,196,118,0.9), rgba(255,196,118,0) 64%)",
          mixBlendMode: "screen",
          willChange: "opacity",
        }}
      />
    </div>
  );
}

// (c) SWAY — a tiny perpetual idle breathing-rotation for standing/hanging
// objects (shelf tapes, album prints). Sits on a NESTED element so it never
// fights an outer resting tilt or a button's whileHover. Staggered per id;
// degrades to a plain wrapper when reduced motion is requested.
function Sway({ id, amp = 1.6, children, style }: { id: string; amp?: number; children: ReactNode; style?: CSSProperties }) {
  const reduce = useReducedMotion();
  if (reduce) return <div style={style}>{children}</div>;
  const a = amp * (0.7 + (jitter(id + "sw", 1) + 1) * 0.22);          // 0.7x–1.14x amp
  const dur = 6.4 + (jitter(id + "sd", 1) + 1) * 1.8;                 // ~6.4–10s
  const delay = -((jitter(id + "sp", 1) + 1) * 3);                    // phase offset
  // pure CSS (compositor) rotation — off the main thread. See @keyframes swayRot.
  return (
    <div
      style={{
        ...style,
        ["--swA" as string]: `${-a}deg`,
        ["--swB" as string]: `${a}deg`,
        willChange: "transform",
        animation: `swayRot ${dur}s ease-in-out ${delay}s infinite`,
      } as CSSProperties}
    >
      {children}
    </div>
  );
}

// ===========================================================================
// POINTER-AS-LIGHT — a soft warm raking light that follows the cursor across a
// "room" surface (the photo wall, the music room). Ambience, not a spotlight:
// one big low-opacity radial blob, spring-smoothed, transform-only. It lives
// ABOVE the room's papered background but BELOW the content (mount it first,
// give the content a positive z-index). Intensity & blend mode are driven from
// THEME_CSS so day stays faint and night glows warmer, in lock-step with the
// existing night toggle. Disabled on coarse/no-hover pointers and under reduced
// motion — degrades to a single static centered glow, no rAF, no listeners.
function PointerLight({ radius = 560 }: { radius?: number }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const reduce = useReducedMotion();
  // start centered so the static fallback (and the first frame) reads as a
  // gentle ambient pool rather than a blob stuck in a corner
  const x = useMotionValue(0.5);
  const y = useMotionValue(0.42);
  // soft, slow follow — this is a moving light source, not a cursor
  const sx = useSpring(x, { stiffness: 90, damping: 26, mass: 0.7 });
  const sy = useSpring(y, { stiffness: 90, damping: 26, mass: 0.7 });
  // translate the blob by (fraction*100% - half its own size), so its CENTRE
  // sits under the pointer; template strings keep this transform-only
  const tx = useTransform(sx, (v) => `calc(${v * 100}% - ${radius / 2}px)`);
  const ty = useTransform(sy, (v) => `calc(${v * 100}% - ${radius / 2}px)`);

  const [interactive, setInteractive] = useState(false);
  useEffect(() => {
    if (reduce) { setInteractive(false); return; }
    if (typeof window === "undefined" || !window.matchMedia) { setInteractive(false); return; }
    const mq = window.matchMedia("(hover: none), (pointer: coarse)");
    const apply = () => setInteractive(!mq.matches);
    apply();
    // older Safari uses addListener/removeListener
    if (mq.addEventListener) mq.addEventListener("change", apply);
    else mq.addListener(apply);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", apply);
      else mq.removeListener(apply);
    };
  }, [reduce]);

  useEffect(() => {
    if (!interactive) return; // reduced-motion / touch: static glow, no tracking
    const host = ref.current?.parentElement;
    if (!host) return;
    let raf: number | null = null;
    let nx = 0.5, ny = 0.42, pending = false;
    const flush = () => { raf = null; pending = false; x.set(nx); y.set(ny); };
    const onMove = (e: PointerEvent) => {
      const r = host.getBoundingClientRect();
      if (!r.width || !r.height) return;
      nx = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      ny = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
      if (!pending) { pending = true; raf = requestAnimationFrame(flush); }
    };
    // ease the light back toward centre when the pointer leaves the room
    const onLeave = () => { nx = 0.5; ny = 0.42; if (!pending) { pending = true; raf = requestAnimationFrame(flush); } };
    host.addEventListener("pointermove", onMove, { passive: true });
    host.addEventListener("pointerleave", onLeave, { passive: true });
    return () => {
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
      if (raf != null) cancelAnimationFrame(raf);
    };
  }, [interactive, x, y]);

  // the radial blob itself — a warm pool that fades to nothing at its edge.
  // Colour is fixed warm; OPACITY + mix-blend-mode come from THEME_CSS so the
  // same markup reads faint in day and warmer at night.
  const blob: CSSProperties = {
    position: "absolute",
    width: radius,
    height: radius,
    borderRadius: "50%",
    background:
      "radial-gradient(circle at 50% 50%, rgba(255,206,138,0.9) 0%, rgba(255,188,112,0.5) 30%, rgba(255,176,96,0.18) 56%, rgba(255,176,96,0) 72%)",
    willChange: "transform",
  };

  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-light"
      style={{ position: "absolute", inset: 0, zIndex: 0, overflow: "hidden", pointerEvents: "none" }}
    >
      {interactive ? (
        <motion.div style={{ ...blob, left: 0, top: 0, x: tx, y: ty }} />
      ) : (
        // static centered glow (reduced motion / touch): no motion values, no rAF
        <div style={{ ...blob, left: "50%", top: "42%", transform: "translate(-50%,-50%)" }} />
      )}
    </div>
  );
}

// ---- markdown (for essays + recipes) ----------------------------------------
function renderMarkdown(body: string): ReactNode[] {
  const out: ReactNode[] = [];
  // links go through dangerouslySetInnerHTML, so only well-formed http(s)/mailto
  // hrefs pass, with quotes escaped; anything else is defanged to "#"
  const safeHref = (u: string) => {
    const t = u.trim();
    return /^(https?:\/\/|mailto:)/i.test(t) ? t.replace(/"/g, "%22") : "#";
  };
  const inline = (t: string) =>
    t
      .replace(/\[(.+?)\]\((.+?)\)/g, (_m, txt: string, url: string) => `<a href="${safeHref(url)}" target="_blank" rel="noopener noreferrer" style="color:#a8551f;text-decoration:underline;text-underline-offset:3px">${txt}</a>`)
      .replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--ink);font-weight:600">$1</strong>')
      .replace(/\*([^*\n]+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code style="font-family:ui-monospace,monospace;font-size:0.85em;background:#e7ddc8;padding:1px 5px;border-radius:3px">$1</code>');
  body.split("\n\n").forEach((b, i) => {
    const t = b.trim();
    if (!t) return;
    if (t === "---" || t === "***") out.push(<hr key={i} style={{ border: "none", borderTop: `1px solid ${RULE}`, margin: "1.7rem 0" }} />);
    else if (t.startsWith("### ")) out.push(<h5 key={i} style={{ fontFamily: LABEL, letterSpacing: "0.16em", textTransform: "uppercase", fontSize: "0.8rem", color: OLIVE, margin: "1.3rem 0 0.4rem" }}>{t.slice(4)}</h5>);
    else if (t.startsWith("## ")) out.push(<h4 key={i} style={{ fontFamily: DISPLAY, fontSize: "1.5rem", color: INK, margin: "1.6rem 0 0.6rem" }}>{t.slice(3)}</h4>);
    else if (t.startsWith("# ")) out.push(<h3 key={i} style={{ fontFamily: DISPLAY, fontStyle: "italic", fontWeight: 500, fontSize: "1.9rem", color: INK, margin: "0.2rem 0 0.8rem" }}>{t.slice(2)}</h3>);
    else if (/^\d+\.\s/.test(t)) out.push(<ol key={i} style={{ margin: "0.5rem 0 1rem 1.3rem", display: "grid", gap: "0.45rem", listStyle: "decimal" }}>{t.split(/\n(?=\d+\.\s)/).map((it, j) => <li key={j} style={{ fontFamily: BODY, fontSize: "1.02rem", lineHeight: 1.7, color: "var(--body)" }} dangerouslySetInnerHTML={{ __html: inline(it.replace(/^\d+\.\s/, "")) }} />)}</ol>);
    else if (t.startsWith("- ")) out.push(<ul key={i} style={{ margin: "0.5rem 0 1rem", display: "grid", gap: "0.35rem" }}>{t.split("\n- ").map((s, k) => (k === 0 ? s.slice(2) : s)).map((it, j) => <li key={j} style={{ display: "flex", gap: "0.6rem", fontFamily: BODY, fontSize: "1.02rem", lineHeight: 1.7, color: "var(--body)" }}><span style={{ color: ACCENT }}>·</span><span dangerouslySetInnerHTML={{ __html: inline(it) }} /></li>)}</ul>);
    else out.push(<p key={i} style={{ fontFamily: BODY, fontSize: "1.06rem", lineHeight: 1.8, color: "#43403a", margin: "0 0 0.9rem" }} dangerouslySetInnerHTML={{ __html: inline(t) }} />);
  });
  return out;
}

function Kicker({ children, color = OLIVE }: { children: ReactNode; color?: string }) {
  return <span style={{ fontFamily: LABEL, fontSize: "0.8rem", letterSpacing: "0.32em", textTransform: "uppercase", color }}>{children}</span>;
}

// section heading — set a little off-axis, not dead center
function Heading({ kicker, title, align = "left" }: { kicker: string; title: string; align?: "left" | "right" }) {
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.5, ease }}
      style={{ textAlign: align, marginBottom: "1.6rem" }}>
      <Kicker color={ACCENT}>{kicker}</Kicker>
      <h2 style={{ fontFamily: DISPLAY, fontSize: "clamp(2.2rem,5vw,3.4rem)", color: INK, lineHeight: 1, marginTop: "0.3rem" }}>{title}</h2>
    </motion.div>
  );
}

// ===========================================================================
export default function BillOfFare() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<(typeof photos)[number] | null>(null);
  const [openWork, setOpenWork] = useState<string | null>("steddi");
  const [openWriting, setOpenWriting] = useState<string | null>(null);
  const [openRecipe, setOpenRecipe] = useState<string | null>(null);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [night, setNight] = useState(false);
  // LE MENU DÉGUSTATION — which course is on the table (null = no service)
  const [tasting, setTasting] = useState<null | number>(null);
  // arriving on a saved-seat link (?seat=n): the table is ready; seat them after a beat
  useEffect(() => {
    try {
      const s = new URLSearchParams(window.location.search).get("seat");
      if (s && /^\d{1,4}$/.test(s)) {
        const t = window.setTimeout(() => setTasting(0), 900);
        return () => window.clearTimeout(t);
      }
    } catch { /* ignore */ }
  }, []);
  // arriving with a #section hash: carry them to the section once layout settles
  // (native anchor jumps can't reach inside the inner scroll container on load)
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!id) return;
    const t = window.setTimeout(() => {
      const el = document.getElementById(id);
      const sc = document.querySelector<HTMLElement>(".overflow-y-auto");
      if (el && sc) sc.scrollTop = el.getBoundingClientRect().top + sc.scrollTop - 6;
    }, 400);
    return () => window.clearTimeout(t);
  }, []);
  // a real audio-reactive VU: lazy Web Audio graph on audioRef, 0..1 levels
  const { levelL, levelR, arm: armVu } = useVuLevel(audioRef, playing !== null);

  // the tasting's audio bow-out: step the volume down over ~2s on a plain
  // interval (no rAF — correct even when frames freeze), then pause, restore
  // the volume, and clear `playing` so the deck downstairs shows the truth.
  const fadeTimer = useRef<number | null>(null);
  const cancelFade = () => {
    if (fadeTimer.current != null) { window.clearInterval(fadeTimer.current); fadeTimer.current = null; }
    const a = audioRef.current; if (a) a.volume = 1;
  };
  const fadeOutAudio = useCallback(() => {
    const a = audioRef.current;
    if (fadeTimer.current != null) { window.clearInterval(fadeTimer.current); fadeTimer.current = null; }
    if (!a || a.paused) return;
    const v0 = a.volume || 1;
    const steps = 20; // 20 × 100ms ≈ 2s
    let i = 0;
    fadeTimer.current = window.setInterval(() => {
      i += 1;
      a.volume = Math.max(0, v0 * (1 - i / steps));
      if (i >= steps) {
        if (fadeTimer.current != null) window.clearInterval(fadeTimer.current);
        fadeTimer.current = null;
        a.pause();
        a.volume = 1; // always restore full — v0 could itself be mid-fade if exit fired twice
        setPlaying(null);
      }
    }, 100);
    // audioRef and setPlaying are stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => () => { if (fadeTimer.current != null) window.clearInterval(fadeTimer.current); }, []);

  const toggleTrack = (t: { title: string; src: string }) => {
    const a = audioRef.current; if (!a) return;
    cancelFade(); // never start a track half-faded
    if (playing === t.title) { a.pause(); setPlaying(null); return; }
    armVu();
    a.src = t.src; void a.play().catch(() => {}); setPlaying(t.title);
  };
  // slot a tape into the deck — loads it and starts the first track
  const insertTape = (rel: Release) => {
    const a = audioRef.current; if (!a) return;
    cancelFade(); // never start a tape half-faded
    setLoadedId(rel.id);
    armVu();
    const t = rel.tracks[0];
    a.src = t.src; void a.play().catch(() => {}); setPlaying(t.title);
  };
  const ejectTape = () => {
    const a = audioRef.current; if (a) a.pause();
    setPlaying(null); setLoadedId(null);
  };

  return (
    <MotionConfig reducedMotion="user">
    <div className="bof-root w-full h-full overflow-y-auto" data-night={night ? "on" : undefined} style={{ position: "relative", background: CREAM, fontFamily: ITEM, color: INK }}>
      <style>{THEME_CSS}</style>
      <audio ref={audioRef} onEnded={() => setPlaying(null)} preload="none" />
      <PaperGrain />
      <PrintMenu />
      <NightWash />
      <LampBreath />
      <MusicGlow levelL={levelL} levelR={levelR} />
      <Motes />
      <FlightCrow night={night} />
      <LampPull night={night} onToggle={() => setNight((n) => !n)} />

      {/* ===== COVER ===== */}
      <header id="cover" style={{ position: "relative", overflow: "hidden", padding: "clamp(2.5rem,6vw,4.5rem) clamp(1.5rem,6vw,5rem) clamp(2rem,5vw,3rem)" }}>
        <CoverLeaves />
        <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <Kicker>Maison {identity.initials}</Kicker>
            <Kicker color={STONE}>Est. {identity.est}</Kicker>
          </div>
          {/* title sits a touch left of center */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease }}
            style={{ marginTop: "clamp(2rem,6vw,4rem)", maxWidth: "20ch" }}>
            <Kicker color={ACCENT}>The House of {identity.name.split(" ")[1]}</Kicker>
            <h1 style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: "clamp(3.4rem,11vw,7.4rem)", lineHeight: 0.92, letterSpacing: "-0.005em", margin: "0.4rem 0 0" }}>À la Carte</h1>
          </motion.div>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.2 }}
            style={{ fontFamily: ITEM, fontStyle: "italic", fontSize: "clamp(1.2rem,2.3vw,1.6rem)", color: STONE, lineHeight: 1.5, maxWidth: "40ch", marginLeft: "auto", marginTop: "1.4rem", textAlign: "right" }}>
            {identity.bio}
          </motion.p>
          {/* casual jump line — with the crow perched on the rule */}
          <div data-perch="cover" style={{ position: "relative", marginTop: "clamp(2rem,5vw,3.2rem)", display: "flex", flexWrap: "wrap", gap: "0.4rem 1.3rem", borderTop: `1px solid ${RULE}`, paddingTop: "1.1rem" }}>
            {[["#verse", "Verse"], ["#works", "Works"], ["#photos", "Photographs"], ["#music", "Music"], ["#writing", "Writing"], ["#kitchen", "Kitchen"]].map(([href, label]) => (
              <a key={href} href={href} className="menu-link" style={{ fontFamily: LABEL, fontSize: "0.78rem", letterSpacing: "0.16em", textTransform: "uppercase", color: OLIVE, textDecoration: "none" }}>{label}</a>
            ))}
            <span style={{ position: "relative", marginLeft: "auto", fontFamily: ITEM, fontStyle: "italic", color: LEADER }}>order anything, in any order
              <InkUnderline width={150} color={ACCENT} style={{ position: "absolute", right: 0, top: "100%", marginTop: "-3px" }} />
            </span>
          </div>
          {/* the kitchen's invitation — a hand-written aside that opens the tasting */}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1rem" }}>
            <button
              onClick={() => setTasting(0)}
              className="tasting-invite"
              style={{ background: "transparent", border: "none", padding: "0.1rem 0.2rem", cursor: "pointer", fontFamily: SCRIPT, fontSize: "1.8rem", lineHeight: 1, color: ACCENT, transform: "rotate(-2deg)" }}
            >
              or, let the kitchen choose &rarr;
            </button>
          </div>
        </div>
      </header>

      {/* ===== VERSE — one poem at a time; loops forever both ways ===== */}
      <Section id="verse" bg={CREAM}>
        <Heading kicker="Aperitif" title="Verse" />
        <PerchRail id="verse" />
        <VerseCarousel />
      </Section>

      {/* ===== WORKS — dishes, tap to read; Steddi featured ===== */}
      <Section id="works" bg={PAPER}>
        <Heading kicker="Mains" title="Works" align="right" />
        <div data-perch="works" style={{ borderTop: `1px solid ${RULE}` }}>
          {works.map((w) => {
            const isOpen = openWork === w.id;
            return (
              <div key={w.id} style={{ borderBottom: `1px solid ${RULE}` }}>
                <button onClick={() => setOpenWork(isOpen ? null : w.id)} className="menu-row"
                  style={{ width: "100%", display: "flex", alignItems: "baseline", gap: "0.6rem", flexWrap: "wrap", background: "transparent", border: "none", padding: "1.05rem 0.2rem", cursor: "pointer", textAlign: "left" }}>
                  <span style={{ fontFamily: DISPLAY, fontSize: w.featured ? "1.8rem" : "1.45rem", color: INK }}>{w.name}</span>
                  {w.featured && <span style={{ fontFamily: LABEL, fontSize: "0.6rem", letterSpacing: "0.2em", textTransform: "uppercase", color: ACCENT, border: `1px solid ${ACCENT}`, borderRadius: 2, padding: "1px 6px" }}>Featured</span>}
                  <span style={{ fontFamily: ITEM, fontStyle: "italic", fontSize: "1.05rem", color: STONE }}>{w.line}</span>
                  <span aria-hidden style={{ flex: 1, borderBottom: `1px dotted ${LEADER}`, marginBottom: "0.3rem", minWidth: "1.5rem" }} />
                  <span style={{ fontFamily: LABEL, fontSize: "0.92rem", color: OLIVE }}>{w.year}</span>
                </button>
                <Expand open={isOpen}>
                  <div style={{ padding: "0 0.2rem 1.5rem", maxWidth: "62ch" }}>
                    <p style={{ fontFamily: BODY, fontSize: "1.05rem", lineHeight: 1.8, color: "var(--body)" }}>{w.detail}</p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center", marginTop: "0.9rem" }}>
                      {w.tags.map((t) => <span key={t} style={{ fontFamily: LABEL, fontSize: "0.66rem", letterSpacing: "0.12em", textTransform: "uppercase", color: OLIVE, border: `1px solid ${RULE}`, borderRadius: 2, padding: "2px 8px" }}>{t}</span>)}
                      {w.link && <a href={w.link.href} target="_blank" rel="noopener noreferrer" style={{ marginLeft: "auto", fontFamily: LABEL, fontSize: "0.74rem", letterSpacing: "0.16em", textTransform: "uppercase", color: ACCENT, textDecoration: "none" }}>{w.link.label} ↗</a>}
                    </div>
                  </div>
                </Expand>
              </div>
            );
          })}
        </div>
      </Section>

      {/* ===== PHOTOGRAPHS — framed on a papered wall ===== */}
      <PhotoAlbum onPhoto={setLightbox} />

      {/* ===== MUSIC — a papered room; drag a tape into the deck ===== */}
      <MusicRoom releases={music} loadedId={loadedId} playing={playing} onInsert={insertTape} onEject={ejectTape} onToggle={toggleTrack} levelL={levelL} levelR={levelR} />

      {/* ===== WRITING — titles + excerpt, tap to read full ===== */}
      <Section id="writing" bg={CREAM}>
        <Heading kicker="On the Side" title="Writing" align="right" />
        <div data-perch="writing" style={{ borderTop: `1px solid ${RULE}` }}>
          {writings.map((p) => {
            const isOpen = openWriting === p.slug;
            const excerpt = p.body.replace(/^#.*$/gm, "").replace(/[#*`>-]/g, "").trim().slice(0, 150);
            return (
              <div key={p.slug} style={{ borderBottom: `1px solid ${RULE}` }}>
                <button onClick={() => setOpenWriting(isOpen ? null : p.slug)} className="menu-row"
                  style={{ width: "100%", display: "block", textAlign: "left", background: "transparent", border: "none", padding: "1.05rem 0.2rem", cursor: "pointer" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "0.6rem" }}>
                    <span style={{ fontFamily: DISPLAY, fontSize: "1.4rem", color: INK, lineHeight: 1.15 }}>{p.title}</span>
                    <span aria-hidden style={{ flex: 1, borderBottom: `1px dotted ${LEADER}`, marginBottom: "0.3rem", minWidth: "1rem" }} />
                    <span style={{ fontFamily: LABEL, fontSize: "0.72rem", letterSpacing: "0.12em", textTransform: "uppercase", color: OLIVE, whiteSpace: "nowrap" }}>{p.date} · {p.readTime}</span>
                  </div>
                  {!isOpen && <p style={{ fontFamily: ITEM, fontStyle: "italic", fontSize: "1.05rem", color: STONE, marginTop: "0.25rem" }}>{excerpt}…</p>}
                </button>
                <Expand open={isOpen}><div style={{ padding: "0 0.2rem 1.6rem", maxWidth: "66ch" }}>{renderMarkdown(p.body)}</div></Expand>
              </div>
            );
          })}
        </div>
      </Section>

      {/* ===== KITCHEN — recipes, tap to cook ===== */}
      <Section id="kitchen" bg={PAPER} decoration={<BurntCorner />}>
        <Heading kicker="Dessert" title="Kitchen" />
        <div data-perch="kitchen" style={{ borderTop: `1px solid ${RULE}` }}>
          {recipes.map((r, ri) => {
            const isOpen = openRecipe === r.slug;
            return (
              <div key={r.slug} style={{ borderBottom: `1px solid ${RULE}` }}>
                <button onClick={() => setOpenRecipe(isOpen ? null : r.slug)} className="menu-row"
                  style={{ width: "100%", display: "block", textAlign: "left", background: "transparent", border: "none", padding: "1.05rem 0.2rem", cursor: "pointer" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "0.6rem" }}>
                    {ri === 0 && <InkStar size={18} color={ACCENT} style={{ alignSelf: "center", flexShrink: 0, marginRight: "-0.2rem" }} />}
                    <span style={{ fontFamily: DISPLAY, fontSize: "1.5rem", color: INK }}>{r.title}</span>
                    <span aria-hidden style={{ flex: 1, borderBottom: `1px dotted ${LEADER}`, marginBottom: "0.3rem", minWidth: "1rem" }} />
                    {r.serves && <span style={{ fontFamily: LABEL, fontSize: "0.72rem", letterSpacing: "0.12em", textTransform: "uppercase", color: OLIVE }}>serves {r.serves}</span>}
                  </div>
                  {r.note && <p style={{ fontFamily: ITEM, fontStyle: "italic", fontSize: "1.06rem", color: STONE, marginTop: "0.2rem" }}>{r.note}</p>}
                </button>
                <Expand open={isOpen}><div style={{ padding: "0 0.2rem 1.6rem", maxWidth: "62ch" }}>{renderMarkdown(r.body)}</div></Expand>
              </div>
            );
          })}
        </div>
      </Section>

      {/* ===== & NEXT + colophon ===== */}
      <section id="next" style={{ position: "relative", overflow: "hidden", padding: "clamp(2.5rem,6vw,4.5rem) clamp(1.5rem,6vw,5rem)" }}>
        <StainRing style={{ width: 232, height: 232, top: "-46px", left: "5%", transform: "rotate(-9deg)" }} />
        <PerchRail id="next" extra={<CrowCollection />} />
        <div style={{ position: "relative", zIndex: 1, maxWidth: "1000px", margin: "0 auto", display: "flex", flexWrap: "wrap", gap: "2rem", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div style={{ maxWidth: "40ch" }}>
            <Kicker color={STONE}>&amp; What's Next</Kicker>
            <p style={{ fontFamily: ITEM, fontStyle: "italic", fontSize: "1.2rem", color: STONE, marginTop: "0.4rem" }}>
              A hand-bound book of sea poems. An album of slowed tides. Whatever I get into next.
            </p>
          </div>
          <div style={{ position: "relative", textAlign: "right" }}>
            <InkArrow width={56} color={ACCENT} style={{ position: "absolute", left: "-3.4rem", bottom: "0.6rem" }} />
            <div style={{ fontFamily: DISPLAY, fontStyle: "italic", fontSize: "1.4rem", color: INK }}>Come hungry.</div>
            <img src="/sig.png" alt={identity.name} style={{ height: "clamp(46px,7vw,66px)", display: "block", marginLeft: "auto", marginTop: "0.7rem", opacity: 0.92 }} />
            <div style={{ marginTop: "0.25rem" }}><Kicker color={OLIVE}>Proprietor · Est. {identity.est}</Kicker></div>
            {/* the kitchen offers the sheet itself. take one home */}
            <button
              onClick={() => window.print()}
              className="tasting-invite"
              style={{ display: "inline-block", background: "transparent", border: "none", padding: "0.1rem 0.2rem", marginTop: "0.55rem", cursor: "pointer", fontFamily: SCRIPT, fontSize: "1.75rem", lineHeight: 1, color: ACCENT, transform: "rotate(-2deg)" }}
            >
              take a copy of the menu &rarr;
            </button>
          </div>
        </div>
      </section>

      {/* the second tea ring — appears in the margin if the visitor truly dwells */}
      <DwellRing />

      {lightbox && <Lightbox photo={lightbox} onClose={() => setLightbox(null)} />}
      {tasting !== null && (
        <TastingMenu
          course={tasting}
          night={night}
          playing={playing}
          onCourse={setTasting}
          onExit={() => setTasting(null)}
          onInsertTape={insertTape}
          fadeOutAudio={fadeOutAudio}
          levelL={levelL}
          levelR={levelR}
        />
      )}
    </div>
    </MotionConfig>
  );
}

// ---- section wrapper --------------------------------------------------------
function Section({ id, bg, children, decoration }: { id: string; bg: string; children: ReactNode; decoration?: ReactNode }) {
  return (
    <section id={id} style={{ position: "relative", overflow: decoration ? "hidden" : undefined, background: bg, borderTop: `1px solid ${RULE}` }}>
      <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "clamp(2.6rem,6vw,4.5rem) clamp(1.5rem,6vw,4rem)" }}>{children}</div>
      {decoration}
    </section>
  );
}

// ---- height expander (one click, in place) ---------------------------------
function Expand({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <motion.div initial={false} animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }} transition={{ duration: 0.34, ease }} style={{ overflow: "hidden" }}>
      {children}
    </motion.div>
  );
}

// ---- poem rendering --------------------------------------------------------
function PoemBody({ poem }: { poem: (typeof verse)[number] }) {
  return (
    <div style={{ display: "grid", gap: "1.4rem" }}>
      {poem.stanzas.map((st, si) => (
        <div key={si}>
          {st.split("\n").map((line, li) => (
            <p key={li} style={{ fontFamily: ITEM, fontStyle: "italic", fontSize: "clamp(1.06rem,1.5vw,1.2rem)", lineHeight: 1.62, color: "var(--poem)", margin: 0 }}>{line}</p>
          ))}
        </div>
      ))}
    </div>
  );
}

// the poem marked up by hand — highlighted lines + handwritten margin notes
function AnnotatedPoem({ poem }: { poem: (typeof verse)[number] }) {
  const anns = poemAnnotations[poem.title] || [];
  const norm = (s: string) => s.trim().toLowerCase().replace(/[—–-]+/g, "-").replace(/[‘’']/g, "'").replace(/[“”"]/g, '"').replace(/\s+/g, " ");
  const map = new Map(anns.map((a) => [norm(a.line), a]));
  const reduce = !!useReducedMotion();
  // give every ANNOTATED line a stable stagger order across the whole poem
  let annOrder = -1;
  return (
    <div style={{ display: "grid", gap: "1.3rem" }}>
      {poem.stanzas.map((st, si) => (
        <div key={si} style={{ display: "grid", gap: "0.2rem" }}>
          {st.split("\n").map((line, li) => {
            const a = map.get(norm(line));
            if (a) annOrder += 1;
            return (
              <AnnotatedLine
                key={li}
                line={line}
                highlighted={!!a}
                note={a?.note}
                order={a ? annOrder : 0}
                reduce={reduce}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

// VERSE — one poem fills the column, the next is cut off at the right edge.
// Renders several copies and recenters to the middle ONLY after scrolling
// settles, so it loops forever both ways with no mid-scroll jump or jitter.
function VerseCarousel() {
  const ref = useRef<HTMLDivElement | null>(null);
  const nudgingRef = useRef(false);
  const interactedRef = useRef(false);
  const reduce = useReducedMotion();
  const reduceRef = useRef(reduce);
  reduceRef.current = reduce;
  const N = verse.length;
  const COPIES = 5;
  const MID = Math.floor(COPIES / 2) * N; // slide index where the middle copy starts
  const slides = Array.from({ length: COPIES }, () => verse).flat();
  const [notes, setNotes] = useState<(typeof verse)[number] | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const basis = () => {
      const a = el.querySelector("article");
      return a ? a.getBoundingClientRect().width : 0;
    };
    const center = () => {
      const b = basis();
      if (b) el.scrollLeft = MID * b;
    };
    const raf = requestAnimationFrame(center);
    // after motion stops, jump back to the same poem in the middle copy (invisible)
    let timer: number | undefined;
    const recenter = () => {
      if (nudgingRef.current) return;
      const b = basis();
      if (!b) return;
      const idx = Math.round(el.scrollLeft / b);
      const norm = ((idx % N) + N) % N;
      const target = (MID + norm) * b;
      if (Math.abs(target - el.scrollLeft) > 1) el.scrollLeft = target;
    };
    const onScroll = () => {
      if (timer) clearTimeout(timer);
      timer = window.setTimeout(recenter, 140);
    };
    const onResize = () => center();
    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      if (timer) clearTimeout(timer);
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
    // MID and N are derived from constants; the effect only needs to run once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // As the poems reach the middle of the screen while you scroll DOWN, if you
  // haven't engaged them sideways the carousel slides the next poem in a touch
  // and the page gently settles onto the verse for a beat — a soft "there's
  // more here". Only a real sideways gesture (a drag, or a horizontal wheel)
  // counts as engaging; merely scrolling the page down over the poems does not.
  useEffect(() => {
    const el = ref.current;
    const sc = document.querySelector<HTMLElement>(".overflow-y-auto");
    if (!el || !sc) return;

    let downX = 0, downY = 0, down = false;
    const onDown = (e: PointerEvent) => { down = true; downX = e.clientX; downY = e.clientY; };
    const onMove = (e: PointerEvent) => {
      if (!down) return;
      const dx = Math.abs(e.clientX - downX), dy = Math.abs(e.clientY - downY);
      if (dx > 8 && dx > dy) interactedRef.current = true;
    };
    const onUp = () => { down = false; };
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 2) interactedRef.current = true;
    };
    el.addEventListener("pointerdown", onDown, { passive: true });
    el.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    el.addEventListener("wheel", onWheel, { passive: true });

    let done = false;
    const fire = () => {
      if (done || interactedRef.current || reduceRef.current) return;
      done = true;
      nudgingRef.current = true;
      // (1) ease the next poem in, then back
      const start = el.scrollLeft;
      const peek = Math.min(150, el.clientWidth * 0.2);
      const t0 = performance.now();
      const dur = 1050;
      const tick = (now: number) => {
        if (interactedRef.current) { el.scrollLeft = start; nudgingRef.current = false; return; }
        const p = Math.min(1, (now - t0) / dur);
        el.scrollLeft = start + peek * Math.sin(p * Math.PI);
        if (p < 1) requestAnimationFrame(tick);
        else { el.scrollLeft = start; nudgingRef.current = false; }
      };
      requestAnimationFrame(tick);
      // (2) one gentle vertical settle onto the poems — the brief "catch"
      const rect = el.getBoundingClientRect();
      const target = sc.scrollTop + rect.top + rect.height / 2 - sc.clientHeight / 2;
      sc.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
    };

    let last = sc.scrollTop;
    const onPageScroll = () => {
      const top = sc.scrollTop;
      const goingDown = top > last; last = top;
      if (done || interactedRef.current || !goingDown) return;
      const r = el.getBoundingClientRect();
      const mid = window.innerHeight * 0.5;
      if (r.top < mid && r.bottom > mid) fire();
    };
    sc.addEventListener("scroll", onPageScroll, { passive: true });

    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      el.removeEventListener("wheel", onWheel);
      sc.removeEventListener("scroll", onPageScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <style>{`.verse-loop::-webkit-scrollbar{display:none}`}</style>
      <div
        ref={ref}
        className="verse-loop"
        style={{
          display: "flex",
          gap: 0,
          overflowX: "auto",
          scrollSnapType: "x mandatory",
          paddingBottom: "1.2rem",
          scrollbarWidth: "none",
        }}
      >
        {slides.map((v, i) => (
          <article
            key={`${v.title}-${i}`}
            style={{
              flex: "0 0 calc(100% - clamp(32px, 6vw, 84px))",
              scrollSnapAlign: "start",
              paddingRight: "clamp(1.5rem,5vw,3rem)",
            }}
          >
            <div style={{ maxWidth: "46ch" }}>
              <h3 style={{ fontFamily: DISPLAY, fontStyle: "italic", fontWeight: 500, fontSize: "clamp(2.1rem,4.4vw,3rem)", color: INK, lineHeight: 1.02, marginBottom: "1.3rem" }}>{v.title}</h3>
              <PoemBody poem={v} />
              {v.analysis && (
                <button onClick={() => setNotes(v)} style={{ marginTop: "1.3rem", display: "inline-block", background: "transparent", border: "none", padding: 0, cursor: "pointer", fontFamily: SCRIPT, fontSize: "1.7rem", lineHeight: 1, color: ACCENT }}>
                  explication de texte &rarr;
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
      {notes && <NotebookExplication poem={notes} onClose={() => setNotes(null)} />}
    </>
  );
}

// marble texture for the composition-book cover
const MARBLE_SVG =
  "<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'>" +
  "<filter id='mb'><feTurbulence type='turbulence' baseFrequency='0.012 0.022' numOctaves='3' seed='4'/><feColorMatrix type='saturate' values='0'/></filter>" +
  "<rect width='100%' height='100%' filter='url(#mb)'/></svg>";
const MARBLE_URL = `url("data:image/svg+xml,${encodeURIComponent(MARBLE_SVG)}")`;

// GALLERY — the explication shown six different "notebook" ways; pick one
function NotebookExplication({ poem, onClose }: { poem: (typeof verse)[number]; onClose: () => void }) {
  const body = (poem.analysis || "").replace(/^#\s+.*(\n+|$)/, ""); // drop the doc's own H1
  const notes = renderMarkdown(body);
  const idx = verse.findIndex((v) => v.title === poem.title);
  const roman = ["i", "ii", "iii", "iv", "v", "vi"][idx] || "i";
  const greyRules = "repeating-linear-gradient(180deg, transparent 0 29px, rgba(96,82,58,0.18) 29px 30px)";
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={onClose}
      style={{ ...LIGHT_VARS, position: "fixed", inset: 0, zIndex: 50, background: "rgba(24,18,11,0.78)", display: "flex", flexDirection: "column", alignItems: "center", padding: "clamp(0.8rem,4vh,3rem) 1rem 3rem", overflowY: "auto", cursor: "zoom-out" }}>
      <button onClick={onClose} aria-label="close" style={{ position: "fixed", top: 16, right: 18, zIndex: 60, width: 34, height: 34, borderRadius: "50%", border: "none", cursor: "pointer", background: "rgba(244,238,221,0.92)", color: "#191713", fontSize: "0.95rem", lineHeight: 1, boxShadow: "0 4px 12px rgba(0,0,0,0.45)" }}>✕</button>
      <motion.div initial={{ scale: 0.985, y: 12 }} animate={{ scale: 1, y: 0 }} transition={{ duration: 0.3, ease }} onClick={(e) => e.stopPropagation()}
        style={{ cursor: "auto", flexShrink: 0, width: "min(960px, 100%)", position: "relative", borderRadius: 4, overflow: "hidden", background: "#fbf7ea", boxShadow: "0 52px 92px -34px rgba(0,0,0,0.66)" }}>
        {/* composition-book marbled cover header */}
        <div style={{ position: "relative", height: "clamp(94px,15vw,142px)", background: "#191713", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div aria-hidden style={{ position: "absolute", inset: 0, opacity: 0.55, backgroundImage: MARBLE_URL, backgroundSize: "200px 200px" }} />
          <div style={{ position: "relative", background: "#f4eedd", border: "2px solid #191713", padding: "0.55rem 1.9rem", transform: "rotate(-0.7deg)", textAlign: "center", boxShadow: "0 6px 14px rgba(0,0,0,0.5)" }}>
            <div style={{ fontFamily: LABEL, letterSpacing: "0.24em", fontSize: "0.6rem", color: OLIVE }}>Explication de Texte</div>
            <div style={{ fontFamily: DISPLAY, fontStyle: "italic", fontSize: "clamp(1.6rem,3.5vw,2.1rem)", color: INK, lineHeight: 1.05 }}>{poem.title}</div>
            <div style={{ fontFamily: LABEL, fontSize: "0.56rem", letterSpacing: "0.2em", color: STONE }}>NO. {roman.toUpperCase()}</div>
          </div>
        </div>
        {/* open spread: the poem on the left page, the notes on the right */}
        <div style={{ display: "flex", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 290px", minWidth: 0, padding: "clamp(1.4rem,3vw,2.1rem)", borderRight: "1px solid rgba(0,0,0,0.09)", boxShadow: "inset -9px 0 14px -12px rgba(40,28,12,0.3)" }}>
            <Kicker color={OLIVE}>the poem</Kicker>
            <div style={{ marginTop: "0.9rem" }}><AnnotatedPoem poem={poem} /></div>
          </div>
          <div style={{ flex: "1 1 380px", minWidth: 0, padding: "clamp(1.4rem,3vw,2.1rem)", backgroundImage: greyRules, backgroundPosition: "0 3.7rem", boxShadow: "inset 9px 0 14px -12px rgba(40,28,12,0.22)" }}>
            <Kicker color={ACCENT}>the notes</Kicker>
            <div style={{ marginTop: "0.5rem" }}>{notes}</div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ===========================================================================
// MUSIC — a tape deck you slot tapes into. The EP is an 8-track cartridge,
// the singles are cassettes; reels turn while they play.
function TapeReel({ spinning, dur = 2.6 }: { spinning: boolean; dur?: number }) {
  return (
    <motion.div
      animate={{ rotate: spinning ? 360 : 0 }}
      transition={spinning ? { repeat: Infinity, ease: "linear", duration: dur } : { duration: 0.6, ease }}
      style={{ width: "100%", height: "100%", borderRadius: "50%", position: "relative", background: "radial-gradient(circle at 42% 36%, #57514a, #201c17 72%)", boxShadow: "inset 0 0 6px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(0,0,0,0.5)" }}
    >
      <svg viewBox="0 0 100 100" aria-hidden style={{ position: "absolute", inset: "26%", width: "48%", height: "48%", display: "block" }}>
        <g fill="#e7e0cd">
          {Array.from({ length: 6 }).map((_, k) => (
            <rect key={k} x="46" y="3" width="8" height="20" rx="2" transform={`rotate(${k * 60} 50 50)`} />
          ))}
          <circle cx="50" cy="50" r="29" />
        </g>
        <circle cx="50" cy="50" r="10" fill="#231f1a" />
      </svg>
    </motion.div>
  );
}

function EightTrackBody({ rel, spinning }: { rel: Release; spinning: boolean }) {
  return (
    <div style={{ position: "relative", width: "100%", aspectRatio: "1.3 / 1", borderRadius: 12, overflow: "hidden", background: "linear-gradient(155deg,#35302a,#15120e 80%)", boxShadow: "inset 0 2px 2px rgba(255,255,255,0.13), inset 0 -3px 7px rgba(0,0,0,0.6)", padding: "clamp(7px,1.5vw,13px)" }}>
      {([["7%", "9%"], ["93%", "9%"], ["7%", "91%"], ["93%", "91%"]] as [string, string][]).map(([l, t], i) => (
        <span key={i} aria-hidden style={{ position: "absolute", left: l, top: t, transform: "translate(-50%,-50%)", width: 7, height: 7, borderRadius: "50%", background: "radial-gradient(circle at 35% 30%,#5b554d,#15120e)", boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.5)" }} />
      ))}
      <div style={{ display: "flex", gap: "clamp(6px,1.4vw,11px)", height: "100%" }}>
        <div style={{ flex: "1 1 58%", position: "relative", borderRadius: 5, overflow: "hidden", boxShadow: "0 0 0 2px rgba(233,226,205,0.85), 0 2px 6px rgba(0,0,0,0.5)", background: "#1a1714" }}>
          {rel.cover && <img src={rel.cover} alt={rel.title} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
          <div aria-hidden style={{ position: "absolute", inset: 0, background: "linear-gradient(118deg, rgba(255,255,255,0.22) 0 14%, rgba(255,255,255,0) 36%)" }} />
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "3px 7px", background: "linear-gradient(transparent,rgba(0,0,0,0.66))" }}>
            <span style={{ fontFamily: LABEL, fontSize: "0.56rem", letterSpacing: "0.16em", color: "#f1ead7" }}>STEREO 8</span>
          </div>
        </div>
        <div style={{ flex: "0 0 33%", position: "relative", borderRadius: 5, background: "radial-gradient(circle at 50% 42%, #1b1713, #0b0907)", boxShadow: "inset 0 2px 6px rgba(0,0,0,0.8), inset 0 0 0 1px rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: "13%" }}>
          <div style={{ width: "100%", aspectRatio: "1 / 1" }}><TapeReel spinning={spinning} dur={3.2} /></div>
        </div>
      </div>
    </div>
  );
}

function CassetteBody({ rel, spinning }: { rel: Release; spinning: boolean }) {
  const oxblood = rel.id === "terror";
  const shell = oxblood ? "linear-gradient(155deg,#7c3320,#37130a 82%)" : "linear-gradient(155deg,#2d2a25,#141210 82%)";
  return (
    <div style={{ position: "relative", width: "100%", aspectRatio: "1.55 / 1", borderRadius: 9, overflow: "hidden", background: shell, boxShadow: "inset 0 2px 2px rgba(255,255,255,0.12), inset 0 -3px 6px rgba(0,0,0,0.55)", padding: "8%" }}>
      <div style={{ position: "absolute", top: "8%", left: "8%", right: "8%", height: "33%", borderRadius: 3, background: "linear-gradient(#f4edda,#e3dbc1)", boxShadow: "0 1px 3px rgba(0,0,0,0.4)", display: "flex", alignItems: "center", padding: "0 7%", overflow: "hidden" }}>
        <span style={{ fontFamily: SCRIPT, fontSize: "clamp(1.1rem,3vw,1.7rem)", color: "#2f2a22", lineHeight: 1, whiteSpace: "nowrap" }}>{rel.title}</span>
      </div>
      <div style={{ position: "absolute", left: "13%", right: "13%", bottom: "13%", height: "40%", borderRadius: "44px/30px", background: "rgba(8,6,5,0.86)", boxShadow: "inset 0 2px 6px rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 8%" }}>
        <div style={{ width: "33%", aspectRatio: "1 / 1" }}><TapeReel spinning={spinning} dur={2.1} /></div>
        <div style={{ width: "33%", aspectRatio: "1 / 1" }}><TapeReel spinning={spinning} dur={2.1} /></div>
      </div>
    </div>
  );
}

/* ============================================================
   WAVE: TACTILE FEEDBACK — audio-reactive VU + write-on notes.
   ============================================================ */

// ---- (c) AUDIO-REACTIVE VU: one lazy Web Audio graph -----------------------
// Builds a single AudioContext + MediaElementSource(audio) -> AnalyserNode ->
// destination, lazily, on the first user-gesture play. Drives two smoothed
// 0..1 MotionValues (left/right) from time-domain RMS while a track plays.
// Guards: unsupported browsers, double-connect, suspended context.
type VuRefs = {
  ctx: AudioContext | null;
  src: MediaElementAudioSourceNode | null;
  analyser: AnalyserNode | null;
  built: boolean;
  unsupported: boolean;
};
function useVuLevel(audioRef: React.RefObject<HTMLAudioElement | null>, active: boolean) {
  const levelL = useMotionValue(0);
  const levelR = useMotionValue(0);
  const refs = useRef<VuRefs>({ ctx: null, src: null, analyser: null, built: false, unsupported: false });
  const rafRef = useRef<number | null>(null);

  // Call inside a user gesture (insert/toggle) so the AudioContext is allowed
  // to start. Safe to call repeatedly — only builds the graph once.
  const arm = useCallback(() => {
    const r = refs.current;
    if (r.built || r.unsupported) {
      if (r.ctx && r.ctx.state === "suspended") void r.ctx.resume().catch(() => {});
      return;
    }
    const a = audioRef.current;
    const Ctor: typeof AudioContext | undefined =
      typeof window !== "undefined"
        ? (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
        : undefined;
    if (!a || !Ctor) { r.unsupported = true; return; }
    try {
      const ctx = new Ctor();
      const src = ctx.createMediaElementSource(a); // throws if already wired — caught below
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.8;
      src.connect(analyser);
      analyser.connect(ctx.destination); // keep audio audible
      r.ctx = ctx; r.src = src; r.analyser = analyser; r.built = true;
      if (ctx.state === "suspended") void ctx.resume().catch(() => {});
    } catch {
      r.unsupported = true; // e.g. element already connected, or blocked
    }
  }, [audioRef]);

  // Run the meter loop only while something is playing; rest to zero otherwise.
  useEffect(() => {
    const stop = () => { if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; } };
    if (!active) {
      stop();
      // settle the needles back down smoothly
      animate(levelL, 0, { duration: 0.45, ease });
      animate(levelR, 0, { duration: 0.45, ease });
      return;
    }
    const r = refs.current;
    const analyser = r.analyser;
    if (!analyser) return; // graph not built (unsupported / not armed) -> stays 0
    if (r.ctx && r.ctx.state === "suspended") void r.ctx.resume().catch(() => {});
    const buf = new Uint8Array(analyser.fftSize);
    // simple smoothing + a tiny stereo illusion (the source is summed mono) so
    // the two windows don't move in perfect lockstep
    let sm = 0;
    const tick = () => {
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
      const rms = Math.sqrt(sum / buf.length); // ~0..0.5 typical
      const lvl = Math.min(1, rms * 2.6); // scale into the meter's useful range
      sm = sm + (lvl - sm) * 0.35; // attack/decay smoothing -> gentle
      levelL.set(Math.min(1, sm * 1.04));
      levelR.set(Math.min(1, sm * 0.92));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return stop;
    // levelL/levelR are stable MotionValues; only `active` drives this
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // tear the context down when the page unmounts
  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      const r = refs.current;
      if (r.ctx) void r.ctx.close().catch(() => {});
    };
  }, []);

  return { levelL, levelR, arm };
}

// One VU window: amber face + an oxblood needle whose angle tracks `level`.
// Keeps the original look exactly; only the motion source changes.
function VuMeter({ level }: { level: MotionValue<number> }) {
  // map 0..1 level -> needle angle (-28deg rest .. +24deg peak), same arc as before
  const rotate = useTransform(level, [0, 1], [-28, 24]);
  return (
    <div style={{ width: 36, height: 22, borderRadius: 3, background: "linear-gradient(#f0e4c6,#cdbf95)", position: "relative", overflow: "hidden", boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.3)" }}>
      <motion.div
        style={{ position: "absolute", left: "50%", bottom: "8%", width: 2, height: "82%", background: "#8a2e12", transformOrigin: "bottom center", rotate }}
      />
    </div>
  );
}

// ---- (b) INK DRAW-ON: one annotated line that "writes itself on" -----------
// Highlight wipes left->right (background-size 0%->100%); the margin note
// fades + drops in with a tiny settle rotation. Staggered by `order`.
// Reduced motion: both appear fully, instantly.
function AnnotatedLine({
  line, highlighted, note, order, reduce,
}: { line: string; highlighted: boolean; note?: string; order: number; reduce: boolean }) {
  // wipe: a horizontal gradient sized 0% -> 100% reveals the amber band L->R
  const baseHl: CSSProperties = highlighted
    ? {
        backgroundImage: "linear-gradient(100deg, rgba(214,158,74,0) 1%, rgba(214,158,74,0.4) 3%, rgba(214,158,74,0.4) 96%, rgba(214,158,74,0) 99%)",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "left center",
        borderRadius: 2,
        padding: "0.06em 0.16em",
        boxDecorationBreak: "clone",
        WebkitBoxDecorationBreak: "clone",
      }
    : {};
  const delay = reduce ? 0 : 0.12 + order * 0.09;
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: "0.6rem", flexWrap: "wrap" }}>
      <motion.span
        initial={highlighted && !reduce ? { backgroundSize: "0% 100%" } : false}
        animate={highlighted ? { backgroundSize: "100% 100%" } : undefined}
        transition={{ duration: 0.5, ease, delay }}
        style={{
          fontFamily: ITEM, fontStyle: "italic", fontSize: "clamp(1.04rem,1.5vw,1.16rem)",
          lineHeight: 1.75, color: "#3b3833",
          // when reduced, force the band fully shown
          ...baseHl,
          ...(highlighted && reduce ? { backgroundSize: "100% 100%" } : null),
        }}
      >
        {line}
      </motion.span>
      {note ? (
        <motion.span
          initial={reduce ? false : { opacity: 0, y: -5, rotate: -9, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, rotate: -2.5, scale: 1 }}
          transition={{ duration: 0.46, ease, delay: delay + 0.18 }}
          style={{ fontFamily: SCRIPT, fontSize: "1.45rem", lineHeight: 0.85, color: ACCENT, transformOrigin: "left center" }}
        >
          {note}
        </motion.span>
      ) : null}
    </div>
  );
}

function VU({ levelL, levelR }: { levelL: MotionValue<number>; levelR: MotionValue<number> }) {
  return (
    <div style={{ display: "flex", gap: 6 }}>
      <VuMeter level={levelL} />
      <VuMeter level={levelR} />
    </div>
  );
}

// a denser, more Victorian damask for the music room wall
const VICTORIAN_SVG =
  "<svg xmlns='http://www.w3.org/2000/svg' width='104' height='150' viewBox='0 0 104 150'>" +
  "<g fill='none' stroke='#6e5026' stroke-opacity='0.2' stroke-width='1.4'>" +
  "<path d='M52 1 C 88 24, 101 50, 101 75 C 101 100, 88 126, 52 149 C 16 126, 3 100, 3 75 C 3 50, 16 24, 52 1 Z'/>" +
  "</g>" +
  "<g fill='#6e5026' fill-opacity='0.15'>" +
  "<path d='M52 28 C 56 37, 61 41, 68 43 C 61 45, 56 49, 52 58 C 48 49, 43 45, 36 43 C 43 41, 48 37, 52 28 Z'/>" +
  "<path d='M52 58 C 65 64, 71 79, 64 93 C 60 101, 52 105, 52 105 C 52 105, 44 101, 40 93 C 33 79, 39 64, 52 58 Z'/>" +
  "<path d='M52 67 C 71 64, 84 73, 86 86 C 77 79, 64 77, 56 81 Z'/>" +
  "<path d='M52 67 C 33 64, 20 73, 18 86 C 27 79, 40 77, 48 81 Z'/>" +
  "<circle cx='52' cy='116' r='3.4'/>" +
  "<circle cx='52' cy='1' r='3'/><circle cx='52' cy='149' r='3'/>" +
  "<circle cx='3' cy='75' r='2.6'/><circle cx='101' cy='75' r='2.6'/>" +
  "</g>" +
  "<g fill='none' stroke='#6e5026' stroke-opacity='0.16' stroke-width='1'>" +
  "<path d='M46 74 C 50 78, 54 78, 58 74'/><path d='M44 84 C 50 89, 54 89, 60 84'/>" +
  "</g></svg>";
const VICTORIAN_WALL: CSSProperties = {
  backgroundColor: "var(--wall)",
  backgroundImage: [
    "radial-gradient(120% 80% at 50% 6%, rgba(255,250,236,0.5), rgba(255,250,236,0) 50%)",
    "radial-gradient(145% 130% at 50% 42%, rgba(40,26,8,0) 46%, rgba(40,26,8,0.3) 100%)",
    `url("data:image/svg+xml,${encodeURIComponent(VICTORIAN_SVG)}")`,
  ].join(", "),
  backgroundSize: "auto, auto, 104px 150px",
};

// MUSIC ROOM — a papered room; pull a tape off the shelf and drag it into the deck
function MusicRoom({ releases, loadedId, playing, onInsert, onEject, onToggle, levelL, levelR }: { releases: Release[]; loadedId: string | null; playing: string | null; onInsert: (r: Release) => void; onEject: () => void; onToggle: (t: Track) => void; levelL: MotionValue<number>; levelR: MotionValue<number> }) {
  const [over, setOver] = useState(false);
  const loaded = releases.find((r) => r.id === loadedId) ?? null;
  const spinning = !!loaded && loaded.tracks.some((t) => t.title === playing);
  const isEP = (r: Release) => r.id === "fear-of-god";
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const id = e.dataTransfer.getData("text/plain");
    const rel = releases.find((r) => r.id === id);
    if (rel) onInsert(rel);
  };
  // (a) DECK KA-CHUNK: when a tape lands, the housing settles with a short
  // damped shake and the PLAY light flickers a couple of times, then holds.
  const reduceDeck = useReducedMotion();
  const shakeX = useMotionValue(0);
  const shakeRot = useMotionValue(0);
  // steady = 1 (full opacity — the real `spinning` light shows through); the
  // ka-chunk briefly animates it below 1. Typed number so animate() overloads.
  const flicker = useMotionValue(1);
  const prevLoad = useRef<string | null>(loadedId);
  useEffect(() => {
    const had = prevLoad.current;
    prevLoad.current = loadedId;
    if (!loadedId || loadedId === had) return; // only on a fresh insert
    if (reduceDeck) { shakeX.set(0); shakeRot.set(0); flicker.set(1); return; }
    // ka-chunk: one quick push + a damped settle on x and rotate
    const cx = animate(shakeX, [0, -5, 3.5, -2, 1, 0], { duration: 0.46, ease: "easeOut" });
    const cr = animate(shakeRot, [0, -0.9, 0.55, -0.28, 0.12, 0], { duration: 0.46, ease: "easeOut" });
    // PLAY light: two bright blinks then release control back to `spinning`
    flicker.set(1);
    const cf = animate(flicker, [1, 0.25, 1, 0.4, 1], { duration: 0.5, ease: "easeInOut" });
    const t = window.setTimeout(() => flicker.set(1), 540); // settle steady (was the `null` sentinel)
    return () => { cx.stop(); cr.stop(); cf.stop(); window.clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedId]);
  const flickerOpacity = flicker; // steady 1 unless the ka-chunk is blinking it
  return (
    <section id="music" style={{ position: "relative", borderTop: "1px solid #d4c39e", borderBottom: "1px solid #d4c39e", ...VICTORIAN_WALL }}>
      <PointerLight radius={640} />
      <div aria-hidden style={{ height: 14, background: "linear-gradient(#caa86a,#9b7c43 44%,#7c6231)", boxShadow: "0 8px 12px -7px rgba(28,16,4,0.5), inset 0 1px 0 rgba(255,255,255,0.4)" }} />
      <div style={{ position: "relative", zIndex: 2, maxWidth: "1180px", margin: "0 auto", padding: "clamp(2.6rem,6vw,4.4rem) clamp(1.25rem,5vw,3.5rem) clamp(1.8rem,3vw,2.6rem)" }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: "0.4rem 1.5rem" }}>
          <Heading kicker="Digestif" title="Music" />
          <p style={{ fontFamily: SCRIPT, fontSize: "2rem", lineHeight: 1, color: ACCENT_DEEP, transform: "rotate(-3deg)", marginBottom: "0.9rem" }}>pull a tape, drag it into the deck &rarr;</p>
        </div>
        <PerchRail id="music" />
        {/* the tapes stand on a shelf on the wall */}
        <div style={{ marginTop: "1.4rem" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: "0.3rem 1rem", marginBottom: "0.9rem" }}>
            <Kicker color={STONE}>The Tapes</Kicker>
            <span style={{ fontFamily: ITEM, fontStyle: "italic", color: STONE, fontSize: "0.95rem" }}>take one off the shelf, drop it in the deck. a tap will do</span>
          </div>
          <div style={{ position: "relative" }}>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", alignItems: "flex-end", gap: "clamp(0.8rem,3vw,2.2rem)", position: "relative", zIndex: 1 }}>
              {releases.map((rel) => {
                const inDeck = rel.id === loadedId;
                return (
                  <div
                    key={rel.id}
                    draggable={!inDeck}
                    onDragStart={(e) => { e.dataTransfer.setData("text/plain", rel.id); e.dataTransfer.effectAllowed = "move"; }}
                    onClick={() => (inDeck ? onEject() : onInsert(rel))}
                    title={inDeck ? "in the deck" : "drag me into the deck, or just click"}
                    style={{ width: isEP(rel) ? "clamp(168px,27vw,232px)" : "clamp(126px,20vw,178px)", cursor: inDeck ? "default" : "grab", opacity: inDeck ? 0.26 : 1, transform: `rotate(${jitter(rel.id, 3)}deg)`, transformOrigin: "bottom center", transition: "opacity 0.2s, transform 0.18s", filter: "drop-shadow(3px 13px 8px rgba(20,12,4,0.45))" }}
                  >
                    <Sway id={rel.id} amp={1.3}>
                      {isEP(rel) ? <EightTrackBody rel={rel} spinning={false} /> : <CassetteBody rel={rel} spinning={false} />}
                    </Sway>
                  </div>
                );
              })}
            </div>
            {/* the plank the tapes stand on */}
            <div aria-hidden style={{ height: 16, marginTop: -1, background: "linear-gradient(#7d5c37,#48331e)", borderRadius: 2, boxShadow: "0 16px 18px -11px rgba(20,12,4,0.6), inset 0 2px 0 rgba(255,255,255,0.22), inset 0 -3px 5px rgba(0,0,0,0.45)" }} />
            <div aria-hidden style={{ height: 6, background: "linear-gradient(#5a4022,#352510)" }} />
            <div aria-hidden style={{ display: "flex", justifyContent: "space-between", padding: "0 13%" }}>
              <span style={{ width: 12, height: 18, background: "linear-gradient(#5a4022,#322309)", borderRadius: "0 0 3px 3px" }} />
              <span style={{ width: 12, height: 18, background: "linear-gradient(#5a4022,#322309)", borderRadius: "0 0 3px 3px" }} />
            </div>
          </div>
        </div>
        {/* the deck on its console + the loaded tape's tracklist */}
        <div style={{ marginTop: "clamp(2rem,4.5vw,3.2rem)", display: "flex", flexWrap: "wrap", gap: "clamp(1.6rem,4vw,3rem)", alignItems: "flex-start" }}>
          <div style={{ flex: "1 1 340px", minWidth: 0 }}>
            <motion.div
              onDragOver={(e) => { e.preventDefault(); if (!over) setOver(true); }}
              onDragLeave={() => setOver(false)}
              onDrop={onDrop}
              style={{ x: shakeX, rotate: shakeRot, position: "relative", borderRadius: 10, padding: "clamp(0.9rem,2vw,1.4rem)", background: "linear-gradient(180deg,#4b4740,#2b2824)", boxShadow: over ? `0 0 0 3px ${ACCENT}, 0 0 22px -2px ${ACCENT}, 0 28px 42px -24px rgba(0,0,0,0.7)` : "0 28px 42px -24px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.14), inset 0 -2px 6px rgba(0,0,0,0.5)", borderLeft: "9px solid #3a2c1c", borderRight: "9px solid #3a2c1c", transition: "box-shadow 0.18s" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.7rem" }}>
                <span style={{ fontFamily: LABEL, letterSpacing: "0.22em", fontSize: "0.6rem", color: "#ccc3ad" }}>Stereo-8 · Tape Deck</span>
                <span style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontFamily: LABEL, fontSize: "0.58rem", letterSpacing: "0.18em", color: spinning ? "#e8a36b" : "#6f685c" }}>
                  <motion.span style={{ width: 7, height: 7, borderRadius: "50%", background: spinning ? "#e0511f" : "#3c3a35", boxShadow: spinning ? "0 0 7px #e0511f" : "none", opacity: flickerOpacity }} />PLAY
                </span>
              </div>
              <div style={{ position: "relative", borderRadius: 6, background: "linear-gradient(#141210,#090807)", padding: "clamp(0.8rem,1.8vw,1.2rem)", boxShadow: "inset 0 3px 10px rgba(0,0,0,0.85)" }}>
                {loaded ? (
                  <motion.div key={loaded.id} initial={{ y: "55%", opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: "spring", stiffness: 240, damping: 22 }}>
                    {isEP(loaded) ? <EightTrackBody rel={loaded} spinning={spinning} /> : <CassetteBody rel={loaded} spinning={spinning} />}
                  </motion.div>
                ) : (
                  <div style={{ textAlign: "center", padding: "clamp(1.6rem,4vw,2.6rem) 0", color: over ? "#e8a36b" : "#6f685c", transition: "color 0.18s" }}>
                    <div style={{ fontFamily: LABEL, letterSpacing: "0.2em", fontSize: "0.68rem" }}>{over ? "▼ DROP IT IN" : "▭ EMPTY DECK"}</div>
                    <div style={{ fontFamily: ITEM, fontStyle: "italic", marginTop: "0.3rem", color: over ? "#e8a36b" : "#857d6f" }}>{over ? "release to play" : "drag a tape in to play"}</div>
                  </div>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.8rem", marginTop: "0.85rem" }}>
                <VU levelL={levelL} levelR={levelR} />
                <span aria-hidden style={{ flex: 1 }} />
                {loaded && (
                  <button onClick={onEject} style={{ fontFamily: LABEL, fontSize: "0.64rem", letterSpacing: "0.18em", textTransform: "uppercase", color: "#e7dfce", background: "linear-gradient(#5a554c,#37332d)", border: "none", borderRadius: 4, padding: "0.4rem 0.8rem", cursor: "pointer", boxShadow: "0 2px 4px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.18)" }}>⏏ Eject</button>
                )}
              </div>
            </motion.div>
            {/* the console ledge the deck sits on */}
            <div aria-hidden style={{ height: 15, background: "linear-gradient(#7a5a36,#4a3520)", borderRadius: "0 0 5px 5px", boxShadow: "0 13px 16px -10px rgba(20,12,4,0.6), inset 0 1px 0 rgba(255,255,255,0.15)" }} />
          </div>
          <div style={{ flex: "1 1 300px", minWidth: 0 }}>
            {loaded ? (
              <>
                <div style={{ display: "flex", alignItems: "baseline", gap: "0.6rem", marginBottom: "0.2rem", flexWrap: "wrap" }}>
                  <h3 style={{ fontFamily: DISPLAY, fontSize: "clamp(1.5rem,3.2vw,2rem)", color: INK }}>{loaded.title}</h3>
                  <Kicker color={ACCENT}>{loaded.kind} · {loaded.tracks.length} {loaded.tracks.length > 1 ? "tracks" : "track"}</Kicker>
                </div>
                <div style={{ borderTop: `1px solid ${RULE}` }}>
                  {loaded.tracks.map((t, i) => {
                    const isP = playing === t.title;
                    return (
                      <button key={t.title} onClick={() => onToggle(t)} style={{ width: "100%", display: "flex", alignItems: "baseline", gap: "0.7rem", background: isP ? "rgba(168,85,31,0.07)" : "transparent", border: "none", borderBottom: `1px solid ${RULE}`, padding: "0.5rem 0.3rem", cursor: "pointer", textAlign: "left" }}>
                        <span style={{ fontFamily: LABEL, fontSize: "0.7rem", color: isP ? ACCENT : LEADER, width: "1.4rem" }}>{i + 1}</span>
                        <span style={{ fontFamily: ITEM, fontSize: "1.2rem", color: isP ? ACCENT : INK, fontStyle: isP ? "italic" : "normal", whiteSpace: "nowrap" }}>{t.title}</span>
                        <span aria-hidden style={{ flex: 1, borderBottom: `1px dotted ${LEADER}`, marginBottom: "0.22rem", minWidth: "1rem" }} />
                        {isP && <span aria-hidden style={{ color: ACCENT, fontSize: "0.66rem" }}>▶</span>}
                        <span style={{ fontFamily: ITEM, fontStyle: "italic", color: OLIVE }}>{t.length}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <p style={{ fontFamily: ITEM, fontStyle: "italic", color: STONE, fontSize: "1.05rem" }}>Nothing loaded yet. Take a tape off the shelf and drop it into the deck.</p>
            )}
          </div>
        </div>
      </div>
      <div aria-hidden style={{ marginTop: "1.2rem", height: 42, background: "linear-gradient(#e9e0cb,#d6caab)", borderTop: "2px solid #c6b58c", boxShadow: "0 -10px 16px -10px rgba(28,16,4,0.4), inset 0 2px 0 rgba(255,255,255,0.5)" }} />
      <div aria-hidden style={{ height: 9, background: "linear-gradient(#c7b896,#b3a280)" }} />
    </section>
  );
}

// ===========================================================================
// PHOTOGRAPHS — a papered wall in a room, art hung salon-style
const CLUSTERS = [
  { key: "Alaska", note: "april, somewhere north" },
  { key: "Greece", note: "spring, 2025" },
  { key: "The West", note: "old panoramas" },
  { key: "Stray Frames", note: "everything else" },
];

const ASPECT: Record<string, number> = { "3/4": 0.75, "4/3": 1.333, "1/1": 1, "16/9": 1.777, "4/5": 0.8 };

// PHOTO ALBUM — prints held by gummed photo-corners on kraft pages you flip through
const PHOTO_CORNERS: { pos: CSSProperties; clip: string }[] = [
  { pos: { top: 0, left: 0 }, clip: "polygon(0 0, 100% 0, 0 100%)" },
  { pos: { top: 0, right: 0 }, clip: "polygon(100% 0, 100% 100%, 0 0)" },
  { pos: { bottom: 0, left: 0 }, clip: "polygon(0 100%, 0 0, 100% 100%)" },
  { pos: { bottom: 0, right: 0 }, clip: "polygon(100% 100%, 0 100%, 100% 0)" },
];

// margin notes in his hand, tied to particular prints wherever they appear
const PRINT_NOTES: Record<string, string> = {
  "sun-over-canyon": "burnt orange was written here",
};

// the album gets the small plate; the lightbox still orders off the full menu.
// /photos/web/IMG_8205.jpg -> /photos/thumb/IMG_8205.webp, baked by
// scripts/make-thumbs.mjs. derived, so photo rows stay one line each.
const thumbOf = (src: string) => src.replace("/photos/web/", "/photos/thumb/").replace(/\.jpg$/, ".webp");

function AlbumPhoto({ p, onClick, w, sizes }: { p: Photo; onClick: () => void; w: number | string; sizes: string }) {
  const ratio = p.ratio ?? ASPECT[p.aspect];
  const tilt = jitter(p.id + "a", 2.4);
  const note = PRINT_NOTES[p.id];
  return (
    <motion.button
      onClick={onClick}
      className={p.sub === "The Lights" ? "album-photo lights-photo" : "album-photo"}
      whileHover={{ scale: 1.04, rotate: 0, zIndex: 4 }}
      transition={{ duration: 0.25, ease }}
      style={{ position: "relative", width: w, transform: `rotate(${tilt}deg)`, background: "transparent", border: "none", padding: 0, cursor: "pointer", display: "block" }}
    >
      <Sway id={p.id + "sway"} amp={1.4}>
        <div style={{ background: "#fffdf6", padding: 6, boxShadow: "0 13px 18px -9px rgba(40,28,12,0.5), 0 2px 5px rgba(0,0,0,0.2)" }}>
          <div style={{ position: "relative", aspectRatio: String(ratio), overflow: "hidden", background: `linear-gradient(150deg, ${p.tone[0]}, ${p.tone[1]})` }}>
            <picture style={{ display: "block", width: "100%", height: "100%" }}>
              <source type="image/webp" srcSet={`${thumbOf(p.src)} ${p.ratio ? 1000 : 600}w`} sizes={sizes} />
              <img src={p.src} alt={p.title} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            </picture>
            {PHOTO_CORNERS.map((c, i) => (
              <span key={i} aria-hidden style={{ position: "absolute", ...c.pos, width: 15, height: 15, background: "rgba(44,31,16,0.8)", clipPath: c.clip }} />
            ))}
          </div>
        </div>
        <div style={{ textAlign: "center", marginTop: "0.35rem", lineHeight: 0.9 }}>
          <span style={{ fontFamily: SCRIPT, fontSize: "1.55rem", color: "#3c352a" }}>{p.title}</span>
          <span style={{ fontFamily: LABEL, fontSize: "0.56rem", letterSpacing: "0.14em", color: OLIVE, marginLeft: "0.45rem" }}>{p.year}</span>
        </div>
        {note && (
          <div style={{ textAlign: "center", marginTop: "0.2rem", fontFamily: SCRIPT, fontSize: "1.25rem", lineHeight: 0.9, color: ACCENT, transform: "rotate(-2deg)" }}>{note}</div>
        )}
      </Sway>
    </motion.button>
  );
}

// LOOSE PRINTS ON THE PAGE — no album object, no pagination. The photographs
// lie directly on the menu paper the way everything else on this site does:
// white-bordered prints, gummed corners, hand tilts, a written label per
// cluster, all four clusters just there as you scroll.
function PhotoAlbum({ onPhoto }: { onPhoto: (p: Photo) => void }) {
  const printW = (p: Photo) => {
    const r = p.ratio ?? ASPECT[p.aspect];
    if (r >= 1.3) return "clamp(180px,30vw,248px)";
    if (r <= 0.85) return "clamp(120px,21vw,168px)";
    return "clamp(150px,25vw,196px)";
  };
  const row = (list: Photo[]) => (
    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", alignItems: "flex-start", gap: "clamp(1.5rem,3.2vw,2.6rem) clamp(1rem,2.4vw,2rem)" }}>
      {list.map((p) => <AlbumPhoto key={p.id} p={p} w={printW(p)} sizes={printW(p)} onClick={() => onPhoto(p)} />)}
    </div>
  );
  return (
    <section id="photos" style={{ position: "relative", overflow: "hidden", background: PAPER, borderTop: `1px solid ${RULE}` }}>
      <PointerLight radius={620} />
      <div style={{ position: "relative", zIndex: 1, maxWidth: "1120px", margin: "0 auto", padding: "clamp(2.6rem,6vw,4.5rem) clamp(1.5rem,6vw,4rem)" }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: "0.4rem 1.5rem" }}>
          <Heading kicker="Plats" title="Photographs" />
          <p style={{ fontFamily: SCRIPT, fontSize: "2rem", lineHeight: 1, color: ACCENT, transform: "rotate(-2deg)", marginBottom: "0.9rem" }}>tap a print to look closer &rarr;</p>
        </div>
        <PerchRail id="photos" />
        {CLUSTERS.map((c, ci) => {
          const inCluster = photos.filter((p) => p.collection === c.key);
          const lights = inCluster.filter((p) => p.sub === "The Lights");
          const loose = inCluster.filter((p) => !p.sub);
          const panos = loose.filter((p) => p.ratio);
          const normal = loose.filter((p) => !p.ratio);
          const right = ci % 2 === 1; // cluster labels alternate sides, off-axis
          return (
            <div key={c.key} style={{ marginTop: ci === 0 ? "0.8rem" : "clamp(2.8rem,5.5vw,4.4rem)" }}>
              <div style={{ display: "flex", flexDirection: right ? "row-reverse" : "row", alignItems: "baseline", gap: "0.7rem", flexWrap: "wrap", borderBottom: `1px solid ${RULE}`, paddingBottom: "0.55rem", marginBottom: "1.7rem", textAlign: right ? "right" : "left" }}>
                <span style={{ fontFamily: DISPLAY, fontStyle: "italic", fontSize: "clamp(1.7rem,3.4vw,2.3rem)", color: INK, lineHeight: 1 }}>{c.key}</span>
                <span style={{ fontFamily: ITEM, fontStyle: "italic", color: STONE }}>{c.note}</span>
              </div>
              {normal.length > 0 && row(normal)}
              {panos.map((p) => (
                <div key={p.id} style={{ width: "min(820px,100%)", margin: "1.9rem auto 0", transform: `rotate(${jitter(p.id + "a", 0.7)}deg)` }}>
                  <AlbumPhoto p={p} w="100%" sizes="min(820px,100vw)" onClick={() => onPhoto(p)} />
                </div>
              ))}
              {lights.length > 0 && (
                <div style={{ marginTop: "2.1rem" }}>
                  <div style={{ fontFamily: SCRIPT, fontSize: "2rem", color: ACCENT_DEEP, transform: "rotate(-2deg)", marginBottom: "0.5rem" }}>the lights</div>
                  {row(lights)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ---- lightbox --------------------------------------------------------------
function Lightbox({ photo, onClose }: { photo: (typeof photos)[number]; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 40, background: "rgba(20,17,13,0.94)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "clamp(1rem,4vw,3rem)", cursor: "zoom-out" }}>
      <motion.img initial={{ scale: 0.96 }} animate={{ scale: 1 }} src={photo.src} alt={photo.title} style={{ maxWidth: "100%", maxHeight: "84vh", objectFit: "contain", boxShadow: "0 30px 80px rgba(0,0,0,0.6)" }} />
      <div style={{ marginTop: "1.1rem", display: "flex", alignItems: "baseline", gap: "0.7rem", color: "#efe7d6" }}>
        <span style={{ fontFamily: DISPLAY, fontStyle: "italic", fontSize: "1.5rem" }}>{photo.title}</span>
        <span style={{ fontFamily: LABEL, fontSize: "0.8rem", letterSpacing: "0.18em", color: "#c7b77c" }}>{photo.year}</span>
      </div>
    </motion.div>
  );
}

/* ============================================================
   WAVE: LE MENU DÉGUSTATION — the kitchen finally serves.
   A full-screen "dark linen" service (zIndex 60, above the
   notebook's 50) that sets down five plates, one at a time:
   the poem, a photograph, music — the EP goes into the REAL
   deck downstairs — a taste from the kitchen, and l'addition.
   Click / → / Space advance, ← goes back, Escape or ✕ exits.
   Framer here is interaction-driven one-shots only; the course
   timers and the audio fade are plain setTimeout/setInterval
   (no rAF), so they're correct even when frames freeze.
   ============================================================ */

// The overlay always reads as lamplit dark linen — re-declaring the palette
// vars on its container (the same trick LIGHT_VARS plays for the notebook,
// inverted) keeps every reused piece (Kicker, PoemBody, VU, Crow) legible in
// BOTH day and night. --crow flips to parchment so the bird reads on the dark.
const LINEN_VARS = {
  "--cream": "#1b1712", "--paper": "#14110c", "--rule": "#3a3328",
  "--leader": "#8a8171", "--stone": "#a59c89", "--ink": "#ece4d2",
  "--olive": "#bda572", "--body": "#cbc1ab", "--poem": "#d8cfb8",
  "--wall": "#201910", "--crow": "#ded3b8",
} as unknown as CSSProperties;

// menu-style course kickers + roman-numeral progress
const TASTING_KICKERS = [
  "Première Assiette · Verse",
  "Deuxième · Photographs",
  "Troisième · Music",
  "Quatrième · Kitchen",
  "L'Addition",
];
const TASTING_ROMAN = ["i", "ii", "iii", "iv", "v"];

// strong daylight prints for the photograph course (night serves The Lights)
const TASTING_DAY_PRINTS = ["snowbound-valley", "winter-dusk", "citadel-mycenae", "mycenae-overlook", "sun-over-canyon", "cloud-country"];

// where the crow attends, course by course — a different corner each plate,
// never the top-right (that corner belongs to the ✕). Facing inward.
const TASTING_CROW: { left?: number; right?: number; top?: number; bottom?: number; flip: boolean }[] = [
  { left: 20, top: 14, flip: true },
  { right: 24, bottom: 12, flip: false },
  { left: 20, bottom: 12, flip: true },
  { left: 20, top: 14, flip: true },
  { right: 24, bottom: 12, flip: false },
];

// the first real line of a recipe — the amuse-bouche
function amuseLine(body: string): string {
  for (const block of body.split("\n\n")) {
    const t = block.trim();
    if (!t || t.startsWith("#") || t === "---" || t === "***") continue;
    const first = (t.split("\n")[0] || "").replace(/^\d+\.\s*/, "").replace(/^-\s*/, "");
    const plain = first.replace(/\[(.+?)\]\((.+?)\)/g, "$1").replace(/[*_`]/g, "").trim();
    if (plain) return plain;
  }
  return "";
}

function TastingMenu({
  course, night, playing, onCourse, onExit, onInsertTape, fadeOutAudio, levelL, levelR,
}: {
  course: number;
  night: boolean;
  playing: string | null;
  onCourse: (i: number) => void;
  onExit: () => void;
  onInsertTape: (r: Release) => void;
  fadeOutAudio: () => void;
  levelL: MotionValue<number>;
  levelR: MotionValue<number>;
}) {
  const reduce = !!useReducedMotion();
  const rootRef = useRef<HTMLDivElement | null>(null);
  // a fresh seed each time the tasting opens, so repeat services vary
  // a fresh seed each service; or, if a seat was saved for you (?seat=n in a
  // shared link), the exact same one: the same poem, print, and taste they had.
  const [seat] = useState(() => {
    let n = `${Date.now() % 9973}`;
    let saved = false;
    try {
      const s = new URLSearchParams(window.location.search).get("seat");
      if (s && /^\d{1,4}$/.test(s)) { n = s; saved = true; }
    } catch { /* ignore */ }
    return { seed: `svc-${n}`, saved };
  });
  const seedRef = useRef(seat.seed);
  const [seatSaved, setSeatSaved] = useState<"idle" | "copied" | "shown">("idle");
  const seatUrl = () => {
    const u = new URL(window.location.href);
    u.searchParams.set("seat", seat.seed.replace("svc-", ""));
    u.hash = "";
    return u.toString();
  };
  const saveSeat = (e: { stopPropagation(): void }) => {
    e.stopPropagation();
    try { navigator.clipboard.writeText(seatUrl()).then(() => setSeatSaved("copied")).catch(() => setSeatSaved("shown")); }
    catch { setSeatSaved("shown"); }
  };
  // did THIS tasting start the audio? (never silence music the guest chose)
  const startedTapeRef = useRef(false);

  const ep = music[0];
  const epPlaying = playing != null && ep.tracks.some((t) => t.title === playing);

  const photoPick = useMemo(() => {
    const lights = photos.filter((p) => p.sub === "The Lights");
    const day = TASTING_DAY_PRINTS.map((id) => photos.find((p) => p.id === id)).filter((p): p is Photo => !!p);
    const pool = night && lights.length ? lights : day.length ? day : photos;
    const idx = Math.min(pool.length - 1, Math.floor(((jitter(seedRef.current + "ph", 1) + 1) / 2) * pool.length));
    return pool[idx];
  }, [night]);

  const recipePick = useMemo(() => {
    if (!recipes.length) return null;
    const idx = Math.min(recipes.length - 1, Math.floor(((jitter(seedRef.current + "rc", 1) + 1) / 2) * recipes.length));
    return recipes[idx];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exit = () => {
    if (startedTapeRef.current) fadeOutAudio(); // bow the music out; the tape stays loaded
    onExit();
  };
  const advance = () => {
    if (course >= TASTING_KICKERS.length - 1) { exit(); return; }
    if (course === 2) fadeOutAudio(); // the music bows out under the next plate
    onCourse(course + 1);
  };
  const back = () => { if (course > 0) onCourse(course - 1); };

  // one keydown listener, reading the LATEST handlers through a ref
  const handlers = useRef({ advance, back, exit });
  handlers.current = { advance, back, exit };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); handlers.current.exit(); }
      else if (e.key === "ArrowRight" || e.key === " " || e.key === "Spacebar") { e.preventDefault(); handlers.current.advance(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); handlers.current.back(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // take focus so stray keys scroll the overlay, not the page behind it
  useEffect(() => { rootRef.current?.focus(); }, []);

  // MUSIC course: slot the EP into the real deck. If .play() is blocked the
  // plate still shows (insertTape sets `playing` optimistically) and the
  // timer still advances. Keyed to the course alone — re-checking `playing`
  // would re-insert (and restart) the tape mid-course.
  useEffect(() => {
    if (course !== 2) return;
    if (!(playing && ep.tracks.some((t) => t.title === playing))) {
      startedTapeRef.current = true;
      onInsertTape(ep);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course]);

  // unhurried auto-advance for the timed plates (the poem waits for you)
  useEffect(() => {
    const ms = course === 1 ? 14000 : course === 2 ? 30000 : course === 3 ? 12000 : null;
    if (ms == null) return;
    const t = window.setTimeout(() => handlers.current.advance(), ms);
    return () => window.clearTimeout(t);
  }, [course]);

  const crow = TASTING_CROW[course] ?? TASTING_CROW[0];

  let plate: ReactNode = null;
  if (course === 0) {
    plate = (
      <>
        {seat.saved && (
          <div style={{ fontFamily: SCRIPT, fontSize: "1.6rem", lineHeight: 1, color: ACCENT, transform: "rotate(-2deg)" }}>someone saved you this seat</div>
        )}
        <h3 style={{ fontFamily: DISPLAY, fontStyle: "italic", fontWeight: 500, fontSize: "clamp(1.9rem,4vw,2.6rem)", color: "var(--ink)", lineHeight: 1.05, margin: "0.8rem 0 1.4rem" }}>{verse[0].title}</h3>
        <div style={{ display: "inline-block", textAlign: "left", maxWidth: "46ch" }}>
          <PoemBody poem={verse[0]} />
        </div>
        <p style={{ marginTop: "1.7rem", fontFamily: ITEM, fontStyle: "italic", fontSize: "0.95rem", color: "var(--leader)" }}>take your time. click, or press →, when you're ready</p>
      </>
    );
  } else if (course === 1) {
    plate = (
      <>
        <img src={photoPick.src} alt={photoPick.title} style={{ maxWidth: "min(760px,100%)", maxHeight: "60vh", objectFit: "contain", display: "block", margin: "1.3rem auto 0", boxShadow: "0 34px 70px -18px rgba(0,0,0,0.65)" }} />
        <div style={{ marginTop: "1rem", display: "flex", alignItems: "baseline", justifyContent: "center", gap: "0.7rem" }}>
          <span style={{ fontFamily: SCRIPT, fontSize: "1.7rem", lineHeight: 1, color: "var(--stone)" }}>{photoPick.title}</span>
          <span style={{ fontFamily: LABEL, fontSize: "0.68rem", letterSpacing: "0.18em", color: "var(--olive)" }}>{photoPick.year}</span>
        </div>
        {PRINT_NOTES[photoPick.id] && (
          <div style={{ marginTop: "0.5rem", textAlign: "center", fontFamily: SCRIPT, fontSize: "1.45rem", lineHeight: 1, color: ACCENT, transform: "rotate(-2deg)" }}>{PRINT_NOTES[photoPick.id]}</div>
        )}
      </>
    );
  } else if (course === 2) {
    plate = (
      <>
        <div style={{ width: "min(320px,78vw)", margin: "1.4rem auto 0", filter: "drop-shadow(0 28px 30px rgba(0,0,0,0.55))" }}>
          <EightTrackBody rel={ep} spinning={epPlaying} />
        </div>
        <div style={{ marginTop: "1.2rem", fontFamily: DISPLAY, fontStyle: "italic", fontSize: "clamp(1.3rem,2.6vw,1.6rem)", color: "var(--ink)" }}>{epPlaying && playing ? playing : ep.tracks[0].title}</div>
        <div style={{ marginTop: "0.85rem", display: "flex", justifyContent: "center" }}>
          <VU levelL={levelL} levelR={levelR} />
        </div>
        <p style={{ marginTop: "1rem", fontFamily: ITEM, fontStyle: "italic", fontSize: "0.95rem", color: "var(--leader)" }}>the tape stays in the deck downstairs</p>
      </>
    );
  } else if (course === 3) {
    plate = recipePick ? (
      <div style={{ display: "inline-block", background: "#f6f0df", borderRadius: 3, padding: "1.5rem 1.8rem 1.6rem", transform: "rotate(-1.3deg)", boxShadow: "0 30px 56px -20px rgba(0,0,0,0.65)", maxWidth: "46ch", textAlign: "left", marginTop: "1.3rem" }}>
        <div style={{ fontFamily: DISPLAY, fontSize: "clamp(1.5rem,3vw,1.8rem)", color: "#2f2e2a", lineHeight: 1.1 }}>{recipePick.title}</div>
        {(recipePick.note || recipePick.serves) && (
          <div style={{ marginTop: "0.35rem", fontFamily: ITEM, fontStyle: "italic", fontSize: "1.02rem", color: "#65635c" }}>
            {recipePick.note}{recipePick.serves ? ` · serves ${recipePick.serves}` : ""}
          </div>
        )}
        <div aria-hidden style={{ margin: "0.95rem 0", borderTop: "1px solid #d4d2cb" }} />
        <p style={{ fontFamily: BODY, fontSize: "1rem", lineHeight: 1.7, color: "#43403a", margin: 0 }}>{amuseLine(recipePick.body)}</p>
        <div style={{ marginTop: "0.9rem", fontFamily: SCRIPT, fontSize: "1.5rem", lineHeight: 1, color: ACCENT }}>just a taste. the rest is downstairs</div>
      </div>
    ) : (
      <p style={{ marginTop: "1.3rem", fontFamily: ITEM, fontStyle: "italic", color: "var(--stone)" }}>the kitchen is quiet tonight.</p>
    );
  } else {
    plate = (
      <>
        <div style={{ marginTop: "1.5rem", fontFamily: DISPLAY, fontStyle: "italic", fontSize: "clamp(1.7rem,3.6vw,2.2rem)", color: "var(--ink)" }}>Come hungry.</div>
        {/* the signature is dark ink — invert it to parchment for the dark linen */}
        <img src="/sig.png" alt={identity.name} style={{ height: "clamp(46px,7vw,66px)", display: "block", margin: "1.2rem auto 0", opacity: 0.95, filter: "invert(0.9) sepia(0.35)" }} />
        <button
          onClick={(e) => { e.stopPropagation(); handlers.current.exit(); }}
          style={{ marginTop: "1.8rem", background: "transparent", border: "none", padding: "0.3rem 0.5rem", cursor: "pointer", fontFamily: LABEL, fontSize: "0.78rem", letterSpacing: "0.2em", textTransform: "uppercase", color: ACCENT }}
        >
          back to the menu →
        </button>
        <div style={{ marginTop: "1.1rem" }}>
          <button onClick={saveSeat} style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", fontFamily: SCRIPT, fontSize: "1.55rem", lineHeight: 1, color: "var(--stone)" }}>
            {seatSaved === "copied" ? "seat saved. the link is in your hand" : "save someone a seat →"}
          </button>
          {seatSaved === "shown" && (
            <div style={{ marginTop: "0.5rem", fontFamily: BODY, fontSize: "0.76rem", color: "var(--leader)", userSelect: "all", wordBreak: "break-all" }}>{seatUrl()}</div>
          )}
        </div>
      </>
    );
  }

  return (
    <motion.div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label="le menu dégustation"
      tabIndex={-1}
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reduce ? 0 : 0.4, ease }}
      onClick={() => handlers.current.advance()}
      style={{
        ...LINEN_VARS,
        position: "fixed", inset: 0, zIndex: 60, cursor: "default",
        background: "rgba(24,18,11,0.92)",
        display: "flex", flexDirection: "column",
        // its own scroll context; `contain` stops the wheel chaining to the
        // page scroller behind, so no scroll-lock (and no unlock) is needed
        overflowY: "auto", overscrollBehavior: "contain",
        outline: "none",
        fontFamily: ITEM, color: "var(--ink)",
      }}
    >
      {/* ✕ — the notebook's close, same hand */}
      <button
        onClick={(e) => { e.stopPropagation(); handlers.current.exit(); }}
        aria-label="close the tasting"
        style={{ position: "fixed", top: 16, right: 18, zIndex: 3, width: 34, height: 34, borderRadius: "50%", border: "none", cursor: "pointer", background: "rgba(244,238,221,0.92)", color: "#191713", fontSize: "0.95rem", lineHeight: 1, boxShadow: "0 4px 12px rgba(0,0,0,0.45)" }}
      >✕</button>

      {/* the bird attends — a different corner each course; the owl waits at night */}
      <motion.div
        key={`crow-${course}`}
        aria-hidden
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 0.9 }}
        transition={{ duration: reduce ? 0 : 0.45, ease }}
        style={{ position: "fixed", zIndex: 1, pointerEvents: "none", left: crow.left, right: crow.right, top: crow.top, bottom: crow.bottom }}
      >
        {night ? <Owl width={44} alive flip={crow.flip} /> : <Crow width={44} alive flip={crow.flip} />}
      </motion.div>

      {/* the plate — set down with a quiet rise, lifted with a shorter one */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={course}
          initial={reduce ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: reduce ? 1 : 0, y: reduce ? 0 : -8, transition: { duration: reduce ? 0 : 0.26, ease } }}
          transition={{ duration: reduce ? 0 : 0.5, ease }}
          style={{ margin: "auto", width: "min(820px,100%)", padding: "clamp(3.2rem,9vh,5rem) clamp(1.1rem,4vw,2rem) 5.4rem", textAlign: "center" }}
        >
          <Kicker color="var(--olive)">{TASTING_KICKERS[course]}</Kicker>
          {plate}
        </motion.div>
      </AnimatePresence>

      {/* roman-numeral progress, set at the foot of the table */}
      <div aria-hidden style={{ position: "fixed", left: 0, right: 0, bottom: 16, zIndex: 2, textAlign: "center", pointerEvents: "none", fontFamily: LABEL, fontSize: "0.8rem", letterSpacing: "0.14em", color: "var(--leader)" }}>
        {TASTING_ROMAN.map((r, i) => (
          <span key={r}>
            <span style={{ color: i === course ? ACCENT : "var(--leader)" }}>{r}</span>
            {i < TASTING_ROMAN.length - 1 && <span style={{ padding: "0 0.5rem", opacity: 0.6 }}>·</span>}
          </span>
        ))}
      </div>
    </motion.div>
  );
}
// ---- the printed menu -------------------------------------------------------
// TAKE A COPY OF THE MENU — the whole house re-typeset for paper. Always
// mounted, display:none on screen; the @media print block at the end of
// THEME_CSS hides the room and shows this instead. Ink stays literal (and the
// theme vars are re-declared to ink in that block), so the sheet prints
// ink-on-white whether or not the lamp was pulled. No hooks, no state — it
// renders once from the live data; the recipes travel in full, the prints stay home.
const P_INK = "#1c1a16";
const P_BODY = "#2e2b25";
const P_STONE = "#6b6557";
const P_OLIVE = "#6c6343";
const P_RULE = "#d8d3c6";
const P_LEADER = "#b3ac9d";

function PrintMenu() {
  // the wall's clusters, in hanging order, counted from the live frames
  const clusters: { name: string; count: number }[] = [];
  for (const p of photos) {
    const c = clusters.find((x) => x.name === p.collection);
    if (c) c.count += 1;
    else clusters.push({ name: p.collection, count: 1 });
  }
  // "1 july 2026" — the date this copy was struck, in the house's lowercase
  const today = new Date()
    .toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    .toLowerCase();

  const kicker = (text: string) => (
    <div style={{ fontFamily: LABEL, fontSize: "8.5pt", letterSpacing: "0.32em", textTransform: "uppercase", color: ACCENT }}>{text}</div>
  );
  const course = (k: string, title: string) => (
    <div style={{ margin: "26pt 0 10pt", borderBottom: `1px solid ${P_RULE}`, paddingBottom: "7pt" }}>
      {kicker(k)}
      <h2 style={{ fontFamily: DISPLAY, fontSize: "21pt", lineHeight: 1.02, color: P_INK, margin: "2pt 0 0" }}>{title}</h2>
    </div>
  );
  const leader = () => (
    <span aria-hidden style={{ flex: 1, borderBottom: `1px dotted ${P_LEADER}`, marginBottom: "3pt", minWidth: "14pt" }} />
  );
  const aside = (text: string) => (
    <p style={{ fontFamily: ITEM, fontStyle: "italic", fontSize: "10.5pt", color: P_STONE, margin: "8pt 0 0" }}>{text}</p>
  );

  return (
    <div className="print-menu" aria-hidden style={{ fontFamily: ITEM, color: P_INK, maxWidth: "168mm", margin: "0 auto" }}>
      {/* ===== MASTHEAD ===== */}
      <header className="pm-item" style={{ textAlign: "center", marginBottom: "8pt" }}>
        <div style={{ fontFamily: LABEL, fontSize: "9pt", letterSpacing: "0.3em", textTransform: "uppercase", color: P_OLIVE }}>
          Maison {identity.initials} · Est. {identity.est}
        </div>
        <h1 style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: "40pt", lineHeight: 0.95, letterSpacing: "-0.005em", margin: "10pt 0 6pt", color: P_INK }}>À la Carte</h1>
        {kicker(`The House of ${identity.name.split(" ")[1]}`)}
        <p style={{ fontFamily: ITEM, fontStyle: "italic", fontSize: "11.5pt", lineHeight: 1.55, color: P_STONE, maxWidth: "44ch", margin: "10pt auto 0" }}>{identity.bio}</p>
      </header>

      {/* ===== VERSE — every poem, whole ===== */}
      {course("Aperitif", "Verse")}
      {verse.map((poem) => (
        <article key={poem.title} style={{ margin: "0 0 16pt" }}>
          <h3 style={{ fontFamily: DISPLAY, fontStyle: "italic", fontWeight: 500, fontSize: "14.5pt", color: P_INK, margin: "0 0 6pt" }}>{poem.title}</h3>
          {poem.stanzas.map((st, si) => (
            <p key={si} className="pm-stanza" style={{ whiteSpace: "pre-line", fontFamily: ITEM, fontSize: "11pt", lineHeight: 1.6, color: P_BODY, margin: "0 0 8pt" }}>{st}</p>
          ))}
        </article>
      ))}

      {/* ===== WORKS — the menu rows, with the detail plated under each ===== */}
      {course("Mains", "Works")}
      {works.map((w) => (
        <div key={w.id} className="pm-item" style={{ margin: "0 0 12pt" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: "6pt" }}>
            <span style={{ fontFamily: DISPLAY, fontSize: "13.5pt", color: P_INK }}>{w.name}</span>
            <span style={{ fontFamily: ITEM, fontStyle: "italic", fontSize: "10.5pt", color: P_STONE }}>{w.line}</span>
            {leader()}
            <span style={{ fontFamily: LABEL, fontSize: "9.5pt", color: P_OLIVE }}>{w.year}</span>
          </div>
          <p style={{ fontFamily: BODY, fontSize: "9.8pt", lineHeight: 1.6, color: P_BODY, margin: "3pt 0 0", maxWidth: "68ch" }}>{w.detail}</p>
        </div>
      ))}

      {/* ===== PHOTOGRAPHS — named, counted, not inked ===== */}
      {course("Plats", "Photographs")}
      {clusters.map((c) => (
        <div key={c.name} className="pm-item" style={{ display: "flex", alignItems: "baseline", gap: "6pt", margin: "0 0 6pt" }}>
          <span style={{ fontFamily: DISPLAY, fontSize: "12.5pt", color: P_INK }}>{c.name}</span>
          {leader()}
          <span style={{ fontFamily: LABEL, fontSize: "9.5pt", color: P_OLIVE }}>{c.count} frames</span>
        </div>
      ))}
      {aside("the prints hang at nathancurtis.to")}

      {/* ===== MUSIC — each release, full tracklist ===== */}
      {course("Digestif", "Music")}
      {music.map((rel) => (
        <div key={rel.id} className="pm-release" style={{ margin: "0 0 14pt" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: "6pt" }}>
            <span style={{ fontFamily: DISPLAY, fontSize: "13.5pt", color: P_INK }}>{rel.title}</span>
            <span style={{ fontFamily: LABEL, fontSize: "8.5pt", letterSpacing: "0.2em", textTransform: "uppercase", color: P_OLIVE }}>{rel.kind}</span>
            <span style={{ fontFamily: ITEM, fontStyle: "italic", fontSize: "10.5pt", color: P_STONE }}>{rel.note}</span>
          </div>
          <div style={{ margin: "4pt 0 0", paddingLeft: "10pt" }}>
            {rel.tracks.map((t) => (
              <div key={t.title} style={{ display: "flex", alignItems: "baseline", gap: "6pt", margin: "0 0 3pt" }}>
                <span style={{ fontFamily: ITEM, fontSize: "10.5pt", color: P_BODY }}>{t.title}</span>
                {leader()}
                <span style={{ fontFamily: LABEL, fontSize: "9pt", color: P_OLIVE }}>{t.length}</span>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* ===== WRITING — the card, not the full pour ===== */}
      {course("On the Side", "Writing")}
      {writings.map((p) => {
        const excerpt = p.body.replace(/^#.*$/gm, "").replace(/[#*`>-]/g, "").trim().slice(0, 150);
        return (
          <div key={p.slug} className="pm-item" style={{ margin: "0 0 10pt" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: "6pt" }}>
              <span style={{ fontFamily: DISPLAY, fontSize: "12.5pt", color: P_INK }}>{p.title}</span>
              {leader()}
              <span style={{ fontFamily: LABEL, fontSize: "8.5pt", letterSpacing: "0.12em", textTransform: "uppercase", color: P_OLIVE, whiteSpace: "nowrap" }}>{p.date} · {p.readTime}</span>
            </div>
            <p style={{ fontFamily: ITEM, fontStyle: "italic", fontSize: "10.5pt", color: P_STONE, margin: "2pt 0 0" }}>{excerpt}…</p>
          </div>
        );
      })}
      {aside("served in full at the house")}

      {/* ===== KITCHEN — the recipes in full; the cookable half of the artifact ===== */}
      {course("Dessert", "Kitchen")}
      {recipes.map((r) => (
        <article key={r.slug} className="pm-recipe" style={{ margin: "0 0 18pt" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: "6pt" }}>
            <span style={{ fontFamily: DISPLAY, fontSize: "14pt", color: P_INK }}>{r.title}</span>
            {leader()}
            {r.serves && <span style={{ fontFamily: LABEL, fontSize: "8.5pt", letterSpacing: "0.12em", textTransform: "uppercase", color: P_OLIVE }}>serves {r.serves}</span>}
          </div>
          {r.note && <p style={{ fontFamily: ITEM, fontStyle: "italic", fontSize: "10.5pt", color: P_STONE, margin: "2pt 0 6pt" }}>{r.note}</p>}
          <div style={{ maxWidth: "68ch" }}>{renderMarkdown(r.body)}</div>
        </article>
      ))}

      {/* ===== COLOPHON ===== */}
      <footer className="pm-item" style={{ marginTop: "30pt", paddingTop: "10pt", borderTop: `1px solid ${P_RULE}`, textAlign: "center" }}>
        <div style={{ fontFamily: DISPLAY, fontStyle: "italic", fontSize: "14pt", color: P_INK }}>Come hungry.</div>
        <img src="/sig.png" alt={identity.name} style={{ height: "44pt", display: "block", margin: "8pt auto 0", opacity: 0.92 }} />
        <div style={{ marginTop: "6pt", fontFamily: LABEL, fontSize: "8.5pt", letterSpacing: "0.26em", textTransform: "uppercase", color: P_OLIVE }}>
          printed for you · table for one · {today}
        </div>
      </footer>

      {/* the watermark — the house crow, barely there, riding every sheet */}
      <div aria-hidden style={{ position: "fixed", right: 0, bottom: 0, opacity: 0.07, pointerEvents: "none" }}>
        <Crow width={150} />
      </div>
    </div>
  );
}
