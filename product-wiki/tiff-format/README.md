# TIFF for microscopy: structure, dialects, tooling, pitfalls

This page covers technology only. The repo already records what *its own* files contain: 3i
SlideBook → Bio-Formats → ImageJ 1.54p; 1200 × 1200 uint16 `CYX` composite; 0.17460 µm/px stored
as `XResolution` 5.727272 with unit `micron`; LUT order not identifying the stain; no z-stack (see
`studies/nor/data/README.md`). This page explains the formats underneath those facts and what
else may arrive.

Researched 2026-10-30. The primary sources are the specification texts and the reader and writer
source code themselves. Claims marked **measured** were run in this session.

## Key insights

- NoR Finder cannot open an LZW-compressed TIFF, the usual compressed kind; a 4 MB imagecodecs wheel fixes it (measured).
- ImageJ keeps the µm unit in its text description, not the TIFF tag, and may write it as `\u00B5m`, which tifffile leaves undecoded.
- Only OME-TIFF can say which stain a channel is. ImageJ TIFF carries display colours only.
- ImageJ files over 4 GB are not BigTIFF. They hold one directory, and most readers see only the first plane.
- Bio-Formats' own docs say exporting OME-TIFF from SlideBook is the best way to keep all its metadata.


## 1. Baseline TIFF 6.0

Source: [TIFF Revision 6.0 Final, June 3 1992 (Adobe), ITU-hosted copy](https://www.itu.int/itudoc/itu-t/com16/tiff-fx/docs/tiff6.pdf).

- **Header and IFDs.** "A TIFF file begins with an 8-byte image file header that points to an
  image file directory (IFD)". Bytes 0–1 are the byte order (`II`/`MM`), bytes 2–3 the number 42,
  and bytes 4–7 the offset of the first IFD. An IFD is a 2-byte entry count, then "a sequence of
  12-byte field entries" (tag, type, count, value-or-offset), then the offset of the next IFD (p.13).
  A multi-page TIFF is a linked list of IFDs, one per plane.
- **Size limit.** "The largest possible TIFF file is 2\*\*32 bytes in length" (p.13), because
  offsets are 32 bits.
- **Strips and tiles.** Baseline images are in strips (`StripOffsets` 273, `RowsPerStrip` 278,
  `StripByteCounts` 279). Section 15 adds tiles: "Tiles are compressed individually, just as strips
  are", and boundary tiles are padded (p.66).
- **Compression.** Baseline values are 1 (none), 2 (CCITT 1D) and 32773 (PackBits). "Baseline
  TIFF readers must handle all three compression schemes" (p.17–18). LZW (5) is an *extension*
  (Section 13, p.57). Deflate (8 / 32946) is not in TIFF 6.0 at all; it is defined in later Adobe
  technical notes. A "Baseline TIFF 6.0 reader is not required to support any extensions" (p.12).
- **Resolution.** `XResolution`/`YResolution` (282/283) are RATIONALs: "the number of pixels per
  `ResolutionUnit`". `ResolutionUnit` (296) is 1 = "No absolute unit of measurement", 2 = inch,
  3 = centimeter, **default 2 (inch)** (p.38). TIFF has no µm unit.
- **Sample format.** `SampleFormat` (339, Section 19, p.80) distinguishes unsigned, signed and
  float samples. `BitsPerSample` (258) carries the bit depth.

### BigTIFF

Source: [LibTIFF BigTIFF design](https://libtiff.gitlab.io/libtiff/specification/bigtiff.html).
The version number "formerly decimal 42, changes to 43". Header bytes 4–5 = 8 (offset size),
bytes 8–15 hold an 8-byte first-IFD offset, entry counts and value/offset fields are 8 bytes,
and new types `LONG8` (16), `SLONG8` (17) and `IFD8` (18) are added. The proposed extensions are
`.tf8`/`.btf`. A classic-TIFF-only reader cannot open it.

---

## 2. ImageJ hyperstack TIFF (the dialect our inputs use)

The authoritative definition is ImageJ's own code:
[`FileSaver.getDescriptionString`](https://github.com/imagej/ImageJ/blob/master/ij/io/FileSaver.java),
[`TiffEncoder`](https://github.com/imagej/ImageJ/blob/master/ij/io/TiffEncoder.java),
[`TiffDecoder`](https://github.com/imagej/ImageJ/blob/master/ij/io/TiffDecoder.java),
[`FileOpener.decodeDescriptionString`](https://github.com/imagej/ImageJ/blob/master/ij/io/FileOpener.java),
[`Calibration`](https://github.com/imagej/ImageJ/blob/master/ij/measure/Calibration.java). The
current source is 1.54u.

### 2.1 Pixel layout

- ImageJ writes **uncompressed** data (`COMPRESSION … 1 //No Compression`, TiffEncoder) as **one
  strip per plane** (`ROWS_PER_STRIP = height`). A C × Z × T hyperstack is written as consecutive
  planes, with one IFD per plane.
- For stacks of 4 GB or more ImageJ writes **one IFD only**. It logs "Stack is larger than 4GB.
  Most TIFF readers will only open the first image". This is not BigTIFF, despite a variable
  called `bigTiff` in the encoder. tifffile documents the same thing: "ImageJ hyperstacks store
  all image data… contiguously after the first IFD. Files > 4 GB contain one IFD only"
  ([tifffile README](https://pypi.org/project/tifffile/)).

### 2.2 `ImageDescription` (tag 270) keys

The value is a `key=value\n` block that starts with `ImageJ=<version>` and is parsed as
`java.util.Properties`. Keys are written in this order, each only when it applies:

| Key | Written when | Meaning |
|---|---|---|
| `ImageJ` | always | Writer version, e.g. `1.54p` |
| `images` | more than 1 image | Total planes = channels × slices × frames |
| `channels`, `slices`, `frames` | each when > 1 | C, Z, T sizes. Plane order is **C fastest, then Z, then T** (tifffile: "ImageJ can handle up to 6 dimensions in order TZCYXS") |
| `hyperstack` | if a hyperstack | `true` |
| `mode` | if a composite image | `composite`, `color` or `grayscale` (display mode only) |
| `unit` | if calibrated | Length unit for **X/Y resolution and `spacing`**, escaped (see §2.4) |
| `cf`, `c0…c4`, `vunit`, `zeroclip` | intensity calibration | Pixel-value calibration function |
| `finterval`, `tunit`, `yunit`, `zunit` | if set and non-default | Frame interval; per-axis units |
| `spacing` | more than 1 image and z-step ≠ 1 | **Z step**, in `unit` (or `zunit`) |
| `fps`, `loop` | more than 1 image | Animation |
| `min`, `max` | 16-bit and 32-bit always; 8-bit if contrast is set | **Display range of the current channel only**, not the data range |
| `xorigin`, `yorigin`, `zorigin` | non-zero | Origin in pixels |
| `info`, `name`, `inverty`, `8bitcolor` | various | — |

### 2.3 Pixel size

- ImageJ stores pixel size as **pixels per unit** in `XResolution`/`YResolution`. The decoder
  computes `pixelWidth = 1.0/xScale`.
- The **unit lives in the description**, not in the TIFF tag. The encoder writes
  `ResolutionUnit = 1` (none) for any unit other than `inch` (2) or `cm` (3). A plain TIFF reader
  therefore sees "5.727 pixels per *no unit*"; `micron` comes only from `unit=` in the
  description.
- On reading, if the TIFF unit is cm and the description says `um`, ImageJ multiplies by 10 000.
  `Calibration.sanitizeUnit` maps `um` to `µm`. The plural helper knows `micron` → `microns`.
  Units seen in practice therefore include `micron`, `um`, `µm` and `\u00B5m`. Normalise all four.
- Z spacing is `spacing=` (with optional `zunit=`). There is no TIFF tag for it.

### 2.4 Escaping

`appendEscapedLine` writes any character outside printable ASCII, or a backslash, as
**`\uXXXX`**. So `µm` is stored as the six characters `\u00B5m`. `java.util.Properties` unescapes
this on load. **tifffile does not.** Measured with tifffile 2026.3.3:
`imagej_description_metadata('ImageJ=1.54p\nunit=\\u00B5m\n')` returns
`{'unit': '\\u00B5m'}`, with the backslash kept. Code that compares `unit` to `'µm'` fails
silently. tifffile also documents the description as Latin-1 encoded.

### 2.5 `IJMetadata` (50839) and `IJMetadataByteCounts` (50838)

These are private tags "registered with Adobe" (TiffDecoder). They appear in the **first IFD
only**. The blob starts with the magic `IJIJ` (big-endian; tifffile writes `JIJI` little-endian),
followed by typed entries:

| Type code | tifffile key | Content |
|---|---|---|
| `info` | `Info` | Image Info property, UTF-16 |
| `labl` | `Labels` | **Per-plane slice labels**, UTF-16. Bio-Formats imports often put channel or plane names here; not verified for our files |
| `rang` | `Ranges` | Display min/max per channel, as float64 pairs |
| `luts` | `LUTs` | Per-channel 3 × 256 uint8 colour tables. These are the "display colours" the repo README discusses |
| `plot` | `Plot` | Serialized plot |
| `roi ` | `ROI` | One ImageJ ROI, binary |
| `over` | `Overlays` | Overlay ROIs, binary, one entry per ROI. Parse with [roifile](https://github.com/cgohlke/roifile) |
| `prop` | `Properties` | Key/value pairs, UTF-16 |

Sources: TiffDecoder constants and tifffile's
[`imagej_metadata_tag`](https://github.com/cgohlke/tifffile/blob/master/tifffile/tifffile.py).
In tifffile, `TiffFile.imagej_metadata` merges the description keys and these entries into one
dict.

### 2.6 RGB vs composite

An ImageJ RGB image has `SamplesPerPixel = 3`, 8 bits per channel, and colour that is *part of
the data*. A composite is N separate grey planes plus N LUTs, where colour is *display only*.
The `mode` key and LUTs say how ImageJ last displayed the image, not what was acquired. The repo
README documents the consequence for our corpus.

---

## 3. OME-TIFF

Source: [OME-TIFF specification](https://ome-model.readthedocs.io/en/stable/ome-tiff/specification.html)
and the [OME 2016-06 XML schema](https://www.openmicroscopy.org/Schemas/OME/2016-06/ome.xsd).

- An OME-TIFF is a standard TIFF or BigTIFF named `.ome.tif`/`.ome.tiff` (BigTIFF also
  `.ome.tf2`, `.ome.tf8`, `.ome.btf`). It carries "a string of OME-XML metadata embedded in the
  ImageDescription tag (270) of the first IFD… UTF-8 encoded".
- **Plane order** comes from `Pixels/@DimensionOrder` (e.g. `XYZCT`), and `TiffData` elements
  (`IFD`, `FirstZ/T/C`, `PlaneCount`) map IFDs to positions. The default is IFD 0 = Z0-T0-C0, then
  rasterised in DimensionOrder. Do not assume ImageJ's C-fastest order.
- **Multi-file.** Each file carries a copy of the OME-XML. `TiffData/UUID@FileName` names the file
  holding each plane. A "partial" variant puts `BinaryOnly MetadataFile=…companion.ome` in the data
  files and the full XML in a companion file. **A browser tool given one file of a set gets only
  some of the planes.**
- **Pyramids** (since 6.0.0). Sub-resolutions are stored "using the SubIFDs TIFF extension tag
  (330)", ordered largest to smallest, and are *not* in the main IFD chain. Downsampling should be
  an integer factor, equal in X and Y.
- **Metadata fields** (schema): `Pixels@PhysicalSizeX/Y/Z` (PositiveFloat) with
  `PhysicalSizeXUnit` and the others, **default `µm`**; `Pixels@Type` (e.g. `uint16`);
  `Pixels@SignificantBits` ("e.g. you can store 12 bit data within a 16 bit type");
  `Channel@Name`, `@Fluor`, `@EmissionWavelength`, `@ExcitationWavelength`, `@Color`.
- **Relevance:** OME-TIFF is the only TIFF dialect that can say *which stain a channel is*.
  ImageJ TIFF cannot, which is why the repo identifies channels by content.

---

## 4. OME-Zarr (OME-NGFF), the cloud successor

Source: [NGFF specification 0.5](https://ngff.openmicroscopy.org/specifications/0.5/index.html).
"latest" redirects to 0.5, and a 0.9.dev2 draft is listed.

- Built on **Zarr v3**: a group's `zarr.json` holds `{"zarr_format": 3, "node_type": "group",
  "attributes": {"ome": {"version": "0.5", …}}}`. Each resolution level is a separate Zarr array
  of chunk files.
- `multiscales` → `axes` (type `space`/`time`/`channel`, with units from UDUNITS-2, e.g.
  `micrometer`) and per-level `coordinateTransformations` (scale, translation) mapping array
  indices to physical coordinates. This is where pixel size and z spacing live.
- Channel display (colours, windows) sits in the `omero` block. `bioformats2raw.layout` marks a
  container produced by bioformats2raw.
- **Relevance:** a directory of many small files is a poor fit for a single-file upload, but a
  good fit for range-read remote viewing (vizarr, Viv, Neuroglancer). `zarr` 3.2.1 is in Pyodide
  314.

---

## 5. Vendor formats and how they reach TIFF

From the Bio-Formats [supported formats table](https://bio-formats.readthedocs.io/en/stable/supported-formats.html):

| Vendor format | Extension | Bio-Formats reader | Pure-Python reader on PyPI (licence) |
|---|---|---|---|
| 3i SlideBook ≤ 6 | `.sld` | SlidebookReader. "Officially Supported Versions: 4.1, 4.2, 5.0, 5.5, 6.0" ([page](https://bio-formats.readthedocs.io/en/stable/formats/3i-slidebook.html)) | none found |
| 3i SlideBook 7 | `.sldy` | SlideBook7Reader. "a small number of datasets"; 3i specs are not redistributable ([page](https://bio-formats.readthedocs.io/en/stable/formats/3i-slidebook-7.html)) | none found |
| Zeiss | `.czi` | yes | `czifile` (BSD-3) |
| Nikon NIS-Elements | `.nd2` | yes | `nd2` (BSD-3) |
| Leica LAS AF | `.lif` | yes | `liffile` (BSD-3), `readlif` (GPL-3) |
| Olympus FluoView / OIR | `.oib/.oif` / `.oir` | yes | `oiffile` (BSD-3) for OIB/OIF |
| Bitplane Imaris | `.ims` (HDF5) | yes | — (h5py; not in Pyodide, not checked) |

On SlideBook, the Bio-Formats page says it "is not likely to support the full range of metadata
that is included in .sld files, and so **exporting to OME-TIFF from SlideBook is the best way to
ensure that all metadata is preserved**. Free software from 3i can export the files to OME-TIFF".
It adds that 3i "also develops a native SlideBook reader which works with Bio-Formats". For our
pipeline this is the cheapest way to get channel names and wavelengths into the files.

**Conversion tools.**

- **`bfconvert`** ([docs](https://bio-formats.readthedocs.io/en/stable/users/comlinetools/conversion.html)):
  "By default, all images will be written uncompressed"; `-compression LZW` is its own example.
  It also has `-series`, `-channel`, `-tilex/-tiley`, `-bigtiff` (automatic above 4 GB, disabled
  by `-nobigtiff`), `-noflat -pyramid-resolutions N -pyramid-scale S`, and `-nolookup`.
- **`bioformats2raw`** converts any Bio-Formats input "to a Zarr structure compatible with the
  OME-NGFF specification". **`raw2ometiff`** then writes a pyramidal OME-TIFF. Both need Java 11+
  and are GPL-2.0 ([bioformats2raw](https://github.com/glencoesoftware/bioformats2raw),
  [raw2ometiff](https://github.com/glencoesoftware/raw2ometiff)).
- Fiji "Bio-Formats Importer", then Save As TIFF: this is how our files were made, and it yields
  the ImageJ dialect of §2.

---

## 6. Python tooling

- **tifffile** (BSD-3, pure Python, needs numpy;
  [PyPI](https://pypi.org/project/tifffile/), [source](https://github.com/cgohlke/tifffile)). It
  reads TIFF, BigTIFF, ImageJ hyperstacks, OME-TIFF, LSM, NDPI and more.
  - `TiffFile.series[0].axes` gives the axes string (e.g. `'CYX'`, `'TZYX'`), and
    `.series[0].asarray()` the data. `TiffFile.imagej_metadata` returns the merged
    description and IJMetadata dict, `TiffFile.ome_metadata` the raw OME-XML string, and
    `is_imagej`/`is_ome` say which dialect a file is.
  - `TiffPage.resolution`, `resolutionunit` and `get_resolution()` read the raw tags. Combine them
    with `imagej_metadata['unit']` yourself.
  - **Codecs:** tifffile delegates compression to `imagecodecs`. When that is missing it falls
    back to a bundled `_imagecodecs.py` that implements only zlib/Deflate (8, 32946, 50013),
    LZMA, Zstd, PackBits and some packing helpers. LZW (5), JPEG, JPEG 2000 and the rest raise
    `"<COMPRESSION.LZW: 5> requires the 'imagecodecs' package"`.
- **bioio** (BSD-3) is the successor to **aicsimageio**, which "is now in maintenance mode only"
  ([aicsimageio README](https://github.com/AllenCellModeling/aicsimageio)). Its `BioImage` exposes
  `dims` (`TCZYX`) and `xarray_data`, and it uses per-format plug-ins (`bioio-ome-tiff`,
  `bioio-tifffile`, `bioio-nd2`, `bioio-czi`, `bioio-lif`, `bioio-bioformats`)
  ([README](https://github.com/bioio-devs/bioio)). It depends on `dask[array]`, which is not in
  Pyodide 314.
- **pyometiff** (GPL-2.0+) has `OMETIFFReader`/`OMETIFFWriter` and aims at fuller OME-XML tag
  coverage ([README](https://github.com/filippocastelli/pyometiff)). It depends on tifffile,
  **imagecodecs** and `lxml<6`, while Pyodide ships lxml 6.1.3.
- **roifile** (BSD-3, pure Python) reads `.roi`/`.zip` and TIFF overlays.

## 7. JavaScript and in-browser decoding

| Library | Licence | Bit depth | Compression | Notes |
|---|---|---|---|---|
| **geotiff.js** ([README](https://github.com/geotiffjs/geotiff.js)) | MIT | (U)Int8/16/32, Float16/32/64 | none, PackBits, **LZW**, Deflate (with predictor), JPEG, LERC, Zstandard | `fromArrayBuffer`/`fromBlob`/`fromUrl`, then `getImage(i)` and `readRasters()`. "Limited bigTIFF support". Has a worker pool. Tags are read via `fileDirectory.getValue(...)`. |
| **UTIF.js** ([README](https://github.com/photopea/UTIF.js)) | MIT | Raw `data` per IFD | codes 1, 3, 4, 5, 6, 7, 8, 32773, 32809 | `UTIF.decode` returns IFDs keyed `tNNN`, so `t270` is the ImageDescription. `toRGBA8` downsamples to 8-bit for display. |
| **tiff.js** ([README](https://github.com/seikichi/tiff.js)) | libtiff licence + zlib | 8-bit RGBA output | As compiled libtiff | Uses only `TIFFReadRGBAImage` and friends, so 16-bit data reaches you already reduced to 8-bit RGBA. Unsuitable for quantitative work. |

**Measured in this session.** This used Pyodide 314.0.7 under Node 22 (`npm i pyodide@314.0.7`),
tifffile 2026.3.3, and 64 × 64 uint16 test TIFFs written by Pillow:

| Compression | tifffile alone | tifffile + `imagecodecs-2026.10.10-cp312-abi3-pyemscripten_2026_0_wasm32.whl` (4.07 MB, from PyPI) |
|---|---|---|
| LZW (5) | **FAIL**: "requires the 'imagecodecs' package" | ok, bit-identical |
| Adobe Deflate (8) | ok | ok |
| PackBits (32773) | ok | ok |

So NoR Finder as pinned today reads ImageJ-native (uncompressed) and Deflate files. It **rejects
an LZW TIFF**, which is what `bfconvert -compression LZW` produces and the most common choice
when a researcher ticks "compress". Either add the imagecodecs Pyodide wheel (4 MB) or decode in
JS with geotiff.js and pass the arrays to Python.

---

## 8. Pitfalls checklist for a browser tool

1. **Channel order vs LUT.** Index, LUT colour and `mode` are display state. Only OME-XML
   `Channel@Name/EmissionWavelength` identifies a stain. (The repo README has the corpus facts.)
2. **16-bit display.** Data is uint16 (often 12-bit or 14-bit significant, per OME
   `SignificantBits`). The `min`/`max` and `Ranges` values are a *display window*, not the data
   range. Scale for display with a percentile or the stored range, and never analyse the 8-bit
   display copy.
3. **Units.** The unit string can be `micron`, `um`, `µm` or the literal `\u00B5m` (§2.4). TIFF
   `ResolutionUnit` is 1 in ImageJ files, and the default 2 (inch) applies when the tag is
   absent. A file with no calibration reads as 72 or 1 "pixels per inch", which is not a
   microscope pixel size. Treat it as uncalibrated, not as a number.
4. **Resolution is pixels per unit.** µm/px = 1 / XResolution. Inverting it wrongly gives 5.73
   instead of 0.1746.
5. **Plane order.** ImageJ is C-fastest (TZCYX). OME-TIFF follows `DimensionOrder`/`TiffData`.
   Use tifffile's `series.axes` rather than assuming either.
6. **Compression.** See §7. LZW needs imagecodecs in Pyodide, and JPEG or JPEG 2000 compression
   is lossy and should be refused for quantification.
7. **File size.** Pyodide is `wasm32` ([lock](https://cdn.jsdelivr.net/pyodide/v314.0.7/full/pyodide-lock.json)),
   so linear memory is addressed by 32 bits and grows in 64 KiB pages
   ([Wasm runtime spec](https://webassembly.github.io/spec/core/exec/runtime.html)). That gives a
   ≤ 4 GiB ceiling, shared by the file bytes, the decoded array and every intermediate.
   Classic TIFF stops at 2³² bytes. ImageJ files over 4 GB have a single IFD (§2.1), and BigTIFF
   support in geotiff.js is "limited".
8. **Multi-file OME-TIFF and pyramids.** One uploaded file of a multi-file set is incomplete.
   SubIFD pyramid levels are invisible to readers that only walk the main IFD chain.
9. **Overlays.** ImageJ overlays and ROIs (`over`/`roi `) can ride inside the TIFF. A user's
   hand annotations may already be there.

## 9. Where each format keeps the key metadata

| Fact | Baseline TIFF | ImageJ TIFF | OME-TIFF | OME-Zarr 0.5 | Vendor (.sld/.czi/.nd2/.lif…) |
|---|---|---|---|---|---|
| **Pixel size (X/Y)** | `XResolution`/`YResolution` in px per inch or cm (`ResolutionUnit`) | Same tags in px per `unit`; `ResolutionUnit=1`; `unit=` in ImageDescription | `Pixels@PhysicalSizeX/Y` + `…Unit` (default µm) | `coordinateTransformations` scale + `axes[].unit` | Vendor metadata, surfaced by Bio-Formats as OME-XML `PhysicalSize*` |
| **Channel identity** | none | none (only LUT colours in IJMetadata `luts`, maybe `Labels`) | `Channel@Name`, `@Fluor`, `@EmissionWavelength`, `@ExcitationWavelength`, `@Color` | `omero.channels` (label, colour, window) | Vendor metadata, mapped to OME `Channel` by Bio-Formats (completeness varies; SlideBook "not likely" full) |
| **Z spacing** | none | `spacing=` (+ `zunit=`) in ImageDescription | `Pixels@PhysicalSizeZ` + unit | z-axis scale in `coordinateTransformations` | Vendor metadata, mapped to `PhysicalSizeZ` |
| **Bit depth** | `BitsPerSample`, `SampleFormat` | Same (ImageJ: 8, 16, 32-float, RGB) | `Pixels@Type`, `@SignificantBits` | Zarr array `data_type` | Vendor, mapped to `Pixels@Type`/`SignificantBits` |
| **Dimension order** | IFD sequence only | `channels/slices/frames`, C fastest | `DimensionOrder` + `TiffData` | `axes` order | Vendor |

---

## Sources

- [TIFF Revision 6.0 Final, June 3 1992 (Adobe), ITU-hosted copy](https://www.itu.int/itudoc/itu-t/com16/tiff-fx/docs/tiff6.pdf)
- [LibTIFF BigTIFF design](https://libtiff.gitlab.io/libtiff/specification/bigtiff.html)
- [`FileSaver.getDescriptionString`](https://github.com/imagej/ImageJ/blob/master/ij/io/FileSaver.java)
- [`TiffEncoder`](https://github.com/imagej/ImageJ/blob/master/ij/io/TiffEncoder.java)
- [`TiffDecoder`](https://github.com/imagej/ImageJ/blob/master/ij/io/TiffDecoder.java)
- [`FileOpener.decodeDescriptionString`](https://github.com/imagej/ImageJ/blob/master/ij/io/FileOpener.java)
- [`Calibration`](https://github.com/imagej/ImageJ/blob/master/ij/measure/Calibration.java)
- [tifffile README](https://pypi.org/project/tifffile/)
- [roifile](https://github.com/cgohlke/roifile)
- [`imagej_metadata_tag`](https://github.com/cgohlke/tifffile/blob/master/tifffile/tifffile.py)
- [OME-TIFF specification](https://ome-model.readthedocs.io/en/stable/ome-tiff/specification.html)
- [OME 2016-06 XML schema](https://www.openmicroscopy.org/Schemas/OME/2016-06/ome.xsd)
- [NGFF specification 0.5](https://ngff.openmicroscopy.org/specifications/0.5/index.html)
- [supported formats table](https://bio-formats.readthedocs.io/en/stable/supported-formats.html)
- [page](https://bio-formats.readthedocs.io/en/stable/formats/3i-slidebook.html)
- [page](https://bio-formats.readthedocs.io/en/stable/formats/3i-slidebook-7.html)
- [docs](https://bio-formats.readthedocs.io/en/stable/users/comlinetools/conversion.html)
- [bioformats2raw](https://github.com/glencoesoftware/bioformats2raw)
- [raw2ometiff](https://github.com/glencoesoftware/raw2ometiff)
- [source](https://github.com/cgohlke/tifffile)
- [aicsimageio README](https://github.com/AllenCellModeling/aicsimageio)
- [README](https://github.com/bioio-devs/bioio)
- [README](https://github.com/filippocastelli/pyometiff)
- [README](https://github.com/geotiffjs/geotiff.js)
- [README](https://github.com/photopea/UTIF.js)
- [README](https://github.com/seikichi/tiff.js)
- [lock](https://cdn.jsdelivr.net/pyodide/v314.0.7/full/pyodide-lock.json)
- [Wasm runtime spec](https://webassembly.github.io/spec/core/exec/runtime.html)

## Growth log

- **2026-10-30** — page created. The TIFF, ImageJ and OME structure was read from the specs and
  writer source; the LZW-in-Pyodide failure and the imagecodecs fix were measured.

## Open questions

- Should NoR Finder vendor the imagecodecs wheel, or decode TIFFs in JavaScript with geotiff.js?
- Do the owner's Bio-Formats-to-ImageJ exports put channel names in `Labels`?

## Gaps / not verified

- **What `Labels` holds in Bio-Formats-to-ImageJ exports** (channel names? `.sld` plane titles?)
  was not checked on our files.
- **ImageJ's handling of OME-XML** when a Bio-Formats import is saved as ImageJ TIFF (whether any
  OME fields survive into the `info`/`prop` entries) was not checked.
- **Pure-Python vendor readers** (`czifile`, `nd2`, `liffile`, `oiffile`) were only looked up on
  PyPI. None was run in Pyodide. Several need imagecodecs for compressed data. No `.sld`/`.sldy`
  Python reader was found.
- **`.sldy` layout:** Bio-Formats says the 3i specs are not redistributable. The on-disk
  structure was not researched.
- **geotiff.js** reading of ImageJ's private tags 50838/50839 (whether it exposes unknown tags
  through `getValue`) was not tested. UTIF exposes any tag as `tNNN` per its README, which was
  not tested either.
- **imagecodecs in Pyodide** was tested only on LZW, Deflate and PackBits decoding of 2D uint16.
  JPEG, Zstd and LERC, multi-page files and memory use were not.
- **Browser memory limits** in practice (per-tab caps below 4 GiB, mobile Safari) were not
  measured. The 4 GiB figure follows from 32-bit addressing.
- **OME-NGFF 0.5** was read for its structure. The exact `omero` block schema, and what changes
  in the 0.9 draft, were not read.
- **TIFF Technical Note for Deflate (code 8)** was not fetched. "Defined outside TIFF 6.0"
  rests on its absence from the 6.0 text and on tifffile's code mapping.
