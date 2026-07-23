---
title: "The Router That Always Took the Costly Turn"
date: "June 2026"
readTime: "6 min"
tags: ["Swift", "Algorithms", "Routing"]
---

## The engine's whole job

Steddi is a routing engine I wrote from scratch: raw OpenStreetMap data in, a driving route out. The reason it's worth building instead of calling someone's API is turn awareness. A good route is the one a person would actually drive, which is rarely the one with the fewest meters. It means paying a cost for the turns themselves: an unprotected left across traffic, a hard merge, doubling back through an intersection you just left. The cost model charges for each of those on top of the road length.

So the search minimizes edge cost plus turn cost. The turn cost is a function of three things: the edge you came in on, the node you're turning at, and the edge you're leaving on. Same intersection, same exit road, different entry road, different penalty. That dependence on the entry road is the whole point of the engine, and it's exactly where I put a bug that quietly defeated the reason the thing exists.

## Node-keyed A* throws away the approach

A* keeps a running best cost to each state and settles states in increasing order of `f = g + h`. The question that turned out to matter is what counts as a state. I did the obvious thing and used the node. `gScore[node]` was the best cost to reach that node, `cameFromEdge[node]` was the edge that got there, `closed[node]` marked it done. Dense arrays indexed by node id, which is the performance story for this kind of engine: CSR adjacency and flat arrays, no dictionaries.

The trouble is that turn cost depends on the edge you arrived on, and a node-keyed search remembers only one arrival per node: whichever gave the cheaper `g` at the moment it was settled. Once a node is closed, its incoming edge is frozen. Every turn leaving that node is charged against that one approach forever. If a more expensive approach would have unlocked a much cheaper turn on the way out, the search has already thrown it away. The node's slot in the array looks identical either way. The information that decides the route is gone.

## The turn trap

Here's the smallest graph that breaks it, which is also the regression test I wrote to prove the bug.

Start at S, end at goal G. A junction M sits in the middle, reachable two ways:

- the cheap approach, S to P to M, costs 1 + 1 = 2
- the costly approach, S to Q to M, costs 1 + 3 = 4

From M the only way onward is M to D to G. The catch is the turn onto M-to-D. Off the cheap approach (arriving via P) that turn costs an extra 100. Off the costly approach (arriving via Q) it's free.

Add up the whole trip:

- via P: 1 + 1 + 1 + 100 + 1 = 104
- via Q: 1 + 3 + 1 + 0 + 1 = 6

Six is the right answer. You spend two extra getting to M so the turn out of it costs nothing. Node-keyed A* can't find it. It reaches M by the cheap P approach first, settles M with `g = 2`, closes it, and from then on the only turn onto D it will ever price is the one off P, the +100. It returns 104 and routes you through the trap every time. The cheaper way to stand at M is a trap, and the search sold the exit to save two units on the approach.

## Make the edge the state

The fix is to stop keying the search by node and key it by the directed edge you just crossed. The state becomes "I am standing at `e.to`, having arrived across edge `e`." `gScore[e]` is the best cost to arrive that way. Two different approach edges into the same node are now two different states, so P-to-M and Q-to-M both stay alive, the downstream turn gets priced correctly off each, and the costlier approach can win when it earns its keep.

The state arrays go from node-indexed to edge-indexed. Before:

```swift
var gScore = [Double](repeating: .infinity, count: nodeCount)
var cameFromEdge = [Int32](repeating: -1, count: nodeCount)
var closed = [Bool](repeating: false, count: nodeCount)
```

After:

```swift
let edgeCount = graph.edges.count
var gScore = [Double](repeating: .infinity, count: edgeCount)
var cameFromEdge = [Int32](repeating: -1, count: edgeCount)   // predecessor edge index
var closed = [Bool](repeating: false, count: edgeCount)
```

The relax step used to read the frozen incoming edge off the node. Now the popped state already is an edge, so the incoming edge is that edge, and the turn is charged from it directly:

```swift
let currentEdge = graph.edges[Int(currentEdgeIndex)]
let v = currentEdge.to          // standing here, having crossed currentEdge
for outIndex in graph.outEdgeRange(of: v) {
    let out = graph.edges[Int(outIndex)]
    if closed[Int(outIndex)] { continue }
    let stepEdge = cost.edgeCost(out, in: graph)
    let stepTurn = cost.turnCost(from: currentEdge, to: out, at: vNode, in: graph)
    let tentativeG = gCurrent + stepEdge + stepTurn
    if tentativeG < gScore[Int(outIndex)] {
        gScore[Int(outIndex)] = tentativeG
        cameFromEdge[Int(outIndex)] = currentEdgeIndex
        heap.push(Int(outIndex), priority: tentativeG + h)
    }
}
```

Same heap, same cost protocol, same result type coming out. The only change is what the index means.

## The parts that got fiddly

Rekeying the middle of the search is easy. The edges are the ends.

A search doesn't always start on a clean node. Tap a point halfway down a street and the start is a partial edge. Its edge state is just that edge: you've already crossed the leading partial, so seed it directly.

A start that really is on a node has no incoming edge, so there's nothing to seed. For those I relax each out-edge of the start node once, charging the turn from a nil incoming edge, which the cost model reads as the origin maneuver. That produces the first real edge states.

The goal side flips the same way. The old search stopped when it popped the goal node. The new one stops on the first edge whose `.to` is the goal node, and because A* settles in nondecreasing `f`, that first arrival is the optimal one. Reconstruct then walks the `cameFromEdge` chain backward over edges instead of nodes. One degenerate case skips the edge machinery: a node start whose node already is the goal, zero edges crossed, cost zero. I kept it as its own early exit, the same shape as the old start-equals-goal guard.

## The number that was the bug

The regression test builds that six-node trap and asserts two things: the total cost comes back 6, and the path goes through Q, not P. The edge-keyed search passes it. The node-keyed code returns 104 and routes straight through the trap.

That 104 was the whole bug in one number. A router written specifically to weigh turns was handing back the one route its own cost model most wanted to avoid, and it did it confidently, because the state it searched over couldn't represent the thing it was there to optimize. The node was never a valid state for this problem. It just looked like one until a turn made the difference.
