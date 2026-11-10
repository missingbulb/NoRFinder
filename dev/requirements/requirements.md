# The page's requirements

What a person using the page sees and can do whichever study it runs: the shell (`web/`), then the repo's
checks. Each line is a requirement; its detail and its test fold under it. What one study's page does is that
study's own spec, `studies/<id>/requirements.md` (`req/checks/spec-layout`).

Each requirement is named by a tag, a path under its section's tag (`req/shell/offline/default`), and
cited by that tag wherever code, tests or docs point at it. Each section is sorted by tag, segment by
segment: a new requirement goes where its tag sorts, never at the end, and a related one shares its
branch. `web-tests/test_requirement_tags.py` holds every spec to this and fails a citation of a tag no
spec has.

A sentence opening **Tentative** is a call Claude made where the owner has not decided: it says what the page
does there, and stays open until the owner approves or changes it. One opening **Undecided** names a case
nobody has decided: what the page does there is not a requirement yet.

## `req/shell` The shell, whichever study it runs

- `req/shell/account/role` Beside the study's name, a menu picks the role the user works in; the page shows that role's own view.
  <details>

  Set by the owner on 2026-11-03: one page adapting to every role at once is replaced by a view per role,
  chosen on purpose. Set by the owner on 2026-11-07: the header reads "[study] as [role]", the role's menu right of the
  study's and drawn like it. The menu names the role the user works in and lists the roles they
  hold in the study on show: **Viewer**, everyone's, and the only one for a visitor not signed in
  (`req/shell/account/sign-in`); **Ground Truth Tagger**, held by those Drive lets write to the study's submissions folder (set by the owner on 2026-11-07, `req/shell/data/roles`), listed in every stage but
  Published (`req/shell/study/stage`; set by the owner on 2026-11-04: a PreGT study can have taggers too); and **Study Manager** (named so by the owner on 2026-11-07, once Data Manager), held by those Drive lets
  write to the study's root (`req/shell/data/roles`). Where it
  lists Viewer alone, a line says what signing in adds. Choosing a role changes the page to its view at
  once. Viewer sees the study as a Published one shows it: its tools and what they find, nothing that
  makes ground truth (no Submit GT step, the ground-truth button hidden, the item view its Items, the
  study's postprocessing not shown). Ground Truth Tagger sees the page that makes ground truth, and in a PreGT
  study the postprocessing with nothing to export yet. Tentative: Ground Truth Tagger is listed in a PreGT
  study with no ground truth to make at all (the Image Viewer), where it shows what Viewer shows. Study
  Manager sees Data Management (`req/shell/data/mode`). Moving between Viewer and Ground Truth Tagger
  opens the study afresh on the same image. Undecided: what a Ground Truth Tagger with an image open finds
  after going to Study Manager and back. The page opens as Viewer; the role chosen follows the user
  (`req/shell/account/sign-in`) and Settings lists it (`req/shell/account/settings`). A role not held in
  the study on show, or no longer held, shows as Viewer, and the choice stays for where it is held. Set by the owner
  on 2026-11-07: Google's token lasts an hour and only a click may ask for another, so the page opening after it ran
  out, or Drive not answering, lists the roles Drive last gave that user in that study, kept until they sign out, and a
  line under them says so; opening the menu renews the token and asks Drive again. Nothing else renews it for the
  roles. Test: `web-tests/test_roles_page.py`.
  </details>

- `req/shell/account/settings` The avatar's menu opens Settings: every setting that follows the user, to change and save.
  <details>

  Set by the owner on 2026-10-31. Settings… in the avatar's menu opens a dialog listing each setting
  that follows the user (`req/shell/account/sign-in`), whether or not they are signed in, each with a control to change it:
  the theme (follow the system, dark or light); the role the user works in (`req/shell/account/role`); Show thumbnails in the Drive
  dialog; whether the low-memory popup shows; the last Google Drive link, and the last one in each
  study; the tips closed, each with a tick to clear to see it again; the recent images from Google
  Drive, each with a tick to clear to drop it; Animations; and the version seen last. Set by the owner on 2026-11-07,
  it also holds Auto-save images from Google Drive (`req/shell/drive/kept-images`), which stays with the device and is
  saved there. A line says where they are
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
  user's name, email and picture, for the app's own folder in their Drive, and, set by the owner on
  2026-11-06, to read their Drive (`req/shell/drive/credentials`); it changes nothing in their Drive but its own folder
  and what a study's folders let it write (`req/shell/data/drive-access`).
  Signed in, the avatar is the user's picture, the menu names them and offers Sign out. These
  settings follow the user: dark or light, the tips closed, the version last seen, the low-memory
  popup turned off, the role the user works in (`req/shell/account/role`), the last Drive link (in each study too), Show thumbnails,
  the images opened from Drive lately, whether animations are on (`req/shell/resources-dialog/animations`) and how the status bar shows its resources (`req/shell/status-bar/resources`). These stay with the device: the left bar's width,
  Auto-save images, and everything kept for images. Google's token lasts about an hour and is kept on
  this device for that hour. A new one can be asked for only in the user's own click or key press, so
  once it has run out the page asks only in one that needs Google: a change to a setting that follows
  the user, or opening Drive's button or the image selector. Google's window then opens and closes by itself while
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

  Set by the owner on 2026-11-03. The page supports Chrome, Edge, Firefox and Safari on a desktop or laptop computer, each
  from the version `web/browsers.json` names, the one place the list is kept; the floor is the first version that
  places the page's popups by CSS anchor positioning (Chrome and Edge 125, Firefox 147, Safari 26; an older one
  shows each popup at a fixed spot). Firefox and Safari joined on 2026-11-03, the owner's call once the nightly
  run on their engines (`req/checks/other-engines`) was green. A phone or tablet, iPhone and iPad included, is not supported, nor is any
  other browser (Opera, Samsung Internet), whatever engine it runs; one that names
  itself as Chrome (Brave, Vivaldi) counts as Chrome. In a browser not supported, the status bar's report
  icon (`req/shell/report/bug`) is a warning sign in the warning colour instead of a bug, named Unsupported browser, its
  tooltip saying why and that clicking it reports a problem; the report it opens is titled "Unsupported browser: ". The site's landing page (`req/shell/site/landing`) lists the
  same browsers, written in by the build from `web/browsers.json`. Test: `web-tests/test_problem_report_page.py`,
  `web-tests/test_published_site.py`.
  </details>

- `req/shell/channels/rows` Each channel has its row: shown or not, its black and white points, its name and its description.
  <details>

  Set by the owner on 2026-10-31; one line per row, a colour picker, triangle points and a value bubble
  on 2026-11-03. One row per channel of the image, all on one line: a checkbox that shows or hides it,
  its name, a (?) whose hover shows the study's description of it (at most 100 words), the file's own
  name for it when the study names it otherwise, one slider holding two points, and right of the slider
  a colour picker, a swatch a little wider than tall in a thick frame, like a picture's, its colour
  shaded on the diagonal, a little lighter at the top left and darker at the bottom right with the
  channel's colour at the centre, that recolours it. At or below the black point the channel is dark, at
  or above the white point its full colour, in proportion between; the black point stays below the
  white. Only the colour picker carries the channel's colour: the checkbox and the slider, a ramp from
  black to white, look the same on every row. The slider's track is centred in its row and each point is
  a right-angled triangle sitting on it, the black one left of its value and the white one right, so
  that the two meeting make one larger triangle over one value and neither hides the other: each can
  still be dragged away from there. While a point is dragged or has the keyboard's focus, its value
  (0–255) shows in a small bubble above it, gone once it is let go. A double click on the slider puts
  the points back. The channels are added together, each in its colour. A channel's name, colour,
  description, whether it shows at first and its first points come from the study's `channels` for the
  channel at that place, the study's rule having put the file's channels in its order
  (`req/shell/image/open`), else from what the file says, else from its place: red,
  green and blue, then more colours, a lone channel grey; a channel the file colours but does not name
  is named for its colour. The rows start over with every image, and before any image there are none (set by
  the owner on 2026-11-04). Test:
  `web-tests/test_image_box_page.py`, `studies/viewer/tests/test_viewer.py`.
  Set by the owner on 2026-11-10, a study may show no channel rows at all, naming `channels` in its
  `study.json`'s `view.hide`: the Bookshelf Reader's photos are the camera's colours, nothing to unmix
  (`studies/shelves/tests/test_shelves_page.py`).
  </details>

- `req/shell/data/drive-access` A study manager is offered, in the folder tree, to let the site into the study's folders, just those, and sees which it may write.
  <details>

  Set by the owner on 2026-11-02. In the Study Manager role (`req/shell/account/role`), the tree's head
  offers to approve the folders the site lacks access to, and its click asks for Google's
  per-file permission (`drive.file`) and then Google's own picker showing just the study's folders and
  their subfolders, to approve all or some. The page then knows, for each folder: not approved for this
  site; approved but view-only in Drive; or writable; a folder added since, or one left out, is offered
  again. Changed by the owner on 2026-11-03: the page asks nowhere else, and no bar over the image asks
  for the folders. The page only creates files and changes or trashes the ones it created; it never changes
  a file anyone else made. Test: `web-tests/test_data_mode_page.py`.
  </details>

- `req/shell/data/edit` Edit Image opens the image itself and marks what to do with it: split, crop, slices, channels, imperfections; the view shows the result.
  <details>

  Set by the owner on 2026-11-03. In Data Management, Preprocessing's Edit Image (off until an image is
  open, and while its box is open: set by the owner on 2026-11-04) opens the image itself, from the copy on this device or Drive, when a preview is on show, and
  opens the Edit Image box below Preprocessing. Every choice there redraws the image as it will be saved,
  the view staying as the user left it (a stack turned as it was): Split cuts it 2 × 2 or 3 × 3, the parts drawn apart with a gap between them, so a
  stack in 3D looks cut; on a flat image the cut lines over the image drag, never closer than a twentieth of the crop
  to the next, and a click on a part leaves it out (drawn dim) and keeps it again. Crop draws a rectangle
  on the whole image and then shows only it. Slices, for a stack, is one slider with two marks, the first
  and the last slice kept, the slices outside dropped from the view; a band on the slider marks the
  suggested slices, those holding signal (each slice's 99th percentile above its median, at least a
  quarter of the best slice's), and Use suggested sets the marks there. Channels ticks each channel kept,
  a dropped one shown empty. Imperfections lassoes a part on the image to
  leave out, drawn as if no data were there; each is listed with its share of the image
  and can be removed, and the box's folded title sums them up ("4% imperfections"). Crop and the cut lines
  draw on a flat image, so a stack, shown in 3D only (`req/shell/viewer-3d`), has neither (owner,
  2026-11-03: each viewer gets tools made for it). Changed by the owner on 2026-11-07, Vascular Measurements' damaged
  areas moving here out of its ground truth: a stack has Imperfections too. Mark turns it to straight above and holds
  it there while armed, the lasso draws on it, and what it encloses is left out through every slice, outlined over the
  view as it zooms and pans. Done leaves the box
  and shows the image as it was. Test: `web-tests/test_image_edit_page.py`, `web-tests/test_image_edit.py`.
  </details>

- `req/shell/data/edit-save` Save… writes the edited image, or its parts, into a folder named after the image, beside it.
  <details>

  Set by the owner on 2026-11-03. The page changes no file it did not make (`req/shell/data/drive-access`),
  so an edit goes into a folder named after the image (its name without the extension), which the page
  creates beside it, or uses when the page made it before. Save… shows where the files will go, their
  names (the image's name and a pattern: `_edited` with no split, `_r{row}c{col}` with one, kept as the
  user's setting; the pattern's fields as `req/shell/preprocessing/split` lists them), and holds the save
  while two files would share a name, no channel is kept or every part is left out. Save to Google Drive
  writes them there, while the folder is writable; Download gives the one file, or a ZIP of the parts.
  Wherever the page lists a folder's images (the tree, the folder view and Load's Drive dialog), an image
  beside a folder of its name is not listed: that folder, and the edited files in it, take its place.
  Test: `web-tests/test_image_edit_page.py`.
  </details>

- `req/shell/data/folder` A folder chosen shows its images as a grid or a list, and the left bar sums it up.
  <details>

  Set by the owner on 2026-11-02. Choosing a folder in the tree fills the main area with its images,
  a grid of previews or a list, a button switching them with a slide. A folder's images, in the tree and the
  folder view, are the kinds the study opens, those its `files.accept` names (set by the owner on 2026-11-07:
  the Bookshelf Reader's JPEG photos among them). The left bar's Selected Folder
  box replaces the Image box and counts its images, how many have a preview, how many previews are
  out of date (the image's SHA-256 differs from the preview's), how many have ground truth beside
  them (`<name>.ground_truth.*`, `<name>` the image's name without its extension) and how many are
  marked as needing it (`req/shell/data/preview-images`). The toolbar's tools stay over the folder's
  images, waiting for an image (set by the owner on 2026-11-04: Data Management has its own tools to cut
  and crop, and the viewer's basic ones may sit beside them). Test: `web-tests/test_data_mode_page.py`,
  `web-tests/test_shell_states_page.py`.
  </details>

- `req/shell/data/mode` Data Management: the Study Manager role's view, a column of the study's folders left of the left bar, open until folded.
  <details>

  Set by the owner on 2026-11-02, changed on 2026-11-03: Data Management is the Study Manager role's view
  (`req/shell/account/role`), entered by choosing that role and left by choosing another; nobody in any
  other role sees any of it. In it the tree of the study's folders sits left of the left bar, open; its
  chevron folds it to a narrow strip and opens it again. The tree shows every folder and subfolder, open,
  each with its access (`req/shell/data/drive-access`); a folder's images stay folded under it until
  its image count is clicked, each with a small preview. In the mode the left bar keeps the Image box
  and Preprocessing (`req/shell/preprocessing/split`) and hides the study's own drawers, its item view
  and the steps; Load vanishes in a puff, Unload in its line with it: choosing another image or folder
  replaces the one open (set by the owner on 2026-11-04). The steps hidden are the status bar's breadcrumbs, with the item
  view's switch and its tasks' bar (set by the owner on 2026-11-04). Set by the owner on
  2026-11-04, and on 2026-11-05 how it meets working offline (#768): offline, Study Manager is listed in the role
  menu but says it needs the internet, and choosing it does nothing (`req/shell/offline/default`). Going offline
  inside Data Management keeps what is open: the column and the folder's box say they need the internet and do
  nothing until the network is back, and what reaches Drive (Save to Google Drive, Approve, Update previews, Needs
  GT) is held with them; Preprocessing and an Edit Image under way stay usable, its marks being local, and the
  Image box, the shell's own, stays usable. Test: `web-tests/test_data_mode_page.py`, `web-tests/test_shell_states_page.py`.
  </details>

- `req/shell/data/preview-images` An image chosen in Data Management opens from its preview; Load Original opens the image itself.
  <details>

  Set by the owner on 2026-11-02. Choosing an image in the tree or the folder view opens its preview
  in the study's viewer, a stack in 3D, quick and the same for everyone; the Image box's Load, or its
  top line (`req/shell/load/selector`), gives way to Load Original, which opens the image itself from the copy kept on this device when it has one,
  else from Drive. A preview that cannot be read (a damaged previews file) shows as no preview, and the image,
  chosen, opens itself instead. A study manager can mark an image as needing ground truth (Needs GT), once the study's ground
  truth is set up: the page creates an empty `<stem>__<sha8>.needs_gt`, named as the image's ground-truth subfolder
  (`req/shell/ground-truth/layout`), in the curated folder, the one `GT` folder when submissions need no review,
  never in the data folder (set by the owner on 2026-11-10); unmarking trashes only a marker the page made. Two
  images of one name are marked apart. Once the image has ground truth the marker stays and is no longer shown. Test:
  `web-tests/test_data_mode_page.py`, `web-tests/test_previews_writer.py`.
  </details>

- `req/shell/data/roles` A study names its Drive root; Drive's own sharing decides who manages its data and who tags.
  <details>

  Set by the owner on 2026-11-02; moved to the study's root on 2026-11-07. A study's `root` is a link to its
  Google Drive root folder, shared as "Anyone with the link" to view: the only folder the repo names. The
  folders under it are named by the root's settings file (`req/shell/ground-truth/setup`), and until it has
  one, by name: `Data`, its images, and `GT curated`, `GT submissions` or a single `GT`. Signed in, opening a
  GT or PostGT study asks Drive, with the user's token, whether they may write to the root (Study Manager) and
  to the submissions folder (Ground Truth Tagger); a role is offered only where Drive says so. Nobody is
  listed in the repo, and what anyone can change is still what Drive lets them. Tests:
  `web-tests/test_study_contract.py`, `web-tests/test_study_root.py`, `web-tests/test_gt_drive_page.py`.
  </details>

- `req/shell/data/update-previews` Update previews makes the folder's previews for the images that lack one or changed, and keeps the rest.
  <details>

  Set by the owner on 2026-11-02. Under the folder's summary, Update previews is on while an image
  lacks a preview or has an out-of-date one. It downloads only those images, makes their previews in
  the browser as `dev/tools/previews/make_previews.py` does (`req/shell/drive/previews`; a flat image at
  most 256 px a side, a photo that is not a TIFF (a PNG, JPEG, WebP or BMP) a flat colour image, a stack at most
  96 px and 24 slices), keeps every still-valid preview as it was,
  and writes the folder's previews file (`req/shell/drive/previews`) into the study root's `Previews` folder, made
  there when the root has none: a new file, or the page's own one replaced. Nothing is written into the data
  folder, which may be one no study participant can write to (set by the owner on 2026-11-10). A previews file the
  page did not make is left alone, and the page says to delete it in Drive to let the page manage it;
  deleting the page's own makes it start over. Test: `web-tests/test_data_mode_page.py`,
  `web-tests/test_previews_writer.py`.
  </details>

- `req/shell/dialogs/open-from-button` A popup dialog a button opens grows out of that button.
  <details>

  Set by the owner on 2026-11-03. Every modal dialog on the page, the shell's and a study's, opened by
  a click on a button or a link (or the keyboard pressing one), grows from that button's place and size
  to its own in a fifth of a second, fading in, while its backdrop darkens. A dialog nothing pressed
  opens, the Welcome on arrival say, appears at once, as does every dialog with animations off
  (`req/shell/resources-dialog/animations`) or reduced motion asked for. Test:
  `web-tests/test_dialog_motion_page.py`.
  </details>

- `req/shell/drive/credentials` Signed in, the page reads Google Drive as the user, with their token alone; signed out, with the site's API key.
  <details>

  Set by the owner on 2026-11-06. Signed in, every Drive read the page makes (a folder's listing, a file's details,
  a download) carries the user's own Google token and never the site's API key, so a folder the user's account can
  see opens whether or not it is shared publicly, a shared drive's included, and one it cannot see is refused as
  Google refuses it. Signed out, the same reads carry the site's API key alone, and reach only what is shared as
  "Anyone with the link". A signed-in user whose token has run out is not read for with the key: the next click on
  a Drive control renews the token, and a read with none says to click again. Sign-in asks Google for read access
  to the user's Drive (`drive.readonly`) along with the rest (`req/shell/account/sign-in`); a token from before
  that, lacking it, is renewed on the next click on a Drive control. `drive.readonly` is a restricted scope: until
  Google verifies the site, Google shows an "unverified app" screen on signing in and lets in at most 100 new users
  (missingbulb/RaunTruth#803). Test: `web-tests/test_drive_credentials_page.py`.
  </details>

- `req/shell/drive/dialog` Google Drive: a study browses its own folders, the Image Viewer takes a pasted link; open on Open, double click or Enter.
  <details>

  Set by the owner on 2026-11-04: a study naming a Drive root (its `root`, `req/shell/data/roles`) offers no link to
  paste; its dialog opens straight into the data folder its root names, else the root itself, and browses only within
  it. A study naming none, the Image Viewer, takes the pasted link of an image or a folder: one shared as
  "Anyone with the link", or, signed in, any the user's account can see (`req/shell/drive/credentials`). An image's link loads it at once; a folder lists its subfolders and the images the study opens (the kinds its `files.accept` names), to pick from, each image
  with its size, a small colour thumbnail and, for one opened before in the study, how long since, as the image
  selector says it (`req/shell/load/selector`); set by the owner on 2026-11-04, in place of the date it was added to
  Drive, an image the folder did not hold when this device last listed it carries a small boxed "new", and hovering
  on that says when it was added to Drive (a folder listed here for the first time marks none, having nothing to
  compare with: `req/shell/drive/offline-listing`); the dialog keeps one
  size while the user moves between folders. A click only selects a row; Open (or a double click,
  or Enter) opens it: an image loads, a folder lists its contents. Thumbnails are never read from
  Drive's files, which answers a burst of reads by refusing the browser for a while, the next image
  included. Set by the owner on 2026-11-07: an image no previews file covers (`req/shell/drive/previews`)
  shows Drive's own small picture of it, linked from the folder's listing, unless it is a TIFF, which Drive
  draws grey when it has several channels and which may be a 3D stack (`web-tests/test_drive_previews_page.py`). A study may ship ready-made thumbnails (its `driveThumbs`), fetched for the rows in view
  and the next 10 below them, more as the user scrolls; a row scrolled past before its turn is not
  fetched. Each thumbnail lands in its own row whatever order they arrive in, and a folder's listing
  is shown only while it is still the folder asked for. One fetched stays for the page's life:
  closing the dialog stops the rest, and reopening it shows those at once and fetches what the rows
  in view still lack. Test: `web-tests/test_drive_thumbs_page.py`. An image opened from Drive saves its own in the browser (the latest 100), shown from then
  on without a download. All but Drive's own are in the colours the page gives the
  channels. Show thumbnails in Settings (on at first, `req/shell/account/settings`) turns the downloads off; set by the
  owner on 2026-11-07, the dialog itself holds no such checkbox. The status bar's message says, while they load ("Thumbnails 3 of 10 ·
  1.2 MB"), how many have arrived and their size; once they are in, the message says again what it said
  before (set by the owner on 2026-11-05: the message, not a text of its own beside it). It needs the site's Google API key, kept in the repository variable
  `GOOGLE_API_KEY` and written into `web/config.js` at deploy; without one the option is off
  (`web-tests/test_site_config.py`). Where it takes a link, the dialog opens on the link last pasted in this
  study, else on the link last pasted in any study, and lists a folder link at once; opening on a link is not
  pasting it (`web-tests/test_drive_folder_page.py`). Nothing
  else read from Drive is kept, apart from the image files Auto-save images keeps and what each folder listed holds
  (`req/shell/storage/manage`, `req/shell/drive/kept-images`, `req/shell/drive/offline-listing`;
  `studies/nor/tests/test_drive_dialog.py`).
  </details>

- `req/shell/drive/kept-images` Images from Drive open again without a download.
  <details>

  Set by the owner on 2026-11-07, the Google Drive dialog holds neither Show thumbnails nor Auto-save images nor
  what they take on this device: both are in Settings (`req/shell/account/settings`), Auto-save images on at first and
  kept on this device, and Manage storage says what they take. While Auto-save images is on,
  an image downloaded from Drive is kept on this device. An image chosen in the image selector (`req/shell/load/selector`)
  opens from the copy kept here, with no call to Drive. One chosen from Drive itself, in the dialog's
  list or by its link, opens from the kept copy, whatever the checkbox says, only once its SHA-256
  matches the one Drive gives for the file now (from the folder's listing, or from the file's
  details for a link); otherwise it is downloaded: when the two differ (the file changed on Drive),
  and when Drive gives no SHA-256 or cannot be asked. A download replaces the kept copy while
  Auto-save images is on. Test: `web-tests/test_storage_page.py`, `web-tests/test_drive_cache_page.py`.
  </details>

- `req/shell/drive/offline-listing` The Drive dialog keeps every folder it lists, so it opens offline too, on those folders, greying what cannot open.
  <details>

  Set by the owner on 2026-11-04. Each folder the dialog lists is kept on this device: its rows, what Drive says
  of each (name, size, date, SHA-256), never a thumbnail's bytes or an image's. Offline, the dialog opens on the
  folders it opens on online and shows each folder as last listed: an image kept on this device
  (`req/shell/drive/kept-images`) opens as it does online, and every other image, and a folder never listed, is
  greyed and opens nothing. Online, opening the dialog or a folder shows its kept listing at once, when there is
  one, reads it again from Drive and puts what Drive says now in its place, kept too. Online, an image kept on this
  device carries the offline mark (`req/shell/offline/mark`), the others nothing. Offline with no listing kept for
  the link, the dialog lists the images kept on this device instead (`req/shell/offline/default`). Settings lists
  the listings among what is kept on this device only (`req/shell/account/settings`), and the privacy policy says
  they are kept. Test: `web-tests/test_image_line_page.py`.
  </details>

- `req/shell/drive/previews` A folder's previews file gives every image it covers a preview at once, a stack turning on hover.
  <details>

  A data folder's previews file is `<folder id>.tiff` in the `Previews` folder of the study's root, named by the
  data folder's id so that renaming or moving the folder keeps its previews (set by the owner on 2026-11-10; a
  `rauntruth-previews.tiff` inside a data folder, where previews were kept before, is no longer read). The
  `Previews` folder is found in the root's listing the page already reads, and listed once a minute at most.
  The file is made by Update previews (`req/shell/data/update-previews`), or by `dev/tools/previews/make_previews.py`
  on a computer that has the folder's images (its TIFFs, and the photos Pillow opens) and uploaded under that name: a multi-page TIFF, its pages
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

- `req/shell/ground-truth/clear` Clear progress, in the Ground Truth Tasks, forgets the open image's tagging on this device.
  <details>

  Set by the owner on 2026-11-05. A tagger's progress on an image (votes, added items, masks, the areas
  checked) is kept in the browser, so they can come back to it. Clear progress, at the Ground Truth Tasks
  box's end beside Submit Ground Truth (owner, 2026-11-07), asks first, naming what goes ("your votes, added items and checked areas on <image>"), then forgets
  only the open image's progress: other images keep theirs, and anything already submitted stays in Drive.
  Test: `web-tests/test_gt_drive_page.py`.
  </details>

- `req/shell/ground-truth/curate` A Study Manager accepts or rejects each pending submission into the curated folder.
  <details>

  Set by the owner on 2026-11-05. In Data Management, an image with pending ground truth
  (`req/shell/ground-truth/pending`) lists its submissions, one per tagger. Accept copies the submission
  into the image's subfolder in the curated folder under the same name, the copy recording the
  submission's SHA-256 and who accepted it and when; Reject leaves the file in Submissions marked
  rejected, with an optional reason the tagger sees. Tentative: the rejected mark and its reason are the
  file's public Drive properties, so a reader that is not signed in can see them. Tentative: a study whose
  two folders are the same has no review, so it offers neither button. Test:
  `web-tests/test_gt_drive_page.py`.
  </details>

- `req/shell/ground-truth/draft` Continue tagging brings back a tagger's draft of the image open, where the study takes drafts.
  <details>

  Set by the owner on 2026-11-10, a shell feature, not a study's. A study that takes drafts hands the shell its
  progress on the image open as data each time the tagger changes something, and the shell keeps it in the browser
  by the study, the image's name and its SHA-256. Beside Start GT tagging, Continue tagging shows while an image is
  open in such a study, and is on only while a draft of that image is kept, the box then open as the image opens: it hands the draft back to the study,
  which puts its results and the tagger's progress back with no step run again, and starts tagging. Manage storage
  lists a draft among its image's selections, and Clear progress forgets it with the rest. Changed by the owner on
  2026-11-10: in such a study the box offers one of three, never two at once. Start GT tagging, while no draft
  of the image is kept, before the study's algorithm has run or after; Continue GT tagging, once one is, which
  goes back to the item the tagger last had open; and Stop tagging while the tagger tags. Clear progress
  brings back Start GT tagging. Test: `studies/shelves/tests/test_shelves_page.py`.
  </details>

- `req/shell/ground-truth/folders` A study's ground truth lives in a submissions folder and a curated folder under its root; one folder for both is free submission.
  <details>

  Set by the owner on 2026-11-05; under the study's root since 2026-11-07. Taggers write to submissions;
  only Study Managers write to curated; viewers, the file dialog and the study's lab read curated. Ground
  truth is never sent to GitHub. When one folder serves as both, every submission is curated as it lands and
  nothing is pending. Who may write is what Drive's sharing of each folder allows. Tentative: Data Management
  tells a study with one folder for both that whatever a tagger submits is used at once. Tests:
  `web-tests/test_study_root.py`, `web-tests/test_truth_folders.py`.
  </details>

- `req/shell/ground-truth/layout` Both folders hold one subfolder per image and one file per tagger in it, and a reader takes the newest that is not rejected.
  <details>

  Set by the owner on 2026-11-05. An image's subfolder is named `<image name>__<first 8 hex of its
  SHA-256>`; in it, each tagger's file is `gt_<email>.json`. The file carries the image's full SHA-256,
  its Drive id, who made it and `created`, the time it was made. Submitting again replaces the tagger's
  own file, keeping Drive's earlier version forever (`keepRevisionForever`). A reader (the file dialog,
  a viewer, the lab) takes, in an image's subfolder, the file with the latest `created` that is not
  marked rejected. Only an image opened from Google Drive can be submitted; for one opened from the
  computer the Ground Truth Tasks box says so. Test: `web-tests/test_gt_drive_page.py`.
  </details>

- `req/shell/ground-truth/pending` Taggers and Study Managers see which images have ground truth, and which have it pending, in two listings.
  <details>

  Set by the owner on 2026-11-05; its calls set by the owner on 2026-11-07. The Drive dialog, the image
  selector's recent images (set by the owner on 2026-11-10; one whose SHA-256 this device never learned carries
  none) and Data Management mark an image as having ground truth when the curated folder holds its subfolder: one listing
  of curated, no file in it read. To a Ground Truth Tagger and a Study Manager they also mark it pending, or
  rejected, from one listing of submissions: each image subfolder there carries, as public properties, when
  its newest submission landed and when it was last accepted or rejected, which Submit, Accept and Reject
  stamp on it. Pending: submitted after the last acceptance and the last rejection. Nothing is cached. From the same listing
  of curated, an image without ground truth whose `.needs_gt` marker is there (`req/shell/data/folder`) is tagged
  GT wanted in the Drive dialog and the recent images (set by the owner on 2026-11-10). Data
  Management's summary counts the folder's images with ground truth, pending, and marked as needing it. A viewer sees only curated ground
  truth. Tests: `web-tests/test_truth_folders.py`, `web-tests/test_gt_drive_page.py`.
  </details>

- `req/shell/ground-truth/setup` Set up ground truth, in Data Management, makes the study's ground-truth folders and the root's settings file.
  <details>

  Set by the owner on 2026-11-07. For a Study Manager of a GT or PostGT study, Data Management offers Set up
  ground truth. It asks whether submissions need review: yes makes `GT curated` and `GT submissions` in the
  root, no makes one `GT` for both. It shares the curated folder with anyone with the link to view, then
  writes `rauntruth-study.json` in the root naming the data folder and the ground-truth folders by id, who
  set it up and when. It asks first for the page's per-file permission and Google's picker on the root, if
  not granted. Run again, it makes only what is missing and rewrites the file; it never makes a second
  folder of a name. Google's own words show when it refuses. Changed by the owner on 2026-11-07: it sits
  at the top of Data Management's column, highlighted while the root has no ground-truth folders; choosing
  an answer closes the dialog once the folders are made; once the settings file names the folders it is no
  longer offered; switching between reviewed and unreviewed is the Ground Truth box's
  (`req/shell/ground-truth/switch`). Tests: `web-tests/test_study_root.py`,
  `web-tests/test_gt_drive_page.py`.
  </details>

- `req/shell/ground-truth/submit` Submit writes the tagger's ground truth into the study's submissions folder.
  <details>

  Set by the owner on 2026-11-05. Submit Ground Truth (`req/shell/ground-truth/tasks`) opens a popup with the study's checklist of
  what is left to do, an Export file button that downloads the file, and a Submit button that writes it to
  the image's subfolder in the submissions folder (`req/shell/ground-truth/layout`), creating the
  subfolder when it lacks one. The popup says when the file landed, or why it did not, the export still
  there to keep a copy. Submit is off, saying why, for an image opened from the computer and for a tagger
  Drive does not let write there (`req/shell/ground-truth/tagger-access`).
  Tests: `studies/nor/tests/test_ground_truth_page.py`, `web-tests/test_gt_drive_page.py`.
  </details>

- `req/shell/ground-truth/summary` A Ground Truth box in Data Management says how the study takes ground truth and how many images have it.
  <details>

  Set by the owner on 2026-11-07. In a GT or PostGT study whose root has ground-truth folders, a Ground Truth box sits
  above the folder tree in Data Management. It says whether submissions are reviewed into GT curated or
  land in one GT folder, and counts, from the folders' listings alone (`req/shell/ground-truth/pending`),
  the images with ground truth, those pending review and those rejected. It reads again whenever a folder
  is chosen or a submission accepted or rejected. Test: `web-tests/test_gt_drive_page.py`.
  </details>

- `req/shell/ground-truth/switch` The Ground Truth box switches a set-up study between reviewed and unreviewed, moving no file.
  <details>

  Set by the owner on 2026-11-07. The Ground Truth box (`req/shell/ground-truth/summary`) offers Switch to
  unreviewed… or Switch to reviewed…, and a confirmation says what follows before anything runs. Neither
  moves, copies or deletes a file. Reviewed to unreviewed waits while any submission is pending review,
  saying how many; then GT curated serves as the one folder, so everything accepted stays the study's
  ground truth, and GT submissions, its rejected files included, is left as it is and no longer used; the
  confirmation says taggers need edit access to GT curated, which only Drive's sharing gives. Unreviewed
  to reviewed makes the one GT folder the curated one, so everything submitted so far counts as accepted,
  and makes GT submissions (or finds it by name: never a second folder of a name); the confirmation says
  to give taggers edit access to it and take theirs off GT curated. The settings file keeps who set it up
  and records the mode before, who switched and when. Tests: `web-tests/test_study_root.py`,
  `web-tests/test_gt_drive_page.py`.
  </details>

- `req/shell/ground-truth/tagger-access` The Ground Truth Tasks box shows whether the tagger may write to the submissions folder, and how to get there.
  <details>

  Set by the owner on 2026-11-05. At the top of the Ground Truth Tasks box, a line says whether this tagger
  may write to the submissions folder when they may not: Not approved, with a button that asks Google for
  the page's per-file permission and opens its picker on the submissions folder (as Data Management does,
  `req/shell/data/drive-access`); or View only, telling them to ask the study's owner for edit access. It
  is checked before any work, not first found at submit. Changed by the owner on 2026-11-07: a tagger who may
  write is told nothing, the line taking no room. Test: `web-tests/test_gt_drive_page.py`.
  </details>

- `req/shell/ground-truth/tagging` Ground truth tagging starts when the tagger presses Start GT tagging, and ends with Stop tagging.
  <details>

  Set by the owner on 2026-11-07. Opening an image, or the study's algorithm drawing what it found, leaves the
  page on the image as it is viewed: no task open, nothing framed, ringed or cut out, the view where the person
  left it. The Ground Truth Tasks box counts each task all the while, and Start GT tagging, at its top, begins
  the walk at its next item not done (clicking a task's name starts it at that task); the button then reads Stop
  tagging, which closes the open task and gives the image back to viewing. What tagging alone shows, the current
  item's ring, the area's frame and what is cut out of the image, is shown only while tagging, and the Show menu's
  rows for them are off out of it. Tagging stops when another image opens or
  the study leaves. Set by the owner on 2026-11-10, what is cut out can be the viewer's: a study gives it the shapes
  its tagger has decided, and the viewer cuts them out of the image while the tagger tags, showing there the
  study's `groundTruth.reveal` picture, black while it names none, and gives the image back whole out of tagging. Test: `web-tests/test_gt_drive_page.py`, `studies/nor/tests/test_truth_tasks_page.py`,
  `studies/vascular/tests/test_vessel_tasks_page.py`, `studies/shelves/tests/test_shelves_page.py`.
  </details>

- `req/shell/ground-truth/tasks` The shell lists the study's ground-truth tasks in Ground Truth Tasks, Submit Ground Truth last; how a task is worked through is the study's.
  <details>

  Set by the owner on 2026-11-07. The study names its tasks in order (a name, and a tooltip saying what the
  task is) and how far each has got, done of all; the shell draws them in its Ground Truth Tasks box
  (`req/shell/left-bar/shells`): a progress bar split into one part per task, each as wide as its task is long
  and filled as far as it is done, then one row per task, "13/47 Finalists", with a check once it is done, and
  last the shell's Submit Ground Truth row, which opens the submit popup (`req/shell/ground-truth/submit`) with
  the study's ground truth, Clear progress beside it (`req/shell/ground-truth/clear`). A task is open only while
  the tagger tags (`req/shell/ground-truth/tagging`). The study says when Submit can be pressed and, where it knows, whether its
  ground truth is done, partly done or not started, which the button shows as an icon; whatever it says, Submit
  is off until the study's first step is done (owner, 2026-11-07). A task with no total (the Bookshelf Reader's
  missed books) shows its count alone, "1 Missed books", and its check once the study says it is done. A row may say
  no count at all, its bar part still filled as far as the study says (Vascular Measurements' areas, owner, 2026-11-07). One task at a time is
  the open one, its name in bold: the study puts what it needs under its row and beside its name (its item,
  Back and Skip, an area's check), and hears when the user clicks a task's name. The walk through the tasks
  stays each study's own (owner: a change of heart on how one study does its tasks must not move the others;
  what proves common is merged later). The Submit GT crumb (`req/shell/status-bar/breadcrumbs`) presses
  the shell's Submit. Test: `web-tests/test_study_contract.py`, `web-tests/test_status_bar_page.py`,
  `studies/nor/tests/test_truth_tasks_page.py`, the vascular study's vessel tasks test.
  </details>

- `req/shell/ground-truth/view` Anyone can load an image's curated ground truth and see only its final results.
  <details>

  Set by the owner on 2026-11-05; its calls set by the owner on 2026-11-07. Once an image from Drive is open,
  for anyone not tagging, the curated folder's listing says whether it has ground truth, and if so a
  Ground truth box offers Load GT tagging. Only that click reads the image's subfolder and its newest
  file, then shows its final results on the image, with no algorithm run: none of the tagging tasks' marks
  (no blacked-out areas, no rejected candidates, no work areas). A summary follows: whose file, when it was
  made, and its counts. Test: `web-tests/test_gt_drive_page.py`.
  </details>

- `req/shell/header` A header with the logo, the study switcher and a dark/light switch (remembered).
  <details>

  GitHub's repository switcher, for studies: the study's icon (as in its list, below), its title and a solid caret form one 32 px
  control; it opens, under the caret, a 320 px panel headed "Switch study", a search box (focused,
  filtering by title as the user types) and every study it shows to the user (`req/shell/study/visibility`),
  by title, each with its own icon (the tab's icon its `study.json` names; the generic study icon
  when it names none, or the icon does not load), a rule under its name, then its offline mark (`req/shell/offline/mark`) and
  its stage (`req/shell/study/stage`), 8 px from the row's right edge. No tick marks the one on show: the
  header already names it, and only assistive tech is told which it is. Arrow
  keys move through the list, Enter opens the one marked, Escape closes it. Each entry is a link to
  the study's address (`req/shell/study/folder-and-address`), so a middle click opens it in a new tab. The header's spacing follows
  GitHub's: 64 px tall, 16 px at the sides, a 32 px logo. Test: `web-tests/test_study_runs.py`.
  </details>

- `req/shell/image/file-info` The image's name unfolds what the file says about the image, and nothing it does not say.
  <details>

  Folded at first: the field in µm and px, the pixel size, the bit depth, the ImageJ series, the
  microscope and date when the file names them (the lab's ImageJ exports never do), and the software that saved
  it (`web-tests/test_file_info.py`). What the file does not carry goes unsaid: set by the owner on 2026-11-10, no
  line says the microscope or acquisition is missing, and with no image open the box names none and shows no
  details line, the empty viewer saying it already (`web-tests/test_image_box_page.py`).
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
  no drag selects or drags the page's text (set by the owner on 2026-10-31). Only a glyph of a study's
  drawing that the user drags (a book's corner, say) moves alone, the image staying still under it, in
  every study and viewer (set by the owner on 2026-11-07; `studies/shelves/tests/test_shelves_page.py`). Scrolling up and down zooms around the pointer in small steps;
  scrolling sideways steps to the study's previous or next item (for NoR, the candidate). The main
  area's toolbar holds the zoom at its right, and its tools wait for an image; a preview opened in Data
  Management (`req/shell/data/preview-images`) is one (set by the owner on 2026-11-04). Test:
  `web-tests/test_image_box_page.py`.
  </details>

- `req/shell/image/open` The page reads and shows the image itself, the same way in every study; no study's code and no Python stands between a file and its view.
  <details>

  Set by the owner on 2026-11-07. The shell reads a TIFF (ImageJ hyperstacks, OME-TIFFs in one file and plain
  TIFFs; uncompressed, LZW, Deflate or PackBits), a HEIC (set by the owner on 2026-11-10: by libheif's
  WebAssembly build, fetched from jsDelivr at a pinned version only when a HEIC is first opened, in every browser)
  and any image the browser decodes (PNG, JPEG), and opens it in
  the study's viewer: its channels in the file's own order, each under the name the file gives it and in the
  colour the file displays it in, a z-stack flattened (each pixel the brightest of every slice) and slice by
  slice. Each channel's contrast is set once over the whole stack, never per slice, so signal that fades with
  depth still looks faded: between its 0.5% quantile and its 99.8% one, or the upper quantile the study's
  `view.upper` sets, its black point then lifted where its black-point method measures the background on the
  channel's histogram in that window (set by the owner on 2026-11-08). The method is a preference the viewer takes
  from the first that sets one of the image, the user, the study (`view.blackPoint`) and the file's format; the
  shell has the last two. `triangle`, the format's own for a TIFF of separate channels, puts the black point at the
  histogram's knee where the background's fall meets the signal's tail (Zack's triangle), each channel by its own
  histogram; `quantile`, a photo's (an RGB TIFF, a PNG or a JPEG) and any light background's, leaves it at the 0.5%
  quantile; `background` puts it 2.5 robust standard deviations (1.4826 median absolute deviations) over the
  background's median; `flattened` sets the white point too, leaving the darkest 1% of the flattened image black
  and its brightest 1.3% full colour, the window the owner set by eye on a vascular stack (black 67, white 213 on
  `cd31_frontal_x20_r_1_slices1-12`, owner, 2026-11-08). What a study's `study.json` says of a channel (its name, description, whether it shows, its
  black point, its colour, coloured by depth) is only where that channel's row starts, every one of them the
  user's to change (`req/shell/channels/rows`). A file's display colours do not say which channel is which
  (Vascular's originals show DAPI red, NoR's come in three arrangements), so a study may give a rule, in its page
  part, that puts the file's channels in its own channels' order by what each holds, for these first settings
  alone; a study with none takes the file's order (owner, 2026-11-07). A study whose `view.stretch` is false
  shows an 8-bit image as stored, a photo as the camera took it. A file the shell cannot read says why in the
  status line. Test: `web-tests/test_image_open.py`.
  </details>

- `req/shell/image/opens-fitted` Every image opens whole in the view, never above 100%.
  <details>

  Set by the owner on 2026-11-10, in every study and the 2D viewer. An image larger than the view opens shrunk to
  fit it; one smaller opens at 100%, centred in the view. The next image opens the same way, whatever the last one
  was zoomed to. Test: `web-tests/test_image_fit_page.py`.
  </details>

- `req/shell/image/progressive` An image shows while it downloads.
  <details>

  An uncompressed TIFF like the lab's paints onto the page from its bytes as they arrive from
  Google Drive, in grey from the channels in so far, with the megabytes so far and the elapsed
  time below. Once every byte is in, its colours wipe down over the grey; a file from the computer,
  or one already kept, fades up from black into its colours instead, quickly. No pixel ever shows a
  colour its final one lacks: each is grey, black, or a darker shade of the colour it ends in, and
  the colours it ends in are the brightness the page draws once the image is read (`req/shell/image/open`), so
  that drawing, which replaces it, changes nothing visible. Any other image shows the byte count.
  </details>

- `req/shell/image/proportions` No image is ever drawn out of its proportions.
  <details>

  A crop or picture narrower than its box shrinks as a whole (`studies/nor/tests/test_page_layout.py`).
  </details>

- `req/shell/image/scaling` Zoomed out, the 2D viewer shows the image averaged down, as a photo viewer does; from 100% up, its pixels as sharp squares.
  <details>

  Set by the owner on 2026-11-10, in every study. Below 100% each screen pixel shows the average of the image
  pixels under it, so fine detail, a node or a book's title, neither breaks into scattered dots nor speckles,
  even a phone photo shrunk six times to fit; from 100% up each image pixel is a sharp square. Test:
  `web-tests/test_image_scaling_page.py`.
  </details>

- `req/shell/image/toolbar` The toolbar's left is the study's, how its results show over the image; its right is the viewer's.
  <details>

  Set by the owner on 2026-11-07. At the toolbar's left the study chooses how what it extracted is drawn over the raw
  image (what to show, how wide, how faint); the left bar holds none of those. At its right, beside Zoom, are the
  viewer's own tools (the ruler, the grid, the minimap, the 3D view's Look from). Set by the owner on 2026-11-10, a
  study says, as data in its `study.json` (`view.hide`, naming `ruler` and `grid`), which of the viewer's tools it
  does not show, and the shell reads it there: the Bookshelf Reader's photos have no scale, so it hides both. Test: `studies/vascular/tests/test_model_page.py`, `web-tests/test_viewer3d_page.py`,
  `studies/shelves/tests/test_shelves_page.py`.
  </details>

- `req/shell/image-viewer` The Image Viewer: the page with no study's tools, the one it opens on.
  <details>

  A study with no panels and no actions (`studies/viewer/`): it loads any TIFF or PNG and opens it in the viewer
  its shape asks for (owner, 2026-11-03): a z-stack (a TIFF's Z axis, or the pages of one that names none of its
  axes) in 3D (`req/shell/viewer-3d`), a flat image in 2D. Load being its only step, the Image box stays open once
  the image has loaded (owner, 2026-11-03). It shows each
  channel, up to 8, under the name the file gives it (an OME channel name, an ImageJ label, never
  ImageJ's own made-up "c:1/3 - …") and in the colour the file displays it in (an ImageJ LUT, mixed
  colours included), leaving what the file does not say to `req/shell/channels/rows`; the image box says what the file
  states, its scale only when the file gives one in µm. A side bar it leaves empty gives its room to the image, and it
  has no ground truth, so a local image earns no notice about sending one. A TIFF opens uncompressed or
  compressed with LZW, Deflate or PackBits. Test: `studies/viewer/tests/test_viewer.py`,
  `web-tests/test_study_runs.py`, `web-tests/test_compressed_tiff.py`, `web-tests/test_viewer3d_page.py`.
  </details>

- `req/shell/left-bar/folding` The left bar's boxes stay folded until their step makes them useful, and fold again once it is done.
  <details>

  Set by the owner on 2026-10-30. Every box in the left bar folds under its title, and clicking the
  title opens or closes it. The first is the shell's Image box (the image selector or Load, the image's
  details, its channels, Unload): open until an image opens, then folded; in a study with no steps after Load
  (the Image Viewer) it stays open, nothing else having opened (the owner, 2026-11-05). Processing opens once an image opens and folds
  again after the study's first step (`req/shell/status-bar/breadcrumbs`); Summary and Ground Truth Tasks open after that
  step (`req/shell/left-bar/shells`, set by the owner on 2026-11-07). When a step is done by the user (an image opening, or the
  step's button pressed, never a dial set back to the last run's) its boxes open and the boxes it
  closes fold; opening another image also folds every box waiting for a later step. Between those moments a box
  stays as the user left it; switching study (`req/shell/study/switch-in-place`) starts over.
  Changed by the owner on 2026-10-31. The boxes are drawers stacked in one panel, no gap between
  them, each title on a compact row behind the step's number in a circle, which turns into a green
  check once the drawer's task is done; the open drawers carry an accent bar at their left. A
  drawer's title describes its task while the task waits, open or folded; once it is done, the
  folded title sums up what was done and the open one names the drawer. The Image box, titled Load
  Image while no image is open (and again after Unload), folds once done (in a study with a step after Load) to
  a small preview of the image, its name and what it holds ("2D", "3 channels", from the file;
  only "2D" when the file does not say), and opens as "Loaded Image". A study's drawer is done
  when the study gives it a summary, and waits again when the study takes it back. A drawer opening or
  folding slides open or shut, and the drawers below it slide to their new places (set by the owner on
  2026-10-31). Changed by the owner on 2026-11-03: a folded drawer opens from a click anywhere on it,
  not only on its title or number; an open one still folds only from its title.
  Test: `web-tests/test_left_bar_page.py`, `web-tests/test_study_contract.py`.
  </details>

- `req/shell/left-bar/shells` The shell lays out the whole left bar, Load Image, Processing, Ground Truth Tasks and Summary; a study only fills its boxes.
  <details>

  Set by the owner on 2026-11-07: the left bar's layout is the shell's, and a study adds no box to it. Under
  the Image box (and Data Management's) come three boxes of the shell's, each holding what the study puts in it:
  Processing (what runs the algorithm: its choice, its settings, its button, and the tools that correct its
  result), Ground Truth Tasks and Summary (what the result adds up to, and its downloads). While the study makes
  ground truth for the user (`req/shell/account/role`) Ground Truth Tasks shows in Summary's place; otherwise
  Summary shows. A box the study puts nothing in is not shown. How the study's results are drawn over the image
  is chosen in the toolbar (`req/shell/image/toolbar`), never in the left bar. Test:
  `web-tests/test_study_contract.py`, `web-tests/test_left_bar_page.py`.
  </details>

- `req/shell/left-bar/static` The left bar stays open: nothing collapses it, and it has no chevron and no Steps label.
  <details>

  Set by the owner on 2026-11-07, in place of the collapsing bar of 2026-11-03: no chevron at its top, no narrow
  Steps strip, and dragging the gutter stops at the bar's narrowest rather than collapsing it. A collapsed state
  kept on the device from before opens the bar.
  Test: `web-tests/test_left_bar_page.py`.
  </details>

- `req/shell/left-bar/width` The left bar drags wider or narrower (remembered; a double click restores it); there is no right bar.
  <details>

  Folding or unfolding a box never changes the bar's width. Set by the owner on 2026-10-31: the page
  has no right bar; what a study once put there goes over the image (its `over-image` slot) or at
  the toolbar's right end (its `toolbar-end` slot).
  </details>

- `req/shell/load/button` In a study opening from this computer alone, Load opens an image from it and shines until one is open; Unload beside it closes it.
  <details>

  No study the site publishes opens from this computer alone (`req/shell/load/from`); the shell keeps the case for
  its own tests. The left bar's Image box holds the image: its name and what the file says
  (`req/shell/image/file-info`), its channels (`req/shell/channels/rows`), and at its foot Load, which opens the
  computer's own file chooser, filled and glowing until an image is open and a plain button with a blue border
  after. Load sits at the foot, not in the box's title, so the title keeps its place whether the box is folded or
  open. Once an image is open, Unload stands beside Load and clears the page back to before any image:
  no image, no minimap, the steps starting over at Load image, the boxes folded as at first, and the
  study starting over too, its panels as they were before any image; Python, if it has started, lets the image go. Test:
  `web-tests/test_image_box_page.py`.
  </details>

- `req/shell/load/from` Only the Image Viewer opens files from this computer; every study opens images from Google Drive.
  <details>

  Set by the owner on 2026-11-04. A study's `files.from` lists where it opens images from, `local` (this
  computer) and `drive` (Google Drive), and every study lists at least one. The Image Viewer, which makes no
  ground truth, opens from both; NoR Finder and Vascular Measurements, whose images and ground truth live in
  Drive, from Google Drive alone, with no way to a file on the computer. Corrected by the owner on 2026-11-04: the
  Image Viewer is the only study that may use local files, not one limited to them. Where Load reads from is no
  setting of the user's. Test: `web-tests/test_image_line_page.py`.
  </details>

- `req/shell/load/recents-tip` A tip bubble points at the image selector when an image opened from Drive is one of the recent ones.
  <details>

  When an image chosen in the Google Drive dialog opens from this device (`req/shell/drive/kept-images`), a bubble beside
  the image selector (`req/shell/load/selector`), its arrow pointing at it, says "To load recent files click here". Its ×
  closes it for good, and so does opening the selector, which is what it asks for. Each tip has an
  id, and the ids of the tips closed are kept in the browser (listed in Manage storage's settings as
  "Tips you closed"), so a closed tip never shows again, after a reload too. Test:
  `web-tests/test_drive_cache_page.py`.
  </details>

- `req/shell/load/selector` In a study opening from Google Drive, the Image box's top line picks the image: a selector of the images opened lately, newest first, each saying how long ago; Unload once one is open; the computer's button where the study opens local files; and Drive's button.
  <details>

  Set by the owner on 2026-11-04, in place of Load and its dropdown (`req/shell/load/from`). The Image box's first
  line, above the image's details (`req/shell/image/file-info`, titled Details) and its channels, holds a selector
  looking like the header's study switcher: its face names the image open, or, before one, says "Choose an
  image"; it opens on the last 30 images opened in the study on show, newest first, the first (the one opened
  last) selected, so Enter opens it (set by the owner on 2026-10-31: an image opened in another study is
  irrelevant here). Each shows its name and where it is, beside that place's small logo: in Drive, the folders under
  where it was opened from, so two files of one name stay apart; for a file on this computer, "This computer". Each
  carries a small tag of how long since it was last opened: "<1h" within the hour, then whole hours ("3h"), days
  ("6d"), months ("2mo") and years ("1y"); one opened before the page kept that time carries none. An image is one
  entry however often it is opened. Choosing one from Drive opens the copy kept on this device
  (`req/shell/drive/kept-images`), with no download, and downloads it again only when none is kept; offline, one
  not kept is greyed and opens nothing. Choosing a file from this computer opens the file itself, as it is now,
  after the browser asks the user to allow it to be read again: the page keeps the browser's reference to the
  file, never a copy (set by the owner on 2026-11-04); a file moved, deleted or refused says so and opens nothing.
  The browser keeps such a reference only where it lets a page choose files itself (Chrome and Edge); in any
  other the list holds the images from Drive alone. With none opened yet the selector says so. At the line's right,
  where the study opens local files, a button bearing a computer opens the computer's own file chooser; last, a
  button bearing Drive's logo opens the Google Drive dialog (`req/shell/drive/dialog`), offline too
  (`req/shell/drive/offline-listing`). Until an image is open, the selector, or when it lists nothing the
  computer's button, else Drive's, is filled and glowing, as Load is (`req/shell/load/button`). Once an image is
  open a small Unload button stands after the selector, and clears the page as Unload does. The selector's list
  stays inside the left bar, a long name cut short. The references to files on this computer stay with this
  device, listed in Settings among what is kept on this device only (`req/shell/account/settings`), and the
  privacy policy says they are kept. Test: `web-tests/test_image_line_page.py`, `web-tests/test_storage_page.py`.
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
  copy, in each form the site answers online: `/app` and a study's address with a trailing slash lead where
  the site redirects them (set by the owner on 2026-11-10). A study whose Python is already on this device runs; one whose Python is not says so: it
  needs the internet once, or Make Available Offline (`req/shell/offline/per-study`). It says so plainly, not as an error
  and with no traceback, the spinner stopping, the network dropping as the study's own modules load too (set by the owner on 2026-11-03). An image kept on this device (`req/shell/drive/kept-images`,
  `req/shell/offline/per-study`) opens: offline, the Google Drive dialog shows its folders as last listed (`req/shell/drive/offline-listing`),
  or, with none kept, the images kept here.
  The status bar's online icon (`req/shell/status-bar/online`) shows it, the network's tooltip and its
  Network tab saying the page is offline too. No
  network is the browser saying so, or the site not answering, asked every 30 seconds all session long and every
  5 seconds while offline, so the network going mid-session shows within 30 seconds and coming back within
  seconds, even with a release that landed meanwhile still being copied (set by the owner on 2026-11-04), the browser saying online or not, and a Wi-Fi's
  sign-in page answering in the site's place counts as no network. What the page is doing follows it, set by the
  owner on 2026-11-03: a study whose Python could not load loads it once the network is back, with no reload;
  an open Google Drive dialog greys what cannot open once it goes and reads its folder again once it is back, and
  an image it could not download says the internet cannot be reached; an open Prepare for Offline popup reads the
  study's folder and counts again, and offers Download again after a run the network cut short, what it kept
  staying kept; a signed-in user's settings sync, the version is checked and the site's copy brought up to date.
  What needs the network says so in
  its tooltip and does nothing: Sign in with Google, opening a new GitHub issue, Submit New Study
  Request and Data Management (`req/shell/data/mode`). A change to a setting that follows the user (`req/shell/account/sign-in`) waits and is saved once the network is
  back. A visit the browser cannot reach a copy for, never opened online, shows the browser's own
  offline page: no site opens there. Nothing here installs the site as an app or asks the browser
  for anything. Test: `web-tests/test_offline_page.py`.
  </details>

- `req/shell/offline/mark` What is available offline says so, quietly: a study, and an image from Google Drive.
  <details>

  Set by the owner on 2026-11-02, so the user knows before doing anything what works with no network
  (`req/shell/offline/default`). A small green mark, the same everywhere, an arrow into a tray for saved on this device,
  follows a study whose Python is all on this device and, for a study with a Google Drive folder of its own, at least
  one of its images too (set by the owner on 2026-11-07), in the header's switcher and its Storage
  section, and an image kept on this device, in the Google Drive dialog's rows; what is not available
  offline carries nothing. The image selector's images carry none: with Auto-save on, they are all kept; offline,
  one not kept is greyed (`req/shell/load/selector`). The owner set on
  2026-11-04 that the mark states a state rather than prompting an action, so it is green, with no
  question-mark pointer; assistive tech is told what it means: the study runs, or the image opens, without the internet.
  The owner set on 2026-11-06 a tiny tooltip on it, "Available for offline", and that in a Drive row it sits before what
  the image holds (2D, 3D), which every image shows (the nor-finder pack's row-indicators-edges). Tests:
  `web-tests/test_storage_page.py`, `web-tests/test_image_line_page.py`.
  </details>

- `req/shell/offline/per-study` Each study can be made available offline from the Storage tab, after a popup with what it takes and how long.
  <details>

  Set by the owner on 2026-11-02, nothing in it happening until the user asks. The Storage tab
  (`req/shell/storage/manage`) opens with an **Offline Settings** block holding **Install as an app** (set by the owner on
  2026-11-07): only on the user's click does the page offer the
  browser's install, an icon that opens the site in its own window, offline too; until then the
  page names no app manifest, so the browser offers none unprompted. Where the browser has no install
  button of its own to call, the tab says where that browser's own menu has it. Each study's section
  that is not available offline (`req/shell/offline/mark`), and each with a Google Drive folder of its own (`files.drive`),
  has **Make Available Offline**, which opens the **Prepare for Offline** popup, a list of what that takes: first its
  Python, a row ticked and greyed, since the study cannot run without it, with the size still missing (Python itself
  counted when it is) or saying it is already on this device; set by the owner on 2026-11-10, the files its page fetches
  beyond Python that its `study.json` names to keep offline (`web.offline`, pinned addresses, such as the Bookshelf
  Reader's text finder) go with it, the row then named **Python and models**; then every image reachable from its Google Drive folder,
  its subfolders included, each with its folder and size, ticked, to untick one by one or all at once. Below the list
  the popup carries no text of its own (set by the owner on 2026-11-07); its button at the right says what the choice
  downloads, **Download 320 MB Now**. A choice larger than how much more the browser lets the site keep is refused,
  saying so. Download asks the browser
  to keep the site's storage until the user deletes it, downloads with its progress shown and can be
  stopped, and ends saying what is now on this device and whether the browser agreed to keep it.
  When Google throttles the downloads (`req/shell/drive/throttle`) it stops and says so. Test: `web-tests/test_offline_page.py`.
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

- `req/shell/preprocessing/split` Preprocessing, in Data Management, holds Edit Image; each file it saves is an ImageJ TIFF recording where it lay.
  <details>

  Set by the owner on 2026-10-31. A large image is hard to annotate in one sitting; its parts can be
  annotated one at a time, by several people at once, and give the finders smaller samples to tune on.
  Changed by the owner on 2026-10-31: it is the shell's, in every study, the Image Viewer included.
  Changed by the owner on 2026-11-02: it exists only in Data Management (`req/shell/data/mode`), below
  the Image box; out of it no drawer, number or crumb names it. Changed by the owner on 2026-11-03: Split
  into parts became Edit Image (`req/shell/data/edit`), whose Save… (`req/shell/data/edit-save`) writes
  the files; there is no separate dialog.
  Each part is an ImageJ TIFF (uncompressed, little-endian) of the channels and slices kept, every time point
  kept, its pixels the image's own, bit for bit at its own bit depth, but 0 inside an imperfection: the image's scale, unit, slice spacing,
  channel colours (the file's LUTs, else the page's colours), names, display ranges and Info are kept, and
  its Info gains a line `rauntruth.split={…}`: the image it came from (name, SHA-256, Drive id, size,
  channels, slices, frames), the grid's cuts, the part's row, column, number, x, y, width and height, the
  channels and slices kept (from 0), the parts of the image left blank as imperfections (`removed`, polygons
  in the image's pixels, every slice), and for a part of a part where it lies in the first image (`root`).
  That record is enough to join the parts' ground truth back into the whole image's. It reads ImageJ
  hyperstacks, OME-TIFFs in one file and plain TIFFs (strips or tiles; uncompressed, LZW, Deflate or
  PackBits, either byte order; 8, 16, 32 or 64 bits), and a PNG as the browser decodes it; it refuses a
  BigTIFF, and a part over 4 GB. Test: `web-tests/test_split.py`, `web-tests/test_image_edit.py`.
  </details>

- `req/shell/python/file-bytes` A study's algorithms run on the image file as it is stored, never on what the viewer shows.
  <details>

  Set by the owner on 2026-11-07. The study's Python opens the file's own bytes, exactly as they came from this
  computer, Google Drive or the device's copy, and every algorithm reads only what it reads from them. Nothing the
  viewer does (its contrast, the channels shown, the black and white points, the 3D view) reaches Python, so the
  same file gives the same result however it is viewed. Test: `web-tests/test_study_runs.py`.
  </details>

- `req/shell/python/on-run` Python starts only when the user runs an algorithm.
  <details>

  Set by the owner on 2026-11-07, replacing Python's start at the page's opening: nothing in viewing an image
  needs Python (`req/shell/image/open`). While the page is open, the files Python and the study's packages need
  are kept on this device in the background, when they are not there yet, and nothing runs; the first Run starts
  Python from them, and the status bar names each stage (downloading, with the megabytes so far, only for what
  is not on this device; starting Python; reading and installing the packages; loading the study, in the study's
  own words; then the algorithm's own progress). Later runs reuse the running Python. With no network and the
  files not all here, the status line says the study's Python is not on this device, plainly and not as an error,
  before any Run; once the network is back they are kept, with no reload. Python's importer asks the
  site only for a module the study's folders hold on the release (its offline list), never for a name they
  lack, as scipy's and scikit-image's optional imports are. Test: `web-tests/test_python_files.py`,
  `web-tests/test_study_runs.py`.
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
  file name Save… lists, the Data Management tree and folder view, the Storage tab, the lists in Settings) is logged by what it is. The log keeps the last
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
  the right, then a row of the tab's own buttons and Close. Switching tabs leaves the dialog as it is, the same width
  and height, a tab longer than it scrolling within it (set by the owner on 2026-11-07). Test:
  `web-tests/test_status_bar_page.py`.
  </details>

- `req/shell/resources-dialog/animations` An Animations checkbox in the resources dialog's CPU tab turns every animation on the page off.
  <details>

  Set by the owner on 2026-10-31. It is the checkbox alone, with no text explaining it (set by the owner on
  2026-11-07). Checked at first, it is kept as the user's setting: the next visit
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

- `req/shell/site/icons` The site, the app and each study show their own icon in the tab and their own poster and description in a shared link.
  <details>

  Set by the owner on 2026-11-02. The site's pages carry the site's favicon (`favicon.svg`, and
  `favicon.ico` for whatever asks for it unnamed) and its poster; the app carries a different icon
  and its own poster. Every study a person can open (any but an `unlisted` one, which only the tests
  open) names its own in `study.json`, set by the owner on 2026-11-10: `icon` (an SVG) and `poster`
  (a 1200 × 630 JPEG), files under its `web/`, and `description`, one line of at most 160 characters.
  Its address then carries them, and while it is on show the tab's icon is its own; an unlisted study
  naming none shows the app's. A poster is named by its full address (`og:image`), with the page's
  title and description, for a shared link's preview; posters are JPEG, which every link preview
  shows. Test: `web-tests/test_published_site.py`, `web-tests/test_study_contract.py`,
  `web-tests/test_study_runs.py`.
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
  page's importer can reach, and the files its `generated` names under `web/`, each the output of one of
  its scripts the build runs. A study's docs, data, tests and lab notes stay in the repo, and nothing
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

- `req/shell/status-bar` The status bar: the study's steps at the left, the disk, memory, network, CPU and version at the right.
  <details>

  From the left edge: the breadcrumbs of its steps (`req/shell/status-bar/breadcrumbs`), then
  the spinner and what the page is doing now (each stage of Python's loading, the study's progress,
  an error in red) and the thumbnails' progress (`req/shell/drive/dialog`). From the right edge inward: the site's
  version (stamped by each release; `req/shell/version-history`, `req/shell/site/out-of-date`), the CPU (`req/shell/status-bar/cpu`), the network (`req/shell/status-bar/network`), the
  memory (`req/shell/status-bar/memory`) and the disk (`req/shell/status-bar/disk`); between the version and those four, the report icon (`req/shell/report/bug`), a bug, or a warning sign in a browser the page does not support,
  and then the online icon (`req/shell/status-bar/online`). The four are folded into one icon unless set
  always open (`req/shell/status-bar/resources`), and unfolding them moves neither their icon, the online icon, the report icon nor the version. With too
  little room, what the page is doing now and the four give way, cut short, while the steps at the left and the
  icons and version at the right stay whole (owner, 2026-11-07). Each of the four before the version is a small grey icon
  and its number, with no word naming it; all five are plain, with no box, alike. A mild vertical
  bar separates each item from the next, the resources icon included, folded or not, but the four, which sit
  together with none between them. Nothing in the status bar turns the pointer into a
  question mark. The image's name and the study's counts are in the
  breadcrumbs' popups: Load image names the image, the study's own step gives its counts. Test:
  `web-tests/test_status_bar_page.py`.
  </details>

- `req/shell/status-bar/breadcrumbs` Breadcrumbs show the steps done so far, and the step to do now shines.
  <details>

  A study's steps are Load image, the study's own in order (its `study.json` `phases`; for NoR
  Run algorithm and Review all items), then Submit GT while the study makes ground truth for the user: a
  Ground Truth Tagger in a GT or PostGT study (`req/shell/account/role`). The status bar shows
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

- `req/shell/status-bar/memory` The memory, a memory-chip icon and "253 MB", opens what holds it.
  <details>

  The memory the tab holds: Python's, its files, the page's (Chrome and Edge say it) and an estimate
  for the compiled code and the browser, which a page cannot read; amber past a quarter of the
  computer's total where the browser says it. Clicking it opens the Memory tab (`req/shell/resources-dialog`) listing each
  of those, and within the page's share the image and the study's results, and the computer's
  total. It carries no button to have Python collect its garbage (a Run GC button removed by the owner on
  2026-11-07), and no essay on how Python's memory grows. Test:
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

- `req/shell/status-bar/online` The online icon says whether the page is online, and opens where offline is set up.
  <details>

  Set by the owner on 2026-11-03, in the place of a red mark on the network's and the resources' icons. Between the
  resources and the report icon, a grey Wi-Fi icon while online; offline, a crossed-out cloud (set by the owner on
  2026-11-05), in red, the one red in the status bar. Its tooltip says which, and that clicking it sets up working
  offline: it opens the Storage tab of the resources dialog (`req/shell/resources-dialog`), where the page installs as
  an app and each study is made available offline (`req/shell/offline/per-study`). Online and offline are what
  `req/shell/offline/default` says. Tests: `web-tests/test_status_bar_page.py`, `web-tests/test_offline_page.py`.
  </details>

- `req/shell/status-bar/resources` The disk, memory, network and CPU fold into one icon, unfolding on hover and while something needs watching.
  <details>

  Set by the owner on 2026-11-03. The four sit in one block with a gauge icon at its right, next to the
  online icon (`req/shell/status-bar/online`). An Autohide checkbox in the resources dialog, above its tabs on every tab, chooses how the block shows:
  checked, the default, it auto-hides; unchecked, it is always open, as the status bar was before (set by the owner on
  2026-11-07, in the place of a choice that also offered Hidden always; a kept Hidden always reads as auto-hiding). Auto-hiding,
  the page opens with the four folded away and the icon alone showing; hovering the block unfolds the
  four as they look always open, opening beside the icon, which stays where it is (changed by the owner on
  2026-11-07), and leaving folds them again, both ways
  animated (at once with animations off, `req/shell/resources-dialog/animations`, or reduced motion asked for). It unfolds by
  itself, and stays unfolded, while the CPU has been over 50% of one core for more than
  5 seconds, the network has been downloading over 250 KB/s for more than 5
  seconds, or the tab holds over 1 GB, and folds 8 seconds after the last of these ends. Going offline does not unfold it
  (set by the owner on 2026-11-04): the online icon (`req/shell/status-bar/online`) says so. Always open, the four show beside the icon. Clicking the icon opens the
  resources dialog (`req/shell/resources-dialog`) on the tab last shown, Storage at first. The choice is kept as the user's setting and,
  signed in, follows the user (`req/shell/account/sign-in`). Test: `web-tests/test_status_bar_page.py`.
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
  told apart by study, and opened in none of them since, is listed with the study on show. The study sections sit under a
  **Studies** heading; then, under a **Shared** heading, the **Shared** section (set by the owner on 2026-11-07): the site itself, Python itself, the packages two studies or more use,
  and, as one record, code no study uses now. Each entry can be deleted, but a study's pages, kept
  whole with the site; each section's **Clear cache** (set by the owner on 2026-11-07, in the place of a Delete all) deletes all it can, and a study's is the study's
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
  study and is rewritten to its path. The build publishes the page once more under the id of each study
  the switcher can offer (`req/shell/study/visibility`), so the path opens it fresh too, and refuses an id the app already serves at its
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

  Every `study.json` names its `stage`, `null` for a tool that makes no ground truth and has no stage, and the header's
  switcher (`req/shell/header`) shows each study's at the end of its row as a small label, in 10 px type, the stage's name bordered in its colour: red for PreGT, yellow for GT, green for PostGT,
  green and filled for Published. Set by the owner on 2026-11-04.
  Hovering a label opens a popup beside the switcher listing the four stages in order with what each means, that study's own highlighted and the
  ones before it crossed out, and what the study needs to move on to the next.
  PreGT: the study's tools work but cannot make ground truth yet, so it offers no export: its
  Submit Ground Truth (`req/shell/ground-truth/tasks`) is not shown and it has no Submit GT step. GT: the same,
  with the ground truth exported and submitted (`req/shell/ground-truth/submit`). PostGT: GT with batch actions on top (none
  yet). Set by the owner on 2026-11-02, Published: the study's algorithm is trusted and the page only
  shows what it finds, so it makes no ground truth (no Submit GT, as in PreGT) and
  drops the steps that serve making it: the study's
  postprocessing (NoR's Filters fold in its Processing box, `req/nor/filters/live`) is not shown. A GT or PostGT study names its ground truth's label. The Image Viewer has no stage (`null`): as in PreGT, it makes no ground truth;
  NoR Finder is GT. Test: `web-tests/test_study_contract.py`, `web-tests/test_status_bar_page.py`.
  </details>

- `req/shell/study/switch-in-place` Switching study happens in place: no reload, and the new study starts as a fresh load of its address shows it.
  <details>

  Choosing a study in the switcher, or going back and forward between studies, changes the address
  and swaps the study without reloading the page: Python stays loaded and adds only the packages the
  new study needs. The image on show is unloaded, as Unload does, and nothing of it carries over (its
  steps, its results, Python's copy of it), so the new study starts as one just opened. The study that leaves
  takes its panels, its stylesheet, its drawing and its listeners with it (each listener it adds
  outside its own panels carries `shell.signal`), and an answer its Python was still working on is
  dropped. Set by the owner on 2026-11-07, in place of a reload: the page then is what loading the new
  study's address afresh shows, element by element (each one's attributes, text, form values, scroll and open
  popups) and in the shell's own state, nothing of the study before left anywhere: not the zoom, the 3D view's
  parts, a folder Data Management had open, an edit, the remote files dialog's listing, or a ground-truth line.
  What the browser keeps carries over as a reload would keep it (who is signed in, the role, the theme, the
  user's choices, the images kept here), and so do the tab's own measures in the status bar. Test:
  `web-tests/test_study_runs.py`; and `web-tests/test_shell_states_page.py`, where every path of the shell's
  states ends by going to another study and back, each compared with a fresh load of its address.
  </details>

- `req/shell/study/viewer-choice` The viewer is the study's choice.
  <details>

  The image a study works on is shown by a viewer the study names (`viewer` in `study.json`),
  behind one interface: show the opened image, draw the study's layers over it, report a pick and a
  lasso in image coordinates, zoom and pan. The 3D viewer (`req/shell/viewer-3d`) keeps that interface and shows
  a stack in 3D in the 2D view's place, with no change to the studies that keep the 2D viewer.
  </details>

- `req/shell/study/visibility` A study declares who sees it: everyone, no one but by its address, or the Google accounts it names.
  <details>

  Set by the owner on 2026-11-04. Every `study.json` names its `visibility`: `"listed"` (the
  header's switcher offers it to everyone, and the landing page lists it), `"unlisted"` (offered
  nowhere, opened only by its address; the fixture) or `{"accounts": [email, …]}` (the switcher
  offers it only while one of those accounts is signed in, and the landing page never lists it).
  Opened at its address by anyone else, signed out or signed in with another account, the page
  says the study is shown only to the accounts it names and opens the Image Viewer instead; signing
  in with one of them offers it in the switcher at once. This hides a study from the page, not
  from the network: its files are published like any other study's, so it holds nothing secret.
  The Bookshelf Reader is shown to its owner's account alone. Test:
  `web-tests/test_study_contract.py`, `web-tests/test_published_site.py`,
  `web-tests/test_study_visibility_page.py`.
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
  release, newest first, with its date and what changed for the user. Each pull request that
  changes what users see tells it in a `Version-history:` line of one of its commit messages, at
  most 20 words, or says `Version-history: none`; a pull request changing `web/` or a study's
  `web/` without one fails the Tests workflow, and no pull request edits a shared file for it. The
  site build files each line under the release that first carried its pull request, read from
  main's history, beside the releases told before in
  [`web/version_history.md`](../../web/version_history.md). The browser remembers the version last seen; when the page has been
  updated since and the history names a change in between, a bubble points at the version saying
  "Click here to see what was updated since v…", until the user opens the history or closes the
  bubble with its ×. The history then marks the releases that are new
  (`web-tests/test_version_history.py`, `web-tests/test_version_history_page.py`).
  </details>

- `req/shell/viewer-3d` A study whose viewer is `image3d` shows a z-stack in 3D, turning it by mouse; its channel rows drive it.
  <details>

  Set by the owner on 2026-10-31, moving the 3D MicroViewer into the shell. The page reads a stack as its
  flattened planes, which the 2D view shows unchanged, and every slice of every channel
  (`req/shell/image/open`). A stack is shown in 3D only, with no switch to a flat view
  (owner, 2026-11-03: a 2D image makes no sense in 3D, nor a 3D one in 2D); only where the browser lacks
  WebGL2 does the flattened stack show instead. The 3D view casts rays through the stack in the browser (WebGL2), looking straight down
  as the microscope does. Dragging turns it about the screen's two axes, on past looking straight
  across, a sideways scroll spins it about the line of sight (owner, 2026-11-03), the wheel zooms,
  shift-drag pans, and a reset button puts the view back to the top. A Panning label at the bottom left of the 3D view always shows, filled
  blue while panning is on and outlined grey while off, its tooltip saying to press Shift to pan (owner,
  2026-11-07), a faded grey "shift" right beside it (owner, 2026-11-08); clicking it turns panning on or off, so that a plain drag
  pans instead of turning. Holding shift turns it on until shift is let go, which returns it to the state
  the label holds. That state lives only while the page is open: it is never stored or restored (owner,
  2026-11-05). The toolbar's right holds, beside Zoom, one icon button, its tooltip "Reset view to top", that puts
  the view back to looking straight down; no menu of other views (owner, 2026-11-08), and the 2D view's Zoom, which zooms the 3D view (owner,
  2026-11-04); the 2D view's other tools step aside. Brightest shows the brightest point along each
  ray, Surface a lit surface where the signal crosses a level, and colour by depth paints by the
  depth of that point so crossings at different depths read apart: the study's `view` sets the render
  it opens with. The depth is a row of the image box under the
  channels' rows, as a channel's row holds its points (owner, 2026-11-04): its first and last slice
  shown on one slider, and in the colour picker's place the spacing between slices, a box that reads with
  its unit ("1 µm") and steps up and down by its arrows and the arrow keys (owner, 2026-11-07). No count of the
  slices shown sits beside its name, and each row's picker sits at the box's right edge, its slider filling the room
  before it; a palette picker is framed as the colour picker is (owner, 2026-11-07). Colour by depth is each
  channel's own (owner, 2026-11-07): a small icon tick on each channel's own row beside its colour picker, no words
  and no palette bar beside it (owner, 2026-11-07), and while it is ticked the
  row's colour picker becomes a palette picker, since the channel is then drawn in a range of colours by the depth
  of each point, not in one colour by its brightness alone. Two channels coloured by depth each take a different
  palette, so they read apart; a study's `channels` may tick it from the start (`depth`: true, or a palette's name).
  A study drawing over the stack reads the depth colours of the first shown channel coloured by depth. The slice
  spacing comes from the file, else from the study (`view.spacing`, saying who stated it), else
  1 µm, called a guess, which the spacing's tooltip says; no text over the 3D view says it (owner, 2026-11-07). Every shown channel is drawn in its colour between the black and white
  points of its row, which redraw the 3D view as they move. The study's `view` sets the render and the
  spacing it opens with. A study draws over the 3D view, over the stack or beside it
  in the same camera, picks and drags there, and can keep only the stack inside or outside a mask of
  its own. Test: `web-tests/test_viewer3d_page.py`, and the vascular study's `req/vascular/model/correct`.
  </details>

- `req/shell/views/second` A study's item view shows what was found, behind the shell's Items switch; there is none while ground truth is made.
  <details>

  Set by the owner on 2026-11-02. A study with an item view (`#items-view` in its `views` slot) gets
  the shell's switch at the toolbar's left. The cards are small viewers of what was found; the switch reads
  "Items" with how many there are, and "Image" in the item view. The study counts them (`views.count(total)`,
  null until it has any; Vascular: its junctions and vessels) and hears which view is shown (`views.on(fn)`).
  Set by the owner on 2026-11-07: the shell turns the switch on once the study has counted its items and off
  while it has not; a study never turns it on or off itself. While the study makes ground truth for the user
  (a Ground Truth Tagger in a GT or PostGT study, `req/shell/account/role`) there is no item view and no switch:
  the tasks are listed in the left bar (`req/shell/ground-truth/tasks`), the image in the main area. Set by the
  owner on 2026-11-04: an item view marked `data-shelved` gets no switch in any role, its code kept for a later
  use; NoR's is shelved, and missingbulb/RaunTruth#740 decides whether it goes.
  Test: `web-tests/test_status_bar_page.py`, `web-tests/test_study_contract.py`.
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

  While an image is read, the page shows a spinner and the elapsed time; while a study's
  action runs (for NoR, a finder), a photocopier's light sweeps back and forth over the image, with
  what it is doing and the elapsed time below. Set by the owner on 2026-11-10, the light is the shell's: a
  study says only that it works and what it is doing, and over an image the shell sweeps it, in every study
  alike. Test: `web-tests/test_status_bar_page.py`, `studies/shelves/tests/test_shelves_page.py`.
  </details>

## `req/checks` The repo's checks

- `req/checks/ci-sets` CI runs in two sets, and a test that would skip there fails instead.
  <details>

  The fast set runs on each PR (`.github/workflows/tests.yml`, `-m "not full"`) and needs neither
  Node nor a browser; every test that drives Node, Pyodide or Chromium, or measures speed or memory,
  is marked `full` and runs only in the full set, nightly (the workflow's own schedule)
  and on every push to main, so it has run on anything a release can ship: a green full run on main
  wakes the site release (`.github/workflows/tests-full.yml`, `web-tests/test_ci_split.py`). The nightly run also
  runs the full set on Firefox and WebKit (`req/checks/other-engines`).
  </details>

- `req/checks/other-engines` Every night the full set also runs on Firefox and WebKit; their failures fail the night only once the page supports their browser.
  <details>

  Set by the owner on 2026-11-03. The nightly full run (the workflow's own schedule) runs the full
  set again on Playwright's Firefox and on its WebKit, standing for Safari; a push to main does not, and
  neither gates a release. An engine whose browser `web/browsers.json` does not list (`req/shell/browsers/supported`) reports
  its failures as a warning on the run and the night stays green; once its browser is listed, a failure
  fails the night as any other test does. A test that needs what only Playwright's Chromium offers is marked
  `chromium_only` and left out of those runs: the page's memory, read through Chromium's DevTools, and working
  offline, whose stand-in Google Drive answers the service worker's requests, which Playwright routes in Chromium only; and a check of that kind inside another test (the listeners a
  study leaves, the page's own thread's load) is made in Chromium only. Each page test's driver launches the engine `PW_ENGINE` names, so the
  same run can be made by hand: `python3 dev/tools/build/other_engines.py firefox`. Test:
  `web-tests/test_other_engines.py`.
  </details>

- `req/checks/shell-states` A tree of the shell's elements says what each shows in every state its paths reach; the matrix is generated from it, and a browser walks the paths to check it.
  <details>

  Set by the owner on 2026-11-04: a harness for developing the page and its requirements and for keeping what works
  working, which the owner does not review; its tentative and undecided cases are questions for the owner.
  `dev/requirements/shell-states.json` lists the shell's elements as a tree, each
  under the one holding it; each study with a `studies/<id>/states.json` grafts its own elements in there, under the
  shell's elements holding them, may say where a shell element differs there (its rule), and may add roots and paths
  of its own (`req/checks/spec-layout`), with the sample image or z-stack its paths load and what stands in for what
  its page reaches off the site. The shell's paths
  open the study the file names, the fixture; a study's own paths open it, on the shell's tree with its own elements
  alone grafted in. Each element gives only what differs from its parent: cases over the state (the
  study's stage, who is signed in, the role, the image open and whether it is a z-stack, the study's step done, the view, what Data Management
  has selected, whether the page is online, whether Edit Image is open, whether the image fits the view, whether it is larger than the view,
  whether a notice shows, and what the study says of itself in its
  `study.json` and panels: whether it opens images from the computer, has steps after Load, and has an item view,
  never shown when shelved, `req/shell/views/second`), each citing the requirement that decides it and marked tentative or undecided where the owner has
  not decided (an undecided case is shown and not checked). Its paths start from a few roots (a study's stage and a
  role) and take actions one after another, each state one more action on the one before: loading an image, one
  larger than the view, a z-stack or a file from the study's Drive folder, Unload, the study's first step, the view switched, a role chosen
  (to or from Ground Truth Tagger the study opens afresh), another study and Back, the notice's OK, zooming in until
  the image no longer fits, Data Management's folder, preview and Edit Image, and
  the network lost and back.
  `dev/tools/build/shell_states.py` writes from it the matrix, `dev/requirements/shell-states.GENERATED.md`, one table
  per path, and the browser test's expectations. It fails on what the walk would leave unchecked: a case no state
  reaches; a case decided only where a parent hides or folds the element, which the browser reads as gone whatever
  the case says, unless the element or the case is marked unwalked with why no path shows it (what an unwalked
  element holds goes with it); an element every state shows the same, unless marked steady with why; such a mark a
  state contradicts; an action no path takes; and a value of a var no state has. In the fast set the
  generated files must be up to date, every element in each study's tree must be on the shell's page or that
  study's panels (one the page makes as it runs, such as the 3D view's controls, by the nearest element holding it
  that the page does not make), every element of the shell's page and of each study's panels, but what a dialog,
  popup, menu or disclosure holds, must be in the shell's tree or that study's, and the tree must call an element a
  box or a control where the page does. In the full set one page per path takes the actions on its study, the study's stage set for it,
  against a stand-in Google and a stand-in Python answering what the study's own Python answers on loading and on
  opening the image, or the z-stack a path loads, and the study's own Python answering its calls once it takes its
  first step, signed in as an account the study is shown to, and at every state, the study's calls answered, reads each element as shown,
  disabled, held offline, folded or gone. After its last state, back online first, each path goes to another
  study and back (`req/shell/study/switch-in-place`), and the page in each must be what a fresh load of that address
  shows in the same browser: the whole page read element by element and the shell's own state, leaving out what
  changes between two readings of the same page (the status bar's measures of the tab, the browser's mark on what is
  scrolled out of view, an attribute left empty, the order of a class list); every difference is listed before it fails. Test: `web-tests/test_shell_states.py`,
  `web-tests/test_shell_states_page.py`.
  </details>

- `req/checks/shell-states/renders` Every state the browser walks is pictured, arrows pointing at what changed there.
  <details>

  Set by the owner on 2026-11-04. With `SHELL_STATES_RENDERS` set, the browser test keeps a picture of each state
  and an `index.html` of them, path by path. Arrows point at the elements that changed since the state before,
  only the outermost of those that changed together, and on a path's first state at what shows folded or disabled;
  a dashed arrow points where an element was before it went, and a red one at an element that is not what the
  rules say. The arrows say where to look, not what to expect. The pictures are made on demand and kept nowhere. Test: `web-tests/test_shell_states_page.py`.
  </details>

- `req/checks/spec-layout` The shell's requirements are in one spec, and each study's in its own folder.
  <details>

  Set by the owner on 2026-11-05. `dev/requirements/` holds what the shell does whichever study it runs:
  `requirements.md` has only `req/shell` and `req/checks`, and `shell-states.json` only the shell's own elements.
  Everything one study's page must do is under that study's folder: `studies/<id>/requirements.md` holds its
  requirements, one section tagged `req/<id>`, and a study whose elements the shell's states walk (the fixture
  study) gives them in `studies/<id>/states.json`, grafted into the shell's tree under the element it names.
  Removing a study's folder removes its requirements with it. Test: `web-tests/test_requirement_tags.py`,
  `web-tests/test_shell_states.py`.
  </details>
