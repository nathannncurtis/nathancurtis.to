---
tags: [project, react, typescript, tailwind, vite, github-pages, portfolio]
repo: https://github.com/nathannncurtis/nathancurtis.to
updated: 2026-03-15
language: TypeScript, CSS
---
# nathancurtis.to

## Overview

Personal portfolio website for Nathan Curtis, live at [nathancurtis.to](https://nathancurtis.to/). A single-page React application with a dark editorial aesthetic. Built with Vite, React 19, TypeScript, Tailwind CSS v4, and Framer Motion. Hosted on GitHub Pages with automated deployment via GitHub Actions.

The site positions Nathan as a Process Development Specialist who works across automation, infrastructure, production hardware, and cross-departmental workflow design. It showcases four open-source projects, a resume section, original poetry, and contact links.

## Tech Stack

| Technology | Role |
|---|---|
| **Vite 7.3.1** | Build tool and dev server |
| **React 19** | UI framework |
| **TypeScript** | Type safety |
| **Tailwind CSS v4.2.1** | Styling (CSS layer-based) |
| **Framer Motion** | Animations (via `motion` package) |
| **EB Garamond** | Heading font (serif, 400 weight) |
| **Satoshi** | Body font (sans-serif, 300 weight) |
| **JetBrains Mono** | Monospace font |
| **GitHub Pages** | Hosting |
| **GitHub Actions** | CI/CD (auto-deploy on push to main) |

## Color Palette: Deep Sea

| Token | Value | Usage |
|---|---|---|
| `--bg` | `#0C1014` | Background |
| `--bg-card` | `#161C24` | Card surfaces |
| `--fg` | `#D0D8DE` | Primary text |
| `--fg-secondary` | `#7A8A96` | Secondary text |
| `--accent` | `#4A9A9A` | Primary accent (teal) |
| `--accent-light` | `#5CB8B8` | Light teal |
| `--accent-warm` | `#D4944A` | Warm accent (amber) |
| `--accent-cool` | `#6A7A8A` | Cool accent (grey) |

## Architecture

Single-page hybrid layout: each section is `min-h-screen` with flex centering, creating the feel of separate pages without actual routing. Content fades in after fonts load via `document.fonts.ready`.

### Directory Structure

```
/
├── .github/workflows/deploy.yml   # GitHub Actions deploy
├── index.html                     # Entry point, OG meta, font loading
├── public/
│   ├── CNAME                      # Custom domain
│   ├── favicon.svg                # SVG favicon (teal "nc")
│   └── og.png                     # Open Graph preview image
├── src/
│   ├── App.tsx                    # Main app with section layout
│   ├── main.tsx                   # Entry, font-ready fade-in
│   ├── index.css                  # CSS vars, Tailwind config, theme
│   ├── sections/
│   │   ├── Hero.tsx               # Word-by-word reveal, ripple clicks, magnetic CTAs
│   │   ├── About.tsx              # Two-column: prose + capability cards
│   │   ├── Projects.tsx           # Expandable accordion, per-project accents
│   │   ├── Resume.tsx             # Role card, tech tags, domain grid
│   │   ├── Poetry.tsx             # Tabbed poem selector with animated indicator
│   │   └── Contact.tsx            # 3D tilt cards (email, GitHub, Instagram)
│   └── components/
│       ├── Nav.tsx                # Scroll progress bar, active section tracking
│       ├── GridBg.tsx             # Animated orbs, grid lines, noise, vignette
│       ├── SectionHeading.tsx     # Section number + title + accent line
│       └── TiltCard.tsx           # Reusable 3D perspective tilt on hover
├── vite.config.ts
├── package.json
└── tsconfig.json
```

## Sections

1. **Hero** — Word-by-word headline blur-in animation, gradient text on highlighted words (with descender padding fix), SVG water ripple clicks (feTurbulence + feDisplacementMap, 3 concentric rings, max radius 50px), magnetic CTA buttons, parallax scroll
2. **About** — Two-column layout: prose left (lg:sticky), capability cards right with slide-in hover effect, ambient parallax glow orb
3. **Projects** — Expandable accordion with per-project accent colors (teal, amber, light teal, grey). Left accent bar when expanded, Problem/Approach/Outcome 3-column detail. Projects: Coil, Feather, File Processor, Study Aggregator
4. **Resume** — 3/2 column grid (role + skills), hoverable tech tags with accent glow, 5 domain cards below
5. **Poetry** — Tabbed selector with layoutId animated indicator, serif font, centered stanzas. Poems: Scent of Salt, Routine in Green, Rings Not Stories
6. **Contact** — TiltCard 3D perspective hover on link cards (Email, GitHub, Instagram), ArrowUpRight reveal on hover

## Technologies Listed

Python, Swift, C, C++, C#, TypeScript, JavaScript, Go, PowerShell, Shell, PHP, SwiftUI, PyQt5, Electron, React, AG Grid, SQL, Docker, Active Directory, Group Policy, DNS/DHCP, RAID, SSH

## Key Design Decisions

- **No em dashes** — semicolons used instead throughout all copy
- **Dark mode only** — Deep Sea palette (teal/amber/grey on near-black)
- **No snap scrolling** — smooth scroll with section dividers
- **Font loading** — `#root` hidden with `opacity: 0` until `document.fonts.ready`, then fades in over 0.6s
- **Body background** — set inline on `<body>` tag AND in CSS to prevent white flash
- **No whileInView scroll animations** — removed due to persistent flashing issues on production
- **Hero page-load animations** — kept (word-by-word reveal, staggered CTAs)
- **Mobile nav clearance** — `pt-16 md:pt-0` on hero section

## Deployment

Push to `main` triggers GitHub Actions workflow:
1. `npm ci`
2. `npx vite build` (outputs to `dist/`)
3. `actions/upload-pages-artifact` + `actions/deploy-pages`

Custom domain `nathancurtis.to` via CNAME file in `public/`.

## Dev Server

```bash
cd ~/Desktop/nathancurtis-portfolio
npx vite --port 3000
```

Note: the working dev copy is at `~/Desktop/nathancurtis-portfolio`. The git repo clone is at `~/Desktop/nathancurtis.to-repo`.

## Related

- [[coil]] — Flagship project featured on the projects page
- [[Feather]] — Image optimizer featured on the projects page
- [[File-Processor]] — Batch file converter featured on the projects page
- [[Study-Aggregator]] — DICOM processor featured on the projects page
- [[nathannncurtis]] — GitHub profile README links to this portfolio site
