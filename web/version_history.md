# Version history

What changed on the NoR Finder page, newest first, in the words its users read: clicking the
version in the status bar shows this list.

Each pull request that changes what a user sees adds one terse line under **Next release**, ending
with its number, `(#123)`. The site build files every such line under the release that first
carried that pull request (`web/version_history.py`, from the release commits on `main`), so
nobody has to know the version a change will ship in; `python3 web/version_history.py fold`
writes those versions into this file. Releases with no visible change are left out.

## Next release

## 0.11007.21
- The status bar shows how much memory the page is using. (#358)

## 0.11007.20
- The Summary box draws richer histograms (mean, SD and count) and holds the CSV downloads; the Downloads box becomes Ground Truth. (#361)
- Drive thumbnails come with the site, so the dialog no longer stalls the next image. (#362)
- The ground truth checklist is shorter and lists only what applies. (#360)
- The Add mask button is blue. (#357)
- A red measuring end slides only along the NoR's axis. (#359)
- Filter presets fold away with the Filters box; the presets replace "restore defaults". (#356)

## 0.11007.19
- Slow buttons show a spinner until their work is done, and a popup suggests freeing memory when the computer is low on it. (#339)
- The Image box shows what the file says about the image: field size, pixel size, bit depth and more. (#337)
- The ground truth button shows how complete your verdicts are, and Add mask lassoes the area the summary counts. (#335)

## 0.11007.18
- Each finder shows its precision and recall, and the Filters box offers three presets. (#342)
- In the Drive dialog a click selects and Open opens; TIFFs get colour thumbnails. (#341)
- Measuring ends drag freely, and a right click adds a NoR you measure yourself. (#336)
- Packages download while Python starts, and the status bar names each stage. (#338)

## 0.11003.14
- Mark candidates the finder missed and submit your ground truth as a GitHub issue. (#299)

## 0.10930.10
- Crops keep their proportions in narrow boxes. (#270)

## 0.10929.9
- The item views follow the selected candidate, verdicts are thumbs up or down, and each view has its own options. (#267)

## 0.10929.8
- The Drive dialog keeps one size and shows each file's size and date. (#265)

## 0.10929.7
- The version box lights up when a newer version of the page is out. (#256)
- A light sweeps over the image while candidates are found. (#258)
- The image paints while it downloads. (#260)
- The page no longer piles up memory when you open image after image. (#262)

## 0.10929.6
- One kind of control for every finder and filter setting. (#254)

## 0.10929.5
- Each filter shows what it rejects alone and in all; a moved dial marks our value with a tick. (#252)
- Load from Google Drive opens on the lab's folder. (#250)

## 0.10929.4
- Load images from Google Drive by pasting a shared link. (#242)
- Python starts while you choose an image; cards carry Approve and Reject. (#246)

## 0.10929.3
- Drag, zoom and step between candidates; select one to see its card; Finalists and Rejected views; ground truth downloads. (#235)

## 0.10928.2
- A help note for every finder and setting, a Show menu, and a tidier toolbar and footer. (#232)

## 1.10928.1
- The NoR Finder page: open an image, find candidates once and filter them live. (#225)
- A new layout, with Find Candidates run on demand. (#228)
- A fixed frame with scrolling columns and the site version in the footer. (#230)
