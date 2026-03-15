# Steddi

iOS navigation app for daily commuters who already know their routes. Your route, your rules — only rerouted when it actually matters.

## Links
- Repo: github.com/nathannncurtis/steddi (private)
- Server path: `/home/nathan/projects/steddi` (clawd)

## Stack
- Swift / SwiftUI / Mapbox Navigation SDK v3 / SwiftData / MVVM
- iOS 17+, no backend for v1

## Status
- **Phase 1: Project Foundation** — scaffolded and pushed to GitHub
- Xcode still installing — planning and scaffolding mode only

## v1 Phases
1. ~~Project Foundation~~ — repo, models, services, architecture docs
2. Map & Location Core — Mapbox map view, location tracking, permissions
3. Pinned Locations — save/manage locations, home screen cards, search
4. Basic Navigation (Dumb Mode) — standard turn-by-turn, global no-go zones
5. Route Recording ("Drive It") — GPS trace + Map Matching, save preferred route
6. Commute System — origin/destination pairs, route hierarchy, BYOR navigation
7. Reroute Engine — traffic monitoring, threshold logic, suggestion UI, fallback cascade
8. Route Planning ("Draw/Plan It") — manual route creation, route-specific no-go zones
9. Offline, Donations & Polish — caching, downloadable routes, StoreKit tip jar, onboarding

## Deferred (post-v1)
- Passive route learning (pattern detection from repeated drives)
- CarPlay support
- Custom voice guidance
- App icon / branding

## Threshold Algorithm
- Percentage-based, evaluated against **remaining ETA** (not original trip duration)
- Percentage scales with remaining time: higher % for short drives, lower % for long
- Sigmoid curve centered at 30 min remaining
- If percentage threshold met → reroute suggested, regardless of hard floor
- Hard minute floor (default 10 min) = secondary gate for long drives only
- Default base percentage: 20%

## Mapbox Free Tier Limits
- Nav SDK: 1,000 trips/month
- Directions API: 100,000 requests/month
- Map Matching API: 100,000 requests/month
- Maps SDK: 25,000 MAU

## Decisions
- No-go zones: global (settings) + route-specific (during planning). Global can be overridden per-route (hidden opt-in).
- Offline: cache active route during nav, linger 5 min after, manual download option. No traffic data cached.
- Monetization: StoreKit tip jar, no ads, no subscription
- Passive route learning deferred to post-v1
