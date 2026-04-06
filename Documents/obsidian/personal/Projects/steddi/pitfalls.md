# Steddi Pitfalls — Things That Don't Work

## DON'T: Style NavigationViewController with UIAppearance
The Mapbox `NavigationViewController` has its own complete UI. Even with custom `NightStyle` subclasses and aggressive UIAppearance overrides, it still looks like stock Mapbox. The 3D lighting tints custom colors, the style manager switches between day/night unpredictably, and the result never feels like Steddi.
**Solution**: Use `NavigationCore` only (active guidance, voice, route progress). Build custom SwiftUI overlay.

## DON'T: Use Mapbox LineLayer colors without lineEmissiveStrength
Any color you set on a `LineLayer` in the Standard style with dusk/night preset will be darkened by 3D ambient lighting. Lavender becomes near-invisible. White becomes gray. Green becomes dark green. Neon colors still look muted.
**Solution**: Set `lineEmissiveStrength = .constant(1.0)` on ALL custom layers. This makes them fullbright.

## DON'T: Use UIKit CAShapeLayer for route lines on a 3D map
Drawing the route as a UIKit overlay (`CAShapeLayer` on a `UIView` above the `MapView`) renders in screen space, not map space. When the map is tilted at 60°+, the line floats in the sky instead of following the road.
**Solution**: Use Mapbox `LineLayer` with emissive strength.

## DON'T: Use `setMapStyle()` on MapboxMap
`mapView.mapboxMap.setMapStyle(.standard(lightPreset: .dusk))` does NOT exist. The correct API is `mapView.mapboxMap.mapStyle = .standard(lightPreset: .dusk)`.

## DON'T: Use `NavigationLink(value:)` in sheets
`NavigationLink(value: commute)` with `.navigationDestination(for: Commute.self)` fails when the `CommuteListView` is embedded in a `NavigationStack` from a parent sheet (SettingsView). The navigation just flashes and pops back.
**Solution**: Use `NavigationLink { CommuteDetailView(commute: commute) } label: { ... }` (destination-based).

## DON'T: Animate SwiftUI view transitions excessively
Adding `.animation()` modifiers, `.transition()`, and `withAnimation()` to the HomeView caused noticeable lag. The map is already heavy — additional animation overhead makes the UI feel sluggish.
**Solution**: Strip all transition animations. State changes are instant. The map provides enough visual continuity.

## DON'T: Use GPS `course` for camera bearing
Raw GPS course from `CLLocation` jumps erratically, especially on simulator and in low-speed situations. The camera spins randomly.
**Solution**: Calculate bearing from the route geometry instead. Find closest point on route, look 3 points ahead, smooth with 15% factor.

## DON'T: Assume map tiles load instantly
Mapbox Standard style tiles take 5-8 seconds to load on the simulator. A black screen does NOT mean a crash. Wait at least 8 seconds before screenshotting after launch.

## DON'T: Try to hide Mapbox logo/attribution via SPI
`ornaments.options.logo.visibility` and `attributionButton.visibility` are `@_spi` protected and inaccessible. The Mapbox logo is required by TOS anyway.

## DON'T: Use `#Predicate` in @Query for complex SwiftData filters
`@Query(filter: #Predicate<Commute> { $0.isActive })` can crash on launch. SwiftData predicates are finicky with certain property types.
**Solution**: Use plain `@Query(sort:)` and filter in the view if needed.

## DON'T: Access @MainActor properties in deinit
`deinit` runs on a non-isolated context. Accessing `@MainActor` properties like `Task<Void, Never>?` directly causes compiler errors.
**Solution**: Mark task properties as `nonisolated(unsafe)`.

## Safe Area Bottom Fill — The Saga
The bottom sheet needs to fill to the screen edge below the home indicator. Tried: Spacer, frame maxHeight, padding, background with extra height, ignoresSafeArea on sheet, map background color matching. **What finally worked**: `.overlay(alignment: .bottom)` with a solid color rectangle offset by 60pt below the clip shape. The clip shape gives rounded top corners, the overlay extends the color past it.
