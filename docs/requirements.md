# Requirements the implementation must satisfy

Standing constraints on *how* the pipeline is built, as distinct from
[`project-brief.md`](project-brief.md), which is what it must do. Each is stated so it can become
a test.

---

## R1 — The pipeline carries no absolute pixel constants

**Every decision rule is expressed in quantities the image measures for itself**, never in pixels
and never in µm. A rule may say "the gap is between 0.3× and 3× the mean paranode length"; it may
not say "the gap is between 8 and 40 pixels" or "between 0.5 and 2.5 µm".

Where a constant is genuinely tied to the sensor rather than to the biology — a denoising radius
matched to the point spread function, say — it is **isolated and labelled** as scale-dependent, so
it is the first thing revisited on new-scale data.

**This is not extra work; it removes work.** Detection needs no physical units at all:

| Spec rule | What it actually needs |
|---|---|
| §4.3.1 two distinct Caspr regions | Blob detection — no units |
| §4.3.2 Nav between them | Ordering along an axis — no units |
| §4.3.3 all three collinear | Angles — dimensionless |
| §4.3.4 gap in a plausible range | **The only rule with a µm number** |

Rule 4 is the one to re-express, and re-expressing it is an improvement on its own terms: a µm
window on node length is a window on **the very quantity the project exists to measure**, so a hard
filter would make the reported distribution partly an artefact of the filter. Stating it as a ratio
to the paranodes flanking that same node removes both problems at once — the units and the circular
prior. Same for §4.2's "close to horizontal", which is an angle and was never a length.

**Consequence:** R1 and R2 are the same requirement seen twice. An algorithm with no absolute
constants is scale-free by construction; there is nothing left in it for a change of scale to break.

## R2 — Detection is invariant to rescaling, rotation and reflection of the input

Running the detector on a transformed image and mapping the results back through the inverse
transform must agree with running it on the original.

**"Agree" means the same nodes, not the same numbers.** A 2× image yields 2× the pixel lengths, and
that is correct. What must match is the *set of detected nodes*, their correspondence, and any
length expressed in physical units or as a ratio.

Three tiers, because they are not equally achievable and pretending otherwise would be dishonest:

### Tier 1 — exact, no tolerance

Transpose, horizontal and vertical flip, and 90/180/270° rotation. These are pixel permutations:
no interpolation, no information lost. **The detection set must be identical after inverse
mapping**, and this is a cheap, strong test that should never be allowed to go amber.

Things that silently break Tier 1, worth watching for: structuring elements that are not
symmetric, filters whose application order differs per axis, and any tie-break that depends on
raster scan order.

*Transpose is a reflection, so it flips handedness.* Our rules survive that because they are
chirality-free — collinearity and betweenness have no left or right. **Any future rule that uses a
signed angle or a sense of rotation would break transpose invariance**, and that is a reason to
reject such a rule rather than to weaken this tier.

### Tier 2 — within a stated tolerance

Arbitrary rotation (34°, the owner's example) and rescaling within the operating range. These
resample, so they blur, shift sub-pixel, and — for rotation — move content across the frame
boundary. Detections must match within a tolerance **expressed as a fraction of paranode length**,
not in pixels, or the tolerance itself violates R1.

The test must pad before rotating, or compare only over the region common to both, so that content
rotated out of frame is not scored as a miss.

### Tier 3 — measured, not asserted

**The scale range over which Tier 2 holds is a measurement, not a promise.**

Downscaling destroys information, and at some point the node gap stops existing in the data. Real
acquisitions put roughly 12–20 pixels across a node gap — 19 px at Arancibia-Cárcamo et al.'s
52.7 nm/px, ~12 px at Appeltshauser et al.'s 75 nm/px, for a ~1 µm node. Halve that once and it is
6–10 px; halve it again and two peaks either side of a gap have ~4 px to live in, which the point
spread function has already smeared together. **No algorithm recovers a gap that is no longer in
the image.**

So the deliverable is a **scale-response curve** — detection count, precision and recall swept
across scale — with the breakdown point read off it and published. That is more useful than a
binary claim, and it tells us directly whether a new dataset at a different magnification is inside
the tested envelope or outside it.

**Explicitly out of scope:** anisotropic scaling (different factors in x and y). It changes angles,
so collinearity genuinely changes, and invariance to it would be wrong rather than desirable.
Microscope pixels are square in xy in every acquisition in the literature notes.

### The harness

A transform-invariance harness needs **no ground truth** — it tests the algorithm against itself.
It can therefore be built and run before any annotation exists, and even against a synthetic
Caspr–Nav–Caspr field before real images arrive. Invariance is a property of the algorithm, not of
the data.

That makes it the **first testable thing this project can have**, and one of the few pieces of work
not blocked on the owner. It is not a substitute for accuracy testing: a detector that finds
nothing is perfectly invariant.

## R3 — Physical units enter only at the reporting boundary

The pipeline computes in pixels. **Exactly one place** converts to µm, at output, using a
per-image factor.

That factor is **read from the file's own acquisition metadata, never measured and never assumed**.
Native microscope formats record physical pixel size — CZI, LIF, ND2 and OME-TIFF all carry it —
so this is a field lookup, not a calibration step. *(Which Python reader to use is unverified until
we have a real file in hand; candidates are `bioio`/`aicsimageio`, `readlif`, `czifile`. Do not
commit to one on this note's say-so.)*

It is a **measurement of that input**, not a project constant: never borrowed from a neighbouring
file, never inferred from a stated microscope setting, and living in exactly one place in the code.

**The one thing that would make this hard:** if images arrive as exported PNG or JPEG rather than
native format, the metadata is gone and no µm output is possible — only pixel-space and
dimensionless quantities. An input offering nothing to calibrate from is **not silently dropped**:
it is marked uncalibrated with the reason, reports only its scale-free quantities, and stays
visible as a known gap.

This is one of several reasons to ask for native multi-channel files rather than exports — the
others being the z-stack (which the reference method's horizontality criterion depends on) and
unambiguous channel identity.

## R4 — Node length is reported under several definitions until data chooses one

The literature offers at least five definitions of "node length"
([`literature/measurement-definitions.md`](literature/measurement-definitions.md)), and the project
overview's own figure uses a different one from the paper it reproduces. **The owner has declined
to pick one, correctly — there is no basis to pick yet.**

The question dissolves rather than waits, because **the definitions share almost the entire
pipeline** and differ only in the last step. Detect the node, fit its axis, sample the Caspr
profile, find the two peaks — all common. Then:

- **A** — crossing at 50% of *each peak's own* height
- **B** — crossing at a *single* threshold (50%, 30%) taken from one peak
- **E** — smallest gap between the two segmented Caspr blocks

Computing all of them costs one extra function each over computing one. So: **compute them all,
report them side by side, each labelled.** No number ever appears without its definition.

The choice then becomes empirical rather than a priori: once the owner has hand-measured a handful
of nodes the way they normally would, **whichever definition best reproduces their own
measurements is the project's definition.** The question they actually have to answer is "show me
how you'd measure this one node" — concrete, and something they already know how to do — not
"which definition do you want", which needed expertise nobody has yet.

**The disagreement between definitions is itself useful**, because they fail in known and opposite
directions: E under-reports on a tilted axon while A and B over-report by 1/cos θ off-axis, and B
alone drifts with brightness asymmetry between the two paranodes. A node where all definitions
agree is well-behaved; a node where they diverge is tilted, asymmetric or noisy. **That spread is a
free per-node quality flag**, and it will be reported alongside.

Honest limit: "report all of them" defers the choice, it does not abolish it. One number eventually
goes in a paper. But that call can be made later, with evidence, and it blocks nothing now.

## R5 — Validation covers pathological tissue, not only controls

Confirmed by the owner: the corpus will include many images, with pathologies.

This is not a nicety. The one published automated node count degraded from **97 ± 11% on healthy
tissue to a median ~85% with a 15–185% spread on pathological tissue**
([`literature/prior-art-detection.md`](literature/prior-art-detection.md)), and the group abandoned
it for their real analysis. Concretely, for us:

- **No accuracy figure is reported without saying which tissue it was measured on.** A control-only
  number is an upper bound and says nothing about the condition the study exists to measure.
- **No threshold or plausibility range is tuned on controls alone.** Node elongation *is* the
  signal; a filter fitted to healthy nodes is blindest exactly where it matters.
- **Void nodes and heminodes will be present in quantity** — ~3% heminodes even in sham, roughly
  doubling after injury, and void nodes rising ~8-fold. They are excluded by the spec's rules, and
  the excluded fraction moves with experimental group. Whether to count and report them separately
  is still an open question for the owner, and now a more pressing one.
- **Report precision and recall against matched per-node ground truth**, never a count ratio. The
  published metric above exceeds 100% because it is `automated / manual`, which cannot distinguish
  a correct count from one with matched false positives and false negatives.

## R6 — Raw data lives on Drive, never in git, and is trusted only by checksum

The owner's microscope files sit in Google Drive; the repository carries only
[`data/sources.json`](../data/sources.json), naming each one by Drive id with its SHA-256.
[`src/fetch_data.py`](../src/fetch_data.py) downloads what is missing into the git-ignored
`data/raw/` and **refuses a file whose checksum differs from the manifest** — a scan silently
replaced on Drive would otherwise change every downstream number with nothing in the repo
recording why. A checksum is `null` until the first fetch pins it (`--pin`); unknown is never
written as a placeholder value. **A fetch can be limited to a subset** (`--match GLOB` over the file's path under `data/raw/`):
the folder is hundreds of MB, and most work needs only a few planes, so pulling everything each
session wastes minutes and disk. Why Drive rather than git, LFS or a Release:
[`data/README.md`](../data/README.md). Test: `tests/test_fetch_data.py`.

## R7 — What counts as a NoR: the owner's validation criteria

Set by the owner (2026-09-25 to 09-27) while reviewing renders; each is a named check in
[`detection/nor3.py`](../detection/nor3.py) (`CHECKS`, letters A-J, plus K and N in
[`detection/nor_rf.py`](../detection/nor_rf.py)), so every rejected candidate says which rule
removed it.

- **Shape of the object.** A green-red-green triplet between nuclei: a short, thick stick
  ("wand"), the red Nav node between two green Caspr paranodes. It is not round, so outlines
  follow its pixels, never an ellipse.
- **Structure.** Exactly three segments in the order green, red, green; the two greens do not
  touch; the three lie roughly on a line (A, B, C).
- **Colour purity.** At most 20% of a segment's core pixels may be lit in the other colour (the
  owner first said 10%, then relaxed it). The 1-px rim where colours meet is left out, because
  optical blur makes it yellow (D, E).
- **Symmetry.** The two greens are similar in area and in total brightness; the smaller is at
  least a fraction of the larger (currently 1/4) (F, H).
- **Stick.** Length along the green-to-green axis over mean width is at least 3, with no gap along
  its length (G; mostly redundant with the others).
- **Bright, not mushy.** The weakest segment is at least 3.5 robust noise units (1.4826·MAD) above
  the local background median. 3.5 sits at a dip in the score histogram; the textbook 5 drops
  good nodes (I).
- **One pixel belongs to at most one NoR.** Overlaps are resolved strongest first (J).
- **Nuclei are not NoRs.** Blue (DAPI) mask: blur σ=2, above 0.45× Otsu (to catch the dim rim),
  drop blobs under 30 px, fill holes, dilate 2 px. The owner approved it on Slide5 (it covers about
  14% of the image). Since 2026-09-27 it is applied after finding: a candidate fails when at
  least 80% of its red lies on the mask (N).

The thresholds are the owner's or were chosen from data with the owner's consent; changing one is
a question for the owner, shown with the objects that only that check rejects.

## R8 — The NoR Finder page: detect once, filter live, in the browser

Set by the owner on 2026-09-28. The page is [`web/`](../web/), served from GitHub Pages with no
backend. Its engine is [`detection/interactive.py`](../detection/interactive.py), tested by
[`tests/test_interactive.py`](../tests/test_interactive.py).

- **One image, one slow step.** Loading an image only reads it. The finder runs when the user
  presses Find Candidates, and that button shines while the finder or its settings differ from the
  last run. Everything else (filters, forced markings, the list, the summary) redraws from the
  stored candidates without finding again.
- **Layout.** A header with the logo, the title and a dark/light switch (remembered). The left bar
  holds the image (Load, with a dropdown for where from: this computer or Google Drive; a
  thumbnail showing the part in view, which moves the view when clicked; its name; a checkbox per
  colour layer, in that layer's colour when on, blue off at first), the candidates finder (its
  "how it works" and its settings fold away) and the filters. The main area has a toolbar over two
  views: the image and the individual items, with the button that switches between them at its
  left and the zoom at its right. The right bar holds the selected candidate, the
  summary and the downloads. Folding or unfolding a box never changes a bar's width. No image is ever drawn out of its proportions: a crop
  or picture narrower than its box shrinks as a whole (`tests/test_page_layout.py`). Both side bars can be dragged wider or narrower (remembered; a double
  click restores one). A status bar shows the image name, the candidate and finalist counts, how
  long each step took, and the site's version (stamped by each release).
- **Moving around the image.** Dragging moves the image; scrolling up and down zooms around the
  pointer in small steps; scrolling sideways steps to the previous or next candidate. The Show
  menu switches accepted and rejected markings on and off, each with its own line width and colour,
  and the candidate numbers, the rejection letters and the measuring lines (remembered).
- **One selected candidate.** Clicking a candidate selects it (a thin white ring) and clicking it
  again deselects it. Its card sits in the right bar with buttons to the previous and next
  candidate by number. Decisions are made on cards, not by clicking the image, with a thumbs up (a
  real NoR, with the lengths shown) and a thumbs down (not one) at the card's top, each saying what
  it does in its tooltip; pressing the chosen one again undoes it and lets the filters decide.
  Pressing either also selects that candidate. Cards the user voted up or down have their own
  border colours. In the item views the selected candidate's card is outlined, clicking a card
  selects it, and switching to the item views opens the tab that lists the selected candidate and
  scrolls its card into sight; the previous and next buttons step through that tab's cards.
- **Filters are live dials.** Every check in `nor3.CHECKS`, the nucleus rule (N) and
  one-pixel-per-NoR (O) is a control that can be switched off. Each shows a letter, a one- or
  two-word title and a line saying what it means (the page's own names, from
  `detection/finder_help.py`; the lab's review sheets keep theirs), and two counts: how many
  candidates it rejects, whatever the other filters do, and how many only it rejects among the
  filters switched on (what switching it off would let through), as plain text reading "X (Y)" after the cards' thumbs-down icon, whose
  tooltip explains that X is the second and Y the first. Each of its parameters is a
  dial, and every marking on the image follows it at once. A dial moved off our value is marked,
  with our value as a tick on its slider that puts it back. Finder and filter settings use this
  one control, so tweaking looks and works the same in both. A check added to `CHECKS` becomes a control with
  no page change.
- **Detection settings are dials too.** They re-run the finder, and the page says that this takes
  time. Each finder names its main settings (its function's `MAIN`), shown first; every setting is
  under a collapsed Advanced box. Each finder shows a few sentences on how it works, and every setting and
  filter value has a ? that says what it does (`detection/finder_help.py`; the test fails when one
  is missing).
- **All finders are offered.** Traffic light is the default.
- **The blue mask is only a filter.** No finder on the page blanks nuclei before finding.
- **Missing candidates.** Right-clicking the image offers "Mark Missing Candidate": a NoR the finder
  proposed nothing for. The mark shows on the image as a dashed yellow circle of the radius it is
  scored within (12 px, about half a NoR's length on the lab's slide), and as a card in its own
  Missing item view, where it can be removed (as it can by right-clicking it). Marks are remembered
  in the browser per file name, whatever the finder.
- **The item views.** Two views: the finalists and the rejected, each candidate cropped on a card:
  its number, state and decision buttons on top, the crop below (with a faint go-to button in its
  corner that shows it on the image), then "Lengths adjusted" with a reset, and the rest.
  A rejected card names every filter that rejects it by itself, or says the user rejected it. Each
  view has its own Options menu (remembered per view) that sets the crop's context padding, turns
  each crop so the NoR lies level, and shows or hides the NoR borders, the measurement bars, the
  lengths on the crop, the lengths on the card and the length adjusters. The finalists open with a
  4 px padding and everything on but the lengths on the card; the rejected open with a 10 px
  padding and only the NoR borders on. The selected card in the right bar uses the options of the
  view that lists it. The adjusters drag the ends of
  the green-to-green length and the red length; the new lengths show on the image, the card, the
  summary and the downloads. The measurements of the finalists are summarised in the right bar.
- **Downloads.** The candidates as CSV (every candidate, its status, its reasons, the user's
  decision and its measurements), the summary as CSV, and the ground truth
  (`norfinder-ground-truth/2`): a JSON file naming the image (its SHA-256, and where it was loaded
  from: its Google Drive id and link, or "local") that lists only what the user marked: every
  candidate voted up (label 1, with its lengths and length lines, marked adjusted or approved) or
  down (label 0), and every missing candidate (label 1, with its radius). A candidate nobody voted
  on is ambiguous and left out. The lab's `nor_lab.py --labels` reads it: the labels score
  detection and the checked lengths score measurement (`tests/test_ground_truth.py`).
- **Submitting ground truth.** For an image from Google Drive, the Ground truth button downloads the
  file and opens a new GitHub issue on the repo, labelled `new-ground-truth` and naming the image
  (name, SHA-256, Drive link, finder, what was marked); a note at the button says to attach the
  file to that issue and that only explicitly marked candidates are sent. An image from the
  computer cannot be submitted: right after it loads, the page says so in one line (at most 15
  words), and the button only downloads. With nothing marked the button says how to mark
  (`tests/test_ground_truth_page.py`). What happens to a submission is R10.
- **Fixed numbers.** Each candidate keeps one number, top to bottom, for as long as a detection
  lasts. Filters never renumber candidates.
- **Remembered marks.** Decisions and adjusted or approved lengths are saved in the browser per
  file name and finder, tied to each candidate's position; missing candidates per file name.
- **Google Drive.** The user pastes the link of an image or a folder shared as "Anyone with the
  link", with no sign-in. An image loads at once; a folder lists its images and subfolders to pick
  from, each image with its size and the date it was added to Drive; the dialog keeps one size
  while the user moves between folders. It needs the site's Google API key, kept in the repository variable `GOOGLE_API_KEY`
  and written into `web/config.js` at deploy; without one the option is off. The dialog opens on
  the last link pasted, or else on the lab's folder (the repository variable
  `DRIVE_DEFAULT_FOLDER`), and lists a folder link at once.
  Nothing read from Drive is cached.
- **No waiting to start.** Python loads in the background from the moment the page opens, while the
  user picks an image, which opens as soon as Python is ready. Its packages download while Python
  itself starts, and the status bar names each stage (downloading, with the megabytes so far;
  installing; loading the finders; ready). Until an image is loaded, Load shines, and the finder and
  filter boxes are folded (their titles open them).
- **Visible waiting.** While an image waits for Python, the page shows a spinner and the elapsed
  time; while a finder runs, a photocopier's light sweeps back and forth over the image, with what
  it is doing and the elapsed time below.
- **An image shows while it downloads.** An uncompressed TIFF like the lab's paints onto the page
  from its bytes as they arrive from Google Drive, one channel after another in its own colour,
  with the megabytes so far and the elapsed time below; a file from the computer shows at once.
  Python's own drawing replaces it once the image is read. Any other image shows the byte count.
- **Remembered settings.** Filter settings persist in the browser across images, visits and
  days, and one button restores the defaults.
- **An open page knows when it is out of date.** Every 5 minutes it compares its version with the
  published one; when a newer one is out, the version box in the status bar lights up and
  refreshes the page when clicked.
- **Only our code is fetched fresh.** Third-party code (Pyodide, its packages, vendored wheels)
  is cached in the browser for 30 days.
- **The page runs the lab's code.** The Python it runs is the repo's `detection/` and `src/` as
  they are, so the finder stays malleable. At our settings, the page passes what the lab passes
  with the blue mask applied after finding.
- **Memory does not grow with use.** Opening image after image, running the finders again and
  moving filters leaves the page, its worker and the Python inside holding no more than the last
  time it did the same thing (`tests/test_memory.py`).

## R9 — No finder change loses quality unless the owner accepts it

Set by the owner on 2026-09-30. Every finder the page offers is scored on every ground-truth image
(R10) spot by spot, and
[`detection/lab/quality_baseline.json`](../detection/lab/quality_baseline.json) records, per finder
and image, which real NoRs each one finds, which not-NoR spots it passes and which missing-candidate
marks it proposes a candidate on. A change that loses a real NoR, passes a new not-NoR or stops
proposing a candidate at a missing mark fails the tests; a loss the owner agreed to is recorded with
`python3 tests/test_quality.py --accept`, so the PR's diff names every spot that moved. Gains are
written into the baseline by a local test run and locked from then on
(`tests/test_quality.py`). Until submissions cover it, the reference slide is scored on Claude's
labels, not the owner's (`detection/STATE.md`), so the lock is only as right as they are. Every test runs in CI on each PR
(`.github/workflows/tests.yml`), and a test that would skip there fails instead.

## R10 — Submitted ground truth joins the data set by code, and outranks older labels

Set by the owner on 2026-10-03.

- **A daily intake, in code.** Every day an open issue labelled `new-ground-truth` exists, the
  nor-finder pack's `ground-truth-intake` task takes every such issue's newest attached `.json`,
  checks it (`norfinder-ground-truth/2`, an image from Google Drive with its SHA-256, at least one
  mark inside the image), and adds it to
  [`detection/lab/ground_truth/`](../detection/lab/ground_truth/) with an entry in its
  `dataset.json`. It re-records the quality baseline (R9) against the new reference and opens one
  pull request that closes the issues it took when merged. A file it cannot use gets a comment on
  its issue saying why, and the label comes off until its author fixes it
  (`detection/ground_truth.py`, `tests/test_ground_truth.py`).
- **Then an agent improves the finders**, on the same pull request, at the opus model, following
  the pack's `improve-on-ground-truth` skill: every finder re-scored on every ground-truth image
  against the last recorded results, candidate detection first for the newly marked missing
  candidates, then overall quality. Losses stay the owner's to accept (R9).
- **Images stay on Drive.** A ground-truth file names its image by Drive id and SHA-256;
  `python3 detection/ground_truth.py fetch` downloads every one into `data/raw/` and checks it
  (R6). No image enters git.
- **Newer and human beats older and Claude's.** For one image, a newer submission's label wins over
  an older one's at the same spot, and every submission wins over the lab's own labels; every
  quality assessment (the lock, `ground_truth.py score`) scores against that merged reference
  (`ground_truth.corpus()`).
- **A missing mark is a real NoR** found when a pass lies within its radius, and proposed when any
  candidate does.

## R11 — Every finder's precision and recall are on record, per filter preset

Set by the owner on 2026-10-06. [`detection/lab/finder_metrics.json`](../detection/lab/finder_metrics.json)
holds, for every finder the page offers, the precision and recall summed over every ground-truth image
(R10), run the way the page runs it, at two stages kept apart: the finder's own candidates before any
filter, and what passes the filters after it at three filter presets (precise, balanced = the
finder's own values, sensitive). Precision counts labelled spots only: real spots passed over labelled spots
passed. A preset moves every filter the same share of the way towards a fixed strict or loose end
(`detection/finder_metrics.py`), the same for every finder. The file is rewritten whenever the
quality baseline (R9) is, and `tests/test_finder_metrics.py` fails when it was measured against
another baseline, another ground truth or other presets. The numbers are only as right as the labels
behind them (R9).

On the page (R8), the finder list shows each finder's balanced precision and recall, and the Filters
box opens with the three presets, each with its own; choosing one sets every filter to its values, and
it stays lit while the filters hold them.
