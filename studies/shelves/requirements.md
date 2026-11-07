# The Bookshelf Reader page's requirements

What a person using the Bookshelf Reader page sees and can do beyond the shell, which
[the shell's requirements](../../dev/requirements/requirements.md) state with the conventions this spec
follows too: tags, their order, **Tentative** and **Undecided**.

## `req/shelves` The Bookshelf Reader page: the books on a photo of shelves, boxed and read

Set by the owner on 2026-11-04: a study of image processing, not biology, an outlier on the site. It
takes a photo of bookshelves, boxes every book on it and reads the text on each, and writes what it
read for a title matcher; matching the titles is not part of it.

- `req/shelves/books/find` Find books boxes every book on the photo: four corners, spine or cover, standing or lying.
  <details>

  Find books runs the study's finder over the photo and draws each book it finds as four corners
  joined, two strokes (dark under light) that show over any colour a book carries, a cover's dashed.
  A book is a spine (its narrow face, standing upright or lying flat in a pile) or a cover (facing
  the camera); one shelf can hold all three. Its corners go clockwise from the one nearest the
  photo's top left. Set by the owner on 2026-11-04, a book leaning on its neighbours is boxed
  leaning with it: its box's long sides follow the spine's own edges, at the angle they run.
  Set by the owner on 2026-11-07, each box is that book's spine by itself, whatever the shelf, the camera angle or
  the books beside it: its top and foot are the book's own, at the angle they run, not a line the shelf's books
  share, with the books packed against each other and the photo taken from the front or from a side. One camera
  took the whole photo, so its perspective is one for every book: a box whose ends turn otherwise than the surest
  boxes say the camera saw them is not a book's. A box is kept only once it checks out as a readable spine: its long sides lie on edges along the book's
  length, its ends on edges across it, it is convex and spine-shaped, and its inside carries a book's texture rather
  than a wall's, a board's or a gap's; a book that fails is left for the ground truth to draw in, never boxed
  wrong. Set by the owner on 2026-11-07, two books of one series standing together, one colour and parted by no
  visible edge, are two boxes: their spines repeat one design, the same marks at the same heights, and a box that
  holds a mark and its repeat further across is two books. Set by the owner on 2026-11-07, books lying cover-up (on a
  ledge, a bench, a table) are boxed as covers, view `cover`, their four corners on the cover's own edges as the camera
  sees them, at a slant or not; a cover is kept only once its four sides lie on edges with the cover on one side and
  something else on the other, so the long lines of a bench's planks or a ledge's rim box nothing. Test: `studies/shelves/tests/test_books.py`,
  `studies/shelves/tests/test_shelves_page.py`.
  </details>

- `req/shelves/books/open` Load takes any single 2D photo: JPEG, PNG, WebP, BMP or a one-page TIFF.
  <details>

  The photo is shown in its own colours, turned as the camera said it was held (its EXIF
  orientation); a grey or 16-bit image is shown grey. Test: `studies/shelves/tests/test_books.py`.
  </details>

- `req/shelves/matcher/export` Download for the matcher writes each book's text, view, corners and how sure the reading is.
  <details>

  Outside ground truth the Summary box lists each book's text in the order found, shelf by shelf
  from the top; Download for the matcher saves `<image>_books.json`: the image, its size, and per
  book an id, its view, its text (empty when nothing was read), the reader's confidence (0 to 1,
  null when it was not read) and the reader's name, and its corners. Test:
  `studies/shelves/tests/test_shelves_page.py`.
  </details>

- `req/shelves/read/readers` Read titles reads each book with the reader chosen, in Hebrew and English, the same in the page as in the sandbox.
  <details>

  Set by the owner on 2026-11-04, three readers are offered, kept side by side until the ground
  truth chooses: Tesseract on the whole book (Hebrew and English), PaddleOCR's text finder marking
  each line of text and Tesseract reading each line, and PP-OCR finding and reading the lines itself
  (English only: it has no Hebrew, and on Hebrew it reads Latin letters with high confidence). Each
  book is straightened to an upright rectangle first and read at each turn its shape allows, the
  most confident kept. The page loads pinned builds of the engines from jsDelivr and the two
  languages from the site; the sandbox (`studies/shelves/reading/read.mjs`) runs the same builds on
  the same straightened crops, so a reading there is the page's. The reader last chosen is kept in
  the browser. Test: `studies/shelves/tests/test_reading.py`, `studies/shelves/tests/test_shelves_page.py`.
  </details>

- `req/shelves/truth/task` One ground-truth task: each book in turn has its corners, view and title set right, then the missed books are drawn in.
  <details>

  Set by the owner on 2026-11-04: boxing and reading are made into ground truth together, as
  NoR's finding and measuring are. A Ground Truth Tagger finds and reads the books, then works down
  the Ground Truth Tasks box: Books ("12/40 Books"), one book at a time, its straightened picture across
  the box, Spine or Cover, its title in a text box filled with what the reader read, and Right or
  Not a book under it, with Back and Skip on its row; its corners drag on the photo, and the
  picture and the reading follow them. Then Missed books: Draw a book takes four clicks on the
  photo, its corners, and the book is read and reviewed as the others; None missed ends the task.
  Submit ground truth is last, and saves `<image>_books_gt.json`, each book with where it came from
  (found or missed), its verdict, its corners, view and text, and for a found one what the finder
  and the reader proposed. Summary is not shown while ground truth is made. Test:
  `studies/shelves/tests/test_shelves_page.py`.
  </details>

- `req/shelves/visibility` The study is shown to its owner's account alone.
  <details>

  Its `visibility` names the owner's Google account (`req/shell/study/visibility`), so the site,
  whose focus is biology, offers it to no one else. Test: `web-tests/test_study_contract.py`.
  </details>
