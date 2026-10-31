# Extraction ledger — every direction, with its evidence and verdict

Add a row for every attempt, including failures, specific enough to retry without the code. "Revisit
if" says when a dropped idea could come back. Grades are against `labels/fable-v1.json`, judged by a
model, **not the owner**: 111 curves called vessels, 74 called not, 9 vessels nobody traced, in five
160 µm tiles. On counts this small a difference of one to three is noise.

## Versions

| id | version | adds | vessels found | non-vessels kept | missed found | F1 | plausibility (fr1 / fr2 / ca1r1 / ca1r2) | verdict |
|---|---|---|---|---|---|---|---|---|
| V1 | v1-flat-skeleton | the tracer as of 2026-10-28 (`vessel_model.py`) | 106/111 | 24/74 | 2/9 | 0.880 | 0.74 / 0.18 / 0.23 / 0.06 | baseline, kept |
| V2 | v2-scored-repair | lumen fill, ridge snap, speck test, weak short loops broken, straight gap bridges, crossing split | 103/111 | 17/74 | 2/9 | 0.892 | 0.86 / 0.72 / 0.72 / 0.50 | kept |
| V3 | v3-geodesic-bridges | open ends follow the ridge map to a landing point (minimal path) | 103/111 | 17/74 | 2/9 | 0.892 | 0.85 / 0.72 / 0.74 / 0.51 | kept, no measured gain: the labels hold few gaps (see L6) |
| V4 | v4-line-evidence | short confirmed dead ends must pass the quarter-turn and ridge tests | 102/111 | 14/74 | 2/9 | 0.899 | 0.84 / 0.70 / 0.78 / 0.49 | kept |
| V5 | v5-no-short-islands | owner rule: lone vessels under 45 µm dropped | 102/111 | 13/74 | 2/9 | 0.903 | 0.83 / 0.70 / 0.78 / 0.49 | **default** |

Plausibility is not monotone with the grade: bridges and kept strong loops lower it while finding
more. Rank versions by the grade; read plausibility for *which* biological rule a version breaks.

## Attempts and lessons

| id | idea (source) | mechanism | result | verdict / revisit if |
|---|---|---|---|---|
| L1 | Score graphs with biology (owner) | `score.py`: on-signal share, short loops (2 edges, or <100 µm round; 2026-10-29 correction from Blinder 2013: ~15% of real loops have 2-4 edges, so a 3-4 edge loop is no longer suspect by count), open ends inside the frame per junction (Blinder: no blind ends in healthy tissue), degree-4 rate over 7%, junction smallest angle <45°, two edges narrowing into one junction and Murray, both at arteriole/venule junctions only (capillary junctions converge and diverge evenly, Smith 2019) | v1's attached-image loops are the dominant flag: 14-128 short-loop edges per stack, 6-26 after v5 | kept as the shared scorer |
| L2 | Break every short loop at its weakest edge (Claude) | weakest by on-curve over beside-curve signal | plausibility 0.01→0.69 on CA1 r2, but **deleted real thick vessels** whose traced curve ran beside the vessel | dropped; now only weak edges (<0.75 of the field's median contrast) or twin edges go, strong loops stay flagged for the owner |
| L3 | Thick vessels trace as two lines around a dim lumen (diagnosis) | fill mask holes narrower than the mask's median vessel width before skeletonising | CA1 loops fall (139→44 flagged short-loop edges on CA1 r2 after the rest of v2) | kept in v2+ (`fill_lumens`) |
| L4 | Validate a segment by the pixels along it (owner) | ridge snap of curve points; quarter-turn test (signal along the curve minus the same curve turned 90°) | v1 candidates: quarter-turn removes 23-258 per stack, mostly the scribbles over speckle | kept |
| L5 | Bridge fragments (owner: fragmentation inflates counts) | straight bridge to a facing end or a vessel's side within 6 widths, ±35°, same depth, gap keeps 40% of the vessels' contrast | 0-12 bridges per stack | kept, conservative |
| L6 | Geodesic bridges (ideation: neuron/road tracing) | minimal path over 1/(sato ridge) from each open end, 12 widths ahead, ±60° | 2-9 more joins per stack; grade unchanged | kept; revisit when labels cover gaps (the judges flagged 9 missed vessels, few of them gaps) |
| L7 | Dead ends on speckle (grade: largest error class) | Fable "not" curves the pipeline kept are short (median 12 µm), half the ridge strength, low quarter-turn lead | 17→14 kept non-vessels for one real vessel lost | kept in v4; the cut-offs are shares of the field's own medians |
| L8 | Short lone vessels are noise (owner, 2026-10-29) | edge with no junction at either end and under 45 µm (median cortical capillary segment, Ji 2021) | 25-46 islands per stack; no judged vessel lost | kept in v5 |

| L9 | Branch angles in 3D (owner gave the z-step, 1 µm, 2026-10-29) | each branch's direction is the mean direction of its curve just outside a sphere as wide as the widest branch (Cassot 2010), x, y and depth in µm; smallest angle under 40° flags a fork; a branch over 50° out of the other two's plane flags a steep junction | v5 out-of-plane rate 4-7% on three stacks, 18% on CA1 r2 (Cassot: under 10% of real junctions); depth is noisy at about a slice over a few-µm tangent, so the rate runs high | kept in `score.py`; replaces the 2D chord to the next control point |

## Ideas not yet tried (from the algorithm-ideation pass, 2026-10-29)

Largest classes after v5: 13 kept non-vessels (short branches on speckle, duplicate traces across
thick vessels in CA1), 7 of 9 judged-missed vessels still missed (faint capillaries at speckle
brightness), 6-26 flagged short-loop edges per stack that are strong on both sides, and 1-1.75 open ends inside the frame per junction (each a gap or a spur by Blinder's no-blind-ends rule).

| idea | lens | targets | cost | kill test |
|---|---|---|---|---|
| Trace in 3D, not on the flat picture: hysteresis per slice and link through depth | change the evidence | crossings and loops that are vessels at different depths; faint vessels hidden by brighter ones above | high | loops in CA1 stay as many |
| Collapse twin traces of one thick vessel into its centreline (medial axis of the filled vessel, not of the skeleton) | change the unit | CA1 duplicates and strong short loops | medium | CA1 loop count unchanged |
| Ridge-map hysteresis as the candidate source instead of an intensity threshold | change the evidence | faint vessels missed | medium | judged-missed recall stays ≤2/9 |
| Optimise the score directly: greedy add/remove of edges from the union of all versions, accept when grade-free plausibility and line evidence both improve | optimise the score | trades in L2 done by search, not order | medium | non-vessels kept does not fall |
| Grow branches where the biology says one must leave: a junction with a parent wider than its child gets a search for the missing child | invariants generate | missing branches | medium | few junctions qualify (taper known on few edges) |
| Versions vote: keep an edge two of three versions confirm | combine | stability | low | grade equals the best single version |

## Owner input, triaged (2026-10-29)

- **Algorithm ideas** (here): loops are wrong (L1, L2), directionality and junction shape as a
  score (L1), start/end widths (every version writes `r_a`/`r_b`), pixel validation of each segment
  (L4), several versions kept like NOR Finder (this folder), a creativity skill (algorithm-ideation),
  Fable comparisons as provisional truth (`fake_truth.py`), short lone vessels are noise (L8).
- **Biology insights to verify with an expert** (collected in `references/BIOLOGY-INVARIANTS.md` by
  the biology thread): "vessels form a DAG with no loops" holds for flow direction but the capillary
  bed is a mesh with loops of ~9-11 segments; "narrowing is the flow direction" holds in arterioles
  but flips in venules, and capillaries barely taper.
- **UI** (the viewer threads): tubes, white 80% opaque vessels, faded low confidence.
