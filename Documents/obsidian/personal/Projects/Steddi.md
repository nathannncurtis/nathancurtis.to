# Steddi

iOS navigation app for daily commuters who already know their routes. Your route, your rules — only rerouted when it actually matters.

## Links
- Repo: github.com/nathannncurtis/steddi (private)
- Local: `~/projects/steddi` (Mac)
- Server: `/home/nathan/projects/steddi` (clawd)
- Subnotes: [[steddi/architecture]], [[steddi/decisions]], [[steddi/progress]], [[steddi/pitfalls]], [[steddi/todo]]

## Stack
- Swift / SwiftUI / UIKit (map container) / iOS 26+
- Mapbox Navigation SDK v3 (core only — custom UI, not stock NavigationViewController)
- Mapbox Maps SDK (Standard style with dusk/day/dawn presets)
- SwiftData for persistence
- MVVM architecture
- Xcode 26.3, iPhone 17 Pro simulator

## Status (as of 2026-03-15)
- **82 commits**, 44 Swift files, zero compiler errors, zero warnings
- 35 Python tests for threshold algorithm (all passing)
- App builds and runs on simulator
- **Working features**: search, navigation with custom UI, route planning, commute management, bidirectional commutes with smart direction detection, no-go zones, onboarding, settings, light/dark mode with adaptive map styles, landscape side panel
- **Not yet wired**: reroute engine (logic exists but not connected to live nav), offline caching (service exists but not triggered), voice toggle (UI exists but not connected), CarPlay

## Visual Identity
- **Signature color**: Soft Lavender `#9B8EC4` — all accents, icons, borders, route line
- **Dark surfaces**: `#1C1917` warm dark (adaptive — flips to warm white `#F8F5F2` in light mode)
- **Sage green** `#22BD73` for "good to go" states
- **Warm red** `#E84D3D` for warnings/delays
- **Typography**: SF Rounded bold for headings, monospaced for numbers (ETAs/speed), default for body
- **Puck**: lavender soft-cornered triangle with white border (custom UIImage)
- **Route line**: lavender with `lineEmissiveStrength = 1.0` to resist 3D dusk lighting
- **Steady Line**: signature brand element — lavender gradient line used as dividers

## Key Architecture
- Home screen: UIKit `MapView` wrapped in `UIViewControllerRepresentable`, SwiftUI overlay
- Navigation: Mapbox `NavigationCore` for routing engine (active guidance, voice, route progress). Custom `SteddiNavOverlay` SwiftUI view for turn-by-turn UI — NOT the stock `NavigationViewController`
- Camera: chase-cam style (route-based bearing, 80m look-ahead, 65° pitch, smoothed rotation)
- Map style: Mapbox Standard with adaptive light presets (day/dawn/dusk based on system appearance + time of day)

## Mapbox Free Tier Limits
- Nav SDK: 1,000 trips/month
- Directions API: 100,000 requests/month
- Map Matching API: 100,000 requests/month
- Maps SDK: 25,000 MAU
