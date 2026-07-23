---
title: "The Self-Updating README: A Go Script, A Daily Cron, And A Footer Chart"
date: "May 2026"
readTime: "5 min"
tags: ["Go", "Automation", "GitHub Actions"]
---

My GitHub profile README has a banner SVG called `assets/timeline.svg`. It's not hand-drawn. A Go program, `scripts/generate_timeline.go`, hits the GitHub API every morning, rebuilds the SVG, and commits it back if anything changed. The workflow is about as plain as GitHub Actions gets:

```yaml
on:
  schedule:
    - cron: "0 6 * * *"  # daily at 6am UTC
  workflow_dispatch:

jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-go@v5
        with:
          go-version: "1.26"
      - name: Generate timeline SVG
        env:
          GITHUB_TOKEN: ${{ secrets.TIMELINE_TOKEN }}
        run: go run scripts/generate_timeline.go
      - name: Commit and push if changed
        run: |
          git add assets/timeline.svg
          git diff --cached --quiet || git commit -m "Update activity timeline" && git push
```

The script pulls two sets of repos: everything under my own account (`/user/repos?type=owner`) and everything under my employer's GitHub org (`/orgs/<org>/repos`), paginated 100 at a time. It buckets them into `named` (a small hardcoded map of seven projects I actually want to show by name, things like `mdview-zig`, `Study-Aggregator`, `coil`) and `otherPushes`, which is just a list of timestamps. Everything under the work org lands in `otherPushes`, because I can't put a client's internal tool names on a public profile.

For a while, the second bucket was an afterthought, literally. If there was any work activity, it got one row at the bottom: an italic "and 14 more" label with a scatter of small dots at 50% opacity along the timeline, whatever `otherColor` (`#3A4450`) happened to be. Featured personal repos got named rows with circles and language labels; work got a caption.

The problem is that caption was lying about where my time actually goes. Most of a given week is spent in that org, not in my seven side projects, and the SVG buried that under a single grey line. So I rewrote the footer.

## From a dot row to a density chart

The commit that changed it, `bb29590`, replaces the dot row with what I've been calling the WORK band: a divider line, a label, and a filled area chart of push density. The featured rows still render exactly as before, on top. Below them, if `otherPushes` is non-empty, the layout adds a divider, a `WORK` label in a new amber (`#D4A574`, replacing the old `otherColor`), and a repo/month count on the right edge:

```
39 repos · 6 mo
```

That number is real: pulled straight from a generated SVG in this commit, over the script's fixed 6-month (`monthsBack`) window.

The chart itself is a 26-bin histogram (`workBins = 26`) of push timestamps across that 6-month window, so each bin is roughly a week:

```go
bins := make([]int, workBins)
for _, p := range otherPushes {
    days := p.Sub(cutoff).Hours() / 24
    idx := int(days / totalDays * float64(workBins))
    if idx >= workBins {
        idx = workBins - 1
    }
    if idx < 0 {
        idx = 0
    }
    bins[idx]++
}
```

Then it's a standard filled-area path: walk the bins, scale each count against `maxCount`, build a polyline from `chartTopY` to `chartBottomY`, close it back down to the baseline, and fill it at 40% opacity with a solid stroke on top. Nothing fancy, just `strings.Join` on a slice of `"%.1f,%.1f"` point strings and an `M ... L ... Z` path string.

The layout math had to become conditional in a way it wasn't before. Previously the SVG height was just `topPad + rowCount*rowH + bottomPad`, where `rowCount` included one extra row if there was any work activity at all. Now the height depends on whether there's a work band, and if there is, on four extra Y coordinates stacked below the featured rows:

```go
featuredEnd := topPad + len(named)*rowH
hasWork := len(otherPushes) > 0
var dividerY, workLabelY, chartTopY, chartBottomY, height int
if hasWork {
    dividerY = featuredEnd + 10
    workLabelY = dividerY + 20
    chartTopY = workLabelY + 12
    chartBottomY = chartTopY + 30
    height = chartBottomY + bottomPad
} else {
    height = featuredEnd + bottomPad
}
```

`bottomPad` itself dropped from 24 to 12, since the chart now supplies its own visual weight at the bottom of the image instead of the whitespace doing it.

## What stayed the same

The anonymization logic didn't change at all, and that was the point of keeping it separate from the display logic. The `featured` map is still the only thing that decides whether a repo name ever reaches the SVG; everything else, work org included, is reduced to a timestamp before it ever gets rendered. The rewrite only changed what happens to that pile of timestamps once they're already anonymous. A dot row said "there's more, trust me." A weekly-density area chart says how much more, and when, without saying what.

The SVG regenerates daily at 6am UTC whether I look at it or not, so the count on the right edge, `39 repos · 6 mo` as of this commit, drifts on its own. That's the whole point of wiring a cron job to a `git commit` step: the README is never more than a day stale, and I never have to remember to update it.
