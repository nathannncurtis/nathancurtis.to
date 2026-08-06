// The one knife the markdown is cut with. Two kitchens use it: the browser
// (which strips frontmatter off a body it fetched) and the build-time content
// index in vite/content-index.ts (which cuts the excerpt shown on a closed
// menu row). The excerpt is baked at build and the body it came from arrives
// later, so if the two ever parsed differently they'd drift apart silently.

export interface Frontmatter {
  meta: Record<string, string>;
  body: string;
}

export function splitFrontmatter(raw: string): Frontmatter | null {
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

// tags are the one list-valued key, read straight off the raw text
export function parseTags(raw: string): string[] {
  const tm = raw.match(/tags:\s*\[([^\]]*)\]/);
  if (!tm) return [];
  return tm[1].split(",").map((t) => t.trim().replace(/"/g, "")).filter(Boolean);
}

export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "untitled";
}

// what a closed row shows: the first ~150 characters of prose with the
// markdown scrubbed off
export function excerptOf(body: string): string {
  return body.replace(/^#.*$/gm, "").replace(/[#*`>-]/g, "").trim().slice(0, 150);
}

// the body as the page renders it. The explications carry no frontmatter, so
// they come through whole — normalized, because a CRLF checkout would
// otherwise hide every paragraph break from the renderer.
export function markdownBody(raw: string): string {
  const fm = splitFrontmatter(raw);
  return fm ? fm.body : raw.replace(/\r\n/g, "\n").trim();
}
