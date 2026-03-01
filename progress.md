# Portfolio Site — Progress

## Status: Live at nathancurtis.to

## What's Built

### Pages
- **index.html** — Landing page with hero (name, positioning, intro, CTA buttons), "What I Work Across" capability domains (5 cards: automation, infrastructure, hardware, tooling, operations), then "Selected Projects" grid (4 cards), proprietary work note linking to full projects page
- **projects.html** — 4 open-source projects (Coil, Feather, File Processor, Study Aggregator) as case studies (problem/approach/outcome) + "Operational Case Studies" section with 2 placeholder cards (Document Processing Automation, Production Environment Stabilization)
- **resume.html** — Summary, experience (single entry), 5 capability domains (automation, systems, hardware, tooling, technical operations), no education section. PDF download wired to `assets/resume.pdf`
- **about.html** — Professional narrative (cross-layer responsibility, infrastructure literacy, hybrid role framing) + personal section (poetry, music). Wider text measure (90ch) to fill the page
- **poetry.html** — 3 poems (Scent of Salt, Routine in Green, Rings Not Stories) in a horizontal responsive grid (max 4 per row, fills available width)
- **privacy-policy.html** — Privacy policy for Twilio A2P 10DLC Morning Briefing SMS campaign (not in nav)
- **terms.html** — Terms & conditions for Twilio A2P 10DLC Morning Briefing SMS campaign (not in nav)

### Design
- **css/style.css** — Dark mode (#09090b background), Inter + Lora typography, frosted glass nav, project cards with gradient accent bars on hover, capability domain cards with gradient top-border reveal, poem cards with accent left border, page fade-in animation
- **js/main.js** — Mobile nav toggle only
- **Layout** — Full-width left-aligned, no centering. Content fills viewport. Paragraph text constrained to 60ch (90ch on about page). Consistent `3.5rem` left padding (1.25rem mobile).
- **Background video** — `assets/bg.mp4` plays fullscreen behind all pages via `position: fixed` with dark semi-transparent overlay (`rgba(9, 9, 11, 0.72)`). Hidden on mobile (≤768px), falls back to solid dark background.
- **Favicon** — "N" in accent blue on dark background. 32x32 browser favicon + 180x180 Apple touch icon. Wired in all page heads.

### Grids
- Homepage capability domains: 3-column, collapses to 2 then 1
- Homepage projects: 4-column, collapses to 2 then 1
- Projects page case studies: 2-column, collapses to 1
- Resume capability domains: 3-column, collapses to 2 then 1
- Resume experience bullets: 2-column, collapses to 1
- Poetry: `auto-fit minmax(300px, 1fr)`, max 4 per row, stacks on mobile

## Design Decisions
- **Dark mode only** — no light mode toggle
- **Left-aligned, full-width** — no centered narrow column
- **Multi-page** with separate HTML files for clean GitHub Pages URLs
- **No .gitignore** — using `.git/info/exclude`
- **Identity framing** — leads with capability domains, not just dev projects. Hardware/infrastructure treated as first-class, not afterthought. Professional narrative over skill lists.
- **Proprietary work acknowledged** — projects page notes internal work, case study placeholders ready for population
- **Typography**: Inter (sans) for everything, Lora (serif) for poetry only
- **Minimal JS** — mobile nav toggle only, no scroll effects or animations beyond CSS
- **No dot grid** — removed background dot pattern, using clean flat dark + video
- **Video background** — fixed position with negative z-index for bulletproof rendering across environments

## What Needs Filling In
- **Case studies**: 2 placeholder cards on projects page need specific metrics/details (marked with UPDATE comments)
- **More poems**: add to `poems-grid` in poetry.html — copy any `.poem` block
- **More projects**: copy a `project-card` block in projects.html

## Assets
- **assets/bg.mp4** — Background video, loops on all pages
- **assets/resume.pdf** — Downloadable resume PDF
- **assets/favicon-32x32.png** — Browser favicon
- **assets/apple-touch-icon.png** — Apple touch icon (180x180)

## Generator Scripts
- **generate_resume.py** — Generates `assets/resume.pdf` using fpdf2
- **generate_favicon.py** — Generates favicon PNGs using Pillow

## Project Details Source
- Coil: from GitHub README — opinionated Python-to-exe compiler, PyPI published as `coil-compiler`
- Feather: from source code — PyQt5 image optimizer, multithreaded batch processing, Pillow-based
- File Processor: from source code — multiprocessing PDF/TIFF/JPEG converter with job queue manager
- Study Aggregator: from README — DICOM medical imaging processor, ZIP/CD support, context menu integration, multithreaded

## File Structure
```
/
├── index.html
├── projects.html
├── resume.html
├── about.html
├── poetry.html
├── privacy-policy.html
├── terms.html
├── css/
│   └── style.css
├── js/
│   └── main.js
├── assets/
│   ├── bg.mp4
│   ├── resume.pdf
│   ├── favicon-32x32.png
│   └── apple-touch-icon.png
├── generate_resume.py
├── generate_favicon.py
├── scent-of-salt.txt
├── routine-in-green.txt
├── rings-not-stories.txt
├── progress.md
├── CNAME
└── README.md
```

## Infrastructure
- **Domain**: nathancurtis.to — CNAME configured, HTTPS enforced, certificate approved
- **Hosting**: GitHub Pages from `nathannncurtis/nathancurtis.to` (private repo)
- **GitHub profile**: README at nathannncurtis/nathannncurtis links to portfolio

## Footer Links (all pages)
- Email: nathan@nathancurtis.to
- GitHub: nathannncurtis
- Instagram: nathanrobertcurtis

## Open Questions
- OG/social meta tags: not added
