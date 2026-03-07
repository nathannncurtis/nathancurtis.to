---
tags: [project, html, css, github-pages, portfolio, nextjs, redesign]
repo: https://github.com/nathannncurtis/nathancurtis.to
updated: 2026-03-07
language: HTML, TypeScript
---
# nathancurtis.to

## Overview

Personal portfolio website for Nathan Curtis, live at [nathancurtis.to](https://nathancurtis.to/). A static, multi-page site that presents professional identity, projects, resume, poetry, and legal pages. Built entirely with hand-written HTML, CSS, and minimal JavaScript — no frameworks, no build tools, no bundlers. Hosted on GitHub Pages with a custom domain via CNAME.

The site positions Nathan as a Process Development Specialist who works across automation, infrastructure, production hardware, and cross-departmental workflow design. It showcases both open-source projects (with GitHub links) and sanitized proprietary case studies. It also includes a poetry section with three original poems and legal pages (privacy policy and terms) required for a Twilio A2P 10DLC "Morning Briefing" SMS campaign.

## Tech Stack

| Technology | Role | Notes |
|---|---|---|
| **HTML5** | Page structure | 7 hand-written pages, semantic markup |
| **CSS3** | Styling | Single `style.css` (15KB), CSS custom properties, grid/flexbox, animations, responsive breakpoints |
| **JavaScript** | Interactivity | Minimal — mobile nav toggle only (~492 bytes) |
| **Google Fonts** | Typography | Inter (sans-serif, weights 400–700) for UI; Lora (serif, regular + italic) for poetry |
| **Python (fpdf2)** | Resume PDF generation | `generate_resume.py` builds `assets/resume.pdf` programmatically |
| **Python (Pillow)** | Favicon generation | `generate_favicon.py` creates favicon PNGs with the letter "N" in accent blue |
| **GitHub Pages** | Hosting | Serves from root of `main` branch, HTTPS enforced |
| **Custom Domain** | DNS | `nathancurtis.to` via CNAME file |

No package.json, no node_modules, no build step. The Python scripts are one-off generators for static assets, not part of a build pipeline.

## Architecture

This is a flat, multi-page static site. No routing, no templating, no SSG. Each page is a standalone HTML file that shares the same nav, footer, video background, and stylesheet.

### Directory Structure

```
/
├── index.html              # Landing page — hero, capability domains, selected projects
├── projects.html           # 4 open-source projects + 2 operational case studies
├── resume.html             # Summary, experience, capability domains, PDF download
├── about.html              # Professional narrative + personal section
├── poetry.html             # 3 poems in responsive grid
├── privacy-policy.html     # Twilio A2P 10DLC compliance
├── terms.html              # Twilio A2P 10DLC compliance
├── css/
│   └── style.css           # All styles — 15KB, CSS custom properties throughout
├── js/
│   └── main.js             # Mobile nav toggle only
├── assets/
│   ├── bg.mp4              # Background video loop (~4MB)
│   ├── resume.pdf          # Downloadable resume
│   ├── favicon-32x32.png   # Browser favicon
│   └── apple-touch-icon.png # Apple touch icon (180x180)
├── generate_resume.py      # Python script to regenerate resume PDF
├── generate_favicon.py     # Python script to regenerate favicon PNGs
├── scent-of-salt.txt       # Poem source text
├── routine-in-green.txt    # Poem source text
├── rings-not-stories.txt   # Poem source text
├── progress.md             # Internal build log / design decisions
├── CNAME                   # Custom domain for GitHub Pages
└── README.md               # Basic project description
```

### Design Pattern

Every page follows the same structure:
1. Sticky frosted-glass nav bar (blur + transparency)
2. Fixed-position background video with dark overlay (`rgba(9, 9, 11, 0.72)`)
3. Content area with left-aligned, full-width layout
4. Footer with email, GitHub, and Instagram links

The video background uses `position: fixed` with negative `z-index` so it sits behind all content regardless of container stacking context — this was a deliberate fix after the video rendered in-flow on GitHub Pages deployed builds.

### Design System (CSS Custom Properties)

- Background: `#09090b` (near-black)
- Surface: `#131316` (cards, elevated elements)
- Accent: `#5b9fc0` (muted blue — links, highlights, tags)
- Secondary accent: `#7c6fb0` (purple — used in gradients with primary accent)
- Text: `#ececef` (primary), `#a0a0ab` (secondary), `#52525a` (muted)
- Typography: Inter sans-serif for everything, Lora serif for poetry only
- Content measure: 60ch default, 90ch on the about page
- Horizontal padding: 3.5rem desktop, 1.25rem mobile

## Key Files

### `index.html`
The landing page. Contains the hero section with name, professional tagline ("Process Development · Automation · Systems & Infrastructure · Technical Operations"), a one-paragraph intro, and two CTA buttons (View Projects, Get in Touch). Below the hero: a "What I Work Across" section with 5 capability domain cards (Automation & Workflows, Systems & Infrastructure, Production Hardware, Tooling & Interfaces, Technical Operations), then a "Selected Projects" grid showing 4 project cards (Coil, Feather, File Processor, Study Aggregator) linking to anchors on the projects page.

### `projects.html`
Four open-source project writeups in problem/approach/outcome format, each with tech tags and GitHub links: Coil (Python-to-exe compiler), Feather (image optimizer), File Processor (batch PDF/TIFF/JPEG converter), Study Aggregator (DICOM medical imaging processor). Below that, an "Operational Case Studies" section with two sanitized descriptions of proprietary work: a Document Processing Automation System and a Production Environment Stabilization project. Case studies have `<!-- UPDATE -->` comments marking where specific metrics should be added later.

### `resume.html`
Online resume with a PDF download link. Contains a summary, a single experience entry ("Process Development Specialist — Litigation Support Company · Current") with 8 bullet points in a 2-column layout, and 5 capability domain cards matching the homepage domains. No education section.

### `about.html`
Two sections: "What I Do" (professional narrative about cross-layer operations role) and "Beyond Work" (poetry and music). Text measure widened to 90ch via `.about-content p` override.

### `poetry.html`
Three poems displayed in a responsive CSS grid (`auto-fit minmax(300px, 1fr)`, max 4 per row): "Scent of Salt," "Routine in Green," and "Rings, Not Stories." Each poem is in a card with a left accent border that highlights on hover. Poetry uses Lora serif font. The `.txt` source files for each poem are also in the repo root.

### `privacy-policy.html` and `terms.html`
Legal pages for Twilio A2P 10DLC compliance. Describe "Morning Briefing" — a personal automated SMS service sending daily news summaries and commute info. Privacy policy states no third-party data collection. Terms specify up to 5 messages/week on weekday mornings with STOP/HELP keywords.

### `css/style.css`
The entire design in one file (~15KB). Organized in sections: reset, typography, navigation (sticky frosted glass), layout, buttons, hero (video background + glow effect), sections, project grids and cards (gradient accent bar on hover), resume styles, about styles, poetry styles (serif font, stanza spacing), footer, page fade-in animation, and three responsive breakpoints (1200px, 768px, 480px). On mobile (<=768px), the video background is hidden entirely and replaced with a solid dark background. All hover transforms are disabled on <=480px.

### `js/main.js`
An IIFE that adds click-to-toggle behavior for the mobile hamburger nav. Also closes the nav when any link is clicked. That is the entire JavaScript for the site.

### `generate_resume.py`
Uses `fpdf2` to programmatically generate `assets/resume.pdf`. Defines a `ResumePDF` class extending `FPDF` with methods for section headings (with accent-blue underlines), bullet points, and domain blocks. Outputs a single-page PDF with name, title, contact info, summary, experience bullets, and capability domains. Uses Helvetica font at various sizes with a color palette matching the site's accent blue (`rgb(91, 159, 192)`).

### `generate_favicon.py`
Uses Pillow to generate two PNG files: a 32x32 favicon and a 180x180 Apple touch icon. Both render the letter "N" in accent blue (`rgb(91, 159, 192)`) on a dark background (`rgb(9, 9, 11)`) using DejaVu Sans Bold.

### `progress.md`
An internal build log documenting what has been built, design decisions made, file structure, asset inventory, and open questions. Acts as a living spec/changelog for the site development.

## Setup & Running

### Local Development

No build step required. Open `index.html` in a browser, or serve locally:

```bash
python -m http.server 8000
```

Then visit `http://localhost:8000`.

### Regenerating Assets

To regenerate the resume PDF (requires `fpdf2`):
```bash
pip install fpdf2
python generate_resume.py
```

To regenerate favicons (requires `Pillow` and DejaVu Sans Bold font):
```bash
pip install Pillow
python generate_favicon.py
```

### Deployment

Push to `main` branch. GitHub Pages serves from the root of `main`. The `CNAME` file maps the custom domain `nathancurtis.to`. HTTPS is enforced by GitHub Pages.

## Recent Activity

### Last 10 Commits (all by Nathan Curtis)

1. **2026-03-01** — Add Privacy and Terms links to nav on all pages
2. **2026-03-01** — Update progress.md with current site state
3. **2026-03-01** — Add privacy policy and terms pages for Twilio A2P 10DLC
4. **2026-02-28** — Widen about page text to 90ch
5. **2026-02-28** — Add favicon and Apple touch icon (minimal "N" in accent blue on dark background)
6. **2026-02-28** — Update resume PDF
7. **2026-02-28** — Remove dot grid background pattern
8. **2026-02-28** — Add resume PDF and update background video loop (generate_resume.py, updated bg.mp4)
9. **2026-02-28** — Fix video background rendering on GitHub Pages (switch to `position: fixed` with negative z-index)
10. **2026-02-28** — Add background video, dark overlay, and Instagram footer link

### Branches
- `main` — only branch, default

### Open PRs / Issues
- None

## How It Works

This is a straightforward static site. There is no server, no API, no database, no client-side routing, and no JavaScript framework. Here is what happens when someone visits:

1. **DNS**: `nathancurtis.to` resolves via the CNAME to GitHub Pages infrastructure.
2. **GitHub Pages** serves the static files from the `main` branch root.
3. **Browser loads `index.html`**: Fetches Google Fonts (Inter + Lora), `css/style.css`, `assets/bg.mp4`, favicon, and `js/main.js`.
4. **Video background**: A looping MP4 plays fullscreen behind all content using `position: fixed` with `z-index: -2`. A dark overlay (`z-index: -1`) sits on top of the video for text readability. On mobile (<=768px), the video is hidden entirely via `display: none` and a solid dark background is used instead.
5. **Navigation**: Sticky at top with frosted glass effect (`backdrop-filter: blur(16px)`). On mobile, a hamburger button toggles the nav links open/closed — this is the only JavaScript on the site.
6. **Page transitions**: A CSS `fadeIn` animation (0.35s, translateY) runs on every `<main>` element load, giving pages a subtle entrance effect.
7. **Content rendering**: All content is static HTML. Project cards, capability domains, and poems are all hand-written markup styled with CSS Grid and Flexbox.
8. **Resume PDF**: The download link points to `assets/resume.pdf`, a static file generated offline by `generate_resume.py`. It is not generated on the fly.
9. **Multi-page navigation**: Each page is a separate `.html` file. Navigation between pages is standard anchor tags — no client-side routing. GitHub Pages handles clean URLs (e.g., `nathancurtis.to/projects.html`).

### Responsive Behavior

Three breakpoints handle the responsive layout:
- **<=1200px**: Project grids collapse from 4 to 2 columns, capability domains from 3 to 2, resume bullets from 2 columns to 1.
- **<=768px**: Everything collapses to single column. Horizontal padding drops from 3.5rem to 1.25rem. Video background hidden. Hamburger nav activates. Font size drops from 17px to 16px.
- **<=480px**: Hero title shrinks further. CTA buttons stack vertically. Hover transforms disabled on cards.

## Notable Decisions

- **No build tools or frameworks**: Deliberately chose vanilla HTML/CSS/JS. No React, no Next.js, no Tailwind, no bundler. The site is simple enough that the overhead of a framework would exceed the complexity of the content. This also means zero dependencies for the site itself, instant deploys, and no build failures.

- **Dark mode only**: No light mode toggle. The design is built around a specific dark aesthetic with the video background and accent colors. A light mode would require a fundamentally different design treatment.

- **Left-aligned, full-width layout**: Breaks from the common centered-narrow-column portfolio pattern. Content fills the viewport width with consistent left padding, giving more room for grids and text.

- **Video background with fixed positioning**: After discovering that `position: absolute` caused the video to render in-flow on GitHub Pages deployed builds (but worked locally), the solution was switching to `position: fixed` with negative z-index. This decouples the video from any container stacking context.

- **No .gitignore**: Uses `.git/info/exclude` instead — keeps the repo root clean.

- **Python-generated static assets**: The resume PDF and favicons are generated by Python scripts checked into the repo, but the generated assets are also committed. The scripts serve as the "source of truth" for regenerating these assets, but there is no automated pipeline — they are run manually when content changes.

- **Poem source texts in repo root**: The `.txt` files for each poem sit alongside the HTML files. These are the raw source texts, separate from their HTML rendering in `poetry.html`.

- **Twilio compliance pages**: The privacy policy and terms pages exist specifically to satisfy Twilio A2P 10DLC registration requirements for a "Morning Briefing" SMS service. They are included in the nav but are not core portfolio content.

- **Identity-first framing**: The site leads with capability domains rather than a list of programming languages. Hardware maintenance and infrastructure administration are treated as first-class competencies alongside software development — reflecting the actual scope of the role.

- **Proprietary work acknowledged openly**: The projects page explicitly states that the strongest work is proprietary and includes case study placeholders with `<!-- UPDATE -->` comments for future metrics.

---

## Redesign (In Progress)

The site is being rebuilt as a modern Next.js application. This section tracks the redesign from initial exploration through launch.

### Redesign Stack

| Technology | Role |
|---|---|
| **Next.js 16** | Framework (App Router) |
| **Tailwind v4** | Styling |
| **shadcn/ui** | Component library |
| **motion** | Animation library |
| **Space Grotesk** | Heading font |
| **Inter** | Body font |
| **Lora** | Poetry/serif font |

### Design Tools
1. **21st.dev Magic MCP** — curated UI component library
2. **Google Stitch MCP** — UI mockup generation
3. **UI/UX Pro Max Skill** — design system intelligence
4. **Nano Banana 2** — AI image generation (web tool at nano-banana.ai)
5. **GSD Workflow** — spec-driven dev with parallel execution

### Redesign Location
- Code: `/tmp/nathancurtis-redesign`
- Planning: `/tmp/nathancurtis-redesign/.planning/`
- Will deploy to same GitHub repo when ready

### Roadmap (9 Phases)

| # | Phase | Status | Notes |
|---|---|---|---|
| 1 | Theme & Typography | Colors rejected | Fonts done (Space Grotesk/Inter/Lora). Colors felt "too generic." |
| 2 | Layout Shell | Not started | Glassmorphism navbar, footer, responsive breakpoints |
| 3 | Homepage Hero | Not started | Animated hero, gradient bg, motion setup |
| 4 | Homepage Content | Not started | Capabilities bento grid, project cards, scroll animations |
| 5 | Projects Page | Not started | Project listings, case studies, hover effects |
| 6 | Resume Page | Not started | Timeline, skills display, PDF download |
| 7 | About Page | Not started | Personal narrative, visual layout |
| 8 | Poetry Page | Not started | Lora serif, masonry grid, editorial mood |
| 9 | Polish & Transitions | Not started | Page transitions, focus states, responsive QA |

### Current Step: Color Palette Exploration

**Problem:** Phase 1 colors (blue #5b9fc0 + purple #7c6fb0) felt too generic — "vibe coded website but prettier."

**Approach:** Built 20 completely different color palettes, each applied to a full homepage mockup (hero, capabilities, projects, footer). All viewable on localhost.

**How to browse:**
- Gallery index: `http://localhost:3000`
- Individual variants: `http://localhost:3000/v1` through `/v20`

**The 20 Palettes:**

| # | Name | Primary | Accent | Mood |
|---|---|---|---|---|
| 1 | Midnight Gold | Gold #c9a84c | Dark gold #8b7335 | luxury |
| 2 | Arctic | Ice blue #7dd3fc | Sky blue #38bdf8 | technical |
| 3 | Ember | Orange #f97316 | Light orange #fb923c | energetic |
| 4 | Forest | Emerald #34d399 | Green #059669 | organic |
| 5 | Amethyst | Lavender #a78bfa | Violet #7c3aed | creative |
| 6 | Copper & Slate | Copper #d4845a | Dark copper #b06d42 | industrial |
| 7 | Neon Minimal | Cyan #00e5ff | Teal #00b8d4 | futuristic |
| 8 | Rose Noir | Rose #e8899a | Dark rose #c0687a | editorial |
| 9 | Terracotta | Burnt clay #c2703c | Earth #96552e | warm |
| 10 | Ocean Deep | Teal #2dd4bf | Blue #0ea5e9 | calming |
| 11 | Monochrome Red | Red #dc2626 | Dark red #b91c1c | minimal |
| 12 | Sunset Gradient | Amber #f59e0b | Pink #ec4899 | vibrant |
| 13 | Moss & Amber | Amber #d4a017 | Moss #6b8f3c | organic |
| 14 | Electric Violet | Violet #8b5cf6 | Lilac #c084fc | bold |
| 15 | Warm Graphite | Peach #f0a070 | Warm #d08858 | comfortable |
| 16 | Steel Blue | Steel #5b8fb9 | Deep steel #3d7aa8 | corporate |
| 17 | Cherry | Crimson #be123c | Deep cherry #9f1239 | dramatic |
| 18 | Jade & Cream | Jade green #4ade80 | Teal #14b8a6 | luxury |
| 19 | Cosmos | Magenta #d946ef | Violet #8b5cf6 | dreamy |
| 20 | Sand & Sea | Blue #3b82f6 | Deep blue #2563eb | natural |

**Next:** Nathan picks favorites from these 20 > we refine + iterate > finalize color system > continue roadmap.

### Decision Log

| Date | Decision | Context |
|---|---|---|
| 2026-03-06 | Next.js 16 + Tailwind v4 + shadcn/ui | Modern stack, good DX, static export possible |
| 2026-03-06 | Dark mode only | Matches original site. No light mode toggle needed. |
| 2026-03-06 | Space Grotesk + Inter + Lora fonts | Heading / body / poetry separation |
| 2026-03-06 | 9-phase roadmap | Foundation > shell > homepage (2 phases) > content pages > polish |
| 2026-03-07 | Reject initial blue/purple palette | Felt too generic. Exploring 20 alternatives. |

## Related

- [[coil]] — Flagship project featured on the projects page; Python-to-exe compiler published on PyPI
- [[Feather]] — Image optimizer featured on the projects page
- [[File-Processor]] — Batch file converter featured on the projects page
- [[Study-Aggregator]] — DICOM processor featured on the projects page
- [[nathannncurtis]] — GitHub profile README links to this portfolio site
- [[obsidian-vault-sync]] — Related personal infrastructure tooling
- [[sfsm-automation]] — Related automation work
