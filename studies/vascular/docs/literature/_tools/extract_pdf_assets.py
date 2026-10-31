#!/usr/bin/env python3
"""Step 1 of paper intake: pull the text and the embedded figure images out of a PDF.

This is the mechanical half of the intake protocol (the judgement half — reading the
paper, writing the digest, naming the figures — is the `paper-intake` skill). It is
deliberately dumb: it does not guess what a figure is, it just dumps every embedded
raster above a size floor and writes a manifest for a human/LLM to name from.

Usage:
    python3 references/_tools/extract_pdf_assets.py <paper.pdf> <out-dir> [--min-px 400]

Writes into <out-dir>:
    fulltext.txt          page-delimited text of the whole PDF (working copy, not committed)
    raw/p<NN>_x<xref>.<ext>   every embedded image whose long edge >= --min-px
    manifest.tsv          page, xref, w, h, ext, bytes, suggested filename

Then: read fulltext.txt, LOOK at each raw image, and `git mv` it to
<paper>/figures/figN_<slug>.png with a description in figures/README.md.

Requires: pymupdf (see requirements.txt).
"""
import argparse
import os
import sys

import pymupdf


def extract(pdf_path, out_dir, min_px):
    doc = pymupdf.open(pdf_path)
    raw_dir = os.path.join(out_dir, 'raw')
    os.makedirs(raw_dir, exist_ok=True)

    pages = []
    for pno in range(doc.page_count):
        pages.append(f'\n\n<<<<<<<<<< PAGE {pno + 1} >>>>>>>>>>\n')
        pages.append(doc[pno].get_text())
    with open(os.path.join(out_dir, 'fulltext.txt'), 'w') as fh:
        fh.write(''.join(pages))

    rows = []
    seen = set()
    for pno in range(doc.page_count):
        for img in doc[pno].get_images(full=True):
            xref = img[0]
            if xref in seen:        # the same xref can be placed on several pages
                continue
            seen.add(xref)
            info = doc.extract_image(xref)
            w, h, ext = info['width'], info['height'], info['ext']
            if max(w, h) < min_px:  # icons, asterisk glyphs, journal logos
                continue
            name = f'p{pno + 1:02d}_x{xref}.{ext}'
            with open(os.path.join(raw_dir, name), 'wb') as fh:
                fh.write(info['image'])
            rows.append((pno + 1, xref, w, h, ext, len(info['image']), name))

    with open(os.path.join(out_dir, 'manifest.tsv'), 'w') as fh:
        fh.write('page\txref\twidth\theight\text\tbytes\tfile\n')
        for r in rows:
            fh.write('\t'.join(str(x) for x in r) + '\n')

    print(f'{os.path.basename(pdf_path)}: {doc.page_count} pages, '
          f'{len(rows)} images >= {min_px}px -> {raw_dir}')
    for r in rows:
        print(f'  p{r[0]:>2}  {r[2]:>5}x{r[3]:<5} {r[4]:<4} {r[6]}')
    return rows


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('pdf')
    ap.add_argument('out_dir')
    ap.add_argument('--min-px', type=int, default=400,
                    help='skip images whose long edge is below this (default 400)')
    args = ap.parse_args()
    if not os.path.isfile(args.pdf):
        sys.exit(f'no such pdf: {args.pdf}')
    extract(args.pdf, args.out_dir, args.min_px)


if __name__ == '__main__':
    main()
