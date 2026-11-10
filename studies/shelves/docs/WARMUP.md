# Bookshelf Reader — read this first

An image-processing study, an outlier on a biology site: a photo of bookshelves in, each book boxed and its text
read, and one JSON per photo out for a title matcher. Matching the titles is not part of this study. Shown in the
page to the owner's Google account alone (`visibility`, `req/shell/study/visibility`) at `/app/shelves`. What the
page must do is `req/shelves` in [its requirements](../requirements.md).

## Map

```
study.json            the study's contract with the shell; stage GT
py/shelves.py         the Python entry: opens the photo (HEIC through pillow-heif), answers view, find and straighten
py/books.py           the finder (find), its text finder's view of the photo, and the straightening of four corners
lab/photos.py         the owner's photos from Drive (data/sources.json), and with --gt the ground truth
lab/grade.py          the finder and the readers scored against a submitted ground truth
lab/words.py          the names list from one dated dump of Hebrew Wikipedia's titles, into web/words/
web/shelves.js        the page: Find books, Read titles, the titles in Summary, the ground-truth task and its pictures
web/reading.js        the three readers, the same module in the page and in the sandbox
web/words/names.txt   Hebrew Wikipedia titles' words the readings are spelled by after the subtitle list (CC BY-SA 4.0, lab/words.py)
web/tessdata/         Tesseract's Hebrew and English (4.0.0_best_int, from @tesseract.js-data/*@1.0.0, MIT): served by the site, pinned
reading/              the sandbox: read.mjs and the pinned engine builds (package.json)
tests/                test_books.py and test_grade.py (fast), test_reading.py and test_shelves_page.py (full)
```

## The pipeline

1. **Find** (`books.find`, Python, R8, req/shelves/books/find): first the page runs PaddleOCR's text finder
   (`reading.textMap`, the `lines` reader's own) over Python's view of the photo (`books.text_view`, long side 1280)
   and hands the finder its map of where text is. Shelves are rows a horizontal edge crosses at least half
   the photo on, each looked at with a margin. Within a shelf, the edges between books are lines found as Osef does
   (unblurred Sobel, 80% of the rows every book crosses, strongest first, none crossing, wide gaps searched again),
   at leans up to 30°, two of them one when closer at both ends than 0.7 of the shelf's own spacing between its
   edges (its 25th percentile, `CROWD`), never under twice the narrowest book. Between two neighbouring lines, the book's top and foot are its own: where its texture stops,
   then the first colour change across its strip, square to its sides give or take 12°, past which hardly any of the
   strip is the book's colour. With the text map, a line crossing text is lettering, and a strip holding two
   columns of text side by side is searched again for the edge between them (`books.text_columns`). A box is kept
   only once it checks out as a readable spine (`books.spine`) and carries a book's texture or a text line along
   it (`books.text_along`); a wide box whose marks repeat further across is two books of one series
   (`books.series_split`); a shelf of fewer than three spines is no shelf. Where no box stands, a region of one
   colour boxes a book (`books.regions`, R8): the shelf cut into Felzenszwalb regions at 500 px wide, each long, thin,
   within 50° of upright and filling its rectangle, its sides moved onto the strongest edge near them, then checked
   as any spine is. With no text map (the text finder out of
   reach) Find runs as R5 did, less the perspective check, and its step says so. Then the covers lying outside the shelves (`books.covers`): quadrilaterals of straight edges
   whose sides end at their corners, searched outside every band whose edges between books stand barcode-close
   (`books.barcode_bands`).
2. **Straighten** (`books.straighten`, Python): the four corners pulled through a homography into an upright
   rectangle, as wide as the box's top and bottom edges on average and as tall as its sides. It samples only the
   photo's pixels around the box (bit-identical to sampling the whole photo, 300 random boxes on a 12 MP photo, and
   about 70 ms a book instead of 120), and a corner may lie outside the photo: what falls outside is black.
3. **Read** (`reading.js`, JavaScript): the crop at each turn its shape allows (a tall crop turned a quarter either
   way, a wide one as is or upside down), the most confident kept, by one of three readers:
   - `tesseract`: Tesseract 5 (tesseract.js 7.0.0, core 7.0.0), Hebrew and English, on the whole crop;
   - `lines`: PaddleOCR's PP-OCRv4 text finder (ONNX on onnxruntime-web 1.31.1) marks each line, Tesseract reads it;
   - `ppocr`: PP-OCRv4 finds and reads (its reader is Chinese and English: **no Hebrew**).

   Each reading's Hebrew words are then spelled (`spelling` in `reading.js`, R7) by FrequencyWords' subtitle list,
   fetched from jsDelivr at a pinned commit and kept offline, then the site's names list: a word not on them becomes
   the most frequent listed word one look-alike letter, or one ו or י, away; a final letter inside a run of letters
   ends a word; a run no word fits is parted into listed words. The problems of Hebrew on spines, their classic fixes and the word sources are in
   [HEBREW.md](HEBREW.md).

The page loads the engines and PaddleOCR's models from jsDelivr at those pinned versions when first needed: the text
finder (onnxruntime-web and the PP-OCRv4 finding model) on Find books, the rest when a reader first needs them. The
text finder's four files are in `study.json`'s `web.offline`, so Make Available Offline keeps them with the Python
(`req/shell/offline/per-study`). The two languages are the one exception: `web/tessdata/` holds them, and the site
serves them, so that the readings stay pinned:

- tesseract.js's own default, with no `langPath`, fetches each language from jsDelivr *unversioned*
  (`@tesseract.js-data/<lang>/4.0.0_best_int`), so a new upload there would change the readings silently;
- a pinned jsDelivr address cannot stand in: `langPath` is one base address for every language, and each
  language's package sits at its own, so one worker could not take both, and mixed spines would lose their one pass;
- handing the data in directly (`{code, data}`) is broken in tesseract.js 5 to 7 (R0).

Fetching the text finder from jsDelivr does not change this: the page fetches that model itself, by one exact pinned
address, while Tesseract builds every language's address from one `langPath` (the owner asked, 2026-11-10).

To add a language, add its `<code>.traineddata.gz` from `@tesseract.js-data/<code>@1.0.0/4.0.0_best_int/` and its
code to `createWorker` in `reading.js`. Unchanged, the files cost a release nothing (the upload skips every file whose
hash it already holds) and a return visit only a revalidation; as the site's own files they are revalidated on each
load rather than kept 30 days as the CDN's are (`req/shell/site/caching`).

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

`find` runs the study's finder as the page does, the text finder first; a ground-truth file in its place reads its own boxes. `read.mjs` runs the study's
Python on the npm build of the page's Pyodide (314.0.7), not the container's Python: the container's Pillow decodes
a JPEG to slightly different pixels than Pyodide's, and on the R0 smoke test that changed four books' readings.
With Pyodide on both sides the page and the sandbox gave the same text for every book.

## Ground truth

One task, Books (`req/shelves/truth/task`): every book, found or added, its corners, turn and text set right or
the book dropped, walked in the order the books stand (`inPlace` in `shelves.js`), then the missed ones added (the
photo's right-click menu, or Draw a book), each one more book to review. The tagger's work is the draft the shell keeps
(`shell.tasks.draft`, `resume`) and Continue tagging brings back; the approved books are cut out of the photo by
the viewer (`viewer.doneMask`). The book's picture in the task is
the page's own, warped in JS from the photo the viewer shows (`picture` in `shelves.js`), so it follows a dragged
corner at once; what the reader reads is still Python's straightening of the file, run behind it with the photo
never covered. Flip reads the book again at that turn alone, in both languages. The submitted `<photo>_books_gt.json` keeps, for each found book, what the
finder and the reader proposed beside the corrected values, so one file scores both the finder (corners, view) and
each reader (text), which `lab/grade.py` does. The ground truth is in the study's GT folder on Drive
(`GT/<photo>__<sha8>/gt_<tagger>.json` under the study's root), fetched by `python3 studies/shelves/lab/photos.py --gt`
into `data/raw/gt/<photo's drive id>__<tagger>.json`. Four photos so far: `1g4iFN`, re-tagged 2026-11-10 after the task's rework, 13 books right (4 of them added
as missed) and 1 found box marked no book; `1HyJrL`, tagged 2026-11-10, 19 books right, all found (the book the
frame cuts at its left edge left untagged); and, new for R8, `1zktX1`, 60 books right (24 added as missed), a
bookcase of two cabinets side by side, and `16w5nW`, 8 books right (2 added as missed), **held out** since R8:
scored once per iteration, never tuned on.

A score is the page's: `node studies/shelves/reading/read.mjs PHOTO find lines OUT.json`, then
`python3 studies/shelves/lab/grade.py GT.json --found OUT.json`. `grade.py --photo` runs the finder without the
text map, and the container's own JPEG decoding moves R8 by up to 6 books on `1zktX1` (below).

## Iterations

### R8 — the shelf's own spacing tells two edges apart; a region of one colour boxes a book (2026-11-10)

Two new ground truths, `1zktX1` (60 books) and `16w5nW` (8, held out). Scores on the page's path (Pyodide's
decoding, the page's text map); **indicative**: three tuning photos, and the gain is all one of them.

| | R7 matched / found | R8 matched / found | R8 precision / recall |
|---|---|---|---|
| `1HyJrL` | 18/19, 21 | 18/19, 21 | 0.86 / 0.95 |
| `1g4iFN` | 11/13, 12 | 11/13, 13 | 0.85 / 0.85 |
| `1zktX1` | 19/60, 39 | 35/60, 55 | 0.64 / 0.58 |
| tuning, all | 48/92, 72 (F1 0.59) | 64/92, 89 (F1 0.71) | 0.72 / 0.70 |
| `16w5nW` (held out) | 5/8, 7 | 5/8, 7 | 0.71 / 0.62 |

No book R7 boxed is lost on any photo. **How far to trust `1zktX1`'s number:** under a ±1 level of noise on its
pixels, R7 gives 18-22 and R8 35-38; the container's own decoding gives R8 41. Read it as 35 ± 3.

- **What was wrong (R7 on `1zktX1`):** of 41 books missed, 17 never proposed, 16 inside a box over two books or
  running through the board, 7 misaligned; 18 false boxes. Two causes measured: the crowding distance between two
  edges (twice `MIN_WIDTH`, 14 px at the working size) is wider than most of its spines (8-15 px), so the second of
  two close edges went; and leaning, low-contrast books in its lower right gave no edge line at all.
- **What changed:** (1) `CROWD`: the crowding distance is 0.7 of the shelf's own 25th-percentile spacing (flat from
  0.7 to 0.8), alone 59/92 in the container. (2) `books.regions` `[spine-colour]`: Felzenszwalb regions shaped like a spine,
  verified by `books.spine`, added only where no line-found box overlaps them; alone 57/92. Together 70/92 in the
  container. The text map's plain-spine keep still holds with the regions off
  (`test_without_its_text_a_plain_spine_is_boxed_only_by_its_colour`).
- **Still missed on `1zktX1`:** dark, plain spines against the dark wood (14, 31, 34), the top right's steep leaners
  (18-22), and its stacked books. False boxes: wedges over two or three books on the top shelves, some through the
  board, and slivers on the frame's posts. On `1TmVNx` (untagged, 59 → 78 boxes) most new boxes are single thin
  spines; one runs through a board, one is on the drill. A shelf of thin spines alone stays merged: the spacing is
  measured after the first, wider crowding.
- **The run:** three ideation routes (fresh lenses, explaining to a child, a transformed view) gave directions A-F,
  each built and scored separately, then a random sweep of the constants; each is a row of
  [Directions tried](#directions-tried).

### R7 — no box over another; a line the books cross is no shelf; readings spelled (2026-11-10)

The second ground truth, `1HyJrL` (19 books). **Two photos, nothing held out**: every number is indicative. The
other 12 photos were checked base against R7 for what moved.

| | precision | recall | matched | mean IoU |
|---|---|---|---|---|
| `1HyJrL` R6 (base) | 0.38 | 0.68 | 13/19 | 0.60 |
| `1HyJrL` R7 | 0.86 | 0.95 | 18/19 | 0.79 |
| `1g4iFN` R6 = R7 | 0.92 | 0.85 | 11/13 | 0.82 |

- **What was wrong (R6 on `1HyJrL`):** the shelf finder cut the photo at a row across the middle of the books (the
  titles' slashes, a light's edge), so nearly every spine came out as two boxes stacked one over the other, each
  about half the book: 34 boxes for 19 books.
- **What changed:** (1) `[shelf-lines]` a shelf's cut is dropped when the edges between books run on across it
  (`books.crossed`, `CROSSED`): measured on every photo's cuts, 0.53 on `1HyJrL`'s and 0.39 on `1yTHiP`'s (both
  through standing spines), at most 0.11 on every real board. (2) The owner's rule, no box over another
  (`books.apart`): two boxes overlapping each other alone, by a fifth of the smaller and in one column, are one
  book's halves, boxed as one; of others overlapping, the weaker fit goes. Ablated on `1HyJrL`: (2) alone 0.79/0.79,
  15/19 (where a half was never found the other stays half a book); (1) alone or both 0.86/0.95. With (1) in, (2)
  fires on no photo here: it is the guard the owner asked for.
- **On the other photos, by eye:** only `1yTHiP` moved (38 → 41 boxes): its middle shelf's spines are boxed whole,
  one new box runs down onto the board.
- **Still missed on `1HyJrL`:** Henderson, split in two at the lettering (the dark gap beside it is the real edge);
  the leftmost Herbert keeps a sliver box over its right part. Both are the owner's note: books stand apart, a gap's
  two sides are two books' edges. `books.most_books` maximises the number of boxes, so it always prefers a split;
  letting a box span one inner line (`REACH` 2) changed nothing for that reason. Its objective is the next lead.
- **The readers on both photos, at the finder's turn (`lab/grade.py --read`):** `tesseract` CER 0.39 / words 0.35
  (`1HyJrL`), 0.69 / 0.15 (`1g4iFN`); `lines` 0.37 / 0.18, 0.78 / 0.08. The grader paired readings to books in
  order and so, on a file holding a box marked no book (`1g4iFN`), scored each against the next book's title: it
  now pairs them by corners.
- **The readings spelled by a dictionary, the owner's idea (`spelling` in `reading.js`):** tesseract.js reports no
  dictionary of its own, so the page fetches a Hebrew word list (FrequencyWords' 50,000 most frequent subtitle words,
  from jsDelivr at a pinned commit, kept offline with the study's Python). A word of three letters or more not on it, even with one or two prefix
  letters off (ו ה ב כ ל מ ש), becomes the most frequent listed word one letter away, that letter one print makes
  look alike (`[look-alike]`). On the tagged books' corners, CER / words before → after:

  | | `tesseract` | `lines` |
  |---|---|---|
  | `1HyJrL` | 0.389 / 0.35 → 0.387 / 0.38 | 0.373 / 0.18 → 0.365 / 0.23 |
  | `1g4iFN` | 0.689 / 0.15 → 0.684 / 0.19 | 0.785 / 0.08 → unchanged |

  It sets `רוכרט`, `הרכרט`, `הבדרסון`, `מרובינטון` right; a name off the list it leaves, or turns into a listed word
  (`גאלויה` → `גלויה`, `חולית` → `חולי`). Rejected on the way: any one-letter edit (fixes names into wrong words:
  `קריספין` → `קריסטין`; `lines` words on `1g4iFN` 0.08 → 0.05); letting a letter be dropped too (the same loss);
  choosing a reading's turn by the dictionary (the wrong turn reads as short common words, `שש`, `זו`, and won:
  `tesseract` CER 0.39 → 0.72 by share of known words, 0.39 → 0.42 at best by known letters added to confidence).
  English is not spelled: no tagged title is English, so nothing could measure it. Then, from the research in
  [HEBREW.md](HEBREW.md): a final letter inside a run ends a word, full and defective spellings match, and, with the
  names of Hebrew Wikipedia's titles added to the list (the owner's choice), runs are parted into listed words. Words
  read whole, all of it on the page's own path: `tesseract` 0.35 → 0.48 (`1HyJrL`), 0.15 → 0.23 (`1g4iFN`); `lines`
  0.18 → 0.35, 0.08 → 0.15; CER 0.389 → 0.384, 0.689 → 0.682, 0.373 → 0.361, 0.785 unchanged. `SPLIT` (3 letters)
  and the names list's 3 titles were chosen on these two photos.
- **Tried and rejected, the owner's one-language idea:** reading each book in Hebrew alone and in English alone at
  each turn and keeping the surest (twice the passes): `lines` 0.37 → 0.34 on `1HyJrL` but words 0.08 → 0.05 on
  `1g4iFN`, `tesseract` unchanged. Dropping the words of the minority script from a reading: within 0.02 everywhere.
  The readings are nearly all one script already; their errors are Hebrew letters confused (`רוכרט` for `רוברט`),
  which a dictionary would catch and a script rule cannot.

### R6 — text lines place the books; the perspective check dropped (2026-11-10)

The first iteration scored against ground truth: `1g4iFN`, 13 books. **One photo, nothing held out**: every number
below is indicative, and the thresholds were set on that photo. The other 13 photos (four HEIC new from the owner)
were checked by eye, base against R6, for what moved.

| `1g4iFN` | precision | recall | matched | mean IoU |
|---|---|---|---|---|
| R5 (base) | 0.80 | 0.62 | 8/13 | 0.80 |
| R6 | 0.92 | 0.85 | 11/13 | 0.82 |

The same in the container's Python and in the page's Pyodide (`read.mjs`).

- **What was wrong (R5 on `1g4iFN`):** two boxes each took in two books, Wangerin with Pohl and "הנוסע השמיני" with
  le Carré: dark spines whose seam the strict pass misses, in gaps too narrow for the wide-gap rescan. The two the
  frame cuts at either edge were missed (still are).
- **What changed, on the owner's idea (the text lines' parallel sides bound a book):** PaddleOCR's text finder,
  already the `lines` reader's, runs over the whole photo first. A strip whose text stands in two columns is searched
  again with the relaxed bar (what split both pairs), an edge line crossing text is dropped, and a box with a text line
  along 30% of it is a book's face whatever its texture (what kept le Carré, whose plain brown face is under the bar
  alone). Ablated on `1g4iFN`: without the rescan 8/13, without the text keep 10/13, without the veto 11/13 but
  mean IoU 0.80; on `1TmVNx` the veto adds four real spines.
- **The perspective check, dropped (the owner's call, 2026-11-10):** with more boxes found it was trusted on more
  photos, and by eye nearly every box it removed was a real book: `1sdDdH`'s rightmost, 11 on `1HyJrL`, 15 on
  `1aip0u`. It never fired on `1g4iFN`.
- **On the other photos, by eye:** `1gvNWf` two merged boxes split into single books; `1tsK-N`, `1yTHiP` one book
  more each; `1TmVNx` several bottom-shelf spines more, one new box wide over a book and the drill beside it;
  `1zktX1` one box now runs past the board.
- **The readers, on the 13 books' own corners at the tagger's turn (`lab/grade.py --read`):** `tesseract` CER 0.69,
  words 0.15; `lines` 0.82, 0.11; `ppocr` 1.00, 0 (no Hebrew: this ground truth was tagged with it, so every
  proposed text is Latin letters). Many titles come through nearly whole; noise characters, run-together words and
  missed lines sink the scores.
- **Tried and rejected:** grayscale before the readers (the owner's idea): `tesseract` words 0.15 → 0.09, `lines`
  0.11 → 0.07; a contrast stretch, Otsu binarising with the ink set dark, and 2× upscaling, alone and together, none
  better than colour on both measures (best: `tesseract` stretched at 2×, CER 0.69, words 0.14, at four times the
  time). The page's reading is unchanged.

### R5 — covers lying cover-up, searched outside the shelves (2026-11-07)

The two photos once called "multi-shelf" (`12msl6`, `1Rx9mp`) are books lying cover-up on a ledge and on a bench; the
owner chose a cover finder, and to split each photo first by its barcode: books on a shelf look like a barcode after
edge detection.

- **Barcode (`books.barcode_bands`):** in each band where books could stand, the spine finder's edges between books
  are measured: books standing packed put them a small share of the band's height apart (the owner's shelves:
  0.09-0.15), covers and walls far more (0.49 and up; three covers drawn on a bench: 0.24). A band at most 0.2 is a
  shelf, whether or not its spines were boxed, and the rows left above and below it are looked at the same way, since
  the shelf finder can merge two shelves. Also, a shelf yielding fewer than three spines boxes none (`SHELF_BOOKS`).
- **Covers (`books.covers`), outside the shelves and the spines' boxes:** straight lines at any angle, each found by a
  Hough transform among the edge pixels of one direction (so lettering does not link across a cover), make every
  quadrilateral two near-parallel pairs give; one is a cover when it has a cover's size and shape, each side lies on
  edges with a colour change across it, and at most one side's edge runs on past its corners. The smallest first,
  none holding one already kept; corners clockwise from the top left (`books.clockwise`).
- **On the photos, by eye:** ledge (`12msl6`) 4 boxes: the chef, cutlery and Marley covers right, the purple one half
  boxed; bench (`1Rx9mp`) 3: the grey and red covers right, the lamp cover half its width. Every shelf photo: no cover,
  the spines unchanged. Several covers on both photos are still missed: touching, overlapping and sun-washed edges.
- **Tried and rejected:** the probabilistic Hough transform (its result changed with its random draw: 4 of 12 seeds
  misplaced a drawn cover, and CI's draw differed from the container's); one Hough over all edge pixels (lettering's
  lines crowd out a cover's sides); the largest quadrilateral first (it took in two covers and the bench between); a
  pixel map of dense, one-way edges as a mask (no fixed threshold separates a dark shelf from a sunny ledge, and it
  ate covers' own edges); the orientation agreement of the edges inside a box, and its count of upright seams (with
  the deterministic lines, a half-boxed cover scored as high as a box over spines).

### R4 — two books of one series, parted by their repeating design (2026-11-07)

R3 boxed `1sdDdH`'s two black Herbert spines as one: one colour, and no seam a gradient, a valley or full resolution
can tell from lettering. The owner's idea: their logo repeats.

- **What changed (`books.series_split`):** a box 1.8× wider than the shelf's usual one is straightened and its bright
  marks (lettering, logos) found; a mark that recurs at the same height (4% of the box) further across, alike in
  shape, gives a shift. When 8 marks agree on one shift (within 4% of the box's width), a line goes in at that shift
  as the edge between the two books, and each half is checked as any book is, except that this one side, having no
  edge on the photo, is excused from lying on one (`Line.seen`).
- **Measured before building:** the merged box held 17 marks recurring at one shift (0.44 of its width); the other 50
  boxes on three single-shelf photos held 0–4. A whole-crop self-match was tried first and rejected: the merged box
  scored 0.26, below many single books.
- **On the photos:** `1sdDdH` 14 boxes, the Herbert pair now two; every other photo unchanged. Calibrated on one real
  pair (`[series-seam]`): thinly supported until ground truth holds more.

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

## Directions tried

Every direction built and scored, kept or not, in brief enough to rebuild, with what would make it worth another
try. Scores are matched books on the tuning photos at the time (container path for R8's rows; R7 then stood at
49/92). The untried ones from the same routes follow.

| id | direction (how it works) | result | verdict | revisit if |
|---|---|---|---|---|
| R8-A | **Colour regions as proposals**: the shelf at 500 px wide cut into Felzenszwalb regions (scales 50, 150); a region long, thin, within 50° of upright and filling 60% of its PCA rectangle gives two side lines, each moved onto the strongest seam within a quarter of its width and 3°, checked by `spine` | +8 to +10 | **kept** (`books.regions`) | - |
| R8-B | **Lean from the text strokes**: text-map components' PCA axes (0.7° median error against the book's lean) narrow the side-line scan to the local lean ± 3°, and a line is seeded beside each stroke | -1 to -3 | rejected: the misses fail at the seam test on dark, cluttered spines, not at the lean | a seam test that holds on dark books exists, or text strokes are found on most spines (24 of 60 on `1zktX1`) |
| R8-C | **Cabinets and floors**: uprights are column runs of board colour with no horizontal edges through the band; each shelf split into cells at them, `shelf_books` per cell, feet clamped at the cell's board | +4, loses 3 | not kept: what it gains, R8-D gains; its thresholds were set on `1zktX1` alone | more photos of multi-cabinet bookcases are tagged, or boxes through boards dominate the false ones |
| R8-D | **Crowding at the shelf's own spacing**: two edges between books are one when closer than 0.7 of the shelf's 25th-percentile spacing (floor: twice the narrowest book) | +10 | **kept** (`CROWD`) | - |
| R8-E | **A scored objective in place of `most_books`**: a DP over candidate intervals scored by fit, end steps, text column and colour uniformity | oracle over R7's candidates: +0 (+3 with the inner-line veto soft) | killed before building: selection is not the wall | candidate generation improves enough that the oracle ceiling rises above the score |
| R8-F | **Lean ridge**: per shelf, a signed colour derivative across a line integrated along leans -42° to 42° gives an (x, lean) map; a Viterbi ridge through it with a penalty per degree; each x scored by the 5th smallest of 8 height bands (persistence), peaks by prominence 0.1; lines added with their own crowding gap, `REACH` 2, only on shelves whose spacing is under 0.055 of their height | +20 alone, +2 over A+D | not kept: 7 settings fit to one photo, a gate with a thin margin, twice the time, loses `1zktX1` #2; untuned +16 with A+D | photos of thin packed spines beyond `1zktX1` are tagged; also a ready generator for searching a gap between found books |
| R8-sweep | **60 random constant mutations** (1-3 constants ×0.6-1.6 each) | best +2 (`WORK` 1440, loses one on `1g4iFN`), 16 worse | no constant change comes near a structural one | - |

Untried, from the same routes: a foot line fitted through a shelf's boxes, capping the rest (boxes through the
board; kill: clamping feet to the median foot offline gains under 3); each side verified by its 8-band barcode, a
line whose flanks match dropped (boxes over two books; kill: fewer false boxes with no loss); a learned verifier over
the candidates, leave-one-photo-out (once more photos are tagged).

## Domain assumptions

- `[shelf-lines]` A shelf is a horizontal edge across at least half the photo. Fails on a photo of one shelf seen at an
  angle, or one whose board is out of frame.
  (R7) A board stops the edges between books: a cut they run on across, on `CROSSED` of the columns, is no shelf.
  Fails on a board only a few rows thick, and on books standing on books.
- `[spine-lean]` A spine's edges lean 30° from upright at most (`books.LEAN`). Fails on a book lying flat in a pile,
  whose edges run across the shelf, and on a photo taken turned.
- `[spine-sides]` A book's two sides lean within 6° of each other (`books.SIDES`). Fails on a spine seen in steep
  perspective.
- `[spine-shape]` A readable spine is 2.5 times as long as it is wide, its long sides within 25% of a length, its ends
  within 30° of square to them, and its inside carries texture (`books.ASPECT`, `SIDES_EQUAL`, `SQUARE`, `TEXTURE`).
  Fails on a squat book, on a spine with no lettering at all (left for the ground truth), and on a steep side view.
- `[series-seam]` Two books of one series repeat one design, at the same heights (`books.series_split`). Fails on a series
  whose spines differ in design, or on two copies of one book (two boxes: right) — calibrated on one pair.
- `[barcode]` Books standing packed put their edges between books close together for their height (`books.BARCODE_GAP`,
  `SHELF_BOOKS`). Fails on a shelf of very wide books, and on covers standing side by side - calibrated on the owner's
  ten photos.
- `[cover-shape]` A cover is a quadrilateral of one cover's size whose edges end at its corners (`books.covers`). Fails on
  covers that touch or overlap, whose sides run on into the next one's.
- `[look-alike]` (R7) A reader's slip on a Hebrew word is one letter for one print makes look alike
  (`LOOK_ALIKE` in `reading.js`, set from the letters' shapes, not from the photos). Fails on a name or a rare word the
  word list lacks that is one such letter from a listed word, which it turns into that word.
- `[text-lines]` A book's title is a line of text along its spine, and no text runs across the edge between two books
  (`books.TEXT_*`). Fails on a spine with no lettering, a title printed across two spines, a sticker spanning a gap,
  and a photo the text finder reads poorly (dark, blurred); calibrated on one tagged photo.
- `[spine-colour]` (R8) A book's face is one region of colour, long and thin, its sides on edges (`books.regions`,
  `REGION_*`). Fails on a spine patterned across its width, and on two like-coloured neighbours read as one region,
  which `books.spine`'s check on the edge between them must then reject; calibrated on one photo's gains.
- `[work-size]` The finder works at a long side of 900 px (`books.WORK`), and the text finder reads the photo at
  1280 (`books.TEXT_LONG`): scale-dependent, the first constants to revisit on photos of another scale.

## Open items

- More ground truth: four tagged photos, one held out; every R8 gain is on one photo (`1zktX1`). Photos of thin
  packed spines would decide the lean ridge (R8's F).
- `1zktX1`'s dark plain spines, steep leaners and the boxes through its boards (R8). A book split at its lettering beside a dark
  gap (`1HyJrL`'s Henderson): `most_books` prefers more boxes.
- Names the Wikipedia titles miss (`אולדיס`, `גאלויה`, `וונגרין`), and the geresh of foreign names (`ג'ון`).
  English is not spelled yet (no English ground truth).
- Books the frame cuts at a photo's edge (both of
  `1g4iFN`'s misses).
- The readers: `tesseract` reads best but most spines come back noisy; what to try next is the owner's call.
- Hebrew word spaces in the `lines` reader: runs are now parted by the word lists (R7); a run of names neither list
  holds stays whole.
- R5's own breaks: several covers on the ledge and the bench missed, two half boxed; pale spines on a pale wall; piles of books lying flat.
- A study pack (`shelves-study`) for its improving-on-ground-truth skill and its ground-truth intake, once there is
  ground truth to take in.
