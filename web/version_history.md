# Version history

What changed on the NoR Finder page, newest first, in the words its users read: clicking the
version in the status bar shows this history.

Each release is told in at most three paragraphs of at most 60 words, each ending with the pull
requests it tells of, `(#12, #34)`. A pull request that changes what a user sees works itself into
the story under **Next release**, and the site build files each paragraph under the release that
carried all its pull requests. The `writing-version-history` skill says how.

## Next release

The Tasks button switches to the tasks again after you Unload an image and load another; before,
it did nothing until the page was reloaded. (#711)

A z-stack now opens in 3D only, with no 2D/3D switch, the Image Viewer included, while a flat image
opens in 2D; a plain multi-page TIFF opens as a stack in Vascular Measurements too. Edit Image on a
stack leaves out Crop, the cut lines and Imperfections. In the Image Viewer the Image box stays open
once loaded. (#702, #707, #713)

The left bar collapses from the chevron at its top, where the collapsed strip shows its own, so the
same spot opens it again. Dragging the bar's edge to the left also collapses it, and dragging the
strip's edge out opens it. A folded drawer opens from a click anywhere on it, not just its title.
(#709, #714)

An image opening in NoR Finder now builds in grey while it downloads, and its colours wipe down over it once it is in; one opened from this computer fades in. No more stray colours that looked like a glitch before the image settled. (#715)

## 0.11103.79

This version history tells each release in a few short paragraphs, instead of a line for every
change. (#701)

A Wi-Fi icon in the status bar says whether you are online, crossed out in red when offline, and
opens where you set up working offline. The bug icon sits beside the version and stays put as the
gauge unfolds, and losing the internet while a study loads says plainly what it needs, instead of an
error. (#692)

## 0.11103.78

Collapse the left bar with the ‹ tab beside the image to give the image the whole width: a narrow
Steps strip keeps the steps' marks, and clicking it brings the bar back. The study switcher's button
shows the open study's icon, and the Image Viewer has its own, a microscope. (#690, #697)

## 0.11103.77

In the 3D view, a sideways scroll spins the stack about the line of sight, and dragging turns on
like a trackball instead of stopping side-on. Switching study unloads the open image, and a popup
grows out of the button that opened it. Choose folders… in Data Management opens Google's permission
window again. (#686, #689, #691, #694)

## 0.11103.76

The study switcher shows each study's own icon beside its name. In Data Management, a folder whose
previews file is damaged shows its images without previews instead of failing. (#683, #684)

## 0.11103.75

LZW-compressed TIFFs, as ImageJ and bfconvert write them, open. (#676)

## 0.11103.74

The big spinner shows again while the page waits for Python. (#674)

## 0.11103.73

Firefox 147 and Safari 26, and later, are supported browsers: the status bar no longer warns in
them, and the site lists them. (#672)

## 0.11103.72

In a browser without 3D graphics, a z-stack opens flattened and Vascular Measurements' cards show
their pictures instead of failing. A toolbar's popup closes when the pointer leaves it. (#662)

## 0.11103.71

Edit Image replaces Split into parts in Data Management's Preprocessing: split an image 2 × 2 or 3 ×
3, crop it, keep a range of slices, drop channels and lasso imperfections out of every slice, seeing
the result in 2D and 3D. Save… puts the files in a folder beside the image in Google Drive, or
downloads them. (#667)

## 0.11103.70

Data Management, for a study's data managers: browse the study's Google Drive folders, see which
images have previews and ground truth, make the missing previews, mark images as needing ground
truth and open one quickly from its preview. Preprocessing now lives there. (#651)

The status bar's storage, memory, network and CPU fold into one gauge icon that opens by itself when
something needs attention; offline, the network icon carries a red mark and the page recovers by
itself when the connection returns. A bug icon opens a GitHub issue already filled in with what you
were doing. (#656, #658, #659)

Popups and tips stay attached to their button when the window is resized, and open from the keyboard
too. (#657)

## 0.11102.69

The site works offline: once opened it runs without the internet, and Manage storage makes a whole
study available offline, with its Drive images, or deletes it. It can be installed as an app. (#645)

The app moved to rauntruth.com/app, each study to rauntruth.com/app/<study>, and rauntruth.com
explains what the site is. Opening the page asks whether to sign in with Google or continue
anonymously. (#649, #650)

Item View is now Tasks, counting what still waits for your verdict, with Submit Ground Truth at its
top and waiting cards marked blue and listed first. (#648)

## 0.11101.68

Load's recent images are listed per study. Animations turned off stay off on your next visit and
follow you when signed in. (#632)

## 0.11031.67

A new study, Vascular Measurements, opens confocal z-stacks of blood vessels in 3D, turning them,
colouring by depth and flattening to 2D, and opens the draft vessel model drawn for a stack: correct
its vessels, draw the missed ones, mark damaged areas, and submit the corrected model as ground
truth. Load from Google Drive opens on each study's own folder. (#620)

Sign in with Google to carry your settings to every device, kept in a hidden file in your own Drive,
and change them all in one place in Settings…. The privacy policy and terms of service are linked
from your avatar's menu. (#624)

Animations can be turned off, the minimap folds into its toolbar button, the status bar's numbers
roll like a clock, and Preprocessing is in every study. (#627, #628, #629, #630)

## 0.11031.66

Preprocessing has Split into parts: cut a large image into 4 or 9 TIFFs to annotate one at a time,
leaving out parts, channels or slices, and download them all as one ZIP. Each part keeps the image's
scale and colours. (#621)

## 0.11031.65

Double click a candidate on the image to open its card, or a card to see it on the image. Long lists
of cards open at once. (#617)

## 0.11031.64

The left bar's boxes are now numbered drawers in one panel, each checked off once done, its folded
title saying what was done. Algorithms and Post-processing are renamed Processing and
Postprocessing. (#616)

## 0.11031.63

A minimap hovers over the image's corner whenever the image is larger than the view, and each
channel has its own brightness slider and name. The right bar is gone: the selected candidate's card
floats over the image, and Submit Ground Truth sits in the toolbar. (#612)

The status bar's resources are small icons opening one dialog, and the study's stage is a traffic
light; clicking the glowing step presses its button. (#610)

## 0.11031.62

A Drive folder can carry a rauntruth-previews.tiff: the dialog then shows every image it covers at
once, with no download each. (#605)

## 0.11031.61

Switching study no longer reloads the page, and each study has its own address. The left bar is now
Load Image, Preprocessing, Algorithms, Post-processing and Summary, each box opening once useful.
The status bar shows the study's stage and your steps, the next one glowing. (#585, #587, #597)

Ruler and Grid buttons measure the image and draw a grid over it, in µm when the file gives a pixel
size. (#594, #596)

Load lists the images you opened lately from Google Drive, opening them at once from this device
while they are unchanged on Drive. The Drive dialog loads thumbnails only as you scroll, marks 3D
stacks, and waits out Google's throttling. (#583, #586, #595)

## 0.11030.60

The title at the top is now a menu for switching between studies. The page opens on a plain Image
Viewer that shows any TIFF or PNG; NoR Finder is one pick away. (#574)

## 0.11030.58

The finder list shows each finder's precision and recall, and the Filters box opens with the
Precise, Balanced and Recalling presets. (#572)

## 0.11030.55

The page has a new address, rauntruth.com, and opens there itself; old links forward. Settings and
saved images stay with the old address, so set them again once. The Drive dialog shows thumbnails
only of images you have opened. (#546, #566)

## 0.11011.35

The Drive dialog auto-saves the images you open, so they open again without a download, and the size
beside its thumbnails opens Manage storage. (#446)

## 0.11011.34

Click your avatar, top right, and choose Manage storage to see and delete what the site keeps on
this device. (#438)

## 0.11007.26

Animations out of view pause, so they no longer keep the CPU busy; Memory Usage now comes close to
Chrome's own count. (#377)

## 0.11007.25

Find candidates leaves about 130 MB less memory behind. (#379)

## 0.11007.24

Each item view can sort its cards: by number, verified first or last, or (rejected) most filters
first. (#374)

## 0.11007.23

NoRs you add are numbered after the found candidates, and that one number is used on the image, the
cards, the CSV and the ground truth. (#373)

## 0.11007.22

Click the version in the status bar to see this history; after an update, a bubble points at it.
(#369)

## 0.11007.21

The status bar shows how much memory the page is using. (#358)

## 0.11007.20

The Summary box draws richer histograms and holds the CSV downloads; the Downloads box becomes
Ground Truth, with a shorter checklist. Drive thumbnails come with the site, so the dialog no longer
stalls the next image. (#360, #361, #362)

Filter presets fold away with the Filters box, a red measuring end slides only along the NoR's axis,
and Add mask is blue. (#356, #357, #359)

## 0.11007.19

Slow buttons show a spinner until their work is done, and a popup suggests freeing memory when the
computer is low on it. The Image box shows what the file says about the image. The ground truth
button shows how complete your verdicts are, and Add mask lassoes the area the summary counts.
(#335, #337, #339)

## 0.11007.18

Each finder shows its precision and recall, and the Filters box offers three presets. In the Drive
dialog a click selects and Open opens, with colour TIFF thumbnails. Measuring ends drag freely, a
right click adds a NoR you measure yourself, and packages download while Python starts. (#336, #338,
#341, #342)

## 0.11003.14

Mark candidates the finder missed and submit your ground truth as a GitHub issue. (#299)

## 0.10930.10

Crops keep their proportions in narrow boxes. (#270)

## 0.10929.9

The item views follow the selected candidate, verdicts are thumbs up or down, and each view has its
own options. (#267)

## 0.10929.8

The Drive dialog keeps one size and shows each file's size and date. (#265)

## 0.10929.7

The version box lights up when a newer version of the page is out. A light sweeps over the image
while candidates are found, the image paints while it downloads, and the page no longer piles up
memory when you open image after image. (#256, #258, #260, #262)

## 0.10929.6

One kind of control for every finder and filter setting. (#254)

## 0.10929.5

Each filter shows what it rejects alone and in all; a moved dial marks our value with a tick. Load
from Google Drive opens on the lab's folder. (#250, #252)

## 0.10929.4

Load images from Google Drive by pasting a shared link. Python starts while you choose an image;
cards carry Approve and Reject. (#242, #246)

## 0.10929.3

Drag, zoom and step between candidates; select one to see its card; Finalists and Rejected views;
ground truth downloads. (#235)

## 0.10928.2

A help note for every finder and setting, a Show menu, and a tidier toolbar and footer. (#232)

## 1.10928.1

The NoR Finder page: open an image, find candidates once and filter them live, in a fixed frame with
scrolling columns and the site version in the footer. (#225, #228, #230)
