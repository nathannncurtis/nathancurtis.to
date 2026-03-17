# Steddi Progress

## Completed
- [x] Project scaffold — models, services, architecture docs, Package.swift
- [x] Mapbox SDK integration — Nav SDK v3, Maps SDK, Directions API, Map Matching API, Geocoding API
- [x] Xcode project setup — xcodegen, builds clean, zero warnings
- [x] SwiftData models — PinnedLocation, Commute, Route, DriveRecord, NoGoZone, CommuteTrip
- [x] Home screen — full-screen map, "Where to?" search bar, settings gear, bottom sheet with tabs
- [x] Search — Mapbox Geocoding v6, debounced 150ms, inline expansion from search bar
- [x] Navigation — custom SteddiNavOverlay (NOT stock Mapbox UI), route line, camera tracking
- [x] Turn-by-turn UI — instruction banner, next maneuver preview, street name, speedometer, compass, voice toggle, view toggle, report button, ETA bar
- [x] Chase-cam — route-based bearing, 80m look-ahead, 65° pitch, smoothed rotation
- [x] Route planning — full-screen map, tap to add waypoints, direction picker, multi-waypoint routing, zoom buttons
- [x] Commute management — create/edit commutes, search for locations, location picker
- [x] Bidirectional commutes — auto-detect direction (proximity → learned patterns → time heuristic → ask)
- [x] BYOR — commutes use saved preferred routes (sampled waypoints from stored polyline)
- [x] Trip logging — CommuteTrip records direction/day/hour for pattern learning
- [x] No-go zone editor — full-screen map, tap to place, radius slider, red circle preview, search
- [x] Onboarding — 5 pages (welcome, pin places, drive to learn, privacy, threshold), dark mode, lavender theme
- [x] Privacy page in onboarding — "all data on-device, nothing sold or shared"
- [x] Silent arrival — no popup, local notification 2 min later if route should be saved
- [x] Settings — threshold slider, hard floor stepper, voice toggle, units, no-go zones, commute management, donation
- [x] Donation view — StoreKit tip jar with fallback display
- [x] Visual identity — soft lavender (#9B8EC4), warm dark surfaces, Steddi theme system, custom puck
- [x] Light/dark mode — adaptive colors, map presets (day/dawn/dusk), sunset auto-switch
- [x] Landscape — side panel on left, map fills all edges, no white bars
- [x] Portrait — bottom sheet with Commutes/Places tabs, fills to screen edge
- [x] Python tests — 35 tests for threshold algorithm, all passing

## In Progress
- [x] Reroute engine live integration — wired, periodic fallback check every 5 min, RerouteCardView shows suggestions
- [x] Voice guidance toggle — wired via AVAudioSession mute/unmute
- [x] Live ETA on commute cards — periodic DirectionsService fetch every 5 min
- [x] Deleted 11 unused files (ViewModels, NavigationCoordinator, legacy views)
- [x] Landscape TBT — two floating cards (instruction + ETA) with 44pt buttons between them
- [x] Landscape home — side panel on left, rounded right corners
- [x] Portrait/landscape code fully separated in both HomeView and SteddiNavOverlay
- [x] 2D/3D toggle — cube/square button is sole toggle, compass is north indicator only
- [x] POI search — switched to Search Box v1 API, supports business names (CVS, Starbucks, etc.)
- [x] Search results show distance from current location
- [x] Report persistence — Report SwiftData model, saves type + location + timestamp
- [x] Settings: Delete All Data with confirmation dialog
- [x] Settings: About section with app version from bundle
- [x] Landscape speedometer shrunk to 38pt
- [x] Post-arrival route review — map preview, "Looks good" save, "Edit route" → RoutePlannerView
- [x] steddi:// URL scheme for CLI testing (steddi://test-arrival triggers post-arrival flow)

## Not Started
- [ ] Reroute suggestion card during live nav (RerouteCardView exists, not triggered)
- [ ] Fallback cascade during navigation
- [ ] "Drive it" route recording with Map Matching post-arrival
- [ ] Offline route caching (OfflineCacheService exists, not triggered)
- [ ] Downloadable routes for offline use
- [ ] Route-specific no-go zones (model supports it, no UI)
- [ ] Global no-go zone override per-route (model supports it, no UI)
- [ ] CarPlay support
- [ ] Passive route learning (pattern detection from repeated drives)
- [ ] Custom voice guidance
- [ ] App icon / branding
- [ ] TestFlight / real device testing (need Apple Developer account)
- [ ] App Store submission
