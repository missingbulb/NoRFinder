# Working in 3D — the owner's confocal stacks

> Where the 3D work on the raw stacks stands. The stacks themselves: [`studies/vascular/data/README.md`](../data/README.md).
> Working rules: [WORKING-GUIDE.md](WORKING-GUIDE.md). Overall state: [STATUS.md](STATUS.md).

## The problem

Each stack is **30 optical slices × 2 channels** (DAPI, CD31) of one 1200 × 1200 field at
0.55 µm/px: a block of tissue about 660 µm wide and a few tens of µm deep. The figure-panel
pipeline flattens a field into one picture. Flattening is one view of the block, and it loses
three things the metrics need:

- **Length.** A vessel tilted out of the image plane by θ projects to L·cos θ, so flattened length
  is a lower bound.
- **Junctions and count.** Two vessels crossing at different depths meet in the flattened picture
  and read as a junction, splitting both into extra segments.
- **Width.** Two parallel vessels stacked in depth merge into one wide one, and out-of-focus haze
  from other slices widens a thresholded vessel. A vessel is narrow in x-y but smeared along z by
  the microscope's axial blur, so its true diameter is read across it in the slice where it is
  sharpest, never along z.

Before anything is measured in 3D the owner needs to judge, by eye, whether the stacked slices
form a believable vessel network, which crossings are real, and what "one vessel" looks like
through depth. That is the feedback loop this page serves.

## What others do

- **The standard 3D vessel pipeline** (STAR Protocols 2020, "3D quantification of vascular-like
  structures in z stack confocal images",
  [link](https://www.sciencedirect.com/science/article/pii/S2666166720301672)): record the voxel
  size, correct the signal lost with depth, median-filter 3×3×3, deconvolve, threshold the whole
  stack at once, skeletonize in 3D, convert to a graph, and read each segment's length off the
  graph and its mean diameter off a distance map. It states outright that a single maximum
  projection limits accuracy. Its tools are Fiji + Amira (commercial) + WinFiber3D.
- **Open-source analysers of a segmented 3D volume**: VesselVio
  ([link](https://www.sciencedirect.com/science/article/pii/S2667237522000443)) and Vessel Metrics
  ([link](https://www.biorxiv.org/content/10.1101/2022.12.22.521670v1.full)) take a 3D mask and
  report length, radius, branch points and tortuosity. Both need the voxel size, z included.
- **Viewers**: napari ([napari.org](https://napari.org/)) is the standard open-source Python viewer
  for multi-channel z-stacks (maximum-intensity and isosurface 3D rendering); Fiji's 3D Viewer and
  Imaris fill the same role. All of them need a local install, and the owner works without a local
  machine, so this project renders the same way in a web page instead (below).

Every one of these starts from the z-step. The stacks do not record it (see below).

## The 3D stack viewer

`analysis/export_stack_view.py` turns one stack into a web page that ray-casts the volume in the
browser (WebGL2):

```
python3 analysis/export_stack_view.py --inspect STACK.tif        # header only, reads no pixels
python3 analysis/export_stack_view.py STACK.tif OUT_DIR [--z-step UM]
```

`OUT_DIR` holds `index.html`, `meta.json` and one 8-bit volume per channel (a lossless grayscale PNG of the slices stacked vertically), binned 2× in
x-y (600 × 600 × 30, 1.1 µm/px). It is published as an Artifact for the owner; the rendered
volumes are derived data, regenerated, never committed. The page offers:

- **Brightest** (maximum intensity along each ray) and **Surface** (a lit surface where the signal
  crosses a chosen level) renders, rotatable, pannable, zoomable, opening on the microscope's own
  top-down view.
- **Colour by depth**, so crossings at different depths show as different colours.
- A **depth slab** (show slices *a*–*b*) and a **slice-spacing slider**, since the true spacing is
  unknown.
- The **flattened picture beside any single slice**, and a per-slice brightness curve that shows
  how signal fades through depth.

Both channels are scaled by one brightness window over the whole stack, never per slice, so a
fade with depth stays visible. The per-slice shift figure is an upper bound on stage drift, because
vessels running obliquely through depth also move from slice to slice.

## What the first real stack showed (`cd31_frontal_x20 r 1`, 2026-09-28)

- **Only slices 1–12 carry signal.** CD31's brightest 1% falls from 233 to 16 (of 255) by slice 16
  and stays there, and DAPI fades the same way, so the lower half is below the tissue or past what
  the light reaches, not thin vessels. The single-slice panel opens on the highest-contrast slice for that reason.
  The owner (2026-09-29) expects this and is checking it on their side.
- **The slices are aligned:** neighbouring slices shift by at most 0.4 px (0.4 µm at bin 2).
- **The background is high** (half of a bright slice's pixels sit above half scale).

## The approved view (owner, 2026-09-29, on frontal r1)

CD31, colour by depth, black point 0.63, white point 1.0, slice spacing 1 µm (still a guess), and
these are the viewer's defaults. It is the frozen render: change it only when the owner asks. The
brightness points are fractions of each stack's own percentile window, so re-check them with the
owner on the first stack from another region.

## What the owner wants out (2026-09-29)

- **No accepted ground truth exists.** The owner asked for a draft to correct.
- **The output is the whole vessel graph**, usable as ground truth with researchers: per edge (a
  junction-to-junction or junction-to-tip segment, the locked COUNT unit) its 3D length and its
  width with the width's spread; per node its position, degree and kind.
- **Invariances (default, not yet confirmed):** the graph must not change when a stack is rotated
  or flipped, or imaged brighter or dimmer.

## The vessel model: a correctable answer key

```
python3 analysis/vessel_model.py STACK.tif OUT.json      # a CD31-only trimmed stack or a two-channel original
```

The model (format `vessel-model/2`, agreed with the owner 2026-10-27) is the junctions and tips in
3D joined by smooth curves, with the stack's own number of slices: x, y and the radius r in µm from
the image's top-left corner, z in slices (the z-step is unknown, so 3D lengths are left out, never
guessed), and `status` draft or corrected. Each edge runs from node `a` to node `b` through its
`via` points, which sit on the vessel, as a centripetal Catmull-Rom curve; on-vessel points were
chosen over Bézier handles, which float off the vessel at a depth that is hard to see. Each edge
carries a `vessel` id, the extractor's guess at which branch continues a trunk through a junction
(the straightest pair within 60° of straight on), for the owner to correct; and `reviewed_regions`
are boxes the owner has checked completely, empty in a draft. An edge may also carry its start and
end widths, `r_a` and `r_b` (radius in µm at `a` and at `b`), and narrows steadily between them along
its curve; and `flow`, `"ab"` or `"ba"`, the direction blood runs, absent where it is unknown. Where
an edge has no `r_a`/`r_b`, its radius runs between the `r` of the points along it. Its `_about` field defines the rest. It is drawn the owner's chosen way, flat plus depth:
each slice in its own noise units, flattened, hysteresis 5σ / 2.5σ, skeletonised, spurs under 2
parent widths, specks under 4 widths and networks adding up to under 10 widths dropped, each
centerline point placed at the depth where its signal sits (median over 2 widths along the
vessel), then each vessel between two junctions or tips fitted with the fewest via points that keep
the curve within half its width of the centerline sideways and within 2 slices in depth (a capillary
spans 4 to 6 slices at half its peak, measured on frontal r1, frontal r2 and CA1 r2), after the
pixel path's stair steps and the depth's noise are smoothed out over half a width and one width.
A vessel takes up its width (owner, 2026-10-28): two junctions whose discs (radius from the distance
map) overlap are one junction, merged midway, and a spur is measured from the edge of the junction it
leaves, not its centre. Faint candidate stubs left dangling once the confident trace has taken their
middle (under 2 widths with one free end, under 4 with two) are dropped. Where junctions still crowd
more than the stack's own mean density allows (a count within 5 typical widths with Poisson
p < 0.001), the area goes into `dense_regions` as probably traced wrong, and the viewer outlines it in
amber; nothing there is deleted.
`excluded_regions` are areas of damaged sample (a fold, a tear, a bubble, debris, out of focus) the
owner marked to leave out of the analysis (owner, 2026-10-29): each an outline in µm drawn from above
with a reason, running through every slice, since the stacks are thin and damage cuts through all of
them. Vessels lying mostly inside are counted apart, not as part of the network, and densities are to
be taken over the field outside them. **Mark a damaged area** in the viewer lassos one; clicking a
hatched area changes its reason or unmarks it. The extractor writes the list empty.
Each edge carries a `state` and a `confidence`. The tracing above makes the
`vessel` segments. A second, fainter tracing (hysteresis 3.5σ / 2.0σ, same cleaning) adds whatever
lies mostly outside the confident mask as `candidate` segments, joined onto a confident vessel where
they reach one; the confident part is exactly what the single tracing drew. `confidence` is the
vessel's median signal over the 5σ seed, capped at 1: a ranking for review, not a calibrated
probability. The owner turns a candidate into `accepted` or `rejected`; a rejected one stays in the
file as a recorded no. Junctions are never stored: a point where two confirmed (`vessel` or
`accepted`) segments meet is a bend, three or more a junction, so accepting a candidate is what
makes its branch point a junction.

Drafts for all four trimmed stacks ship with the MicroViewer (`microviewer/models/`), and opening
one of those stacks loads its draft (the name is matched without case, spaces or punctuation, so a
Drive copy finds it too); **Reload the draft model for this stack** starts over from it. **Side by side** shows
the stack and the model in two views that turn and zoom together; **Overlay** draws the model in
magenta over the stack. On the model: drag a point to move it (in the plane of the screen, so a
tilted view moves it in depth too); right-click a segment to delete it or add a bend, a junction to
split it into vessels that cross (branches paired off straightest-through first, each pair at the
depth between its neighbours, a leftover branch detached as a tip), or any point to delete it;
right-drag from one piece to another to connect them. Candidates are drawn faded, can be hidden,
and a click on one approves or declines its whole vessel (junction to junction; A or D while
pointing at it). Edits are kept in the browser until
**Download corrected model**, with undo and redo. `tests/test_vessel_model_edits.mjs` pins the edits.
In memory the viewer holds an edge's via points as points of their own, so moving a point drags the
curve, **Add a curve point here** adds a bend, and removing one lets the curve run smoother; the
download collapses them back into edges. It still reads `vessel-model/1` files and writes them out
as `vessel-model/2`. A right-click on a junction also offers **Look at it from the side**: the stack
is cut down to a box of 8 vessel radii (at least 10 µm) around the junction and seen level, across
its straightest pair of branches, so two vessels that only cross sit apart in depth. It is a review
aid, not a detector: closer than the 4 to 6 slices a vessel spans, two vessels touch from every
angle. Any of the view buttons shows the whole stack again.

**Moving around the view (owner, 2026-10-29).** Dragging turns the view about the centre of the
screen, wherever panning has put it, and the stack's three axes are drawn there, a fixed size, as the
one thing that stays put while the view turns. A wheel or pinch zooms, a sideways scroll pans left and
right, and shift-drag or right-drag pans. The stage carries no instructions of its own. The model's
points, the handles that are dragged to correct it, appear only once the view is zoomed in to twice
the whole-stack view, so the opening picture is the vessels alone; until then a point cannot be
picked, and segments still can. While a point is dragged, every other handle is hidden and the stack
and the model away from it fade, leaving clear what lies within reach of the point (its farthest
neighbour, and at least 60 px).

The **Items** tab takes the model apart into its units of work, the way NOR Finder reviews each
candidate on its own: a card for every junction (three or more live branches, so one that waits on
a candidate's review is listed and marked) and every vessel (an edge from a junction or tip to the
next). A card shows the stack around its item, flattened over the shown slices in the depth
colours, with the rest of the model thin in magenta and the item in white; a vessel's band is its
modelled width. A vessel card gives its length (along the curve, with depth at the drawn slice
spacing), mean width and range, and depth span, and approves, declines or deletes it; a junction
card gives its depth, width and how many other junctions lie within 20 µm (crowding is a sign the
trace went wrong there), and opens the side view or splits it as a crossing. Filters show the ones
worth a look (candidates; junctions that are pending, of four or more branches, or crowded) and
the declined vessels; sorting brings the shortest, widest, most branched or most crowded first.
**Show in 3D** cuts the stack down to the vessel and looks at it from above. Every card edit is an
ordinary edit, undone and downloaded with the rest.

**Vessels as tubes (owner, 2026-10-29).** Beside the stack the model is a picture of its own, so it
can be told apart from the image at a glance: the depth colours are the stack's alone, and the model
is drawn white at 80% opacity. With **Show vessel widths** on, each vessel is a shaded tube as wide
as the vessel, narrowing from its start width to its end width; off, it is a plain line. A
low-confidence vessel is faded, never dotted: a paler blue at 40% beside the stack, fainter magenta
over it, and fainter on the item cards; a junction that waits on one is faded too. Over the stack
the widths stay two slim edges, tapering the same way, so the signal under them stays readable.

**Review: Detected and Missed (owner, 2026-10-28).** The owner asked for two ways to look at the
stack against its model: one keeping only the stack's layers where vessels were detected, to check
and measure them, and one keeping only the rest, to find what was missed. Once a model is open, the
**Review** box offers **Everything**, **Detected** (only the signal within reach of a shown vessel)
and **Missed** (only the signal away from every shown vessel; whatever bright line is left is a
vessel the model does not have). Within reach means inside a tube along each curve of the vessel's
own radius `r` plus **Reach beyond the vessel wall**, a share of that vessel's own width from 0% to
200% (default 50%), so a narrow vessel allows fewer pixels of error than a thick one (owner,
2026-10-29; it was a fixed 2 µm before), reaching as far in depth at the slice spacing the view draws; a point without a radius takes the model's median. Hidden candidates
and declined vessels cover nothing. Both renders, both flattened pictures and the depth picking
below honour the review. Hovering a vessel shows its width (⌀ = 2 r) there.
**Draw a missed vessel** places a new vessel a click at a time: a click on an existing point or
vessel snaps to it, anywhere else lands on the brightest shown voxel under the pointer (so in Missed
the depth comes from the unexplained signal itself). Joining an existing vessel, Enter or Escape
ends it; each click is one undo step. The drawn vessel is an owner-drawn `vessel` edge with no
radius yet. `tests/test_microviewer_coverage.mjs` pins the tube.

**First draft (2026-10-03):** 961 points, 920 segments, 136 junctions, 222 tips, 55 KB. Seen before
the owner's corrections: the main network is followed; the bright tissue edge down the left side is
traced as a vessel; faint vessels in the lower right break into short pieces or are missed; a few
junctions sit in small clusters where a vessel runs past a bright blob; crossings are not split
(the crossing test in `trace_vessel_graph.py`, below, is not in this generator), so each X is a
junction for the owner to split.

**Low-confidence candidates (2026-10-26):** the same confident draft (961 points, 136 junctions,
unchanged), plus 743 candidate segments in 161 vessels that would add up to 72 junctions, 165 KB.
Seen before review: a few candidates bridge gaps in a confident vessel, which is what the review is
for; most are short curls in the speckled lower half that are probably noise. Their thresholds are
a first guess, untuned against any review.

**Curves (2026-10-27):** the same 136 confident junctions and 222 tips on frontal r1, now as 358
curved vessel edges through 381 via points where the straight draft needed 643 bend points, in 184
vessel ids; 161 candidate vessels (69 pending junctions); 102 KB. Seen against the stack (outline
over the brightest-over-depth picture, zoomed 3×): the curves follow the vessels as closely as the
straight segments did, with fewer points. The tracing faults above are unchanged, since only the
fit after tracing changed.

**Widths as extent (2026-10-28):** owner asked for widths that keep vessels apart, far fewer short
vessels, and a flag on junction knots. Confident edges, junctions, share of edges under 10 µm, and
pairs of vessels whose widths overlap without sharing a junction, before → after:

| Stack | Edges | Junctions | Under 10 µm | Overlapping pairs | Centerline |
|---|---|---|---|---|---|
| frontal r1 | 358 → 236 | 136 → 78 | 32% → 7% | 36 → 0 | 9.7 → 9.3 mm |
| frontal r2 | 858 → 491 | 335 → 178 | 47% → 16% | 309 → 12 | 14.6 → 13.8 mm |
| CA1 r1 | 674 → 401 | 308 → 169 | 36% → 11% | 206 → 6 | 12.7 → 11.9 mm |
| CA1 r2 | 1045 → 580 | 533 → 261 | 38% → 11% | 491 → 11 | 18.2 → 16.6 mm |

Seen against the flattened stack: the strings of junctions along wide vessels and blobs become one
junction per branch point, and the ladders of short edges inside them go, which is most of the 4–9%
of centerline lost (it was counted twice). Still there: faint squiggles traced over speckle as lone
pieces, a few small loops, and knots where crossing vessels tangle; the knot test marks 4 of these
(CA1 r1 one, CA1 r2 two, frontal r2 one, frontal r1 none). Untuned against any owner review.

## The graph tracer: the earlier draft route

```
python3 analysis/trace_vessel_graph.py STACK.tif OUT_DIR --region Y0,X0,SIZE [--z-step UM | --flat]
```

It writes the region's viewer files and `graph.json` (its `_about` field defines every field). The
viewer then draws the graph over the approved view, and the owner clicks an edge or a junction to
mark it right, wrong or unsure, or marks a vessel the draft missed on the flattened picture. The
published page keeps the marks in its store under the draft's id, which changes whenever the
tracing does, so marks never attach to the wrong edge. Tracing, in scale-free terms: background
removed at ~11 µm, hysteresis at 5σ / 2.5σ of each plane's own noise, planes with no signal above
noise skipped, 3D skeleton, then bumps (spurs shorter than the Murray limit below), specks and
split junctions cleaned out. `--flat` flattens the planes that carry signal (each in its own noise
units, so a deep faint vessel still counts) into one picture and traces that, with no depth. `tests/test_trace_vessel_graph.py` pins the graph bookkeeping on drawn tubes.

**First draft (2026-09-29):** frontal r1, region `400,400,400` (220 µm square, all 30 slices,
z-step 1 µm guessed): 114 edges, 49 junctions, 2011 µm of centerline, traced down to slice 17. Seen
before the owner's marks: the main vessels are followed; faint links between them are missed; a few
edges are specks (short isolated pieces); junctions cluster where a vessel runs along a bright blob.
That draft pruned spurs under 3 vessel widths, before the Murray limit.

**The owner's call on flattening (2026-09-29):** a plain flattened trace is not enough. After
rotating the 3D view, two vessels that the flattened picture shows as one crossing are plainly
distinct. Offered full 3D tracing or a flat trace that uses depth only to split crossings, the owner
chose **flat plus depth**: lengths stay in the image plane, and depth decides crossing vs junction. A first measure of how
often this bites: on the flattened draft, 11 of 25 junctions have branches whose brightest slice
differs by 4 or more (indicative: the brightest slice per pixel is noisy on faint vessels).

**Flat plus depth — the crossing test.** `segment_flat` also returns where each pixel's signal sits
in depth (the noise-normalised planes' intensity-weighted mean slice). At every junction of the flat
trace, each branch's depth is read 1–5 of its widths out (clear of the junction's blend), sorted, and
split into groups wherever neighbours differ by more than 3× their pooled point-to-point depth
noise (floored at half a slice). If the groups separate and one of them is a pair running straight
through (over 120° apart), the vessels cross: each group gets its own node, so the pair becomes one
vessel passing through. A lone branch that merely climbs or dives stays a branch. `graph.json`
lists these as `crossings`, and each edge carries `depth_slices` so the 3D view can draw the flat
draft at its depth. Region `400,400,400`: 51 edges, 18 junctions, 7 crossings, 1541 µm (the central
X of the region is crossing 3: slices 0–1 against 4). Seen before marks: 3 and 7 look like real
crossings; 5 and 6 cut a short stub off a vessel that changes depth, which may be wrong.

**Per-slice detection, then merge (owner asked, 2026-10-02).** Each slice is segmented on its own
(same noise units and hysteresis as the flat trace), then at each junction of the flat trace two
branches are joined only if some slice shows both of them, each within one slice of where its own
signal is at least half its peak, in one connected piece around the junction. Branches that never
share such a slice are separate vessels; a branch no single slice shows (too faint alone) gives no
evidence. **The owner chose slices first, depth as fallback (2026-10-02), and the tracer now
does that:** the slices decide wherever they show at least two of a junction's branches; a branch no
single slice shows joins the group nearest its depth; with fewer than two shown, the depth test
decides. Each crossing records `decided_by`. Region `400,400,400`: 51 edges, 17 junctions,
8 crossings, all decided by the slices, 1554 µm. Against the depth test's 7 crossings: both agree on 4, including the central X, which the slices show plainly (one vessel in slices
1–2, the other in 3–7). Seen before marks: the slice method is right where a vessel dives with a
stub on it (the depth test's 3 extra calls look like that), and it pairs the through-vessels by
itself; it is weakest where a branch is faint in every single slice, which it can only leave
undecided.

**The spur limit — Murray's law (owner asked, 2026-09-29).** The owner proposed not marking a node
whose side branch is no more than about twice the vessel width. Murray's law says a parent of radius
r0 splits into daughters with r0^a = r1^a + r2^a; a = 3 for laminar flow (Murray 1926; Wikipedia,
"Murray's law"), and measured capillary networks sit nearer a = 2–2.2 (PLOS One 2023,
doi:10.1371/journal.pone.0292962, retinal capillaries). An even split's daughter is therefore
2^(-1/a) = 0.71–0.79 of the parent's width, and even a lopsided real branch is a vessel, not a bump,
once it has left the parent's wall. So a real daughter reaches at least half the parent's width
(to the wall) plus its own width beyond it: `SPUR_WIDTHS = 0.5 + 2^(-1/3) ≈ 1.29` parent widths,
the parent width being the median width of the other edges at that junction. That is a floor: a
spur shorter than it cannot be a real branch. On the first flattened region, every stub between the
floor and 2 parent widths was a bump on the wall (skeleton roughness plus bright blobs), so the
tracer uses the owner's 2×, which Murray's law shows cuts no real even-split daughter.

**Flattened draft (2026-09-29):** same region, `--flat`, 2× limit: 60 edges, 25 junctions,
1542 µm of centerline, median width 3.6 µm. At the 1.29 floor: 76 / 31 / 1579 µm; at 3×: 52 / 22 /
1512 µm, so the limit moves node counts much more than length. Seen before marks:
the main vessels and most faint links are followed; a few specks and short stubs off bright blobs
remain.

## Open questions for the owner

1. ~~**The z-step**~~ — answered by the owner on 2026-10-29: **1 µm**, recorded in
   `data/sources.json` and read from there by every script when a file stores none.
2. **Ground truth.** Nothing measures width or length until the owner has marked the draft graph:
   which edges are vessels, which junctions are real, and which vessels the draft missed.

## Ledger

| Idea | Source | Status |
|---|---|---|
| Flatten all slices into one maximum projection, then run the 2D pipeline | earlier plan | Kept as the baseline and shown beside every 3D view; loses length along z, fuses crossings at different depths, and can merge stacked vessels into one wide one. Revisit as the naive baseline once a 3D answer key exists. |
| Look at the stack in 3D (ray-cast brightest + surface), by depth colour | owner, this page | First real stack published 2026-09-28 (`cd31_frontal_x20 r 1`, bin 2, spacing guessed); owner approved the view 2026-09-29 (settings above). |
| A small straight-line model of the whole stack, corrected by the owner in the viewer | owner, 2026-10-03 | Built: draft for frontal r1 slices 1–12 ships with the site, waiting on the owner's corrections. Pairs of short paths between the same two junctions (a vessel split round a hole) collapse to one; without that and the 10-width network floor the draft had 1392 segments, mostly noise specks. Depth where no slice clears the growth level falls back to the brightest slice; before that, 453 of 1504 points piled up at slice 0. |
| Full 3D pipeline: 3D threshold → 3D skeleton → graph → distance-map diameter | STAR Protocols 2020, VesselVio | Built as the draft tracer (above) to produce an answer key for the owner to correct, not as the measurement; scored only once marks exist. |
| Normalise noise per plane for hysteresis | this session | Kept: the signal fades with depth. Alone it blew camera noise in the empty lower planes into junk edges (120 edges, traced to slice 30); skipping planes whose top 0.1% is within 1.5× of pure-noise level fixed it. |
| Seed on the whole stack's noise, grow per plane | this session | Dropped: the stack-wide noise is set by the quiet lower planes, so seeds fired everywhere in the bright upper ones (506 edges). |
| Prune every short spur in one pass | this session | Dropped: a bump and the real vessel's last stretch off the same junction both went, eating the vessel; now only the shortest spur per junction goes per pass. |
| Flatten the raw brightest value, then threshold | this session | Dropped for the flattened draft: deep vessels are faint in raw units and fell below one global threshold; flattening each plane's noise-normalised value keeps them. |
| Spur limit: Murray floor (1.29 parent widths) vs the owner's 2× | owner + Murray 1926, PLOS One 2023 | 2× is the default: Murray gives 1.29 as the floor below which nothing is a real branch, and every stub between 1.29 and 2 on the first region was a bump (2× drops 16 of 76 flattened edges). Owner may overrule by eye. |
| Full 3D tracing, crossings resolved in the volume | owner offered, 2026-09-29 | Not chosen by the owner in favour of flat plus depth. A first 3D run of the same region gave 168 edges and 71 junctions (vs 51 / 18 flat): the volume fragments more. |
| Crossing when branch depths differ, on the whole-edge depth scatter | this session | Dropped: long vessels dive slowly, so the scatter along a whole edge hid the central X; the point-to-point depth noise found it. |
| Crossing on depth alone, no straight-through test | this session | Dropped: a Y whose third arm climbs through depth split into a false crossing. |
| Per-slice detection merged across slices, to split fake junctions | owner, 2026-10-02 | Kept as the primary crossing test, depth as fallback (owner, 2026-10-02): 8 crossings, 4 shared with the depth test. Its one-slice tolerance stops a branch whose peak sits in one slice splitting from its neighbour peaking in the next. Without the half-peak filter, axial blur joins crossing vessels in the slice where both blur. The drawn-tube test needed an axial blur added: flat-topped tubes made every slice equally strong. |
| Merge junctions whose discs overlap (width as extent) | owner, 2026-10-28 | Kept: removes the junction strings inside wide vessels and nearly all overlapping pairs. |
| Flag dense junctions, against the stack's own mean density | owner, 2026-10-28 | Kept as a flag, not a filter: deleting or demoting the edges there would also hit dense real capillary beds; Poisson p < 0.001 within 5 widths marks 0–2 knots per stack. |
| Drop lone pieces by confidence, to remove the faint squiggles | this session | Not done: lone squiggles score 0.6–0.8, but so does a tenth of the connected network, so no cut separates them. |
| Estimate the z-step from the depth extent of round DAPI nuclei | this session | Not tried. Axial blur lengthens every nucleus along z, so it would overstate the spacing; only a cross-check for the lab's number, never a substitute. |
