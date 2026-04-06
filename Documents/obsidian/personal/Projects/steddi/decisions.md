# Steddi Decisions

## Custom Nav UI vs Stock Mapbox NavigationViewController
**Decision**: Build custom SwiftUI overlay on Mapbox NavigationCore, ditch NavigationViewController entirely.
**Why**: The stock NavigationViewController looks like Google Maps — blue accents, light mode, its own complete UI. Can't be restyled enough to feel like Steddi. The UIAppearance-based styling (SteddiNightStyle) was attempted but the VC overrides styles and applies its own 3D lighting.
**How it works**: Use `provider.tripSession().startActiveGuidance()` for the routing engine, subscribe to `provider.navigation().routeProgress` / `locationMatching` / `waypointsArrival` publishers for data, render everything in SwiftUI (`SteddiNavOverlay`).

## Route Line: lineEmissiveStrength
**Decision**: Use `lineEmissiveStrength = 1.0` on route line layers.
**Why**: The Mapbox Standard style with dusk/night light presets applies 3D ambient lighting that darkens all custom layers. Lavender, white, green, cyan — all looked dark/invisible. `lineEmissiveStrength` makes the layer "fullbright", ignoring the 3D scene lighting.
**Previously tried that didn't work**: Slot.top, Slot.middle, layerPosition.above, removing/re-adding layers on delay, UIKit CAShapeLayer overlay (floated in sky in 3D), changing colors to compensate.

## Camera: Route-Based Bearing
**Decision**: Use route geometry to determine camera bearing, not GPS `course`.
**Why**: GPS course jumps erratically on simulator and is noisy on real devices. Route geometry gives a stable, predictable bearing that follows the road.
**Implementation**: `bearingAlongRoute()` finds closest point on route coords, looks 3 points ahead, calculates bearing. Smoothed with 15% factor to prevent jerky rotation.

## Bidirectional Commutes
**Decision**: One commute = two directions. App auto-detects which way you're going.
**Why**: Users shouldn't need to create separate "Home → Work" and "Work → Home" commutes. That's busywork.
**Priority stack**: proximity (500m) → learned patterns (5+ trips) → weekday time heuristic (before noon = going to dest) → ask user.
**Data**: Routes have a `direction` field. `CommuteTrip` logs every completed trip for pattern learning.

## Silent Arrival
**Decision**: No popup on arrival. Local notification 2 minutes later IF no preferred route exists for that direction.
**Why**: Commuters don't need "You've arrived!" — they know. The notification catches the case where you drove a new route and might want to save it, but respects your flow (you're parking, walking in, etc.)

## Map Style: Adaptive Light Presets
**Decision**: Use `.standard(lightPreset:)` that adapts to system appearance and time of day.
**Why**: Dark mode users get dusk, light mode users get day, light mode after 5pm gets dawn (golden hour), after 7pm gets dusk.
**Implementation**: `updateMapStyle()` in `SteddiMapContainer`, triggered by `traitCollectionDidChange()`.

## Bottom Sheet: Portrait vs Landscape
**Decision**: Portrait = bottom sheet with tabs. Landscape = left side panel (like Apple Maps).
**Why**: Bottom sheet in landscape eats half the screen. Side panel gives full-width map.
**Implementation**: `isLandscape` check via `verticalSizeClass == .compact`. Separate `portraitLayout` and `landscapeLayout` computed properties.

## Safe Area Handling
**Decision**: ZStack ignores all safe areas. Map extends everywhere. UI elements add their own padding.
**Why**: In landscape, safe areas create white bars on left/right sides. In portrait, the bottom needs to be filled by the sheet color.
**Implementation**: `.ignoresSafeArea()` on main ZStack, portrait layout adds `.padding(.top, 54)` and `.padding(.bottom, 34)`, landscape layout doesn't. Sheet uses overlay offset trick to extend background past bottom clip shape.

## Color: Soft Lavender
**Decision**: `#9B8EC4` as Steddi's signature color. Not blue (every map app), not gold (too premium), not green.
**Why**: Nathan picked it from a swatch preview. Quiet confidence, different, calm.

## Privacy
**Decision**: All data on-device. Nothing sold, shared, or sent to any server.
**Why**: Core product value. Onboarding explicitly states this. No analytics, no tracking beyond what Mapbox requires.

## Monetization
**Decision**: Free app, StoreKit tip jar ($1.99/$4.99/$9.99). No ads, no subscription.
**Why**: Commuters shouldn't pay monthly for a tool that respects their habits.
