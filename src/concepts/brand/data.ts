// Shared content for the rebrand. Real content across mediums.

export const identity = {
  name: "Nathan Curtis",
  initials: "NC",
  est: "MMXXIV",
  tagline: "Pictures, poems, songs, software, and the odd good meal.",
  taglines: [
    "Pictures, poems, songs, software, and the odd good meal.",
    "I make things. Some you read, some you hear, some you run.",
    "A maker across mediums.",
  ],
  bio:
    "I make things across whatever medium holds my attention: photographs, poems, essays, music, software, the occasional ambitious dinner. This is all of it, in one place.",
};

export interface Facet {
  key: string;
  label: string;
  blurb: string;
  count: string;
}

export const facets: Facet[] = [
  { key: "works", label: "Works", blurb: "Things I've built that quietly work.", count: "7 projects" },
  { key: "verse", label: "Verse", blurb: "Poems, mostly about water and weather.", count: "4 poems" },
  { key: "photographs", label: "Photographs", blurb: "Light, caught and kept.", count: "38 frames" },
  { key: "writing", label: "Writing", blurb: "Essays and field notes.", count: "12 pieces" },
  { key: "music", label: "Music", blurb: "Songs and sounds I've made.", count: "1 EP, 2 singles" },
  { key: "kitchen", label: "Kitchen", blurb: "Dinners worth repeating.", count: "3 recipes" },
  { key: "next", label: "& Next", blurb: "Whatever I get into next.", count: "ongoing" },
];

// ── Photographs ────────────────────────────────────────────────────────────
export interface Photo {
  id: string;
  title: string;
  year: string;
  aspect: "3/4" | "4/3" | "1/1" | "16/9" | "4/5";
  collection: string;
  sub?: string; // sub-section within a collection (e.g. "The Lights")
  src: string;
  ratio?: number; // explicit width/height for panoramas (shown uncropped)
  tone: [string, string];
}

export const photoCollections = ["Alaska", "Greece", "The West", "Stray Frames"];

const PHOTO_TONE: Record<string, [string, string]> = {
  Alaska: ["#5f8a7a", "#10181a"],
  Greece: ["#9a8f78", "#352f25"],
  "The West": ["#b07a52", "#3a261a"],
  "Stray Frames": ["#7c8a86", "#222826"],
};

const W = (base: string) => `/photos/web/${base}.jpg`;

const photoRows: Omit<Photo, "tone">[] = [
  // Alaska · The Lights (aurora, April 2023) — six chosen of the night
  { id: "slow-turning", title: "Slow Turning", year: "2023", aspect: "3/4", collection: "Alaska", sub: "The Lights", src: W("slow-turning") },
  { id: "cathedral", title: "Cathedral", year: "2023", aspect: "4/3", collection: "Alaska", sub: "The Lights", src: W("cathedral") },
  { id: "green-tide", title: "Green Tide", year: "2023", aspect: "3/4", collection: "Alaska", sub: "The Lights", src: W("green-tide") },
  { id: "single-thread", title: "A Single Thread", year: "2023", aspect: "3/4", collection: "Alaska", sub: "The Lights", src: W("single-thread") },
  { id: "nightwatch", title: "Nightwatch", year: "2023", aspect: "3/4", collection: "Alaska", sub: "The Lights", src: W("nightwatch") },
  { id: "lone-spruce", title: "Lone Spruce", year: "2023", aspect: "4/3", collection: "Alaska", sub: "The Lights", src: W("lone-spruce") },
  // Alaska · the daylight that held it
  { id: "snowbound-valley", title: "Snowbound Valley", year: "2023", aspect: "16/9", collection: "Alaska", src: W("IMG_8040") },
  { id: "winter-dusk", title: "Winter Dusk", year: "2023", aspect: "4/3", collection: "Alaska", src: W("IMG_8044") },
  { id: "yukon-whites", title: "Yukon Whites", year: "2023", aspect: "4/3", collection: "Alaska", src: W("IMG_8076") },
  // Greece, spring 2025
  { id: "odeon", title: "Odeon of Herodes Atticus", year: "2025", aspect: "3/4", collection: "Greece", src: W("IMG_0645") },
  { id: "athens-above", title: "Athens From Above", year: "2025", aspect: "3/4", collection: "Greece", src: W("IMG_0680") },
  { id: "roofs-of-athens", title: "Roofs of Athens", year: "2025", aspect: "4/3", collection: "Greece", src: W("IMG_0681") },
  { id: "lycabettus", title: "Lycabettus Hill", year: "2025", aspect: "4/3", collection: "Greece", src: W("IMG_0685") },
  { id: "caryatid", title: "Caryatid of the Erechtheion", year: "2025", aspect: "3/4", collection: "Greece", src: W("IMG_0715") },
  { id: "corinth-canal", title: "Corinth Canal", year: "2025", aspect: "3/4", collection: "Greece", src: W("IMG_0748") },
  { id: "mycenae", title: "Mycenae", year: "2025", aspect: "4/3", collection: "Greece", src: W("IMG_0758") },
  { id: "citadel-mycenae", title: "Citadel of Mycenae", year: "2025", aspect: "16/9", collection: "Greece", src: W("IMG_0764") },
  { id: "mycenae-overlook", title: "Mycenae Overlook", year: "2025", aspect: "4/3", collection: "Greece", src: W("IMG_0770") },
  { id: "greek-colors", title: "Greek Colors", year: "2025", aspect: "3/4", collection: "Greece", src: W("IMG_0828") },
  { id: "the-tholos", title: "The Tholos, Delphi", year: "2025", aspect: "3/4", collection: "Greece", src: W("IMG_0884") },
  { id: "olympia-spring", title: "Olympia in Spring", year: "2025", aspect: "4/3", collection: "Greece", src: W("IMG_0889") },
  { id: "stone-lane", title: "Stone Lane", year: "2025", aspect: "3/4", collection: "Greece", src: W("IMG_1051") },
  { id: "cloud-country", title: "Cloud Country", year: "2025", aspect: "4/3", collection: "Greece", src: W("IMG_0766") },
  { id: "hermes", title: "Hermes of Praxiteles", year: "2025", aspect: "3/4", collection: "Greece", src: W("IMG_0947") },
  { id: "draped-marble", title: "Draped Marble", year: "2025", aspect: "3/4", collection: "Greece", src: W("IMG_0956") },
  { id: "seated-marble", title: "Seated in Marble", year: "2025", aspect: "3/4", collection: "Greece", src: W("IMG_0637") },
  // The West — desert & canyon (panoramas shown full)
  { id: "canyonlands-dawn", title: "Canyonlands Dawn", year: "2017", aspect: "16/9", collection: "The West", src: W("PANO_20170717_062243-02"), ratio: 4.23 },
  { id: "red-rock-road", title: "Red Rock Road", year: "2017", aspect: "16/9", collection: "The West", src: W("PANO_20170719_133054"), ratio: 4.88 },
  { id: "sun-over-canyon", title: "Sun Over the Canyon", year: "2024", aspect: "3/4", collection: "The West", src: W("IMG_9553") },
  // Stray Frames
  { id: "drifting-medusa", title: "Drifting Medusa", year: "2024", aspect: "3/4", collection: "Stray Frames", src: W("IMG_0192") },
  { id: "blue-macaw", title: "Blue Macaw", year: "2022", aspect: "3/4", collection: "Stray Frames", src: W("IMG_7376") },
  { id: "harbor-lights", title: "Harbor Lights", year: "2022", aspect: "3/4", collection: "Stray Frames", src: W("IMG_7373") },
  { id: "old-growth", title: "Old Growth", year: "2023", aspect: "3/4", collection: "Stray Frames", src: W("IMG_8206") },
  { id: "clear-shallows", title: "Clear Shallows", year: "2023", aspect: "3/4", collection: "Stray Frames", src: W("IMG_8209") },
  { id: "throne-in-the-woods", title: "Throne in the Woods", year: "2023", aspect: "3/4", collection: "Stray Frames", src: W("IMG_8205") },
  { id: "campground-fireworks", title: "Campground Fireworks", year: "2024", aspect: "3/4", collection: "Stray Frames", src: W("IMG_9208") },
  { id: "alcatraz-steps", title: "Alcatraz Steps", year: "2022", aspect: "3/4", collection: "Stray Frames", src: W("IMG_7369") },
  { id: "the-rock", title: "The Rock", year: "2022", aspect: "4/3", collection: "Stray Frames", src: W("IMG_7370") },
];

export const photos: Photo[] = photoRows.map((r) => ({
  ...r,
  tone: PHOTO_TONE[r.collection] ?? ["#6f6a60", "#221f1b"],
}));

// ── Verse — full poems, with room for analysis ─────────────────────────────
export interface Verse {
  title: string;
  stanzas: string[]; // each stanza is a multi-line string ("\n" separated)
  analysis?: string;
}

export const verse: Verse[] = [
  {
    title: "Burnt Orange",
    stanzas: [
      "the leaves were always changing,\nburnt orange, a hue that danced, then drifted,\none — a single leaf, swayed, paused,\nbefore resting gently on the ground,\nlike a whisper of what's yet to come.",
      "the seasons shifted, silent, slow,\nautumn blending into winter's grasp.\nyet, there's warmth in the cold,\na hidden ember beneath the frost,\na quiet spring waiting, just out of reach.",
      "a crow, calm, lands on a powerline,\nperched in quiet contemplation,\nits black feathers sharp against the soft orange sky,\na fleeting moment, like our first hello,\nbut lasting — etched in memory.",
      "carefully, calmly, the crow contemplates,\nclawed feet clutching the cold cable,\nas we navigate this path,\nsubtle moments of almost-rhyme,\nbut don't, and that's just right.",
      "the wind, it whispers —\ncarrying us forward, gently,\nthrough seasons, through change.\nthe leaf falls again, but not forgotten,\ntransforming, as we have,\nin every smile, every shared glance —\nalmost like that crow, watching,\nfrom its wire, as we navigate this path.",
      "and now, as the crow takes flight,\nthe burnt orange fades into something new,\nsomething we're still discovering, together,\nin this ever-changing season of friendship.",
    ],
  },
  {
    title: "Scent of Salt",
    stanzas: [
      "Too deep —\nbarely breathing.\nCursed to swim,\nnot float.",
      "Current pulls —\nfurther,\ndeeper,\nThe shore whispers,\nhorizon taunts.",
      "Soon to sink.\nTo drown.",
      "I am a wick —\nforced to burn,\ndoomed to smother.",
      "Haunted by breath —\nthat clogs, not clears.",
      "Lungs will fill —\nwith smoke or salt.\nFull.",
      "Waves don't wait\nfor sand or stone.\nTreading's for survival —\nnot life.",
      "Arms, soon to give.\nLegs will quit.\nThe sea will take me.",
      "A body once known,\nturned depths lurking.\nThe salt will claim me.",
    ],
  },
  {
    title: "Routine in Green",
    stanzas: [
      "Click click —\nthe mint approaches.\nA simple feeling:\nan ache masked in flavor.",
      "Click click —\nthe tube running low,\na soft charade\nof bliss.",
      "The temptation of tongue,\nthe dread of the teeth.\nClick click —\nno twist left —\nwasting.",
      "As the lips cry their wear,\nthe thumb plays that rhythm.\nClick click —\nthe relief dwindles.",
      "Balm seals the creases —\na crack no more.\nAs the click click\ngrows distant.",
      "A cheap motion,\nin object, in cost.\nA purpose: routine —\na callous click click.",
      "For the green distracts,\nthe mint soothes the pain.\nClick click —\njust for me.",
    ],
  },
  {
    title: "Rings, Not Stories",
    stanzas: [
      "Still walking.\nTo what —\nto where?\nIt's unbecoming;\njust walking.",
      "The leaves rustle,\nthe humidity just so.\nThere —\na shadow scurries across the path.",
      "Just a rat —\na mouse maybe.\nHurriedly running from a faint flutter —\na whisper of wings —\na \"who\" echoes — alone.",
      "Pine muddles the senses.\nThe wind\nshouting from the valley afar.",
      "For the trees:\nthey're listening — laughing.",
      "But they do not speak,\nnor cast judgment.\nFor they cannot\nwith their lungs filled with sap.",
      "They cannot breathe alone,\nyet they persevere all the same.\nFor their yearning's not for novels —\nbut for rings.",
      "While the granite lies again exposed,\nand the moss now looks west.\nAnd the trees still chuckle,\nwith a new grin on the same grain.",
      "Now the branches feel like family,\nand all the timber gathers near.\nThe trees continue dancing —\nlike they always do.",
      "\"Have I seen that one before?\"",
    ],
  },
];

// Attach each poem's explication (long-form analysis) from src/content/explications/<slug>.md
const explicationFiles = import.meta.glob("../../content/explications/*.md", { query: "?raw", eager: true }) as Record<string, { default: string }>;
const explications: Record<string, string> = {};
for (const [path, mod] of Object.entries(explicationFiles)) {
  const slug = (path.split("/").pop() || "").replace(/\.md$/, "");
  explications[slug] = mod.default;
}
for (const v of verse) {
  const a = explications[slugify(v.title)];
  if (a) v.analysis = a;
}

// Hand-curated marginalia (one pass per poem from its explication): lines to
// highlight in the poem, with a few short handwritten margin notes.
export interface PoemAnnotation {
  line: string;
  note?: string;
}
export const poemAnnotations: Record<string, PoemAnnotation[]> = {
  "Burnt Orange": [
    { line: "one — a single leaf, swayed, paused,", note: "the love, and her. both." },
    { line: "a quiet spring waiting, just out of reach.", note: "weather openly wanting. the tell." },
    { line: "its black feathers sharp against the soft orange sky,", note: "the intruder. me, watching." },
    { line: "but don't, and that's just right.", note: "her word. just write." },
    { line: "in this ever-changing season of friendship.", note: "the lie i left in" },
  ],
  "Scent of Salt": [
    { line: "Cursed to swim,", note: "the spine. an identity, not an event" },
    { line: "doomed to smother.", note: "fire word, water work" },
    { line: "with smoke or salt.", note: "not two options — unknowable" },
    { line: "Treading's for survival —" },
    { line: "turned depths lurking.", note: "the call's from inside" },
    { line: "The salt will claim me." },
  ],
  "Routine in Green": [
    { line: "an ache masked in flavor.", note: "green is camouflage" },
    { line: "the dread of the teeth.", note: "tongue strikes teeth to say it" },
    { line: "wasting.", note: "tube, me, the time — all three" },
    { line: "Balm seals the creases —", note: "bomb in the balm" },
    { line: "a crack no more." },
    { line: "just for me." },
  ],
  "Rings, Not Stories": [
    { line: "It's unbecoming;", note: "un-becoming. stuck in -ing" },
    { line: 'a "who" echoes — alone.', note: "not the bird — the question" },
    { line: "Pine muddles the senses.", note: "the disease, named: wanting" },
    { line: "with their lungs filled with sap." },
    { line: "but for rings.", note: "novel = die into it" },
    { line: '"Have I seen that one before?"' },
  ],
};

// ── Works — with detail + links ────────────────────────────────────────────
export interface Work {
  id: string;
  name: string;
  line: string;
  year: string;
  detail: string;
  tags: string[];
  link?: { label: string; href: string };
  featured?: boolean;
}

export const works: Work[] = [
  {
    id: "steddi",
    name: "Steddi",
    line: "An iOS navigation app for daily commuters.",
    year: "2026",
    featured: true,
    detail:
      "Built from scratch in Swift and SwiftUI with MapKit. No third-party map SDKs, no branding, no compromises. It learns your routes and only reroutes when it actually matters, with sunset-synced themes, weather-reactive UI, haptics tuned to turns, and CarPlay support. Privacy-first and offline-ready.",
    tags: ["Swift", "SwiftUI", "MapKit", "CarPlay"],
    link: { label: "steddi.io", href: "https://steddi.io" },
  },
  {
    id: "mdview",
    name: "mdview",
    line: "A native, cross-platform markdown viewer.",
    year: "2026",
    detail:
      "Most markdown viewers ship a whole browser engine to render a few hundred lines of text. mdview doesn't: native text rendering on each platform (DirectWrite, Cairo, CoreText), no webview, no runtime, in a single ~285KB binary. File watching, syntax highlighting, scroll memory, drag and drop.",
    tags: ["Zig", "DirectWrite", "Cairo", "CoreText"],
    link: { label: "GitHub", href: "https://github.com/nathannncurtis/mdview-zig" },
  },
  {
    id: "study-aggregator",
    name: "Study Aggregator",
    line: "A DICOM engine that makes slow work disappear.",
    year: "2026",
    detail:
      "The parsing hot path rewritten as a native Rust engine, called by subprocess from the existing PyQt GUI. Zero-copy memory-mapped parsing, parallel directory walks, streaming ZIP extraction. Multi-minute jobs now finish in seconds, roughly 100 to 400 times faster, and it reads the malformed DICOMs the old version couldn't touch.",
    tags: ["Rust", "Python", "DICOM", "rayon"],
    link: { label: "GitHub", href: "https://github.com/nathannncurtis/Study-Aggregator" },
  },
  {
    id: "coil",
    name: "Coil",
    line: "Turning ideas into things you can hold.",
    year: "2026",
    detail:
      "A Python-to-executable compiler with a custom C bootloader that loads an embedded Python runtime and launches the app. It auto-detects dependencies and bundles everything into a standalone directory or portable .exe. No spec files, no hook scripts, no cryptic errors. Published on PyPI.",
    tags: ["C", "Python", "PyPI"],
    link: { label: "GitHub", href: "https://github.com/nathannncurtis/coil" },
  },
  {
    id: "commit-summarizer",
    name: "Commit Summarizer",
    line: "Plain-English notes on what changed, kept in-house.",
    year: "2026",
    detail:
      "A webhook that verifies GitHub push events, pipes the commit metadata through a local Ollama model, and posts a plain-English summary to Slack. Runs entirely on-prem, so non-engineers get visibility and nothing leaves the network.",
    tags: ["Python", "Ollama", "Self-hosted"],
    link: { label: "GitHub", href: "https://github.com/nathannncurtis/commit-summarizer" },
  },
  {
    id: "obsidian-vault-sync",
    name: "Obsidian Vault Sync",
    line: "Notes that follow you, no subscription.",
    year: "2026",
    detail:
      "Self-hosted, real-time Obsidian sync: a FastAPI server that stores the vault and pushes changes over WebSocket, and a TypeScript plugin that subscribes. Token auth, file-hash reconciliation, a Dockerized server. Runs on a home box and keeps vaults in sync with no third party in the loop.",
    tags: ["TypeScript", "FastAPI", "WebSocket", "Docker"],
    link: { label: "GitHub", href: "https://github.com/nathannncurtis/obsidian-vault-sync" },
  },
  {
    id: "file-processor",
    name: "File Processor",
    line: "Twenty million pages, handled without fuss.",
    year: "2025",
    detail:
      "A network-aware batch converter with a PyQt GUI, a configurable job queue, automatic CPU-core rebalancing, and error recovery. It runs daily in production and has processed over twenty million pages across PDF, TIFF, and JPEG pipelines.",
    tags: ["Python", "PyQt5", "Multiprocessing"],
    link: { label: "GitHub", href: "https://github.com/nathannncurtis/File-Processor" },
  },
];

// ── Music — the fEAR oF gOD EP + singles ───────────────────────────────────
export interface Track {
  title: string;
  length: string;
  src: string;
}

export interface Release {
  id: string;
  title: string;
  kind: "EP" | "Single";
  note: string;
  cover?: string;
  tracks: Track[];
}

export const music: Release[] = [
  {
    id: "fear-of-god",
    title: "fEAR oF gOD",
    kind: "EP",
    note: "A live EP.",
    cover: "/music/falling-down.jpg",
    tracks: [
      { title: "cRYING lOUDLY", length: "4:12", src: "/music/crying-loudly.mp3" },
      { title: "fALLING dOWN", length: "2:01", src: "/music/falling-down.mp3" },
      { title: "fALSE hARMONIES", length: "1:25", src: "/music/false-harmonies.mp3" },
      { title: "her", length: "2:46", src: "/music/her.mp3" },
      { title: "sAYING nOTHING", length: "1:30", src: "/music/saying-nothing.mp3" },
      { title: "sWING / / sET", length: "3:17", src: "/music/swing-set.mp3" },
    ],
  },
  {
    id: "before",
    title: "Before",
    kind: "Single",
    note: "A single.",
    tracks: [{ title: "Before", length: "4:02", src: "/music/before.mp3" }],
  },
  {
    id: "terror",
    title: "Terror",
    kind: "Single",
    note: "A single.",
    cover: "/music/terror.jpg",
    tracks: [{ title: "Terror", length: "2:56", src: "/music/terror.mp3" }],
  },
];

// ── Markdown loader (writings + recipes) ───────────────────────────────────
function splitFrontmatter(raw: string): { meta: Record<string, string>; body: string } | null {
  const normalized = raw.replace(/\r\n/g, "\n");
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return null;
  const meta: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    meta[key] = val;
  }
  return { meta, body: match[2].trim() };
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "untitled";
}

export interface Writing {
  slug: string;
  title: string;
  date: string;
  year: string;
  readTime: string;
  tags: string[];
  body: string;
  order: number;
}

const writingFiles = import.meta.glob("../../content/writing/*.md", { query: "?raw", eager: true }) as Record<string, { default: string }>;

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
function dateRank(date: string): number {
  const parts = date.split(" ");
  const month = MONTHS.indexOf(parts[0]);
  const year = Number(parts[parts.length - 1]) || 0;
  return year * 12 + (month >= 0 ? month : 0);
}

export const writings: Writing[] = Object.values(writingFiles)
  .map((m) => {
    const fm = splitFrontmatter(m.default);
    if (!fm) return null;
    const { meta, body } = fm;
    const title = meta.title || "Untitled";
    const date = meta.date || "";
    let tags: string[] = [];
    const tm = m.default.match(/tags:\s*\[([^\]]*)\]/);
    if (tm) tags = tm[1].split(",").map((t) => t.trim().replace(/"/g, "")).filter(Boolean);
    return {
      slug: slugify(title), title, date, year: date.split(" ").pop() || "",
      readTime: meta.readTime || "", tags, body, order: meta.order ? Number(meta.order) : 999,
    } as Writing;
  })
  .filter((w): w is Writing => w !== null)
  .sort((a, b) => { const d = dateRank(b.date) - dateRank(a.date); return d !== 0 ? d : a.order - b.order; });

export interface Recipe {
  slug: string;
  title: string;
  note: string;
  serves: string;
  body: string;
}

const recipeFiles = import.meta.glob("../../content/recipes/*.md", { query: "?raw", eager: true }) as Record<string, { default: string }>;

export const recipes: Recipe[] = Object.values(recipeFiles)
  .map((m) => {
    const fm = splitFrontmatter(m.default);
    if (!fm) return null;
    const { meta, body } = fm;
    return { slug: slugify(meta.title || "Untitled"), title: meta.title || "Untitled", note: meta.note || "", serves: meta.serves || "", body } as Recipe;
  })
  .filter((r): r is Recipe => r !== null)
  .sort((a, b) => a.title.localeCompare(b.title));
