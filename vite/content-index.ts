import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Plugin, ViteDevServer } from "vite";
import { excerptOf, parseTags, slugify, splitFrontmatter } from "../src/content/frontmatter";

// THE CONTENT INDEX — the menu, not the meal.
//
// The essays used to ride into the first JS chunk in full: an eager
// import.meta.glob inlined all 64 writings, 4 explications and 3 recipes, so
// every first-time visitor downloaded ~455 kB of markdown to read none of it.
//
// This reads the same files at build and in dev and hands the app only what a
// closed menu row needs — title, date, read time, tags, and an excerpt cut
// with the same knife the page used to cut it with at runtime. The bodies stay
// behind a lazy glob in src/concepts/brand/data.ts, one chunk each, fetched
// when a guest actually orders something.
//
// Nothing is checked in, so nothing can drift: the index is read from the
// markdown on every build and re-read on every dev-server change. Keep the
// emitted shapes in step with src/virtual-content.d.ts.

const VIRTUAL_ID = "virtual:content-index";
const RESOLVED_ID = "\0" + VIRTUAL_ID;

const CONTENT = "src/content";
const DIRS = ["writing", "recipes", "explications"];

interface MarkdownFile {
  file: string;
  abs: string;
  raw: string;
}

function readDir(root: string, dir: string): MarkdownFile[] {
  const abs = path.resolve(root, CONTENT, dir);
  return readdirSync(abs)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((file) => ({ file, abs: path.join(abs, file), raw: readFileSync(path.join(abs, file), "utf8") }));
}

function buildIndex(root: string): { code: string; files: string[] } {
  const files: string[] = [];
  const seen = (m: MarkdownFile) => { files.push(m.abs); return m; };

  // writings: the row plus its excerpt. A file with no frontmatter is skipped,
  // same as the runtime loader used to skip it.
  const writingIndex = readDir(root, "writing").map(seen).flatMap((m) => {
    const fm = splitFrontmatter(m.raw);
    if (!fm) return [];
    const title = fm.meta.title || "Untitled";
    const date = fm.meta.date || "";
    return [{
      slug: slugify(title),
      file: m.file,
      title,
      date,
      year: date.split(" ").pop() || "",
      readTime: fm.meta.readTime || "",
      tags: parseTags(m.raw),
      excerpt: excerptOf(fm.body),
      order: fm.meta.order ? Number(fm.meta.order) : 999,
    }];
  });

  const recipeIndex = readDir(root, "recipes").map(seen).flatMap((m) => {
    const fm = splitFrontmatter(m.raw);
    if (!fm) return [];
    return [{
      slug: slugify(fm.meta.title || "Untitled"),
      file: m.file,
      title: fm.meta.title || "Untitled",
      note: fm.meta.note || "",
      serves: fm.meta.serves || "",
    }];
  });

  // an explication is claimed by filename — <slug-of-poem-title>.md
  const explicationIndex = readDir(root, "explications").map(seen).map((m) => ({
    slug: m.file.replace(/\.md$/, ""),
    file: m.file,
  }));

  const code = [
    `export const writingIndex = ${JSON.stringify(writingIndex)};`,
    `export const recipeIndex = ${JSON.stringify(recipeIndex)};`,
    `export const explicationIndex = ${JSON.stringify(explicationIndex)};`,
  ].join("\n");
  return { code, files };
}

export function contentIndex(): Plugin {
  let root = process.cwd();
  return {
    name: "nc:content-index",
    configResolved(config) {
      root = config.root;
    },
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : null;
    },
    load(id) {
      if (id !== RESOLVED_ID) return null;
      const { code, files } = buildIndex(root);
      for (const f of files) this.addWatchFile(f); // so `build --watch` notices a new essay
      return code;
    },
    configureServer(server: ViteDevServer) {
      // in dev the index is a module the server has already handed out; a new,
      // edited or deleted essay makes it stale
      const restock = (file: string) => {
        const p = file.replace(/\\/g, "/");
        if (!p.endsWith(".md") || !p.includes(`/${CONTENT}/`)) return;
        const mod = server.moduleGraph.getModuleById(RESOLVED_ID);
        if (mod) server.moduleGraph.invalidateModule(mod);
        server.hot.send({ type: "full-reload" });
      };
      for (const dir of DIRS) server.watcher.add(path.resolve(root, CONTENT, dir));
      server.watcher.on("add", restock);
      server.watcher.on("change", restock);
      server.watcher.on("unlink", restock);
    },
  };
}
