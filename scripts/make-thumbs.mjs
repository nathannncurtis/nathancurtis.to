// Bakes the small plates: one WebP thumbnail per photograph the album actually
// shows, into public/photos/thumb/. The full-size /photos/web/ jpegs stay
// exactly as they are — the lightbox still wants them at full strength.
//
// Run it by hand after adding or removing a photo row, then commit what it
// emits. Deliberately NOT wired into the build: CI stays a plain vite build
// with no image processing in the kitchen.
//
//   node scripts/make-thumbs.mjs
//
// Sources are read from data.ts's W() rows rather than from the directory,
// because more than a third of the files on disk are unreferenced leftovers
// and they don't get a plate.

import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "src", "concepts", "brand", "data.ts");
const FULL = join(ROOT, "public", "photos", "web");
const THUMB = join(ROOT, "public", "photos", "thumb");

// grid cells top out around 248px css wide, so 600px covers a 2x screen with
// room to spare. the panoramas are the exception: they lie across the page at
// min(820px,100%), and a 600px source would go soft at that size.
const GRID_W = 600;
const PANO_W = 1000;
const QUALITY = 80;

const bytes = (n) => `${n.toLocaleString("en-US")} bytes`;

const src = await readFile(DATA, "utf8");
// one row per line in data.ts; `ratio:` on the row means it's a panorama
const wanted = [];
for (const line of src.split(/\r?\n/)) {
  const m = line.match(/src:\s*W\("([^"]+)"\)/);
  if (!m) continue;
  wanted.push({ base: m[1], width: /\bratio:\s*[\d.]/.test(line) ? PANO_W : GRID_W });
}
if (!wanted.length) throw new Error("no W(...) rows found in data.ts — did the helper move?");

const seen = new Set();
for (const { base } of wanted) {
  if (seen.has(base)) throw new Error(`${base} is referenced twice in data.ts`);
  seen.add(base);
}

await mkdir(THUMB, { recursive: true });

let fullTotal = 0;
let thumbTotal = 0;
let thumbMax = { base: "", size: 0 };

for (const { base, width } of wanted) {
  const from = join(FULL, `${base}.jpg`);
  const to = join(THUMB, `${base}.webp`);
  const before = (await stat(from)).size;
  const out = await sharp(from).resize({ width, withoutEnlargement: true }).webp({ quality: QUALITY }).toBuffer();
  await writeFile(to, out);
  fullTotal += before;
  thumbTotal += out.length;
  if (out.length > thumbMax.size) thumbMax = { base, size: out.length };
  console.log(`${base.padEnd(26)} ${String(before).padStart(8)} -> ${String(out.length).padStart(7)}  (${width}px)`);
}

// anything left in thumb/ that no row asks for is stale — say so rather than
// quietly deleting someone else's file
const orphans = (await readdir(THUMB)).filter((f) => f.endsWith(".webp") && !seen.has(f.replace(/\.webp$/, "")));

console.log(`\n${wanted.length} photographs referenced by data.ts`);
console.log(`originals   ${bytes(fullTotal)}  (avg ${bytes(Math.round(fullTotal / wanted.length))})`);
console.log(`thumbnails  ${bytes(thumbTotal)}  (avg ${bytes(Math.round(thumbTotal / wanted.length))}, max ${thumbMax.base} at ${bytes(thumbMax.size)})`);
console.log(`grid path is ${(100 - (thumbTotal / fullTotal) * 100).toFixed(1)}% lighter`);
if (orphans.length) console.log(`\nstale thumbnails, no longer referenced: ${orphans.join(", ")}`);
