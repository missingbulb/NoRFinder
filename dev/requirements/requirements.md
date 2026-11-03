# The page's requirements

What a person using the page sees and can do, in one place: the shell (`web/`) whichever study it
runs, the repo's checks, then each study's own page. Each line is a requirement; its detail and its
test fold under it. A study's research requirements, which no user sees, stay in the study's docs
([NoR Finder](../../studies/nor/docs/requirements.md)).

Each requirement is named by a tag, a path under its section's tag (`req/shell/offline/default`), and
cited by that tag wherever code, tests or docs point at it. Each section is sorted by tag, segment by
segment: a new requirement goes where its tag sorts, never at the end, and a related one shares its
branch. `web-tests/test_requirement_tags.py` holds the spec to this and fails a citation of a tag the
spec does not have.

## `req/shell` The shell, whichever study it runs

- `req/shell/account/settings` The avatar's menu opens Settings: every setting that follows the user, to change and save.
  <details>

  Set by the owner on 2026-10-31. Settings… in the avatar's menu opens a dialog listing each setting
  that follows the user (`req/shell/account/sign-in`), whether or not they are signed in, each with a control to change it:
  the theme (follow the system, dark or light); where Load reads from; Show thumbnails in the Drive
  dialog; whether the low-memory popup shows; the last Google Drive link, and the last one in each
  study; the tips closed, each with a tick to clear to see it again; the recent images from Google
  Drive, each with a tick to clear to drop it; Animations; and the version seen last. A line says where they are
  kept: in the user's Google Drive when signed in, else on this device only. Below them, set by the
  owner on 2026-11-02, **Kept on this device only**: every other setting the page keeps here, the
  shell's and the study on show's, each with its size and a tick to clear to forget it, and a link
  that clears them all, since the Storage tab no longer lists them (`req/shell/storage/manage`). Save writes what changed,
  the theme at once, and when signed in saves the user's settings file; Cancel changes nothing. Test:
  `web-tests/test_account_page.py`.
  </details>

- `req/shell/account/sign-in` Signing in with Google keeps the user's settings in their own Google Drive; not signing in changes nothing.
  <details>

  Set by the owner on 2026-10-31. The site has no server of its own for this: Google signs the user
  in, in Google's own window, and the page reads and writes their settings in their own Google Drive,
  in the app's hidden folder (`drive.appdata`), as one small file it reads whole and replaces whole.
  When the site has a Google client (the repository variable `GOOGLE_CLIENT_ID`, written into
  `config.js` by the build), the avatar's menu offers Sign in with Google, which asks Google for the
  user's name, email and picture and for the app's own folder in their Drive, nothing else of it.
  Signed in, the avatar is the user's picture, the menu names them and offers Sign out. These
  settings follow the user: dark or light, the tips closed, the version last seen, the low-memory
  popup turned off, where Load reads from, the last Drive link (in each study too), Show thumbnails,
  the images opened from Drive lately, and whether animations are on (`req/shell/resources-dialog/animations`). These stay with the device: the left bar's width,
  Auto-save images, and everything kept for images. Google's token lasts about an hour and is kept on
  this device for that hour. A new one can be asked for only in the user's own click or key press, so
  once it has run out the page asks only in one that needs Google: a change to a setting that follows
  the user, or opening Load or its dropdown. Google's window then opens and closes by itself while
  Google still remembers the consent; any other click opens nothing. Whenever
  the page has a token it syncs: the file's settings replace this device's, the theme at once, except
  each one this device changed since it last synced, which is kept and saved over the file's; with no
  file yet, this device's start it. While it has a token,
  each change to a setting that follows the user saves the whole file. Sign out forgets the user and
  the token on this device and leaves its settings as they are. A visitor who never signs in is asked
  once on opening the page (`req/shell/account/welcome`) and loads nothing from Google for it. Test: `web-tests/test_account_page.py`,
  `web-tests/test_site_config.py`.
  </details>

- `req/shell/account/welcome` Opening the page asks, once, whether to sign in with Google or go on anonymously, and remembers the answer if asked to.
  <details>

  Set by the owner on 2026-11-02. Where the site has a Google client (`req/shell/account/sign-in`), opening the page
  fades it behind a popup offering **Sign in with Google** or **Continue anonymously**, with
  **Remember this choice** below them, unticked. Ticked, the answer stands: signed in, the next
  visits open signed in with no popup, and anonymously, with no popup either, but a tip beside the
  avatar suggesting signing in to keep the settings on every device and reach the user's data files
  as themselves, until closed (`req/shell/account/settings` lists it with the tips). Unticked, the popup comes back on the
  next visit, signed in or not; there Continue anonymously signs out as the menu's Sign out does,
  and Sign in with Google goes on as the user signed in. A remembered answer the sign-in on this
  device contradicts (anonymous, yet signed in from another tab) is asked again. Signing in from the
  menu counts as a remembered choice; signing out there forgets it, and every open tab follows a
  sign-in or sign-out made in another. Closing the popup (Escape) changes nothing for this visit.
  Set by the owner on 2026-11-02 after a review: Sign in with Google keeps the popup up until Google
  answers; a Google window cancelled or blocked leaves it up, saying sign-in did not finish, to try
  again or continue anonymously. Google's script loads as the button is pressed, never on hover or
  focus. The popup deletes nothing and stops nothing the page is doing. Offline (`req/shell/offline/default`), a user
  signed in is not asked: the page opens signed in and the settings waiting for Google Drive keep
  waiting, to be asked on the next visit online. Anyone else offline still gets the popup: Sign in
  with Google is held, as everywhere offline, and a line says signing in can wait until the network
  is back, from the avatar's menu; Continue anonymously works. The sign-in tip, like every tip,
  follows what it points at when the window resizes. Test: `web-tests/test_welcome_page.py`.
  </details>

- `req/shell/browsers/supported` The page names the browsers it supports; in any other, the status bar's report icon is a warning sign.
  <details>

  Set by the owner on 2026-11-03. The page supports Chrome and Edge on a desktop or laptop computer, each from
  the version `web/browsers.json` names, the one place the list is kept; the floor is the first version that
  places the page's popups by CSS anchor positioning (Chrome and Edge 125; an older one shows each popup at a
  fixed spot). Firefox, from 147, and Safari, from 26, join the list once the nightly run on their engines
  (`req/checks/other-engines`) is green. A phone or tablet, iPhone and iPad included, is not supported, nor is any
  other browser (Opera, Samsung Internet), whatever engine it runs; one that names
  itself as Chrome (Brave, Vivaldi) counts as Chrome. In a browser not supported, the status bar's report
  icon (`req/shell/report/bug`) is a warning sign in the warning colour instead of a bug, named Unsupported browser, its
  tooltip saying why and that clicking it reports a problem; the report it opens is titled "Unsupported browser: ". The site's landing page (`req/shell/site/landing`) lists the
  same browsers, written in by the build from `web/browsers.json`. Test: `web-tests/test_problem_report_page.py`,
  `web-tests/test_published_site.py`.
  </details>

- `req/shell/channels/rows` Each channel has its row: shown or not, its black and white points, its name and its description.
  <details>

  Set by the owner on 2026-10-31. One row per channel of the image: a checkbox in the channel's
  colour that shows or hides it, its name, a (?) whose hover shows the study's description of it (at
  most 100 words), the file's own name for it when the study names it otherwise, and one slider
  holding two points: at or below the black point the channel is dark, at or above the white point
  its full colour, in proportion between; the black point stays below the white. A double click on
  the slider puts the points back. The channels are added together, each in its colour. A channel's
  name, colour, description, whether it shows at first and its first points come from the study's
  `channels` for the channel at that place, else from what the file says (the study's Python), else
  from its place: red, green and blue, then more colours, a lone channel grey; a channel the file
  colours but does not name is named for its colour. The rows start over with every image. Test:
  `web-tests/test_image_box_page.py`, `studies/viewer/tests/test_viewer.py`.
  </details>

- `req/shell/drive/dialog` Google Drive: paste a shared link, no sign-in; browse folders; open on Open, double click or Enter.
  <details>

  The user pastes the link of an image or a folder shared as "Anyone with the link", with no
  sign-in. An image loads at once; a folder lists its images and subfolders to pick from, each image
  with its size, the date it was added to Drive and a small colour thumbnail; the dialog keeps one
  size while the user moves between folders. A click only selects a row; Open (or a double click,
  or Enter) opens it: an image loads, a folder lists its contents. Thumbnails are never read from
  Drive, which answers a burst of reads by refusing the browser for a while, the next image
  included. A study may ship ready-made thumbnails (its `driveThumbs`), fetched for the rows in view
  and the next 10 below them, more as the user scrolls; a row scrolled past before its turn is not
  fetched. Each thumbnail lands in its own row whatever order they arrive in, and a folder's listing
  is shown only while it is still the folder asked for. One fetched stays for the page's life:
  closing the dialog stops the rest, and reopening it shows those at once and fetches what the rows
  in view still lack. Test: `web-tests/test_drive_thumbs_page.py`. An image opened from Drive saves its own in the browser (the latest 100), shown from then
  on without a download; a PNG shows Drive's own. All are in the colours the page gives the
  channels. A checkbox at the bottom, "Show thumbnails" (on at first, remembered in the browser),
  turns the downloads off; beside it, and in the status bar while they load, how many have arrived
  and their size. It needs the site's Google API key, kept in the repository variable
  `GOOGLE_API_KEY` and written into `web/config.js` at deploy; without one the option is off
  (`web-tests/test_site_config.py`). The dialog opens on the link last pasted in this study, else on
  the study's own folder (`files.drive` in its `study.json`), else on the link last pasted in any
  study, and lists a folder link at once; opening on a link is not pasting it
  (`web-tests/test_drive_folder_page.py`). Nothing
  else read from Drive is kept, apart from the image files Auto-save images keeps (`req/shell/storage/manage`, `req/shell/drive/kept-images`;
  `studies/nor/tests/test_drive_dialog.py`).
  </details>

- `req/shell/drive/kept-images` Images from Drive open again without a download.
  <details>

  The Google Drive dialog's bottom row holds two remembered checkboxes, **Show thumbnails** and
  **Auto-save images** (both on at first), and beside them a link that opens Manage storage, its
  text the bytes the thumbnails and saved images take on this device. While Auto-save images is on,
  an image downloaded from Drive is kept on this device. An image chosen from the recents (`req/shell/load/recents`)
  opens from the copy kept here, with no call to Drive. One chosen from Drive itself, in the dialog's
  list or by its link, opens from the kept copy, whatever the checkbox says, only once its SHA-256
  matches the one Drive gives for the file now (from the folder's listing, or from the file's
  details for a link); otherwise it is downloaded: when the two differ (the file changed on Drive),
  and when Drive gives no SHA-256 or cannot be asked. A download replaces the kept copy while
  Auto-save images is on. Test: `web-tests/test_storage_page.py`, `web-tests/test_drive_cache_page.py`.
  </details>

- `req/shell/drive/previews` A folder's `rauntruth-previews.tiff` gives every image it covers a preview at once, a stack turning on hover.
  <details>

  A Drive folder may hold `rauntruth-previews.tiff`, made by `dev/tools/previews/make_previews.py`
  on a computer that has the folder's images and uploaded beside them: a multi-page TIFF, its pages
  deflate-compressed, whose first page's description is a JSON index naming each image, its SHA-256
  and its pages. A flat image has one colour page; a stack has a mini-volume, one 8-bit page per
  slice and channel. The dialog never lists the file; when a folder has one it downloads it at
  once, in one request, and keeps it in the browser until Drive gives the file a different SHA-256.
  An image the index names with the SHA-256 Drive gives for it now shows its preview and what it
  holds (`req/shell/drive/stacks`) with no read of its own: a flat image's colour picture, a stack's mini-volume drawn
  turned a little, its channels in their own colours, and turning while the pointer is over its row.
  An image the index lacks, or names with another SHA-256 (it changed since the file was made), is
  read as without the file (`req/shell/drive/dialog`, `req/shell/drive/stacks`). The download waits, like every other, while Drive
  throttles the site (`req/shell/drive/throttle`). Manage storage counts each folder's file with its study's thumbnails. Test:
  `web-tests/test_drive_previews_page.py`.
  </details>

- `req/shell/drive/stacks` The Drive dialog tells a 3D stack from a flat image, and shows a stack in 3D once opened.
  <details>

  Each TIFF row in the Google Drive dialog says what the file holds, "3D · 24 slices" for a stack
  ("3D · 30 slices · 2 channels" when it has more than one channel) and "2D · 3 channels" for a flat
  image, read from the file's first 64 KB (its ImageJ header), for the
  rows in view and the next 10 as the thumbnails are (`req/shell/drive/dialog`) and only while Show thumbnails is on.
  What each file holds is remembered in the browser, so it is read once. A file whose header says
  neither shows nothing. When a stack is opened from Drive, its thumbnail is a small 3D picture of
  the whole stack, turned a little to show its depth, its channels in their own colours (two in green
  and magenta), drawn from the file the page already has with
  no further download; a flat image's stays the one `req/shell/drive/dialog` describes. Test:
  `web-tests/test_drive_shapes_page.py`.
  </details>

- `req/shell/drive/throttle` When Google throttles the site's Drive downloads, the Drive dialog says so and waits 15 minutes.
  <details>

  Google answers a burst of downloads by refusing the site's for a while, with no word the page
  can read, so the page knows it by a download failing while Drive still answers for the same
  file's details (a failure where both fail is shown as the error it is). From then on, for 15
  minutes, the Drive dialog shows a large notice, "Google is throttling this site's downloads. Try
  again in 15 minutes.", with a red countdown from 15:00, and makes no call to Drive: its link, Go,
  Open, the list, its thumbnails and badges all wait. The wait is kept in the browser, so reloading
  the page does not end it. An image kept on this device (`req/shell/drive/kept-images`) still opens, from the device. When
  the countdown ends, the notice goes and the dialog lists its link again. Test:
  `web-tests/test_drive_throttle_page.py`.
  </details>

- `req/shell/ground-truth/submit` Ground truth goes to GitHub as a file and a labelled issue; an image from the computer cannot.
  <details>

  The study's submit button opens a popup with the study's checklist of what is left to do, an
  Export file button that downloads the file, and beside it an Open new GitHub issue button: a new
  issue on the repo, labelled with the study's `groundTruth.label` and naming the image, whose body
  says to attach the file. The next step is the blue button: Export file, then Open new GitHub
  issue, then Close; for a local image Close follows the export. An image from the computer cannot
  be submitted: right after it loads, the page says so in one line (at most 15 words), and in the
  popup the issue button is off and says why (`studies/nor/tests/test_ground_truth_page.py`).
  </details>

- `req/shell/header` A header with the logo, the study switcher and a dark/light switch (remembered).
  <details>

  GitHub's repository switcher, for studies: the study's title and a solid caret form one 32 px
  control; it opens, under the caret, a 320 px panel headed "Switch study", a search box (focused,
  filtering by title as the user types) and every study whose `study.json` says `"listed": true`,
  by title, each with a study icon, a rule under its name, and a tick on the one on show. Arrow
  keys move through the list, Enter opens the one marked, Escape closes it. Each entry is a link to
  the study's address (`req/shell/study/folder-and-address`), so a middle click opens it in a new tab. The header's spacing follows
  GitHub's: 64 px tall, 16 px at the sides, a 32 px logo. Test: `web-tests/test_study_runs.py`.
  </details>

- `req/shell/image/file-info` The image's name unfolds what the file says about the image, and nothing it does not say.
  <details>

  Folded at first: the field in µm and px, the pixel size, the bit depth, the ImageJ series, the
  microscope and date when the file names them (the lab's ImageJ exports never do, and the box says
  so), and the software that saved it (`studies/nor/tests/test_file_info.py`).
  </details>

- `req/shell/image/minimap` A minimap hovers over the image, showing the part in view; drag, zoom and step by mouse.
  <details>

  Set by the owner on 2026-10-31. The minimap (a small picture of the whole image, the part in view
  outlined; never called a thumbnail, which is a file's picture in a list) hovers over the image's top
  left corner, headed "Minimap" and framed by a solid white border that sets it apart from any image;
  a click or a drag on it moves the view there. It shows only while the image is larger than the view:
  with the whole image in view there is nothing to navigate, and it would only cover the image's
  corner. A ^ at one end of its header collapses it to the
  header, and the same spot then shows v, which opens it again, so a second click undoes the first;
  an X at the header's other end hides it. A Minimap button in the toolbar, beside the Grid, shows it
  again or hides it, pressed while it shows; hiding it folds the minimap into that button, flying there
  along an arc, and showing it unfolds it back out of the button (set by the owner on 2026-10-31; no
  motion for a user who asks the system for reduced motion); hovering over the button opens a popup choosing how
  see-through it is at rest, opaque at first and always opaque under the pointer. Whether it shows and its opacity are kept as the user's settings for the
  next visit. Dragging moves the image, wherever it starts, a label or the ruler's length included:
  no drag selects or drags the page's text (set by the owner on 2026-10-31). Scrolling up and down zooms around the pointer in small steps;
  scrolling sideways steps to the study's previous or next item (for NoR, the candidate). The main
  area's toolbar holds the zoom at its right, and its tools wait for an image. Test:
  `web-tests/test_image_box_page.py`.
  </details>

- `req/shell/image/progressive` An image shows while it downloads.
  <details>

  An uncompressed TIFF like the lab's paints onto the page from its bytes as they arrive from
  Google Drive, one channel after another in its own colour, with the megabytes so far and the
  elapsed time below; a file from the computer shows at once. Python's own drawing replaces it once
  the image is read. Any other image shows the byte count.
  </details>

- `req/shell/image/proportions` No image is ever drawn out of its proportions.
  <details>

  A crop or picture narrower than its box shrinks as a whole (`studies/nor/tests/test_page_layout.py`).
  </details>

- `req/shell/image-viewer` The Image Viewer: the page with no study's tools, the one it opens on.
  <details>

  A study with no panels and no actions (`studies/viewer/`): it loads any TIFF or PNG and shows each
  channel, up to 8, under the name the file gives it (an OME channel name, an ImageJ label, never
  ImageJ's own made-up "c:1/3 - …") and in the colour the file displays it in (an ImageJ LUT, mixed
  colours included), leaving what the file does not say to `req/shell/channels/rows`; the image box says what the file
  states, its scale only when the file gives one in µm. A side bar it leaves empty gives its room to the image, and it
  has no ground truth, so a local image earns no notice about sending one. Test:
  `studies/viewer/tests/test_viewer.py`, `web-tests/test_study_runs.py`.
  </details>

- `req/shell/left-bar/folding` The left bar's boxes stay folded until their step makes them useful, and fold again once it is done.
  <details>

  Set by the owner on 2026-10-30. Every box in the left bar folds under its title, and clicking the
  title opens or closes it. The first is the shell's Image box (the image's details, its channels, Load
  and Unload): open until an image opens, then folded. Each of a study's boxes
  names the step (`req/shell/status-bar/breadcrumbs`) after which it opens, or that only its title opens it, and may name the
  step after which it folds again. When a step is done by the user (an image opening, or the
  step's button pressed, never a dial set back to the last run's) its boxes open and the boxes it
  closes fold; opening another image also folds every box waiting for a later step. Between those moments a box
  stays as the user left it; switching study (`req/shell/study/switch-in-place`) starts over.
  Changed by the owner on 2026-10-31. The boxes are drawers stacked in one panel, no gap between
  them, each title on a compact row behind the step's number in a circle, which turns into a green
  check once the drawer's task is done; the open drawers carry an accent bar at their left. A
  drawer's title describes its task while the task waits, open or folded; once it is done, the
  folded title sums up what was done and the open one names the drawer. The Image box, titled Load
  Image while no image is open (and again after Unload), folds once done to
  a small preview of the image, its name and what it holds ("2D", "3 channels", from the file;
  only "2D" when the file does not say), and opens as "Loaded Image". A study's drawer is done
  when the study gives it a summary, and waits again when the study takes it back. A drawer opening or
  folding slides open or shut, and the drawers below it slide to their new places (set by the owner on
  2026-10-31). Test: `web-tests/test_left_bar_page.py`, `web-tests/test_study_contract.py`.
  </details>

- `req/shell/left-bar/width` The left bar drags wider or narrower (remembered; a double click restores it); there is no right bar.
  <details>

  Folding or unfolding a box never changes the bar's width. Set by the owner on 2026-10-31: the page
  has no right bar; what a study once put there goes over the image (its `over-image` slot) or at
  the toolbar's right end (its `toolbar-end` slot).
  </details>

- `req/shell/load/button` Load opens an image from this computer or Google Drive, and shines until one is open; Unload beside it closes it.
  <details>

  The left bar's Image box holds the image: its name and what the file says (`req/shell/image/file-info`), its channels
  (`req/shell/channels/rows`), and at its foot Load, with a dropdown for where from (this computer or Google Drive),
  filled and glowing until an image is open and a plain button with a blue border after. Load sits at
  the foot, not in the box's title, so the title keeps its place whether the box is folded or open.
  Each place in the dropdown has a small icon: a computer for this computer, Drive's logo for Google
  Drive. Once an image is open, Unload stands beside Load and clears the page back to before any image:
  no image, no minimap, the steps starting over at Load image, the boxes folded as at first, and the
  study starting over too, its panels as they were before any image; Python lets the image go. Test:
  `web-tests/test_storage_page.py`, `web-tests/test_image_box_page.py`.
  </details>

- `req/shell/load/recents` Load's dropdown lists the images opened from Google Drive lately, each one click away; the dropdown stays inside the left bar, a long name cut short.
  <details>

  Below this computer and Google Drive, Load's dropdown lists the last 10 images opened from Drive
  in the study on show, newest first (set by the owner on 2026-10-31: an image opened in another
  study is irrelevant here), each by its name and where it is in Drive (the folders under the link it was opened
  from) beside Drive's small logo, as From Google Drive has one, so two files of one name stay apart; an image is one entry however often it is opened.
  Choosing one opens the copy kept on this device (`req/shell/drive/kept-images`), with no download, and downloads it again
  only when none is kept. Images from this computer are not listed: a web page cannot open a file
  on the computer again by itself. Test: `web-tests/test_storage_page.py`.
  </details>

- `req/shell/load/recents-tip` A tip bubble points at Load's dropdown when an image opened from Drive is one of the recent ones.
  <details>

  When an image chosen in the Google Drive dialog opens from this device (`req/shell/drive/kept-images`), a bubble beside
  Load's dropdown arrow, its arrow pointing at it, says "To load recent files click here". Its ×
  closes it for good, and so does opening the dropdown, which is what it asks for. Each tip has an
  id, and the ids of the tips closed are kept in the browser (listed in Manage storage's settings as
  "Tips you closed"), so a closed tip never shows again, after a reload too. Test:
  `web-tests/test_drive_cache_page.py`.
  </details>

- `req/shell/memory/no-growth` Memory does not grow with use.
  <details>

  Opening image after image, running the study's actions again and moving its controls leaves the
  page, its worker and the Python inside holding no more than the last time it did the same thing
  (`studies/nor/tests/test_memory.py`).
  </details>

- `req/shell/offline/default` Offline by default: a page opened once online opens again with no connection, and runs whatever is already on this device.
  <details>

  Set by the owner on 2026-11-02 (the airplane case), with no step from the user. Every visit keeps
  a copy of the whole site's own files on this device, the one release the build lists in
  `offline.json` with each file's SHA-256, each checked against that list and refetched only when it
  changed. With no network the page then opens at its own address and at every study's, from that
  copy. A study whose Python is already on this device runs; one whose Python is not says so: it
  needs the internet once, or Make available offline (`req/shell/offline/per-study`). An image kept on this device (`req/shell/drive/kept-images`,
  `req/shell/offline/per-study`) opens: offline, From Google Drive lists the images kept here instead of a Drive folder.
  The status bar shows Offline, which opens the Storage tab (`req/shell/offline/per-study`). What needs the network says so in
  its tooltip and does nothing: Sign in with Google, opening a new GitHub issue and Submit New Study
  Request. A change to a setting that follows the user (`req/shell/account/sign-in`) waits and is saved once the network is
  back. A visit the browser cannot reach a copy for, never opened online, shows the browser's own
  offline page: no site opens there. Nothing here installs the site as an app or asks the browser
  for anything. Test: `web-tests/test_offline_page.py`.
  </details>

- `req/shell/offline/mark` What is available offline says so, quietly: a study, and an image from Google Drive.
  <details>

  Set by the owner on 2026-11-02, so the user knows before doing anything what works with no network
  (`req/shell/offline/default`). A small grey mark, the same everywhere, an arrow into a tray for saved on this device,
  follows a study whose Python is all on this device, in the header's switcher and its Storage
  section, and an image kept on this device, in the Google Drive dialog's rows; what is not available
  offline carries nothing. Load's recent images carry none: with Auto-save on, they are all kept. Hovering on the mark says what
  it means: the study runs, or the image opens, without the internet. Test:
  `web-tests/test_storage_page.py`.
  </details>

- `req/shell/offline/per-study` Each study can be made available offline from the Storage tab, after a popup with what it takes and how long.
  <details>

  Set by the owner on 2026-11-02, nothing in it happening until the user asks. The Storage tab
  (`req/shell/storage/manage`) opens with **Install as an app**: only on the user's click does the page offer the
  browser's install, an icon that opens the site in its own window, offline too; until then the
  page names no app manifest, so the browser offers none unprompted. Where the browser has no install
  button of its own to call, the tab says where that browser's own menu has it. Each study's section
  that is not all on this device has **Make available offline**, which opens a popup of what that
  takes: its Python still missing, Python itself counted when it is, from jsDelivr; and, for a study
  with a Google Drive folder of its own (`files.drive`), every image reachable from it, its
  subfolders included, each with its folder and size, ticked, to untick one by one or all at once.
  The popup adds up what the choice downloads, beside how much more the browser lets the site keep,
  and estimates how long it takes, source by source (`1 GB from Google Drive at 25 MB/s + 200 MB of
  Python at 15 MB/s, about 1 min 20 s`), at the speeds this session measured from each source; with
  none measured yet, at the browser's own estimate of the connection, saying so, or it says it
  cannot tell. A choice larger than the room left is refused, saying so. Download asks the browser
  to keep the site's storage until the user deletes it, downloads with its progress shown and can be
  stopped, and ends saying what is now on this device and whether the browser agreed to keep it.
  When Google throttles the downloads (`req/shell/drive/throttle`) it stops and says so. The status bar's Offline
  (`req/shell/offline/default`) opens the Storage tab. Test: `web-tests/test_offline_page.py`.
  </details>

- `req/shell/page-state` The shell's controls are drawn from one page state, and change only it.
  <details>

  Set by the owner on 2026-10-31. Which image is open (or being read), and the minimap's mode and
  opacity, live in one page state in the shell (`web/page_state.js`). Loading and unloading an image
  change that state, and every control showing a part of it (Load and Unload, the image's name and
  details, the channels, the view, the minimap and its toolbar button) redraws from it; no control
  reaches into another to change it. The steps (`req/shell/status-bar/breadcrumbs`) are a state of the same kind. Test:
  `web-tests/test_image_box_page.py`.
  </details>

- `req/shell/preprocessing/split` Preprocessing, in every study, splits an image into 4 or 9 TIFFs for ground truth, each recording where it lay.
  <details>

  Set by the owner on 2026-10-31. A large image is hard to annotate in one sitting; its parts can be
  annotated one at a time, by several people at once, and give the finders smaller samples to tune on.
  Changed by the owner on 2026-10-31: it is the shell's, in every study, the Image Viewer included. Below
  the Image box the shell's Preprocessing drawer opens with the image and folds once the study's first step
  is done (a study with no steps leaves it as the user left it); a study adds its own preprocessing steps
  to it through its `preprocessing` slot. Its Split into parts button, off until an image is open, opens
  the dialog. The dialog shows the image small, cut 2 × 2 or 3 × 3 into evenly spaced parts numbered as `{n}` counts
  them; dragging a line moves its cut, never closer than a twentieth of the image to the next one, and
  clicking a part leaves it out, clicking again keeping it. It lists the image's channels by the names and
  colours the page gives them, each kept or dropped, and for a stack the slices kept, from one to another.
  The parts' file names are the image's name and a pattern (`_r{row}c{col}` at first, kept as the user's
  setting; `{row}` `{col}` `{n}` `{x}` `{y}` `{rows}` `{cols}`, `{name}` for the image's name), listed as
  they will be; a pattern giving two parts one name, no channel kept, slices out of range or every part left
  out holds the download and says why. Download all parts gives one ZIP of the parts. Upload to Google
  Drive is shown, off, and says it needs a Google sign-in the page does not have.
  Each part is an ImageJ TIFF (uncompressed, little-endian) of the channels and slices kept, every time point
  kept, its pixels the image's own, bit for bit at its own bit depth: the image's scale, unit, slice spacing,
  channel colours (the file's LUTs, else the page's colours), names, display ranges and Info are kept, and
  its Info gains a line `rauntruth.split={…}`: the image it came from (name, SHA-256, Drive id, size,
  channels, slices, frames), the grid's cuts, the part's row, column, number, x, y, width and height, the
  channels and slices kept (from 0), and for a part of a part where it lies in the first image (`root`).
  That record is enough to join the parts' ground truth back into the whole image's. It reads ImageJ
  hyperstacks, OME-TIFFs in one file and plain TIFFs (strips or tiles; uncompressed, LZW, Deflate or
  PackBits, either byte order; 8, 16, 32 or 64 bits), and a PNG as the browser decodes it; it refuses a
  BigTIFF, and a part over 4 GB. Test: `web-tests/test_split.py`, `web-tests/test_split_page.py`, `web-tests/test_left_bar_page.py`.
  </details>

- `req/shell/python/background-load` No waiting to start: Python loads in the background from the moment the page opens.
  <details>

  The user picks an image meanwhile, which opens as soon as Python is ready. Its packages download
  while Python itself starts, and the status bar names each stage (downloading, with the megabytes
  so far; installing; loading the study, in the study's own words; ready). Until an image is loaded,
  Load shines, and the study's boxes are folded (`req/shell/left-bar/folding`).
  </details>

- `req/shell/python/one-call` Python is reached through one generic call.
  <details>

  The shell's Python runtime opens a file with the study's `Session(path)` and forwards every other
  request as `call(action, args)`, returning JSON and optional bytes. It never names an action.
  Test: `web-tests/test_study_runs.py` runs the fixture study through the bridge in Pyodide and through
  the real worker in the page; the NoR study's memory test checks that repeated calls leave nothing
  behind.
  </details>

- `req/shell/report/action-log` The page keeps the user's last 200 actions on this device, for a problem report, and sends them nowhere.
  <details>

  Set by the owner on 2026-11-03. Each control the user clicks, ticks, chooses or sets is logged by its name
  as the page shows it, with where it is (the dialog or popup), and never what they type; opening a study, an
  image (where from, its size and slices) and a step done are logged too, and kept apart from them the errors
  the page meets: an error in the status line, and a script error the page did not catch. No image's or
  folder's name is logged: a control that shows one (Load's recents, the Drive list, the image's name, a
  part's file name, the Storage tab, the lists in Settings) is logged by what it is. The log keeps the last
  200 entries in the browser, so a report filed after a reload still has them; Settings lists it among what is
  kept on this device only, with its size, to clear (`req/shell/account/settings`). The privacy policy says it is kept. Test:
  `web-tests/test_problem_report_page.py`.
  </details>

- `req/shell/report/bug` A bug icon in the status bar, always there, opens a new GitHub issue filled in with the browser, the study, its state and the last five actions.
  <details>

  Set by the owner on 2026-11-03: the regular way to report any problem. A small grey bug, the status bar's
  first item from the left of its right-hand items, in every browser (in one not supported, a warning sign:
  `req/shell/browsers/supported`), and **Report a problem…** in the avatar's menu, open a new issue in a new tab on the repo's **Problem report** form
  (`.github/ISSUE_TEMPLATE/bug-report.yml`), its fields filled in: the browser's name, full version where the
  browser gives it, system, whether it is supported, and its user-agent string; the page's state (the site's
  version, the study and its stage, whether Python is ready, the steps and which are done, the image open by
  where it came from, its size, channels and slices, never its name, the view, whether online and signed in,
  the window's size and the memory the browser says the computer has); the last five actions
  (`req/shell/report/action-log`), oldest first, each with its time; and the last three errors. The user writes what happened,
  reads what was filled in and submits it themselves; the page sends nothing. The title starts "Problem: ",
  or "Unsupported browser: " in a browser not supported. Offline both are held, as everything that
  needs the internet (`req/shell/offline/default`). Test: `web-tests/test_problem_report_page.py`.
  </details>

- `req/shell/resources-dialog` Storage, memory, network and CPU are four tabs of one dialog, alike.
  <details>

  Set by the owner on 2026-10-31. The disk, memory, network and CPU in the status bar each open
  the same dialog, titled Resource Usage, on their own tab, and its tabs switch between them. Every tab is laid out the
  same way: a line with the total, then rows of a name, what it is in grey beneath, and a size at
  the right, then a row of the tab's own buttons and Close. Test: `web-tests/test_status_bar_page.py`.
  </details>

- `req/shell/resources-dialog/animations` An Animations checkbox in the resources dialog's CPU tab turns every animation on the page off.
  <details>

  Set by the owner on 2026-10-31. Checked at first, it is kept as the user's setting: the next visit
  opens with it as it was left, and signed in it follows the user (`req/shell/account/sign-in`). Unchecked, nothing on the
  page moves to draw the eye: the minimap and the drawers change at once, the photocopier's light
  does not sweep the image, no button shines or glows (one that would looks plain, with no light or
  halo frozen on it), the status
  bar's digits change without rolling and a sharp rise does not flash. A spinner still turns, since
  it is what says the page is working rather than stuck. Test: `web-tests/test_status_bar_page.py`,
  `web-tests/test_account_page.py`.
  </details>

- `req/shell/site/app-address` The app is at rauntruth.com/app/; the site's root says what the site is.
  <details>

  Set by the owner on 2026-11-02. The shell's page files are published under `app/`, beside the
  studies' `studies/` folder at the site's top, so the page's `../studies/` resolves to the same
  folder in the app and at `/web/` in a preview of the repo itself. The site's own pages (`site/`)
  are published at its top: the landing page (`req/shell/site/landing`), the legal pages (`req/shell/site/policies`, `req/shell/site/license`), the
  icons and posters (`req/shell/site/icons`), `robots.txt` and `sitemap.xml` (`req/shell/site/crawlers`). An address from before the
  move (`/<id>`, `/web/…`, `/?study=<id>`) is not served, by the owner's choice: nothing redirects
  it. The service worker the app registered at the site's top before the move is retired by a
  `/sw.js` that unregisters itself and deletes nothing it kept. Test:
  `web-tests/test_published_site.py`, `web-tests/test_old_worker_page.py`.
  </details>

- `req/shell/site/caching` Only our code is fetched fresh; third-party code is cached for 30 days.
  <details>

  Third-party code (Pyodide, its packages, vendored wheels) is cached in the browser for 30 days.
  The site's own files are fetched fresh whenever the network answers, so a release shows on the
  next load; a copy is kept only to open the page offline (`req/shell/offline/default`).
  </details>

- `req/shell/site/crawlers` `sitemap.xml` lists the site's own pages, never the app or a study; `robots.txt` keeps crawlers off the app.
  <details>

  Set by the owner on 2026-11-02. The build writes both: the sitemap lists the site's own pages;
  `robots.txt` names the sitemap and disallows `/app/`, the app and every study's address in it,
  leaving the site's pages open to crawlers. Test: `web-tests/test_published_site.py`.
  </details>

- `req/shell/site/icons` The site, the app and each study show their own icon in the tab and their own poster in a shared link.
  <details>

  Set by the owner on 2026-11-02. The site's pages carry the site's favicon (`favicon.svg`, and
  `favicon.ico` for whatever asks for it unnamed) and its poster; the app carries a different icon
  and its own poster. A study may name its own in `study.json`, `icon` (an SVG) and `poster` (a
  1200 × 630 PNG), files under its `web/`: its address then carries them, and while it is on show
  the tab's icon is its own; a study naming none shows the app's. A poster is named by its full
  address (`og:image`), with the page's title and description, for a shared link's preview. Test:
  `web-tests/test_published_site.py`, `web-tests/test_study_contract.py`, `web-tests/test_study_runs.py`.
  </details>

- `req/shell/site/landing` The site's root is a short page saying what the site is, opening the app and each listed study.
  <details>

  Set by the owner on 2026-11-02, so a visitor who gets a link learns what this is before landing in
  the tool. `rauntruth.com/` says what the site does and for whom, that images are analysed in the
  browser and never uploaded, and that it is free and open source; it opens the app (`req/shell/site/app-address`), lists
  every study the switcher offers (`req/shell/header`), each a link to its address, filled in by the build from
  the studies' `study.json`, lists the supported browsers (`req/shell/browsers/supported`), and links the privacy policy, the terms and the license. Test:
  `web-tests/test_published_site.py`.
  </details>

- `req/shell/site/license` The code is MIT-licensed: the repo's `LICENSE`, and rauntruth.com/license.
  <details>

  Set by the owner on 2026-11-02, naming whoever the terms name. The license page carries the MIT
  text the repo's `LICENSE` carries, word for word, and is linked from the landing page, the legal
  pages and the avatar's menu. Test: `web-tests/test_published_site.py`.
  </details>

- `req/shell/site/out-of-date` An open page knows when it is out of date.
  <details>

  Every 5 minutes it compares its version with the published one; when a newer one is out, the
  version box in the status bar lights up and refreshes the page when clicked.
  </details>

- `req/shell/site/policies` The site publishes its privacy policy and terms of service, linked from its landing page and the avatar's menu.
  <details>

  Set by the owner on 2026-10-31, for Google's sign-in consent screen, which links both and requires
  them on the site's own domain, linked from its home page. rauntruth.com/privacy and /terms say who
  runs the site and how to reach them. The privacy policy says what the page keeps on the device, what
  reaches each outside service (Cloudflare, Google, jsDelivr, GitHub) and when, and, for signing in,
  which Google user data the page reads, where it keeps it and that it shares none, under Google's
  API Services User Data Policy and its Limited Use requirements. The landing page (`req/shell/site/landing`) and the
  avatar's menu link both. Test:
  `web-tests/test_published_site.py`.
  </details>

- `req/shell/site/published-files` The shell decides what is published.
  <details>

  The published site is the shell's page and, from each study, only what its standard layout says
  the page loads: `study.json`, the study's page part under `web/` (never its Python), and the
  modules directly in the folders its Python is imported from (`python.paths`), which is all the
  page's importer can reach. A study's docs, data, tests and lab notes stay in the repo, and nothing
  in a study says how, where or whether it is published. The build (`dev/tools/build/build.py`)
  assembles the set under `dev/build/site/`, the tree the release uploads. Test:
  `web-tests/test_published_site.py`.
  </details>

- `req/shell/site/visit-counting` Visits are counted without cookies.
  <details>

  The released site loads Cloudflare Web Analytics, which sets no cookies and stores nothing on the
  device. Its token is a repository variable the release writes into the uploaded copy, so a local
  preview or a fork counts nothing. Test: `web-tests/test_published_site.py`.
  </details>

- `req/shell/status-bar` The status bar: the study's stage and its steps at the left, the disk, memory, network, CPU and version at the right.
  <details>

  From the left edge: the study's stage (`req/shell/study/stage`), then the breadcrumbs of its steps (`req/shell/status-bar/breadcrumbs`), then
  the spinner and what the page is doing now (each stage of Python's loading, the study's progress,
  an error in red) and the thumbnails' progress (`req/shell/drive/dialog`). From the right edge inward: the site's
  version (stamped by each release; `req/shell/version-history`, `req/shell/site/out-of-date`), the CPU (`req/shell/status-bar/cpu`), the network (`req/shell/status-bar/network`), the
  memory (`req/shell/status-bar/memory`) and the disk (`req/shell/status-bar/disk`), and before them the report icon (`req/shell/report/bug`), a bug, or a warning sign in a browser the page does not support. Each of the four before the version is a small grey icon
  and its number, with no word naming it; all five are plain, with no box, alike. A mild vertical
  bar separates each item from the next. Nothing in the status bar turns the pointer into a
  question mark. The image's name and the study's counts are in the
  breadcrumbs' popups: Load image names the image, the study's own step gives its counts. Test:
  `web-tests/test_status_bar_page.py`.
  </details>

- `req/shell/status-bar/breadcrumbs` Breadcrumbs show the steps done so far, and the step to do now shines.
  <details>

  A study's steps are Load image, the study's own in order (its `study.json` `phases`; for NoR
  Run algorithm and Review all items), then Submit GT in a GT or PostGT study. The status bar shows
  the steps done, then the first one not done, which shines blue, and with it the button that does
  that step (the `button` the step names; Load for Load image, the ground-truth button for Submit
  GT); later steps do not show yet, and once every step is done none shines. Load image is done
  once an image is open, Submit GT once its issue is opened (for a local image, once its file is
  exported); the study says when its own steps are done (NoR: Run algorithm while the image was
  searched with the finder and settings now chosen, Review all items while the Submit Ground Truth
  button (`req/nor/downloads`) says the ground truth is complete: some vote cast, every added NoR and every
  finalist decided; corrected by the owner on 2026-10-31, so the filters rejecting every finalist
  never moves the step on while the button still says what is missing). Opening another image, or switching study (`req/shell/study/switch-in-place`), starts over. Hovering a crumb says what was done in that step
  and when. Clicking the crumb that shines brings its button into view, unfolding the box it is in
  (`req/shell/left-bar/folding`) and scrolling to it, and presses it: a way there, a lesson in where it is, and a
  shortcut. The steps live in one state in the shell, and the crumbs and the shining buttons are
  drawn from it alone. Test: `web-tests/test_status_bar_page.py`,
  `studies/nor/tests/test_ground_truth_page.py`.
  </details>

- `req/shell/status-bar/cpu` The CPU, a processor icon and "12%", is how busy this tab's threads are now.
  <details>

  Set by the owner on 2026-10-31. The page's own thread and Python's, each as a share of one core
  over the last two seconds, their sum in the status bar, as a browser's task manager counts it.
  An estimate, which its tab says: Python's share is the time it spent working; the page's is its
  long tasks, which only Chrome and Edge report (elsewhere it shows as unknown); the browser's own
  work, its drawing included, is not counted. Test: `web-tests/test_status_bar_page.py`.
  </details>

- `req/shell/status-bar/disk` The disk, a drive icon and "1.4 GB", opens the Storage tab.
  <details>

  What the site keeps on this device, the total the Storage tab reports (`req/shell/storage/manage`), kept current as the
  page saves or the user deletes. Clicking it opens the Storage tab (`req/shell/resources-dialog`). Test:
  `web-tests/test_status_bar_page.py`.
  </details>

- `req/shell/status-bar/memory` The memory, a memory-chip icon and "253 MB", opens what holds it and a Run GC button.
  <details>

  The memory the tab holds: Python's, its files, the page's (Chrome and Edge say it) and an estimate
  for the compiled code and the browser, which a page cannot read; amber past a quarter of the
  computer's total where the browser says it. Clicking it opens the Memory tab (`req/shell/resources-dialog`) listing each
  of those, and within the page's share the image and the study's results, and the computer's
  total. Its Run GC button has Python collect its garbage and says what Python then holds in use
  against what it has reserved; the tab carries no essay on how Python's memory grows. Test:
  `web-tests/test_status_bar_page.py`.
  </details>

- `req/shell/status-bar/network` The network, a download icon and "1.2 MB/s", is how fast this tab is downloading now.
  <details>

  Set by the owner on 2026-10-31; a speed rather than a total since 2026-10-31, so a burst shows
  as one. The speed is what was downloaded over the last two seconds, as the CPU's share is
  (`req/shell/status-bar/cpu`). Its tab gives the speed and what this tab has downloaded since it opened, and splits
  that total into the page's own files, Python with its
  packages and the study's Python, and Google Drive. What comes from this browser's caches counts
  nothing; Google's small pictures of images in the Drive dialog are not counted, since Google does
  not let a page read their size. Test: `web-tests/test_status_bar_page.py`.
  </details>

- `req/shell/status-bar/rolling` The status bar's numbers roll to each new value, and a sharp rise in the CPU or network flashes.
  <details>

  Set by the owner on 2026-10-31. Whenever the disk, memory, network or CPU changes, each
  character that changed rolls up to its new one, like a clock's digits. When the CPU or the
  network speed at least doubles in one update and rises by a sharp step (30 points of a core;
  1 MB/s), its icon and number turn the warning colour for three seconds, then fade back. With
  reduced motion asked for, the digits change without rolling. Test:
  `web-tests/test_status_bar_page.py`.
  </details>

- `req/shell/storage/keys-keep-names` What a user saved stays theirs: a stored key never changes its name.
  <details>

  A browser key an existing study saves under keeps its name across the split and every later
  change to the shell, so a person's settings, decisions and measurements survive a release.
  </details>

- `req/shell/storage/manage` The user sees, and can clear, what this device keeps, study by study.
  <details>

  Not signed in (`req/shell/account/sign-in`), the user is whoever opened the page on this device. An avatar at the right of
  the header opens a menu whose **Manage storage** opens the Storage tab of the resources dialog
  (`req/shell/resources-dialog`), which lists everything the site keeps on this device but settings, each with its size, in
  sections folded when the dialog opens. Set by the owner on 2026-11-02, the sections follow what it
  takes to work offline (`req/shell/offline/default`, `req/shell/offline/per-study`): one per study, whose title says whether the study is
  available offline (`req/shell/offline/mark`), holding its Python packages no other study uses, by package; its own
  pages and code, part of the site's copy; the images kept from Google Drive in it, by name; one
  record for all their thumbnails and its Drive folders' previews; and, for the study on show, the
  selections per image, by image name. An image, a thumbnail or a preview kept before images were
  told apart by study, and opened in none of them since, is listed with the study on show. Then
  **Shared by every study**: the site itself, Python itself, the packages two studies or more use,
  and, as one record, code no study uses now. Each entry can be deleted, but a study's pages, kept
  whole with the site; each section's Delete all deletes all it can, and a study's is the study's
  whole purge, leaving what other studies use. Settings are not listed here: they are kept, shown
  and cleared in Settings (`req/shell/account/settings`); the total says what they take, and counts too what is stored
  under the site that neither the shell nor the study names. The shell names its own keys; the study names its keys through its `stored` hook, so the
  shell still names no study (`req/shell/study/knows-none`). Test: `web-tests/test_storage_page.py`.
  </details>

- `req/shell/study/folder-and-address` A study is a folder, and the app runs the one its address names: rauntruth.com/app/<id>.
  <details>

  A study is `studies/<id>/` with a `study.json` that names everything the shell needs, and every
  file it names exists. The app runs the study its path names (`rauntruth.com/app/nor`), the Image
  Viewer (`req/shell/image-viewer`) at its bare address (`rauntruth.com/app/`); `?study=<id>` there opens the same
  study and is rewritten to its path. The build publishes the page once more under each listed
  study's id, so the path opens it fresh too, and refuses an id the app already serves at its
  top. Adding a study changes nothing in `web/`, in the deploy's settings or in CI. Test:
  `web-tests/test_study_contract.py`, `web-tests/test_published_site.py`, `web-tests/test_study_runs.py`.
  </details>

- `req/shell/study/knows-none` The shell knows no study.
  <details>

  Nothing in `web/` names a study, its channels, its algorithms or its flow. Everything
  study-specific reaches the page through the study's `study.json`, its Python entry module and its
  `mount(shell)`. Test: `web-tests/test_study_contract.py` reads `web/` for the NoR study's own words,
  and the shell's page tests run on the fixture study, which shares none of them.
  </details>

- `req/shell/study/request-form` The switcher ends with Submit New Study Request, a GitHub issue form for proposing a study.
  <details>

  Below the studies, apart from the search, "Submit New Study Request" opens, in a new tab, a new
  issue on the repo from its `new-study` form, labelled `new-study-request`: the research proposal
  (a link, or a document attached in the box), a public Google Drive link to sample images, one to
  ground truth if any, the literature, and the submitter's name and email, which the form warns
  are public. Test: `web-tests/test_study_runs.py` (the link opens the form the repo carries),
  `web-tests/test_study_request.py` (the form asks for each of these).
  </details>

- `req/shell/study/stage` A study declares its stage: PreGT, GT, PostGT or Published.
  <details>

  Every `study.json` names its `stage`, and the status bar shows it first as a traffic light, its
  name in no words: red for PreGT, yellow for GT, green for PostGT, all three green for Published.
  Hovering it opens a popup listing the four stages in order with what each means, the study's own highlighted and the
  ones before it crossed out, and what the study needs to move on to the next.
  PreGT: the study's tools work but cannot make ground truth yet, so it offers no export: its
  ground-truth button (`groundTruth.button`) is hidden and it has no Submit GT step. GT: the same,
  with the ground truth exported and submitted (`req/shell/ground-truth/submit`). PostGT: GT with batch actions on top (none
  yet). Set by the owner on 2026-11-02, Published: the study's algorithm is trusted and the page only
  shows what it finds, so it makes no ground truth (no Submit GT, its button hidden, as in PreGT) and
  drops the steps that serve making it: the shell's Preprocessing (`req/shell/preprocessing/split`) and the study's
  postprocessing (NoR's filters, `req/nor/filters/live`) are not shown. A GT or PostGT study names its ground truth's label and button. The Image Viewer is PreGT,
  NoR Finder GT. Test: `web-tests/test_study_contract.py`, `web-tests/test_status_bar_page.py`.
  </details>

- `req/shell/study/switch-in-place` Switching study happens in place: no reload, and the open image stays open.
  <details>

  Choosing a study in the switcher, or going back and forward between studies, changes the address
  and swaps the study without reloading the page: Python stays loaded and adds only the packages the
  new study needs, and the image on show opens in the new study at once. The study that leaves
  takes its panels, its stylesheet, its drawing and its listeners with it (each listener it adds
  outside its own panels carries `shell.signal`), and an answer its Python was still working on is
  dropped. Test: `web-tests/test_study_runs.py`.
  </details>

- `req/shell/study/viewer-choice` The viewer is the study's choice.
  <details>

  The image a study works on is shown by a viewer the study names (`viewer` in `study.json`),
  behind one interface: show the opened image, draw the study's layers over it, report a pick and a
  lasso in image coordinates, zoom and pan. The 3D viewer (`req/shell/viewer-3d`) keeps that interface and adds
  a 3D view beside the 2D one, with no change to the studies that keep the 2D viewer.
  </details>

- `req/shell/tools/grid` A Grid button beside the Ruler draws a grid over the image, its colour and spacing the user's.
  <details>

  The button, a red 3×3 grid, draws the grid or takes it away. Clicking it, or hovering over it,
  opens a popup choosing the grid's colour and the distance between its lines: in µm when the file
  gives the pixel's size, the cells then square in µm whatever the pixel's width and height, and in
  pixels when it does not. The colour and both distances, µm and pixels each its own, are kept as
  the user's settings for the next visit, and Settings lists them, kept on this device only (`req/shell/account/settings`). The grid stays on from one
  image to the next, and keeps its place through zoom. Test: `web-tests/test_grid_page.py`.
  </details>

- `req/shell/tools/ruler` A Ruler beside Zoom measures a distance on the image, in µm when the file gives a scale.
  <details>

  The Ruler button arms it: dragging from a point shows a circle of the reach around it, and on
  release the ruler alone stays on the image between the two points with their distance beside it.
  The distance is in µm when the file gives the pixel's size, its width and height each counted on
  its own axis, which may differ; in pixels when it does not. A click with no drag measures nothing.
  Once the ruler is down the image pans again; pressing the button again takes the ruler away, as
  does opening another image. The ruler keeps its place and size through zoom and the study's own
  drawing. Test: `web-tests/test_ruler_page.py`.
  </details>

- `req/shell/version-history` Clicking the version opens a Version history; a bubble points at it after an update.
  <details>

  Clicking the version in the status bar (it has no tooltip) opens a Version history popup: each
  release, newest first, with its date and terse lines on what changed for the user. The lines live
  in [`web/version_history.md`](../../web/version_history.md): a pull request that changes what
  users see adds one under "Next release", and the site build files it under the release that first
  carried that pull request. The browser remembers the version last seen; when the page has been
  updated since and the history names a change in between, a bubble points at the version saying
  "Click here to see what was updated since v…", until the user opens the history or closes the
  bubble with its ×. The history then marks the releases that are new
  (`web-tests/test_version_history.py`, `web-tests/test_version_history_page.py`).
  </details>

- `req/shell/viewer-3d` A study whose viewer is `image3d` shows a z-stack in 3D, turning it by mouse; its channel rows drive it.
  <details>

  Set by the owner on 2026-10-31, moving the 3D MicroViewer into the shell. The study's Python
  returns a stack as its flattened planes, which the 2D view shows unchanged, followed by every
  slice of every channel (`Z` in its meta). A 2D/3D switch in the toolbar opens the 3D view, which
  a stack opens on: it casts rays through the stack in the browser (WebGL2), looking straight down
  as the microscope does. Dragging turns it, the wheel zooms, shift-drag pans, and Top, Tilted,
  Side and Front put the view back. Brightest shows the brightest point along each ray, Surface a lit
  surface where the signal crosses a level, and Colour by depth paints by the depth of that point
  so crossings at different depths read apart. Slices *a*–*b* show part of the depth. The slice
  spacing comes from the file, else from the study (`view.spacing`, saying who stated it), else
  1 µm, called a guess. Every shown channel is drawn in its colour between the black and white
  points of its row, which redraw the 3D view as they move. The study's `view` sets the render, Colour
  by depth and the spacing it opens with. A study draws over the 3D view, over the stack or beside it
  in the same camera, picks and drags there, and can keep only the stack inside or outside a mask of
  its own. Test: `web-tests/test_viewer3d_page.py`, and the vascular study's `req/vascular/model/correct`.
  </details>

- `req/shell/views/second` The second view is Tasks while a study makes ground truth, and Items otherwise; the shell owns its switch.
  <details>

  Set by the owner on 2026-11-02. A study with an item view (`#items-view` in its `views` slot) gets
  the shell's switch at the toolbar's left, off until the study turns it on. In a GT or PostGT study
  the item view is a list of the tasks the user does to make the ground truth, so the switch reads
  "Tasks" and, once the study counts them, how many are left ("Tasks 3 left", "Tasks done" at none
  left). In a PreGT or Published study nothing is being made, the cards are small viewers of what
  was found, and it reads "Items" with how many there are. In the item view it reads "Image". The
  study counts its own (`views.count(left, total)`; NoR: the finalists and added NoRs with no
  verdict, among all; Vascular: the low-confidence vessels with no verdict, among all junctions and
  vessels) and hears which view is shown (`views.on(fn)`). Test: `web-tests/test_status_bar_page.py`.
  </details>

- `req/shell/views/submit-task` Submit Ground Truth is the last task: it sits in the Tasks view's bar, and each card says whether its task is open.
  <details>

  Set by the owner on 2026-11-02. In a GT or PostGT study a bar heads the Tasks view (`req/shell/views/second`): how
  many tasks are done of all ("28 of 40 done", as words and a meter), and at its end the study's
  Submit Ground Truth (its `tasks-end` slot); the image view has no submit button. The Submit GT
  crumb (`req/shell/status-bar/breadcrumbs`) opens Tasks and presses it. A card whose task is still open is marked so, and the
  cards list open tasks first unless the user chose another order (NoR's finalists open sorted
  Verified last; Vascular's cards open Open tasks first, an open junction being one that waits on
  a vessel's review). In a PreGT or Published study there is no bar and no card is marked. Test:
  `web-tests/test_status_bar_page.py`, `studies/nor/tests/test_page_layout.py`.
  </details>

- `req/shell/waiting/slow-computers` Kind to slow computers: a slow button is held until its action is done; low memory is warned of.
  <details>

  A button whose action can take a while (Load, the study's slow actions — for NoR Find
  Candidates, the view switch, the item tabs, the CSV downloads, the ground truth export, restoring
  the filter defaults) is disabled the moment it is pressed, with a small spinner after its label,
  and comes back only when its action is done, including the worker's answer. A failed request
  frees its button. Browsers do not say how much memory is free, so when the browser reports 4 GB
  or less in all (Chrome and Edge report it), a popup on opening asks the user to close other tabs
  and apps, with tips (tab groups, the shortcut that reopens closed tabs, Memory Saver) and "Don't
  show this again". The page running out of memory shows it whatever was chosen, saying so
  (`studies/nor/tests/test_slow_machine_page.py`).
  </details>

- `req/shell/waiting/visible` Visible waiting: a spinner and the elapsed time, and a sweeping light while the study works.
  <details>

  While an image waits for Python, the page shows a spinner and the elapsed time; while a study's
  action runs (for NoR, a finder), a photocopier's light sweeps back and forth over the image, with
  what it is doing and the elapsed time below.
  </details>

## `req/checks` The repo's checks

- `req/checks/ci-sets` CI runs in two sets, and a test that would skip there fails instead.
  <details>

  The fast set runs on each PR (`.github/workflows/tests.yml`, `-m "not full"`) and needs neither
  Node nor a browser; every test that drives Node, Pyodide or Chromium, or measures speed or memory,
  is marked `full` and runs only in the full set, nightly (the nor-finder pack's `full-tests` task)
  and on every push to main, so it has run on anything a release can ship: a green full run on main
  wakes the site release (`.github/workflows/tests-full.yml`, `web-tests/test_ci_split.py`). The nightly run also
  runs the full set on Firefox and WebKit (`req/checks/other-engines`).
  </details>

- `req/checks/other-engines` Every night the full set also runs on Firefox and WebKit; their failures fail the night only once the page supports their browser.
  <details>

  Set by the owner on 2026-11-03. The nightly full run (the nor-finder pack's `full-tests` task) runs the full
  set again on Playwright's Firefox and on its WebKit, standing for Safari; a push to main does not, and
  neither gates a release. An engine whose browser `web/browsers.json` does not list (`req/shell/browsers/supported`) reports
  its failures as a warning on the run and the night stays green; once its browser is listed, a failure
  fails the night as any other test does. Each page test's driver launches the engine `PW_ENGINE` names, so the
  same run can be made by hand: `python3 dev/tools/build/other_engines.py firefox`. Test:
  `web-tests/test_other_engines.py`.
  </details>

## `req/nor` The NoR Finder page: detect once, filter live, in the browser

Set by the owner on 2026-09-28: the shell running the NoR study with no backend. Its engine is
[`studies/nor/detection/interactive.py`](../../studies/nor/detection/interactive.py), tested by
[`studies/nor/tests/test_interactive.py`](../../studies/nor/tests/test_interactive.py).

- `req/nor/candidates/add-missed` Right-clicking the image adds a NoR the finder missed.
  <details>

  Right-clicking the image offers "Add a NoR Here": a NoR the finder proposed nothing for. It is not
  drawn as a mask; it gets measuring lines (level, centred where clicked, as long and wide as the
  image's median finalist) that the user corrects on its card, which is selected at once. It lists
  among the finalists, marked by an icon rather than text, and among the rejected once thumbed
  down; its card can also remove it (as can right-clicking it). On the image it shows its lines
  and, until the user gives a verdict, a dashed yellow circle glowing between 0.8 and 0.3 opacity.
  Like any candidate it enters the ground truth only once the user approves it. Added NoRs are
  remembered in the browser per file name, whatever the finder.
  </details>

- `req/nor/candidates/decide` One selected candidate, decided on its card with a thumbs up or down.
  <details>

  Clicking a candidate selects it (a thin white ring) and clicking it again deselects it. Changed by
  the owner on 2026-10-31: its card alone, with no title, hovers over the image's top right corner
  while a candidate is selected, and only then; buttons to the previous and next candidate by number
  hover over the bottom of its crop. Decisions are
  made on cards, not by clicking the image, with a thumbs up (a real NoR, with the lengths shown)
  and a thumbs down (not one) at the card's top, each saying what it does in its tooltip; pressing
  the chosen one again undoes it and lets the filters decide. Pressing either also selects that
  candidate. Cards the user voted up or down have their own border colours. In the item views the
  selected candidate's card is outlined, clicking a card selects it, and switching to the item
  views opens the tab that lists the selected candidate and scrolls its card into sight; the
  previous and next buttons step through that tab's cards. Set by the owner on 2026-10-31: double
  clicking a candidate on the image selects it and opens the item views at its card, and double
  clicking a card selects it and shows it on the image, as its go-to button does. Test:
  `studies/nor/tests/test_item_view_page.py`.
  </details>

- `req/nor/candidates/numbering` Each candidate keeps one number for as long as a detection lasts.
  <details>

  Numbered top to bottom, finalists and rejected alike. Filters never renumber candidates. Added
  NoRs are numbered after the finder's candidates, in the order added (set by the owner on
  2026-10-07). The image, the cards, the Candidates CSV and the ground-truth file all name a
  candidate by that number (`studies/nor/tests/test_ground_truth_page.py`).
  </details>

- `req/nor/candidates/remembered` Decisions, lengths and added NoRs are remembered per file name.
  <details>

  Decisions and adjusted or approved lengths are saved in the browser per file name and finder,
  tied to each candidate's position; added NoRs per file name.
  </details>

- `req/nor/cards/adjusters` A card's adjusters correct its lengths and width by dragging.
  <details>

  The adjusters are the ends of the green-to-green length, the red length and the width, each
  draggable anywhere. The four length and red ends stay on one straight axis, in order. A red end
  only slides along the axis, changing the red length. A green end drags anywhere: the axis turns,
  through it, about the other green end, and the other ends keep their distances from that end. A
  width end sets where along the axis the width is measured and, mirrored, how wide it is. On
  release the crop turns level with the new axis. The new measurements show on the image, the card,
  the summary and the downloads.
  </details>

- `req/nor/cards/lazy` The item views draw only the cards near the view, so a long list opens at once.
  <details>

  Set by the owner on 2026-10-31. Every card takes its place in the list at once as an empty
  outline; only those in view and the two rows past it either way are drawn in full, together in
  one go per frame rather than card by card, and the rest are drawn as scrolling brings them near.
  Test: `studies/nor/tests/test_item_view_page.py`.
  </details>

- `req/nor/cards/views` The item views show the finalists and the rejected as cards, each with its own Options.
  <details>

  Each candidate cropped on a card: its number, state and decision buttons on top, the crop below
  (with a faint go-to button in its corner that shows it on the image), then "Lengths adjusted"
  with a reset, and the rest. A rejected card names every filter that rejects it by itself, or says
  the user rejected it. Each view has its own Options menu (remembered per view) that sets the order
  of its cards (by number; verified first; verified last, the finalists' default while the study
  makes ground truth (`req/shell/views/submit-task`, changed by the owner on 2026-11-02); by number for the rest; and on the rejected, the most
  rejecting filters first; ties by number; set by the owner on 2026-10-07), the crop's context
  padding, turns each crop so the NoR lies level (finalists only; the rejected are never turned),
  and shows or hides the NoR borders, the measurement bars, the lengths on the crop, the lengths on
  the card and the measurement adjusters. The finalists open with a 4 px padding and everything on
  but the lengths on the card; the rejected open with a 10 px padding and only the NoR borders on.
  The selected card over the image uses the options of the view that lists it.
  </details>

- `req/nor/downloads` Download Candidates and Download Summary give CSVs; Submit Ground Truth gives the ground truth.
  <details>

  Moved by the owner on 2026-10-07. At the bottom of the Summary box, side by side across its width,
  Download Candidates gives the candidates as CSV (every candidate, its status, its reasons, the
  user's decision and its measurements) and Download Summary the summary as CSV. Submit Ground
  Truth, at the right end of the main area's toolbar (moved there by the owner on 2026-10-31, and
  shown only in a GT or PostGT study, `req/shell/study/stage`), gives the ground truth
  (`norfinder-ground-truth/2`): a JSON file naming the image (its SHA-256, and where it was loaded
  from: its Google Drive id and link, or "local") that lists only what the user marked: every
  candidate voted up (label 1, with its lengths and length lines, marked adjusted or approved) or
  down (label 0), and every added NoR the user approved (kind `missing`, label 1, with its radius,
  `origin: "added by user"`, its measurements and lines). A candidate nobody voted on is ambiguous
  and left out. The lab's `nor_lab.py --labels` reads it: the labels score detection and the
  checked lengths score measurement (`studies/nor/tests/test_ground_truth.py`).
  </details>

- `req/nor/filters/live` Filters are live dials: each can be switched off, and every marking follows it at once.
  <details>

  Every check in `nor3.CHECKS`, the nucleus rule (N) and one-pixel-per-NoR (O) is a control that
  can be switched off. Each shows a letter, a one- or two-word title and a line saying what it
  means (the page's own names, from `detection/finder_help.py`; the lab's review sheets keep
  theirs), and two counts: how many candidates it rejects, whatever the other filters do, and how
  many only it rejects among the filters switched on (what switching it off would let through), as
  plain text reading "X (Y)" after the cards' thumbs-down icon, whose tooltip explains that X is the
  second and Y the first. Each of its parameters is a dial, and every marking on the image follows
  it at once. A dial moved off our value is marked, with our value as a tick on its slider that puts
  it back. Finder and filter settings use this one control, so tweaking looks and works the same in
  both. A check added to `CHECKS` becomes a control with no page change.
  </details>

- `req/nor/filters/persist` Filter settings persist across images, visits and days; the Balanced preset returns to the finder's own values.

- `req/nor/find/blue-mask` The blue mask is only a filter: no finder blanks nuclei before finding.

- `req/nor/find/finders` All finders are offered; Traffic light is the default.

- `req/nor/find/one-slow-step` One image, one slow step: the finder runs only on Find Candidates.
  <details>

  Loading an image only reads it. The finder runs when the user presses Find Candidates, and that
  button shines while the finder or its settings differ from the last run. Everything else
  (filters, forced markings, the list, the summary) redraws from the stored candidates without
  finding again.
  </details>

- `req/nor/find/settings` Detection settings are dials too, and the page says re-finding takes time.
  <details>

  They re-run the finder. Each finder names its main settings (its function's `MAIN`), shown first;
  every setting is under a collapsed Advanced box. Each finder shows a few sentences on how it
  works, and every setting and filter value has a ? that says what it does
  (`detection/finder_help.py`; the test fails when one is missing).
  </details>

- `req/nor/lab-parity` The page runs the lab's code, and at our settings passes what the lab passes.
  <details>

  The Python it runs is the study's `detection/` as it is, so the finder stays
  malleable. At our settings, the page passes what the lab passes with the blue mask applied after
  finding.
  </details>

- `req/nor/layout` The left bar holds Load Image, Preprocessing, Processing, Postprocessing and Summary; the selected candidate is over the image, Submit Ground Truth in the toolbar.
  <details>

  Changed by the owner on 2026-10-30 and 2026-10-31. Below the Image box (`req/shell/left-bar/folding`) the left bar holds
  the shell's Preprocessing (`req/shell/preprocessing/split`), to which the study adds that Find Candidates works on the image as
  loaded, open from the image's opening until Find
  Candidates (once a step marks the parts of the image to leave out, its folded title says how much,
  "14% imperfections"); Processing, the candidates finder (its "how it works" and its settings fold
  away; its "restore defaults" sits with the settings, not in the title row), open over the same
  span and, folded once Find Candidates has run with the finder and
  settings now chosen, titled "<finder> executed"; Postprocessing, the filters, which only its title
  opens; and Summary, which opens once the candidates are found. Postprocessing and Summary keep
  their names whatever is done. The main area has a toolbar over two views: the image and the
  tasks, a card for each candidate to decide, with the shell's switch between them at its left (`req/shell/views/second`); Submit Ground Truth (`req/nor/downloads`) heads
  the tasks, in their bar (`req/shell/views/submit-task`). Changed by the owner on 2026-11-02: it is no longer in the
  image view. Changed by the owner on 2026-10-31: there is no right bar
  (`req/shell/left-bar/width`).
  </details>

- `req/nor/metrics` On the released site each finder and each filter preset shows its precision and recall.
  <details>

  The finder list, the finder's note and the Postprocessing box's presets read the study's measured
  quality (`studies/nor/docs/requirements.md` R11), so that file ships with the page part
  (`studies/nor/web/`), like everything else the page fetches. Test:
  `web-tests/test_published_site.py`, which checks that every file a study's page module fetches is
  published.
  </details>

- `req/nor/show-menu` The Show menu switches each kind of marking on and off (remembered).
  <details>

  Accepted and rejected markings, each with its own line width and colour, and the candidate
  numbers, the rejection letters and the measuring lines.
  </details>

- `req/nor/submit/progress` The submit button's icon says how finished the work is; its popup lists what is left.
  <details>

  Changed by the owner on 2026-10-06 and twice on 2026-10-07. A small icon beside the Submit Ground
  Truth button's text says how finished the work is: a green check when every finalist has the
  user's verdict, an orange warning when some candidates have one but a finalist does not, and a red
  error when no candidate has one yet or a candidate the user added still waits for a verdict; the
  warning and the error pulse gently. Any animation scrolled out of view is paused, since Chrome
  would keep drawing it. The button itself stays plain. Its popup (`req/shell/ground-truth/submit`) carries a checklist of
  short instructions (approve or reject the NoRs you added, vote on at least one candidate, vote on
  every finalist, only images from Google Drive can be exported), each done one crossed out with a
  green check; the added-NoRs line shows only when the user added some, and while a summary mask is
  on a warning that the mask is not exported, never crossed out. The issue names the image (name,
  SHA-256, Drive link, finder, what was marked). With nothing marked the popup says how to mark and
  exports nothing (`studies/nor/tests/test_ground_truth_page.py`). What happens to a submission is
  the study's R10.
  </details>

- `req/nor/summary/density` The summary gives the finalists' density, in NoRs per mm² when the file has a scale.
  <details>

  Set by the owner on 2026-10-06. The summary and the Summary CSV give the finalists' density over
  the area counted (the mask, else the whole image) in NoRs per mm², from the scale in the file, or
  per million square pixels when the file has none (`studies/nor/tests/test_ground_truth_page.py`).
  </details>

- `req/nor/summary/histograms` The summary shows one histogram per measurement of the finalists.
  <details>

  Changed by the owner on 2026-10-07: a count axis, the mean drawn as a line with one SD either side
  shaded, and the mean, SD and n written above it, with no separate table.
  </details>

- `req/nor/summary/mask` A lassoed summary mask limits the summary and the CSVs to the candidates inside it.
  <details>

  Set by the owner on 2026-10-06. Add mask, on its own row below the Summary box's title (moved
  there by the owner on 2026-10-31), switches to the image
  view, zooms out to show the whole image and lets the user lasso an area by dragging (Esc
  cancels). The summary then counts only the candidates whose centre is inside the mask, and the
  Candidates and Summary CSVs hold only those; the ground truth ignores the mask. Lassoing again
  adds an area by exclusive or, so a lasso inside another cuts a hole. The mask's borders show as a
  pulsing dashed line, and its inside is tinted a very transparent white only when areas overlap or
  nest. Clear mask, shown while a mask is on, removes it. The mask is remembered in the browser per
  file name (`studies/nor/tests/test_ground_truth_page.py`).
  </details>

## `req/vascular` The Vascular Measurements page: cerebral vessels in CD31 z-stacks

Migrated from [missingbulb/vascularColoring](https://github.com/missingbulb/vascularColoring) on
2026-10-31, at rauntruth.com/vascular. Its research requirements, the
owner's decisions on the stacks and the vessel model, are
[`studies/vascular/docs/3D-STACKS.md`](../../studies/vascular/docs/3D-STACKS.md) and
[`studies/vascular/docs/WORKING-GUIDE.md`](../../studies/vascular/docs/WORKING-GUIDE.md).

- `req/vascular/drive-folder` Load from Google Drive opens on the owner's stacks folder.
  <details>

  `files.drive` in the study's `study.json`, under `req/shell/drive/dialog`'s rule.
  </details>

- `req/vascular/model/cards` Tasks shows each junction and vessel of the model as a card.
  <details>

  A card for each junction (three or more live branches) and each vessel (junction or tip to the
  next): the stack around it flattened over the slices shown, the rest of the model thin in magenta
  and the item in white, with its numbers (a vessel's length along its curve, its width and depth
  span; a junction's depth, width and how many junctions lie within 20 µm). Filters show the ones
  worth a look and the declined vessels; sorting brings the open tasks (`req/shell/views/submit-task`, the default), the shortest, widest, most branched or most
  crowded first. A card approves, declines or deletes a vessel, splits a junction, or shows its
  item in 3D. Test: `studies/vascular/tests/test_model_page.py`.
  </details>

- `req/vascular/model/correct` A stack's vessel model opens beside it or over it, to correct by hand.
  <details>

  Moved from the 3D MicroViewer (`studies/vascular/docs/3D-STACKS.md`, the owner's decisions of
  2026-10-03 to 10-29). A stack the study ships a draft for (`web/models/`, matched by name without
  case, spaces or punctuation) opens with it; any `vessel-model/2` file loads too. Side by side
  shows the model as white tubes in a view of its own that turns with the stack's; Overlay draws it
  in magenta over the stack; Hide takes it away. On the model: drag a point to move it, right-click
  a segment or a point to delete it, add or remove a bend or split a junction into vessels that
  cross, right-drag from one piece to another to connect them, and click a faded low-confidence
  vessel to approve or decline it. Review keeps only the signal within reach of the model's
  vessels (Detected) or away from them (Missed), within a reach that is a share of each vessel's
  own width; Draw a missed vessel adds one a click at a time; Mark a damaged area lassos an area to
  leave out. Every edit can be undone, and the edits stay in the browser until the model is
  submitted. Test: `studies/vascular/tests/test_model_page.py`.
  </details>

- `req/vascular/model/ground-truth` The corrected model is the study's ground truth.
  <details>

  Submit Ground Truth (`req/shell/ground-truth/submit`), in the item view (Tasks, `req/shell/views/second`) and only there, exports the corrected `vessel-model/2` file, `status` corrected and
  its corrections counted, labelled `vascular-ground-truth`; it is off until the model carries a
  correction, and its checklist says how many low-confidence vessels still wait for a verdict.
  Test: `studies/vascular/tests/test_model_page.py`.
  </details>

- `req/vascular/stack-view` A z-stack opens in 3D in the owner's approved view; 2D shows it flattened.
  <details>

  Any multi-page TIFF (an ImageJ hyperstack or plain pages in depth) opens in the 3D viewer
  (`req/shell/viewer-3d`), every channel scaled by one window over the whole stack, so signal that fades with depth
  still looks faded; 2D shows its brightest-over-depth picture. CD31 is always the first channel: a
  one-channel stack is CD31, and a two-channel one, DAPI then CD31 as the owner's originals are, is
  shown CD31 first. It opens in the view the owner approved on 2026-09-29: CD31 alone, coloured by
  depth, black point 0.63 of the window (161), slices 1 µm apart as the owner stated on 2026-10-29.
  Test: `studies/vascular/tests/test_stack_page.py`.
  </details>
