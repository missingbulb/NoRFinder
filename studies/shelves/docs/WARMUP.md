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

1. **Find** (`books.find`, Python, R1): shelves are rows a horizontal edge crosses at least half the photo on; within
   a shelf, the edges between spines are straight lines found by a Hough transform (scikit-image's Canny and
   `hough_line`) at leans up to 30° either way; each book is the strip between two neighbouring lines whose leans
   differ by 6° at most, from the shelf's top to its bottom. Every book is a spine: R1 tells no cover apart.
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
- `[work-size]` The finder works at a long side of 900 px (`books.WORK`): scale-dependent, the first constant to
  revisit when photos arrive.

## Open items

- The owner's photos are in [the study's Drive folder](https://drive.google.com/drive/folders/1Wt3__aNzVQConuhF8tUx4zmnMtmx-O3w),
  private for now (missingbulb/NoRFinder#766); once it is shared by link, a `data/sources.json` and its fetch, then the first ground truth, then a grader (`proposed` against the corrected values) and the
  finder's first real iteration.
- Hebrew word spaces in the `lines` reader.
- R1's own breaks: a book's top and bottom, lettering lines, false shelf lines, covers and piles.
- A study pack (`shelves-study`) for its improving-on-ground-truth skill and its ground-truth intake, once there is
  ground truth to take in.
