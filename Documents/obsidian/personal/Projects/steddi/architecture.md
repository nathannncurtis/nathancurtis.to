# Steddi Architecture

## Project Structure
```
Steddi/
  App/           SteddiApp.swift (entry point, service injection, notification setup)
  Models/        SwiftData models (PinnedLocation, Commute, Route, DriveRecord, NoGoZone, CommuteTrip)
  Views/
    Home/        HomeView, LocationCardView, SteddiMapView (UIKit map container), ExpandedSearchView
    Navigation/  SteddiNavOverlay (custom turn-by-turn), MapboxNavigationView (unused/legacy), SteddiNavigationStyle, RerouteCardView, PostArrivalSheet
    Settings/    SettingsView, NoGoZoneEditorView (full-screen map), ThresholdExplainerView
    Commute/     CommuteListView, CommuteDetailView, RoutePlannerView (full-screen map with waypoints)
    Onboarding/  OnboardingView, DonationView
    Components/  LocationPickerView, MapPlaceholderView (legacy), ColorSwatchPreview (legacy)
  ViewModels/    HomeVM, NavigationVM, CommuteVM, SettingsVM, RouteRecordingVM (most not wired to views yet — views use @Query directly)
  Services/      LocationService, DirectionsService, MapMatchingService, GeocodingService, RerouteEngine, NavigationCoordinator, OfflineCacheService, MapboxTokenProvider, CommuteDirectionResolver, ArrivalNotificationService
  Utils/         SteddiTheme (colors, fonts, components), PolylineEncoder
```

## How Navigation Works
1. User taps commute card or search result
2. `HomeView.navigateTo()` or `navigateWithSavedRoute()` creates a `MapboxNavigationProvider`
3. Provider calculates routes via `routingProvider().calculateRoutes()`
4. `SteddiMapView` receives the routes, calls `startNavigation()` on the UIKit `SteddiMapContainer`
5. Container calls `provider.tripSession().startActiveGuidance()` to start the routing engine
6. Container draws the route line (Mapbox `LineLayer` with `lineEmissiveStrength = 1.0`)
7. Container subscribes to `provider.navigation().locationMatching` for camera updates
8. `SteddiNavOverlay` (SwiftUI) subscribes to `provider.navigation().routeProgress` and `locationMatching` for instruction/speed/ETA updates
9. On arrival or user tap "End": nav stops, trace is saved, notification scheduled if needed

## How Commute Direction Works
1. `CommuteDirectionResolver.resolve()` checks proximity (500m), then learned patterns (5+ trips), then weekday time heuristic, then asks
2. Each trip is logged as a `CommuteTrip` (day of week, hour, direction) for future pattern learning
3. After 5+ trips on the same day/hour, learned patterns override smart defaults

## Map Container (SteddiMapView → SteddiMapContainer)
- UIKit `MapView` (not SwiftUI `Map` — needed for camera control and navigation integration)
- `viewDidLayoutSubviews()` extends map frame into top/left/right safe areas (not bottom — sheet covers bottom)
- `updateMapStyle()` switches light presets based on `traitCollection.userInterfaceStyle` and time of day
- Camera tracking uses route-geometry-based bearing (not GPS course) with 15% smoothing factor
- Route line uses `Slot.top` and `lineEmissiveStrength = 1.0` to stay bright in 3D dusk lighting

## Data Flow
- SwiftData `ModelContainer` created in `SteddiApp`, injected via `.modelContainer()`
- `LocationService` and `OfflineCacheService` injected via `.environment()`
- Views use `@Query` for data, `@Environment(\.modelContext)` for writes
- ViewModels exist but most views bypass them — direct `@Query` is simpler for current complexity
