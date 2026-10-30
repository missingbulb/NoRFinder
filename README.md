# NoRFinder

**Open the site: [rauntruth.com](https://rauntruth.com/)**

Automated detection of Nodes of Ranvier

NoR Finder is for neuroscience researchers who count and measure Nodes of Ranvier in
immunofluorescence images of CNS tissue. Node number and node length change in myelin injury,
and doing either by hand means scanning hundreds of tiny Caspr–Nav1.6–Caspr triplets per image.
The page does that first pass for you, and you keep the final say: you review each candidate,
accept or reject it, correct its length, and add any node it missed.

It is built to turn a microscope image into numbers you can trust and check. You load a
three-channel ImageJ TIFF (Caspr, Nav1.6, DAPI) or an RGB PNG, from your computer or a shared
Google Drive folder. A finder proposes every candidate node, and a set of named, tunable filters
splits them into finalists and rejects, each reject showing the reason. The page then reports
count, density and length histograms for the whole image or a lassoed region, and exports them
as CSV. Your verdicts can go back to this repository as ground truth, which is what the finders
are tuned and scored against.

All of it runs in your browser: images are analysed on your own machine, never uploaded to a
server. The image analysis is the
repository's own Python code (`studies/nor/detection/`), run under Pyodide (CPython compiled to WebAssembly)
with numpy, scipy and scikit-image, inside a Web Worker so the page stays responsive. A small
bridge passes the image in and the candidates and filter results back out. The JavaScript does
everything that isn't image analysis: drawing the image and its overlays, the item views, the
measurement editors, the summary statistics, the CSVs, the Drive browser and your saved settings.
The site is plain static files served by Cloudflare, with no server and no build framework. It counts
visits with Cloudflare Web Analytics, which sets no cookies, stores nothing on your device and does
not follow you across sites; it receives the page's address, the page that
linked to it and your browser's details, never your images or results. Python and
its packages, about 50 MB, download on the first visit and are cached for 30 days. Images opened
from Google Drive are kept in your browser too, so they open again without a download, unless you
untick Auto-save images; your avatar's Manage storage lists, and deletes, everything kept.

![NoR Finder with a dense corpus callosum field: 428 candidates found, 193 finalists measured, one selected, and the summary's length histograms](docs/screenshot.png)

## For contributors

Start here: **[docs/WARMUP.md](docs/WARMUP.md)** — the repo map: the shell, the study contract and
how to add a study.

- [studies/nor/](studies/nor/docs/WARMUP.md) — the NoR Finder study: its brief, literature, finders
  and ground truth
