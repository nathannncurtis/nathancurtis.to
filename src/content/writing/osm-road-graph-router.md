---
title: "Building a Real OSM Road-Graph Router from Scratch: CSR Arrays, Varint-Delta Geometry, and a Preference Learner"
date: "June 2026"
readTime: "8 min"
tags: ["Swift", "Algorithms", "OpenStreetMap", "iOS"]
---

Steddi already had navigation working. MapKit's `DirectionsService` produced a route, `NavigationEngine` drove turn-by-turn off it, and that was fine for most drives. What it couldn't do was let a driver say "never put me on the highway" and mean it, or notice that I always take the tertiary road past the reservoir instead of the arterial MapKit prefers. Getting that right meant owning the graph the route comes from, not just the polyline MapKit hands back. So on June 14th I built one, starting at 1:11am with `RoadGraph.swift` and finishing 24 commits and 6,763 lines later at 3:57pm with a working preference learner.

## The graph is arrays, not objects

The first commit is the data model, and the design choice that shapes everything downstream is that `RoadGraph` is not a graph of node objects pointing at each other. It's flat arrays:

```swift
struct RoadGraph: Sendable {
    let nodes: [GraphNode]
    let edges: [GraphEdge]
    let geometry: [CLLocationCoordinate2D]
    let osmToIndex: [OSMNodeID: NodeIndex]
    let snapIndex: GraphSpatialIndex
    let graphMaxSpeedMPS: Float
}
```

`GraphNode` stores `firstEdge` and `edgeCount`, a CSR (compressed sparse row) layout: a node's out-edges are `edges[firstEdge ..< firstEdge + edgeCount]`, contiguous, no per-node array allocation. `EdgeAttributes` is an `OptionSet` over a `UInt16` (oneway, tunnel, bridge, toll, roundabout, link, private access, destination-only) rather than a tag dictionary, because A* reads these millions of times per search and a bit test beats a dictionary lookup.

`RoadGraphBuilder.buildGraph` is the part I was most careful with, because OSM's data model is subtle: a way like a street doesn't map 1:1 to a graph edge. A node becomes a real graph node only if it's a way endpoint or is shared by two or more ways (an intersection); everything in between (the hundred quiet points where a road just curves) collapses into edge geometry instead. That's why `GraphEdge.geometryRange` is a slice into a shared coordinate pool rather than each edge owning its own array: one long residential street becomes a handful of edges with long geometry runs, not thousands of one-hop nodes.

## Shrinking the wire format

A corridor-sized graph is too big to reload from Overpass on every route request, so phase 1 also ships `RoadGraphSerializer`, a versioned binary format instead of JSON. The header is 4 magic bytes (`SRG1`) plus a version byte, so a stale cache from a future format fails `deserialize` cleanly instead of misreading garbage. The interesting part is the geometry encoding:

```swift
for coord in graph.geometry {
    let lat = Int32((coord.latitude * coordFactor).rounded())
    let lon = Int32((coord.longitude * coordFactor).rounded())
    writer.writeVarintSigned(Int64(lat) - Int64(prevLat))
    writer.writeVarintSigned(Int64(lon) - Int64(prevLon))
    prevLat = lat
    prevLon = lon
}
```

Coordinates are quantized to precision-6 (`coordFactor = 1_000_000.0`, about 11cm), then delta-encoded against the previous point and written as zig-zag LEB128 varints. Consecutive points on a road are close together, so most deltas fit in one or two bytes instead of eight. `osmToIndex` and the spatial snap index aren't serialized at all — they're derived, and get rebuilt from the edges on load.

## Search, cost, and a graceful-failure contract

Phase 3 added `BinaryHeap` and `AStarSearch` with a snap-to-graph overlay so a search can start or end mid-edge, not just at a graph node. Phase 4 added `DefaultCostModel`: turn costs, protected-left inference, route preferences, and zone soft/hard costs, all folded into edge weight without breaking A*'s admissibility (the heuristic still has to be a true lower bound or the search stops being optimal). Phase 5 wired it all into `CustomRouter`, a facade behind the same `RouteProvider` protocol MapKit's directions service already implemented, selected at runtime by `RouteProviderSelector`.

The contract I wrote into `CustomRouter` is the one thing I'd point to as the actual design decision of the day: if the corridor graph fails to load, if A* finds no path, or if step synthesis comes back empty, `generateRoute` returns `nil` and the selector falls back to MapKit. The custom router is allowed to fail silently. It is never allowed to strand a drive.

## Teaching it what I actually drive

Phase 7, the last piece, is `PrefLearner`: a pure, offline function that takes a driver's `DriveRecord` GPS traces, map-matches them onto the corridor graph, and tallies which road classes and turn types they actually favor versus what `DefaultCostModel` would pick on its own. The output is a tuned `CostWeights`, not a new feature bolted onto the router. The same cost model runs, just with numbers nudged toward revealed preference.

The invariant I cared about most here: learning must never make the graph unsafe to search. Every output is clamped so multipliers stay `>= 1` and penalties stay `>= 0`, which keeps A*'s admissibility intact even after learning. It's also a blend, not an overwrite: `tuned = lerp(default, revealed, learningRate)` with `learningRate = 0.5`, and below `minimumDrives = 3` it returns the seed weights unchanged, so one weird one-off drive to the airport can't reshape someone's daily commute.

By the time `d03f81a` landed at 3:57pm, fixing a bug where class affinity referenced the wrong corridor's available road classes, the pipeline ran end to end: Overpass response in, `RoadGraph` out, cached to disk in a custom binary format, searched by A*, cost-shaped by preferences and learned weights, turned into turn-by-turn steps, with MapKit sitting right behind it as the fallback that never gets seen unless something breaks. Twenty-four commits, one calendar day, and the router never once needed to reach for a third-party SDK.
