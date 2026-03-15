# Steddi TODO

## Priority 1 — Core Features Missing
- Wire reroute engine to live navigation (RerouteEngine.evaluate() → SteddiNavOverlay suggestion card)
- Wire voice toggle button to RouteVoiceController (mute/unmute)
- Wire 2D/3D toggle to map container from nav overlay (partially done — works from overlay but compass button also toggles)
- "Drive it" recording: after navigating, if GPS trace is good, offer to save via Map Matching
- Connect saved route polyline to BYOR navigation properly (currently samples waypoints — works but could be more precise)

## Priority 2 — Polish
- Speed limit data display (speedometer shows speed but limit isn't always available)
- Report button currently shows a sheet but doesn't persist reports anywhere
- Post-arrival sheet (from notification tap) needs to actually run Map Matching on the recorded trace
- Commute card should show live ETA from Directions API (currently shows no ETA)
- Search results should show distance from current location
- Settings needs "Delete all data" option
- About section needs app version pulled from bundle

## Priority 3 — Features
- Offline route caching (service exists, needs triggering on nav start/end)
- Route-specific no-go zones during route planning
- Global no-go zone override per route (hidden setting)
- Donation prompt at milestones (30 days, 50 commutes) — not just in settings

## Priority 4 — Future
- CarPlay support (UIKit, requires CarPlay entitlement)
- Passive route learning (detect repeated patterns, suggest saving)
- App icon and branding
- Custom voice guidance
- Apple Developer account + TestFlight
- App Store listing and submission

## Known Issues
- ViewModels (HomeVM, NavigationVM, etc.) exist but aren't used — views use @Query directly. Fine for now but should consolidate if complexity grows.
- `MapboxNavigationView.swift` and `SteddiNavigationStyle.swift` are legacy files from when we used NavigationViewController. Can be deleted.
- `MapPlaceholderView.swift` and `ColorSwatchPreview.swift` are unused — can be deleted.
- The `debugAutoNav` flag in HomeView should be removed before shipping.
- `CommuteTrip` learning requires 5+ trips before activating — no way to test this quickly.
