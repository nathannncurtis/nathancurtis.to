# Steddi TODO

## Priority 1 — Core Features Missing
- "Drive it" recording: after navigating, if GPS trace is good, offer to save via Map Matching

## Priority 2 — Polish
- Post-arrival Map Matching needs real on-device GPS trace testing (mock flow works)

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
- `CommuteTrip` learning requires 5+ trips before activating — no way to test this quickly.
