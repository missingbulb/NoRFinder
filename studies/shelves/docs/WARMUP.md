# Bookshelf Reader — read this first

An image-processing study, an outlier on a biology site: a photo of bookshelves in, each book boxed and its text
read, and one JSON per photo out for a title matcher. Matching the titles is not part of this study. Shown in the
page to the owner's Google account alone (`visibility`, `req/shell/study/visibility`) at `/app/shelves`. What the
page must do is `req/shelves` in [its requirements](../requirements.md).

## Map

```
study.json            the study's contract with the shell; stage GT
py/shelves.py         the Python entry: opens the photo, answers find and straighten
py/books.py           the finder (find) and the straightening of four corners into an upright crop
web/shelves.js        the page: Find books, Read titles, the titles in Summary, the ground-truth task
web/reading.js        the three readers, the same module in the page and in the sandbox
web/tessdata/         Tesseract's Hebrew and English (4.0.0_best_int, from @tesseract.js-data/*@1.0.0, MIT)
reading/              the sandbox: read.mjs and the pinned engine builds (package.json)
tests/                test_books.py (fast), test_reading.py and test_shelves_page.py (full)
```

## The pipeline

1. **Find** (`books.find`, Python, R3, req/shelves/books/find): shelves are rows a horizontal edge crosses at least half
   the photo on, each looked at with a margin. Within a shelf, the edges between books are lines found as Osef does
   (unblurred Sobel, 80% of the rows every book crosses, strongest first, none crossing, wide gaps searched again),
   at leans up to 30°. Between two neighbouring lines, the book's top and foot are its own: where its texture stops,
   then the first colour change across its strip, square to its sides give or take 12°, past which hardly any of the
   strip is the book's colour. A box is kept only once it checks out as a readable spine (`books.spine`). The photo's
   perspective, read from the surest boxes, drops a box whose ends turn otherwise (`books.perspective`). Every book
   is a spine: R3 tells no cover apart.
2. **Straighten** (`books.straighten`, Python): the four corners pulled through a homography into an upright
   rectangle, as wide as the box's top and bottom edges on average and as tall as its sides.
3. **Read** (`reading.js`, JavaScript): the crop at each turn its shape allows (a tall crop turned a quarter either
   way, a wide one as is or upside down), the most confident kept, by one of three readers:
   - `tesseract`: Tesseract 5 (tesseract.js 7.0.0, core 7.0.0), Hebrew and English, on the whole crop;
   - `lines`: PaddleOCR's PP-OCRv4 text finder (ONNX on onnxruntime-web 1.31.1) marks each line, Tesseract reads it;
   - `ppocr`: PP-OCRv4 finds and reads (its reader is Chinese and English: **no Hebrew**).

The page loads the engines from jsDelivr at those pinned versions and only when a reader first needs them; the two
languages come from the site itself, since tesseract.js takes one base address for every language and the packages
on jsDelivr put each language at its own.

## Run

```
python3 -m pytest studies/shelves -q -m "not full"
python3 -m pytest studies/shelves -q
```

The sandbox reads like the page does:

```
npm ci --prefix studies/shelves/reading
```

```
node studies/shelves/reading/read.mjs PHOTO find lines out.json
```

`find` runs the study's finder; a ground-truth file in its place reads its own boxes. `read.mjs` runs the study's
Python on the npm build of the page's Pyodide (314.0.7), not the container's Python: the container's Pillow decodes
a JPEG to slightly different pixels than Pyodide's, and on the R0 smoke test that changed four books' readings.
With Pyodide on both sides the page and the sandbox gave the same text for every book.

## Ground truth

One task, as NoR's (`req/shelves/truth/task`): each found book's corners, view and text set right or the book
dropped, then the missed ones drawn in. The submitted `<photo>_books_gt.json` keeps, for each found book, what the
finder and the reader proposed beside the corrected values, so one file scores both the finder (corners, view) and
each reader (text). No grader is written yet: it waits for the first ground truth.

## Iterations

### R3 — spine edges by Osef's boundary search; tops past the shadow (2026-11-07)

On the owner's ask to fix R2's series merge and shadow tops, with the spine segmentation of yoavberliner/Osef (commit
f8afe1b, `src/services/spineSegmentation.js`) as reference: "something there that you missed".

- **What R2 missed, from Osef:** the edges between books come from the *unblurred* Sobel gradient (|gx| > 40 and
  1.5×|gy|), not from Canny after a σ=2 blur, which smears away a seam a pixel or two wide. A line is an edge between
  books only if it lies on such an edge along 80% of the rows nearly every book crosses (where the mean upright
  gradient is 35% of its strongest), since lettering runs along only part of a spine. Lines are kept strongest
  first, none crossing or crowding another, and a gap 1.8× the shelf's usual spine is searched again with a lower
  bar. Each book is then the strip between two neighbouring lines (`REACH` 1), still checked by `books.spine`.
  Two changes from Osef: leans up to 30° (Osef's 10° missed every leaning photo here), and a line counts as crowding
  only when it is close to a kept one at *both* ends, since two books leaning apart touch at one end only.
- **Shadow tops:** a book's top was the first colour change within 60% of the strongest, and the shadow under the
  board above meets that board in a far stronger edge than the book meets the shadow. A top is now the first change
  sharp enough to be an end at all (`END_STEP`); a foot keeps the 60% rule, because a logo or label near a foot
  changes the strip as sharply and nothing like the shadow lies beyond it. The ends are also searched square to
  the book's sides, give or take 12° (`END_TURN`), not at any tilt up to the spine's lean.
- **Perspective:** fitted as a line over x, not a plane over x and y: three sure boxes fitted a three-term plane
  exactly and dropped two real books on the drawn side view. Now at least four.
- **On the photos, by eye (no ground truth yet):** `1tsK-N` 23 boxes (R2: 19), tops on the books' own tops;
  `16acjV` 15, `1sdDdH` 13, `1g4iFN` 10, `16w5nW` 7, nearly all one spine each. Still broken: `1sdDdH`'s two black
  Herbert spines stay one box (the series merge is **not** fixed); two multi-shelf photos (`12msl6`, `1Rx9mp`) now
  give no box at all (R2: 3 and 4), not yet looked at.
- **Tried and rejected for the series seam:** a dark-valley test (darker than the strip ±6 px, along the book's
  lean) scored the seam 0.47 against 0.38–0.42 for lines inside single books, and in a wide gap it added false
  lines on `16acjV`'s second shelf while still missing the seam; Osef's edge test at full resolution scores the seam
  0.54 against 0.61 for lettering in a single book; a box holding two lettering columns did not separate it either.
  What would: the two spines repeat one publisher's logo at their feet, so a box holding two copies of one mark is
  two books (template matching, not built).

### R2 — each box the book's own spine, verified before it is kept (2026-11-07)

On the owner's word that R1's boxing was wildly wrong: start with the single-shelf photos, use edge detection, and keep
no box without checking that its four corners make a readable spine. Then, from the owner during the work: a box is the
book's spine by itself, not a baseline the shelf shares; books stand packed; the photo may be slanted or from a side;
and one camera means one perspective for every book. Still no ground truth (the curated folder is empty), so no number
here is a score; the drawn shelves are the test (`test_books.py`, front and side view).

- **What was wrong (R1):** every box ran from its shelf band's top to its bottom, so it took in the wall above a short
  book and the floor below the board; Canny ran with skimage's 0-to-1 thresholds on 0-to-255 brightness, so the wall's
  JPEG grain was all edges and lettering cut spines in two; a book's two sides were any two neighbouring lines.
- **What changed:** the edges are found in colour and kept only in pieces reaching 4% of the shelf; each pair of side
  lines up to six apart is a candidate, and a box is only what passes `books.spine`; the ends are found per book, at
  their own tilt; the most boxes sharing no ground are chosen.
- **On the photos, by eye:** on the five single-shelf photos (`16w5nW`, `16acjV`, `1g4iFN`, `1sdDdH`, `1tsK-N`) most
  boxes now follow one spine each, with its own top and foot; nothing is boxed on the wall or the floor. What still
  breaks: two black spines of one series boxed as one (`1sdDdH`), tops reaching into the shadow under the board above
  (`1tsK-N`), cream spines against the cream wall and books cut by the frame missed. The multi-shelf and wide photos
  are not yet looked at (the owner's order: single shelves first).
- **Perspective (`[camera-uniform]`):** fitted on the drawn side view; on the real photos it was fitted on six of ten
  and trusted on none (at most 63% of the boxes agreed with it, under the two-thirds bar), so there it changes
  nothing yet. The turn of a box's ends from square is too noisy a measure on real books; the board's edge and the
  convergence of the surest boxes' sides are the next to try.
- **Tried and rejected:** a box's height from where its two side edges run (real edges break; heights came out
  short); its ends at the first or the outermost straight Canny edge (lettering and the board's far edge won); its end
  where the strip keeps its colour (lettering lifts the colour of the rows it is on); a fixed bar for the boxes the
  perspective is read from (real side lines lie on edges along ~70% of their length, the drawn ones ~95%).

### R1 — spine edges as leaning lines (2026-11-04)

The first iteration on the owner's photos: ten in the study's Drive folder (`data/sources.json`, fetched by
`lab/photos.py`). Of the twelve first shared, the owner took two out: a screenshot of osefbook.com/shelf, an app
that already boxes spines, and a sketch of P1 straightened with a box per book. No ground truth yet, so no number
here is a score.

- **What was wrong (v0):** on every real photo a box spans several books (real spines are thinner than the gap v0
  kept between cuts), a leaning book cannot fit an upright box, the wall above the books and the board under them
  are boxed, and covers lying flat are missed.
- **What changed:** spine edges are found as straight lines at their own lean, and a book is the strip between two
  neighbours; a strip whose sides disagree by more than 6° is the wedge beside a leaning book, and is dropped.
  v0's covers and piles went with it: R1 marks every book a spine.
- **What breaks, read off the overlay of all ten:** a box's top and bottom are the shelf's, so it runs up into the
  wall above a short book (P5, P7) and down to the board; lines through a spine's lettering split some books in two;
  a false shelf line cuts P1 in half; the board under P4's books is boxed; the wide views (P3, P10) and the covers
  lying flat (P11, P12) are a tangle of lines.
- **Readings, P4 with R1's boxes, `lines`:** about a dozen of 26 boxes read close to the title, Hebrew included
  (`פרנק הרכרט / משיחחולית` for `פרנק הרברט / משיח חולית`); ב read as כ and words run together are the usual slips.
  Unscored.
- **Tried and rejected:** a Hough vote written in numpy alone, to spare the page scikit-image. With edges found by
  a gradient threshold, each edge was several pixels wide and its votes smeared across leans; thinning them to one
  pixel starved the vote below its threshold, and keeping only lines that cross no stronger line dropped real
  edges (a thin spine's two sides, measured a degree or two apart, cross somewhere in a tall shelf). scikit-image's
  Canny and Hough, as the prototype used them, are what work; NoR Finder loads the same package.

### R0 — the first finder and the three readers (2026-11-04)

No photo from the owner yet, so R0 ran on one shelf **drawn** in the scratchpad (coloured bands with rendered
titles, Hebrew and English, standing, lying and facing). It shows the plumbing works, not that the method does; no
number below is a score.

- **Finder, what breaks:** a box takes in the gap beside its book, as a cut lands on one edge of the gap, not on
  both; on the lower shelf the boxes still reach up to the board above (its edge beat the books' tops); one pile
  was boxed as a cover. These are the first things to look at on a real photo.
- **Readers, on the drawn shelf's 32 boxes:** `lines` read nearly every title, Hebrew included, but joins Hebrew
  words (`האריפוטר`); `tesseract` misses most turned spines, as a whole crop has too much else on it; `ppocr`
  reads English perfectly and turns Hebrew into Latin letters **with high confidence** (`QIGILIO` at 0.90), so its
  confidence means nothing on Hebrew.
- **Tried and rejected:** tesseract.js's own way of handing it a language's data (`{code, data}`) is broken in
  every version from 5 to 7 (it passes the data where the language's name belongs), hence the site serving both
  languages under one address. Tesseract.js core 6.1.2 lacks the build tesseract.js 7 asks for; 7.0.0 it is.
  Community Hebrew models for ONNX on Hugging Face (a few months old, unlicensed or with no downloads) were not
  taken.

## Domain assumptions

- `[shelf-lines]` A shelf is a horizontal edge across at least half the photo. Fails on a photo of one shelf seen at an
  angle, or one whose board is out of frame.
- `[spine-lean]` A spine's edges lean 30° from upright at most (`books.LEAN`). Fails on a book lying flat in a pile,
  whose edges run across the shelf, and on a photo taken turned.
- `[spine-sides]` A book's two sides lean within 6° of each other (`books.SIDES`). Fails on a spine seen in steep
  perspective.
- `[spine-shape]` A readable spine is 2.5 times as long as it is wide, its long sides within 25% of a length, its ends
  within 30° of square to them, and its inside carries texture (`books.ASPECT`, `SIDES_EQUAL`, `SQUARE`, `TEXTURE`).
  Fails on a squat book, on a spine with no lettering at all (left for the ground truth), and on a steep side view.
- `[camera-uniform]` One camera took the photo, so every book's ends turn as one perspective says (`books.perspective`).
  Fails on a stitched panorama; thinly supported: never trusted yet on a real photo.
- `[work-size]` The finder works at a long side of 900 px (`books.WORK`): scale-dependent, the first constant to
  revisit when photos arrive.

## Open items

- The owner's photos are in [the study's Drive folder](https://drive.google.com/drive/folders/1Wt3__aNzVQConuhF8tUx4zmnMtmx-O3w),
  private for now (missingbulb/NoRFinder#766); once it is shared by link, a `data/sources.json` and its fetch, then the first ground truth, then a grader (`proposed` against the corrected values) and the
  finder's first real iteration.
- Hebrew word spaces in the `lines` reader.
- R3's own breaks: one series' spines boxed as one (a repeated logo is the next cue to try); the multi-shelf photos
  `12msl6`, `1Rx9mp` give no box; pale spines on a pale wall; a perspective trusted on a real photo; covers and piles.
- A study pack (`shelves-study`) for its improving-on-ground-truth skill and its ground-truth intake, once there is
  ground truth to take in.
