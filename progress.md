# Portfolio Site — Progress

## Status: Initial Build Complete

## What's Built
- **index.html** — Landing page with hero, subtitle, intro, 3 featured project cards, footer with contact
- **projects.html** — Full project page with Coil, Feather, and File Processor as mini case studies (problem/approach/outcome)
- **resume.html** — Formatted resume with summary, experience, capability domains grid, languages/tools
- **about.html** — Professional identity + personal section (poetry, music mention)
- **poetry.html** — "Scent of Salt" formatted with stanza breaks. Template comment for adding more poems
- **css/style.css** — Full stylesheet: typography (Inter + Lora), color system, nav, hero, project cards, resume layout, poetry styling, responsive breakpoints (768px, 480px)
- **js/main.js** — Mobile nav toggle only

## Design Decisions
- **Multi-page** over single-page: cleaner URLs for GitHub Pages, each page has its own HTML file
- **Color palette**: warm off-white (#fafaf9) background, muted blue accent (#2c5f7c), neutral text hierarchy
- **Typography**: Inter (sans) for UI/body, Lora (serif) for poetry only. Google Fonts loaded with preconnect
- **No .gitignore**: using .git/info/exclude per spec
- **Desktop-first** responsive: base styles target desktop, @media (max-width: 768px) handles mobile
- **Minimal JS**: only mobile nav toggle. No animations, no scroll effects
- **Sticky nav** across all pages with consistent links and active state

## What Needs Filling In
- **Resume**: Company name, dates, education section — marked with comments/placeholders
- **Resume PDF**: `assets/resume.pdf` — link is wired up, just drop the file in
- **More poems**: Template comment in poetry.html shows the block structure to duplicate
- **More projects**: Structure is modular — copy a `project-card` block in projects.html

## Project Details Source
- Coil: pulled from GitHub README — opinionated Python-to-exe compiler, auto-detect entry points, PyPI published
- Feather: pulled from source code — PyQt5 image optimizer with multithreaded batch processing, Pillow-based
- File Processor: pulled from source code — multiprocessing PDF/TIFF/JPEG converter with job queue manager, network-aware

## File Structure
```
/
├── index.html
├── projects.html
├── resume.html
├── about.html
├── poetry.html
├── css/
│   └── style.css
├── js/
│   └── main.js
├── assets/
│   └── (resume PDF goes here)
├── scent-of-salt.txt
├── progress.md
└── README.md
```

## Open Questions
- Custom domain setup: will need CNAME file for nathancurtis.to when DNS is configured
- Favicon: none yet — add one when ready
- OG/social meta tags: not added — can add later if needed
