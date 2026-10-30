# Version history

What changed on the NoR Finder page, newest first, in the words its users read: clicking the
version in the status bar shows this list.

Each pull request that changes what a user sees adds one terse line under **Next release**, ending
with its number, `(#123)`. The site build files every such line under the release that first
carried that pull request (`dev/tools/build/version_history.py`, from the release commits on `main`), so
nobody has to know the version a change will ship in; `python3 dev/tools/build/version_history.py fold`
writes those versions into this file. Releases with no visible change are left out.

## Next release
- The Drive dialog loads thumbnails only for the rows you can see and the next few, and no longer mixes in a folder you have just left. Each TIFF says whether it is a 3D stack or a flat image, and a stack you open gets a small 3D thumbnail. When Google throttles the site's downloads, the dialog says so and counts down 15 minutes before trying again. (#586)
- The status bar shows the study's stage and the steps you've done, with the next one glowing; hover a step to see what was done. RAM opens what uses memory, with Run GC, and Disk opens Manage storage. (#587)
- Switching study no longer reloads the page: the image you have open stays open in the new study, and each study has its own address, like rauntruth.com/nor. The study menu looks like GitHub's, with a search box, and ends with Submit New Study Request. (#585)
- Load's dropdown now lists the images you opened lately from Google Drive, each opening at once from the copy kept on this device; a small Drive logo marks them and From Google Drive, and a computer marks From this computer. (#583)
- The title at the top is now a menu for switching between studies. The page opens on a plain Image Viewer that shows any TIFF or PNG; NoR Finder is one pick away, at rauntruth.com/?study=nor. (#574)
- The finder list shows each finder's precision and recall, and the Filters box opens with the Precise, Balanced and Recalling presets. (#572)
- The page now opens at rauntruth.com/ itself; old /web/ links forward there. The Drive dialog no longer shows ready-made thumbnails of the lab's images, only of images you have opened. (#566)
- The page has a new address, rauntruth.com; the old one forwards there. Settings and saved images stay with the old address, so set them again once. (#546)
- The Drive dialog auto-saves the images you open, so they open again without a download (untick Auto-save images to stop); "Download thumbnails" is now "Show thumbnails", and the size beside them opens Manage storage, whose sections now start folded. (#446)
- Click your avatar, top right, and choose Manage storage to see and delete what the site keeps on this device. (#438)
- Animations out of view pause, so they no longer keep the CPU busy; Memory Usage now comes close to Chrome's own count. (#377)
- Find candidates leaves about 130 MB less memory behind. (#379)
- NoRs you add are numbered after the found candidates, and that one number is used on the image, the cards, the CSV and the ground truth. (#373)
- Each item view can sort its cards: by number, verified first or last, or (rejected) most filters first. (#374)
- Click the version in the status bar to see this history; after an update, a bubble points at it. (#369)

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
