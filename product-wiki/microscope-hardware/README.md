# Microscope hardware: what software receives

This page covers how the microscope, its camera or detector, and its acquisition software shape the
pixel values and metadata that an analysis tool receives. It leaves out biology and any optics that do
not set the pixels. File formats and readers are covered in [TIFF for microscopy](../tiff-format/README.md),
and analysis software in [microscopy tools](../microscopy-tools/README.md). This page does not repeat them.

## Key insights

- In 10 of the lab's files, up to 16% of a channel's pixels are exactly 0: the camera offset was subtracted and the floor clipped.
- One sampled channel still sits on the camera's ~100 offset, so channels in one file can have different zero levels.
- In the Prime 95B's 12-bit mode, 4095 means full inside a 16-bit file. No sampled lab pixel is above 3,781.
- 11 µm ÷ 63 gives about 1.3–1.5 pixels per resolution limit, below the 2.3 that camera maker Andor calls ideal.
- Bio-Formats reads no wavelengths or stage positions from SlideBook .sld files. It maps 34 fields from SlideBook and 181 from ZEISS.
- SlideBook's newer .sldy is a folder of NumPy arrays and YAML files. Python can read it, but it is not a single file.
- Pixel size is whatever the software was told. Leica LIF readers once disagreed by one pixel's width.

## 1. Microscope types, by what they output

| Type | Detector | What one acquisition writes | What sets the pixel grid |
|---|---|---|---|
| Widefield | Camera (sCMOS, EMCCD, CCD) | One frame per channel × z × t × position. The frame is the camera's full sensor, or its ROI or binned size | Camera pixel ÷ total magnification (§3) |
| Spinning-disk confocal (e.g. Yokogawa CSU-W1, inside 3i's Marianas) | Camera | Same as widefield. The disk only removes out-of-focus light | Camera pixel ÷ magnification. An optional SoRa magnification changer adds **1×, 2.8× or 4.0×** in the light path ([Yokogawa SoRa](https://yokogawa.com/us/solutions/products-platforms/life-science/spinning-disk-confocal/super-resolution)) |
| Point-scanning confocal / multiphoton | Point detectors: PMT, GaAsP, hybrid (HyD) | One image per detector channel, built pixel by pixel from the scan. Frame size is chosen in software | Scan field, zoom and the chosen pixel count, not a sensor. See below |
| Light-sheet | Camera | Large z-stacks, often tiled, sometimes skewed volumes that must be deskewed (§5) | Camera pixel ÷ magnification. The z step is set by how the sheet or stage moves |

- **Spinning disk with SoRa.** Yokogawa pairs the 2.8× changer with a 100× objective and the 4.0× with a 60×. It quotes an "effective scan field of view" of 61 × 57 µm and 71 × 67 µm, and XY resolution of 150 nm, or 120 nm after deconvolution ([Yokogawa SoRa](https://yokogawa.com/us/solutions/products-platforms/life-science/spinning-disk-confocal/super-resolution)). The same page lists 3i (Marianas, VIVO) as a CSU partner. If the changer is in the path and the software does not know it, the recorded pixel size is wrong by 2.8× or 4×. The lab's 0.1746 µm/px = 11 µm ÷ 63 shows that the changer was **not** in use for those files (derived from `studies/nor/data/README.md`).
- **Point detectors.** Leica's Power HyD S detectors run in two modes: "analog" detection, which "delivers the highest dynamic range", and **photon counting**, with "ultra-low dark noise". Leica's newer "Power Counting" claims "more than twice dynamic range" over classical counting, because it can tell overlapping photons apart ([Leica, The Power HyD Detector Family](https://www.leica-microsystems.com/the-power-hyd-detector-family/)). In counting mode a pixel value is a photon count, not an amplified voltage. Detector gain (high voltage) and offset are recorded in the vendor file, and Bio-Formats maps `Detector:Gain`/`Offset` from CZI, LIF and OIR files (§4 table).
- **Scanning under SlideBook.** 3i's Scanning module drives galvanometer scanners "via resonant scanning or standard x,y scanning" for point-scanning confocal and multiphoton imaging ([3i SlideBook](https://www.intelligent-imaging.com/slidebook)).

## 2. Cameras

### 2.1 The linear camera model (EMVA 1288)

The EMVA 1288 standard models a camera with one **overall system gain K, in DN/e⁻** (digital numbers per electron). The mean output is `µy = µy.dark + K·µe`, where the **dark signal** `µy.dark` is what the camera reads with no light ([EMVA 1288 Release 4.0 Linear, 16 June 2021](https://www.emva.org/wp-content/uploads/EMVA1288Linear_4.0Release.pdf), Eq. 5). Two consequences matter for software:

- "The mean dark gray value µy.dark must be higher than zero so that no significant underflow occurs." The **offset is deliberate.** A raw camera frame never legitimately contains many zeros.
- "The saturation capacity must not be confused with the full-well capacity… the signal is clipped to the maximum digital value 2ᵏ−1 before the physical saturation of the pixel is reached." Saturation therefore shows up as a pile-up at **2ᵏ−1 of the camera's mode**, not at 65535 (§2.4).
- Pixel-to-pixel offset differences are **DSNU** and gain differences are **PRNU**. The standard calls "fixed pattern noise" a misleading name for them (same document, §4).

Camera makers state the inverse, in **e⁻ per grey level**. Photometrics: "Signal in Electrons = (Signal in Grey Levels − Bias) × Gain". Its worked example says the Prime 95B "has a bias of ~100 and a gain of ~1.18". Bias and gain for each camera are on its Certificate of Performance ([Teledyne Photometrics Prime 95B Customer Applications Handbook](https://psirep.com/system/files/2025-02/Teledyne%20DALSA%20Prime%2095B%20Customer%20Applications%20Handbook.pdf), "Measuring Camera Bias", p. 105). The handbook does not say which readout mode that example used.

### 2.2 sCMOS vs EMCCD vs CCD, as they reach software

| | sCMOS (e.g. Prime 95B, ORCA-Flash4.0 V3) | EMCCD (e.g. Andor iXon Ultra) | CCD |
|---|---|---|---|
| Typical frame | 1200×1200 at 11 µm (Prime 95B); 2048×2048 (Flash4.0 V3) | 1024×1024 at 13 µm (888), 512×512 at 16 µm (897) | — |
| Digitisation | Mode-dependent: 12-bit or 16-bit (Prime 95B); 16, 12 or 8-bit through a LUT (Flash4.0 V3) | "16-bit (at all speeds)" | — |
| Gain | Fixed per mode | EM gain "1 – 1000 times" via RealGain, plus an excess noise factor of √2 | — |
| Shutter | Rolling, plus "effective global shutter" through trigger timing (Prime 95B) | Frame transfer | — |
| Binning | Partly digital. Read noise adds per column, and fixed-pattern noise is "substantially amplified by binning" | On-chip charge binning, before the ADC | On-chip charge binning, before the ADC |
| On-camera processing | Defect-pixel correction, denoising, spurious-event removal (§2.3) | — | — |

Sources: [Prime 95B datasheet, rev. 2024-08-20](https://psirep.com/system/files/2025-02/Teledyne%20DALSA%20Prime%2095B%20Datasheet.pdf); [ORCA-Flash4.0 V3 technical note, June 2018](https://hep.hamamatsu.com/resources/pdf/sys/SCAS0134E_C13440-20CU_tec.pdf); [Andor iXon Ultra specifications](https://andor.oxinst.com/downloads/uploads/andor-ixon-ultra-emccd-specifications.pdf); the binning and excess-noise rows come from the [Photometrics handbook](https://psirep.com/system/files/2025-02/Teledyne%20DALSA%20Prime%2095B%20Customer%20Applications%20Handbook.pdf) (pp. 76, 109). No primary CCD spec sheet was read this pass, so the CCD column is mostly empty.

### 2.3 Processing done inside the camera, before software sees the pixels

- **Defect (hot) pixel correction.** The ORCA-Flash4.0 V3 "has real-time variant pixel correction" that "defaults to the ON condition when powered up". It has three levels, correcting about 0.1%, 0.05% (the default) or under 0.001% of pixels ([Hamamatsu technical note](https://hep.hamamatsu.com/resources/pdf/sys/SCAS0134E_C13440-20CU_tec.pdf), §3-6). Corrected pixels are interpolated values, not measurements.
- **Spurious-event removal (Photometrics BERT).** Pixel values "which could not have come from the actual sample… are replaced with a best approximation by taking the mean of the surrounding pixels" ([Photometrics handbook](https://psirep.com/system/files/2025-02/Teledyne%20DALSA%20Prime%2095B%20Customer%20Applications%20Handbook.pdf), p. 76).
- **Denoising (PrimeEnhance).** On the Prime 95B this is a "real-time quantitative denoising algorithm", patch-based, claiming a 3–5× gain in peak SNR (p. 6). The handbook's own case study reports that it "can amplify some noise and produced false localizations" until the localization software was retuned (p. 17). A denoised file looks like a raw one.
- **Bit reduction through a LUT.** On the Flash4.0 V3, 12-bit and 8-bit output exist to cut data volume. A "User-Controllable Look Up Table" maps "a selectable, reduced range, of intensities" into the smaller depth ([Hamamatsu technical note](https://hep.hamamatsu.com/resources/pdf/sys/SCAS0134E_C13440-20CU_tec.pdf), §5-1). The stored values are then no longer linear in photons across the full range.
- **Per-pixel calibration.** Photometrics describes "equalling bias value, linearizing the response and gain of each individual pixel" for sCMOS, which shows that raw sCMOS frames are already corrected in firmware (handbook p. 76).

### 2.4 Teledyne Photometrics Prime 95B (the lab's camera)

From the [Prime 95B datasheet (rev. 2024-08-20)](https://psirep.com/system/files/2025-02/Teledyne%20DALSA%20Prime%2095B%20Datasheet.pdf), a copy hosted by a distributor (photometrics.com returned a Cloudflare 403):

| Item | Value |
|---|---|
| Sensor | GPixel GSense 144 BSI CMOS Gen IV |
| Active array | **1200 × 1200** (1.44 MP) |
| Pixel | **11 µm × 11 µm**; sensor 13.2 × 13.2 mm (18.7 mm diagonal) |
| Peak QE | > 95% |
| Modes | **Sensitivity (200 MHz): 12-bit**, full well 10,000 e⁻, 82 fps, line time 10.1 µs. **HDR (100 MHz): 16-bit**, full well 80,000 e⁻, 41 fps, line time 20.3 µs |
| Read noise | 1.6 e⁻ (median) in both modes |
| Readout | Rolling shutter, or "effective global shutter" (a trigger-timing mode) |
| Binning | 2 × 2, "digital" (the handbook says "on FPGA") |
| Interfaces | PCIe, USB 3.0; frame rates are the same on both |

The handbook's spec page names the modes "16-bit (Combined Gain)" and "12-bit (High Gain)", with dynamic range 50,000:1 ([handbook](https://psirep.com/system/files/2025-02/Teledyne%20DALSA%20Prime%2095B%20Customer%20Applications%20Handbook.pdf), p. 12). Arithmetic that follows from these specs (derived, not quoted):

- A 12-bit-mode file stores values of at most **4095** in a uint16 container. Values at 4095 are clipped, and the top 4 bits are always empty.
- **Rolling-shutter skew** is line time × rows. That is about 12 ms (12-bit) or 24 ms (16-bit) between the first and last row of a full frame. The Flash4.0 V3 instead reads "from the center line to the top line and to the bottom line simultaneously" in normal mode, so its skew is symmetric about the middle ([Hamamatsu](https://hep.hamamatsu.com/resources/pdf/sys/SCAS0134E_C13440-20CU_tec.pdf), §4-4-1).
- Under 2 × 2 binning the frame becomes 600 × 600 and the pixel size doubles. The binned pixels carry the digital-binning noise penalty of §2.2.

## 3. Pixel size and scale

- **Formula.** Sample pixel = camera pixel ÷ (objective × any coupler, relay or intermediate magnification) × binning. Andor's guide lists "Additional coupler magnification" as a key input and tabulates 11 µm cameras with 1.5× and 2× couplers ([Andor, Matching sCMOS camera to objective lenses](https://andor.oxinst.com/learning/view/article/optimizing-field-of-view-and-resolution-in-microscopy-matching-scmos-camera-to-objective-lenses)). Its own example uses "a Nikon Ti2 with 60x objective and integrated 1.5x tube lens", which is a magnification inside the microscope body that nothing on the camera side records.
- **Nyquist, as camera makers use it.** Andor assumes "ideal oversampling is 2.3 or greater, but that between 2 and 2.3 will also yield acceptable resolving capability", with resolution from the Rayleigh equation. For an 11 µm camera with a 60×/1.4 objective, it gets 2.14 with a 1.5× coupler and 2.85 with a 2× coupler (same page, Table 1). Without a coupler that ratio scales to about 1.43 (derived). At the lab's 63× it is about 1.5, or about 1.3 at 520 nm emission with NA 1.4 (derived: 0.61·0.52/1.4 = 0.227 µm, divided by 0.1746). **The objective's NA is not recorded in the lab's TIFFs, so these figures assume NA 1.4.** The decision-relevant reading: a diffraction-limited spot spans only about 1–2 pixels, so detectors cannot rely on the spot's shape.
- **How software learns pixel size.**
  - Micro-Manager: pixel calibration "refers to the process of determining how many microns are imaged onto each pixel of your camera". It is a hand-entered table in which "you… indicate the pixel size, and then select which device property or properties correspond" (usually the objective turret). "If your system is calibrated, the correct pixel size will appear… otherwise you will have to enter the correct number" ([Micro-Manager 2.0 User's Guide](https://micro-manager.org/Version_2.0_Users_Guide)). An uncalibrated or wrongly keyed table writes a confident wrong number. The documented example metadata shows `"PixelSize_um": 1` ([Micro-Manager Files and Metadata](https://micro-manager.org/Files_and_Metadata)).
  - Reader disagreement: Bio-Formats before 5.3.3 divided a Leica LIF's physical image width "by the number of pixels", while the Leica specification divides "by the number of pixels minus one". The old behaviour is still available through `leicalif.old_physical_size` ([Bio-Formats, Leica LIF](https://bio-formats.readthedocs.io/en/stable/formats/leica-lif.html)). The same file can therefore report two slightly different pixel sizes, depending on the reader version and options.
  - Export resampling: ZEN's image export has a **Resize** option that point-samples from a pyramid tile ([ZEISS ZEN, Image Export – File Type](https://knowledge.zeiss.com/rms/en/zen/basic-concepts/image-processing/image-processing-functions/export-import/image-export/file-type-section)). A resized export has a different pixel size from the acquisition.
- **Sanity check a browser tool can run.** The camera pixel (11 µm for the Prime 95B) ÷ the stored µm/px should be close to a real objective magnification (10, 20, 40, 60, 63, 100), optionally × 1.5, 2, 2.8 or 4. A ratio like 72 or 1 means the pixel size is uncalibrated or wrong. (This check is this page's suggestion.)

## 4. Acquisition software and what it writes

The native format and readers are on the [TIFF page, §5](../tiff-format/README.md). This table records which acquisition settings an **open reader (Bio-Formats) actually maps** to OME fields, from each reader's "Supported Metadata Fields" page. Y means the field is in the reader's supported list. What the vendor file holds beyond that is in "original metadata", unmapped.

| Software (format) | Mapped fields | Exposure | Detector gain / offset / binning | Objective mag / NA | Channel name | Ex / Em wavelength | Pixel X, Z | Stage XYZ | Δt | Source |
|---|---|---|---|---|---|---|---|---|---|---|
| 3i SlideBook ≤6 (.sld) | **34** | Y | — / — / — | Y / — | Y | — / — | Y, Y | — | — | [SlidebookReader](https://bio-formats.readthedocs.io/en/stable/metadata/SlidebookReader.html) |
| 3i SlideBook 7 (.sldy) | 64 | Y | — | Y / — | Y | — / — | Y, Y | Y | Y | [SlideBook7Reader](https://bio-formats.readthedocs.io/en/stable/metadata/SlideBook7Reader.html) |
| ZEISS ZEN (.czi) | **181** | Y | Y / Y / Y | Y / Y | Y | Y / Y | Y, Y | Y | Y | [ZeissCZIReader](https://bio-formats.readthedocs.io/en/stable/metadata/ZeissCZIReader.html) |
| Nikon NIS-Elements (.nd2) | 52 | Y | Y / — / Y | — / Y | Y | Y / Y | Y, Y | Y | Y | [ND2Reader](https://bio-formats.readthedocs.io/en/stable/metadata/ND2Reader.html) |
| Leica LAS X (.lif) | 85 | Y | Y / Y / — | Y / Y | Y | Y / — | Y, Y | Y | Y | [LIFReader](https://bio-formats.readthedocs.io/en/stable/metadata/LIFReader.html) |
| Evident cellSens (.vsi) | 49 | Y | Y / Y / Y | Y / Y | Y | — / Y | Y, Y | Y | Y | [CellSensReader](https://bio-formats.readthedocs.io/en/stable/metadata/CellSensReader.html) |
| Evident/Olympus FV (.oir) | 48 | — | Y / Y / — | Y / Y | Y | Y / Y | Y, Y | Z only | Y | [OIRReader](https://bio-formats.readthedocs.io/en/stable/metadata/OIRReader.html) |
| MetaMorph (.stk/.nd) | 59 | Y | Y / — / Y | — / Y | Y | light-source λ / Y | Y, Y | Y | Y | [MetamorphReader](https://bio-formats.readthedocs.io/en/stable/metadata/MetamorphReader.html) |
| Micro-Manager (TIFF + JSON) | 42 | Y | Y / — / Y | — / — | Y | — / — | Y, Y | Y | Y | [MicromanagerReader](https://bio-formats.readthedocs.io/en/stable/metadata/MicromanagerReader.html) |

Counts are "The file format itself supports N of them" out of 476 documented OME fields. The table was built by matching field names on each page. It is a mapping inventory, not a test of real files.

Per package, beyond the table:

- **3i SlideBook.** `.sld` is "a single file that contains all images and metadata". `.sldy` is "a directory where each captured 2D or 3D image is stored in an independent file (by channel and timepoint)". Its "images, masks, and histograms are stored as Python-compatible NumPy arrays, and the metadata is stored in the open-source YAML format". `.sldyz` compresses each NumPy file with Zstandard, losslessly. SlideBook exports "16-bit TIFFs", "fully supports OME-TIFF export for any dataset", and has a free SlideBook Reader ([3i SlideBook](https://www.intelligent-imaging.com/slidebook)). Bio-Formats recommends exporting OME-TIFF from SlideBook to keep metadata (already on the [TIFF page](../tiff-format/README.md)).
- **ZEISS ZEN.** ZEN recommends `.czi`, which "has lossless compression" ([ZEN Image Export – File Type](https://knowledge.zeiss.com/rms/en/zen/basic-concepts/image-processing/image-processing-functions/export-import/image-export/file-type-section)). Export options that change pixels ([ZEN Image Export – Image Data](https://knowledge.zeiss.com/rms/en/zen/basic-concepts/image-processing/image-processing-functions/export-import/image-export/image-data-section)):
  - **Convert to 8 Bit**, available for TIFF, BigTIFF, PNG and JPEG XR. With pixel shift on, "a 14 bit image is first transformed to a 16 bit image… The 14 bit range is mapped to the whole 8 bit range".
  - **Apply Display Curve and Channel Color**: "These settings are applied to the pixel values of the exported images."
  - **Burn-in Annotations**: "The pixels under the graphical element (e.g. scale bars) are overwritten."
  - **Quality**, for JPEG and JPEG XR, where low values reduce quality "considerably".
  - **Resize**, see §3.
  - CZI files themselves can be JPEG-XR compressed ([Bio-Formats, Zeiss CZI](https://bio-formats.readthedocs.io/en/stable/formats/zeiss-czi.html)).
- **Nikon NIS-Elements.** "There are two distinct versions of ND2: an old version, which uses JPEG-2000 compression, and a new version which is either uncompressed or Zip-compressed." Bio-Formats has no official specification ([Bio-Formats, ND2](https://bio-formats.readthedocs.io/en/stable/formats/nikon-nis-elements-nd2.html)). Nikon also writes its own TIFF variant, read by a separate reader ([Bio-Formats, Nikon Elements TIFF](https://bio-formats.readthedocs.io/en/stable/formats/nikon-elements-tiff.html)). NIS-Elements' own export dialog was not read.
- **Leica LAS X.** It writes `.lif` (and XLEF/LOF). Bio-Formats holds Leica specs it may not redistribute, and there is the pixel-size discrepancy of §3 ([Bio-Formats, Leica LIF](https://bio-formats.readthedocs.io/en/stable/formats/leica-lif.html)). LAS X's export dialog was not read.
- **Evident/Olympus.** cellSens writes `.vsi` ([Bio-Formats, cellSens VSI](https://bio-formats.readthedocs.io/en/stable/formats/cellsens-vsi.html)). FluoView writes `.oir`, or the older `.oib` (single file) and `.oif`. OIF "is a multi-file format that includes an .oif file and a directory of .tif, .roi, .pty, .lut, and .bmp files" ([Bio-Formats, FV1000](https://bio-formats.readthedocs.io/en/stable/formats/olympus-fluoview-fv1000.html); [OIR](https://bio-formats.readthedocs.io/en/stable/formats/olympus-oir.html)).
- **MetaMorph.** It writes `.stk` stacks, with a `.nd` file describing a multi-file experiment, and a separate "MetaMorph 7.5 TIFF" variant ([Bio-Formats, STK](https://bio-formats.readthedocs.io/en/stable/formats/metamorph-stack-stk.html); [MetaMorph 7.5 TIFF](https://bio-formats.readthedocs.io/en/stable/formats/metamorph-75-tiff.html)).
- **Micro-Manager (open source)** ([File Formats](https://micro-manager.org/Micro-Manager_File_Formats); [Files and Metadata](https://micro-manager.org/Files_and_Metadata); [NDTiffStorage](https://github.com/micro-manager/NDTiffStorage)):
  - **Separate image files**: one TIFF per plane named `img_00000000t_channel_00z.tif`, plus `metadata.txt`, which "contains the metadata in JSON format".
  - **Image stack file**: OME-TIFF, up to 4 GB per file, "one file… for each XY stage position" by default. The first IFD carries OME-XML **and** a second ImageDescription for ImageJ, and every IFD carries a private `MicroManagerMetadata` tag (51123) holding per-image JSON. The file opens as a hyperstack "with the same contrast settings used in Micro-Manager".
  - **NDTiff**: a folder of `NDTiff.index`, `{name}_NDTiffStack.tif` (+ `_1`, `_2` past 4 GB) and `display_settings.txt`. Axes are arbitrary (`{'time': 1, 'channel': 2}`), and the files are "standard TIFF files, with the addition of a specialized header". There are optional `Downsampled_x2`/`_x4` pyramid folders.
  - **Per-image JSON keys** (MetadataVersion 10 example): `Camera-Binning`, `Camera-BitDepth`, `Camera-Gain`, `Camera-Offset`, `Exposure-ms`, `ElapsedTime-ms`, `Objective-Label`, `PixelSizeUm`, `Channel`, `Z-Position`/`ZPositionUm`, `XY` stage, `Emission-Label`/`Excitation-Label` (filter names, not wavelengths), and the whole device-property state. Summary keys include `ChNames`, `ChColors`, `z-step_um`, `Interval_ms`, `PixelSize_um`, `SlicesFirst` and `TimeFirst`. The page says the format is "subject to change".
  - Pointing Bio-Formats at a `.ome.tif` instead of `metadata.txt` skips "the extended Micro-Manager metadata" ([Bio-Formats, Micro-Manager](https://bio-formats.readthedocs.io/en/stable/formats/micro-manager.html)).
  - Photometrics notes that hardware timestamps from its cameras appear in the TIFF header when metadata is enabled in Micro-Manager, and are "much more reliable" than software timestamps ([handbook](https://psirep.com/system/files/2025-02/Teledyne%20DALSA%20Prime%2095B%20Customer%20Applications%20Handbook.pdf), p. 119).

## 5. Multi-dimensional outputs: what one "image" file holds

- **Channels.** On a single-camera system, channels are acquired **sequentially**: separate exposures with filter or laser changes. Each channel can then have its own exposure, and Micro-Manager records `Exposure-ms` per image ([Files and Metadata](https://micro-manager.org/Files_and_Metadata)). **Simultaneous** two-colour imaging splits the sensor or uses two cameras. The CSU-W1 has 1-camera, 2-camera and "split view" models ([Yokogawa](https://yokogawa.com/us/solutions/products-platforms/life-science/spinning-disk-confocal/super-resolution)). Hamamatsu's W-VIEW mode sets exposure and readout separately for the top and bottom halves of one sensor, "optimized for simultaneous image acquisition of dual wavelength images" ([Hamamatsu](https://hep.hamamatsu.com/resources/pdf/sys/SCAS0134E_C13440-20CU_tec.pdf), §4-3). A split-view file can be **one frame holding two channels side by side**.
- **Acquisition order.** Micro-Manager's summary records `SlicesFirst`/`TimeFirst` ([Files and Metadata](https://micro-manager.org/Files_and_Metadata)). Storage order is a format matter, covered on the [TIFF page](../tiff-format/README.md).
- **Tiles and positions.** Micro-Manager's grid tool allows "an overlap between the images… (to specify a space between them, use a negative overlap)". It needs a valid pixel calibration ([MM 1.4 User's Guide](https://micro-manager.org/Micro-Manager_User%27s_Guide); [2.0 guide](https://micro-manager.org/Version_2.0_Users_Guide)). By default it writes one file per position. Shading makes the seams between tiles visible: "intensity discontinuities and resulting stitching errors" in mosaics ([Peng et al. 2017, BaSiC](https://www.ebi.ac.uk/europepmc/webservices/rest/PMC5472168/fullTextXML)).
- **Light-sheet.** SlideBook's LightSheet module includes "deskewing, channel registration, and deconvolution" ([3i SlideBook](https://www.intelligent-imaging.com/slidebook)). Raw volumes from such systems may need geometry correction before they are a normal XYZ stack. Hamamatsu's Lightsheet Readout Mode synchronises the rolling shutter with the illumination scan to reject scattered light ([Hamamatsu](https://hep.hamamatsu.com/resources/pdf/sys/SCAS0134E_C13440-20CU_tec.pdf), §4-4).
- **Consequence for a single-file upload.** One acquisition may be one file, one file per position, one per plane plus JSON, or a folder. These are SlideBook `.sldy`, Micro-Manager NDTiff and Olympus OIF, cited above.

## 6. Output pitfalls for analysis software

| Pitfall | What the file shows | Source |
|---|---|---|
| **Saturation** | A pile-up at 2ᵏ−1 *for the camera's mode*: 4095 in Prime 95B 12-bit mode, not 65535 | [EMVA 1288 §2.7](https://www.emva.org/wp-content/uploads/EMVA1288Linear_4.0Release.pdf); [Prime 95B datasheet](https://psirep.com/system/files/2025-02/Teledyne%20DALSA%20Prime%2095B%20Datasheet.pdf) |
| **Offset not subtracted** | Background near the bias (~100 on a Prime 95B), so ratios and "fold over background" are biased | [Photometrics handbook p. 105](https://psirep.com/system/files/2025-02/Teledyne%20DALSA%20Prime%2095B%20Customer%20Applications%20Handbook.pdf) |
| **Offset subtracted and clipped** | Many exact zeros. The noise floor is truncated, so the background mean is biased up and its SD down | Measured on the lab's files (§7); EMVA says raw dark values must be > 0 |
| **Shading / flat-field** | `I_meas = I_true·S(x) + D(x)`: S is the flat-field, and D, the dark-field, is "dominated by camera offset and thermal noise". Brightness falls off toward the edges | [Peng et al. 2017](https://www.ebi.ac.uk/europepmc/webservices/rest/PMC5472168/fullTextXML) |
| **Display curve baked into export** | ZEN "Apply Display Curve…" writes the display curve into the pixels. "Convert to 8 Bit" maps a 14-bit range onto 256 levels | [ZEN Image Data](https://knowledge.zeiss.com/rms/en/zen/basic-concepts/image-processing/image-processing-functions/export-import/image-export/image-data-section) |
| **Burnt-in scale bars** | Overwritten pixels | same |
| **Lossy export** | JPEG / JPEG XR quality slider; old ND2 uses JPEG-2000 | [ZEN File Type](https://knowledge.zeiss.com/rms/en/zen/basic-concepts/image-processing/image-processing-functions/export-import/image-export/file-type-section); [Bio-Formats ND2](https://bio-formats.readthedocs.io/en/stable/formats/nikon-nis-elements-nd2.html) |
| **Bit depth packed in 16 bits** | 12-bit data (≤4095) or a LUT-compressed range in a uint16 file. A display scaled to 0–65535 looks black | [Hamamatsu §5-1](https://hep.hamamatsu.com/resources/pdf/sys/SCAS0134E_C13440-20CU_tec.pdf); [Prime 95B datasheet](https://psirep.com/system/files/2025-02/Teledyne%20DALSA%20Prime%2095B%20Datasheet.pdf) |
| **On-camera alteration** | Interpolated hot pixels (Flash4.0 V3, on by default), BERT replacement, PrimeEnhance denoising. None is visible in the file unless the vendor metadata records it | §2.3 |
| **Chromatic shift between channels** | Channels offset laterally and, more strongly, axially. The axial shift is depth-dependent | [Leiwe et al. 2021](https://www.frontiersin.org/journals/neuroanatomy/articles/10.3389/fnana.2021.760063/full) |
| **Rolling-shutter skew** | Rows exposed at different times (~12–24 ms across a Prime 95B frame, derived). Fast-moving or flickering signal varies down the frame | §2.4 |
| **Binning on sCMOS** | Fixed-pattern noise "substantially amplified", and pixel size doubled | [Photometrics handbook p. 76](https://psirep.com/system/files/2025-02/Teledyne%20DALSA%20Prime%2095B%20Customer%20Applications%20Handbook.pdf) |

## 7. Measured on the lab's own files (2026-10-30)

Every sixth file of the 55 in `owner-scans` (10 files, SHA-256 verified against `sources.json`) was downloaded to the scratchpad and read with tifffile. Per channel, these are uint16 1200 × 1200 values. This is the **only measured** section of the page, and the sample is 10 of 55 files.

- **Maximum value across all 30 channels: 3,781.** No pixel is above 4095, and the maximum is a single pixel in every channel (1–2 pixels at the max). Nothing is clipped. The data fit 12 bits, but the SlideBook → ImageJ export does not record which camera mode was used. This is consistent with either mode at these signal levels, so it is **not** evidence of the 12-bit mode.
- **Exact zeros: 29 of 30 channels have minimum 0.** The share of zero pixels per channel ranges from 0.0% to 15.8% (median 1.3%). A raw Prime 95B frame sits on a ~100 bias (§2.1), so these values were background- or offset-subtracted and clipped at 0, somewhere between SlideBook and the "Edited" TIFFs.
- **The exception:** channel 1 of `Left Up- Edited/Slide5_4AP_NoR.sld - Slice2_up_left2.tif` has minimum **109**, 1st percentile 127, median 156, and no zeros. That matches an un-subtracted ~100 bias. The other two channels of the same file have zeros. **Baselines differ between channels within one file**, so a fixed absolute threshold, or an intensity ratio across channels, means different things per channel.
- Median values are 8–71 counts. The signal sits low in the range, so most of the 16-bit container is unused.

## Sources

- [EMVA Standard 1288, Release 4.0 Linear (16 June 2021)](https://www.emva.org/wp-content/uploads/EMVA1288Linear_4.0Release.pdf)
- [Teledyne Photometrics, Prime 95B datasheet, rev. 2024-08-20 (distributor-hosted copy)](https://psirep.com/system/files/2025-02/Teledyne%20DALSA%20Prime%2095B%20Datasheet.pdf)
- [Teledyne Photometrics, Prime 95B Customer Applications Handbook (distributor-hosted copy)](https://psirep.com/system/files/2025-02/Teledyne%20DALSA%20Prime%2095B%20Customer%20Applications%20Handbook.pdf)
- [Hamamatsu, ORCA-Flash4.0 V3 C13440-20CU technical note (June 2018)](https://hep.hamamatsu.com/resources/pdf/sys/SCAS0134E_C13440-20CU_tec.pdf)
- [Andor (Oxford Instruments), iXon Ultra EMCCD specifications](https://andor.oxinst.com/downloads/uploads/andor-ixon-ultra-emccd-specifications.pdf)
- [Andor, Optimizing field of view and resolution: matching sCMOS camera to objective lenses](https://andor.oxinst.com/learning/view/article/optimizing-field-of-view-and-resolution-in-microscopy-matching-scmos-camera-to-objective-lenses)
- [Yokogawa, CSU-W1 SoRa confocal scanner unit](https://yokogawa.com/us/solutions/products-platforms/life-science/spinning-disk-confocal/super-resolution)
- [Leica Microsystems, The Power HyD Detector Family](https://www.leica-microsystems.com/the-power-hyd-detector-family/)
- [3i, SlideBook software](https://www.intelligent-imaging.com/slidebook)
- [ZEISS ZEN Knowledge Base, Image Export – Image Data section](https://knowledge.zeiss.com/rms/en/zen/basic-concepts/image-processing/image-processing-functions/export-import/image-export/image-data-section)
- [ZEISS ZEN Knowledge Base, Image Export – File Type section](https://knowledge.zeiss.com/rms/en/zen/basic-concepts/image-processing/image-processing-functions/export-import/image-export/file-type-section)
- [Micro-Manager, File Formats](https://micro-manager.org/Micro-Manager_File_Formats)
- [Micro-Manager, Files and Metadata](https://micro-manager.org/Files_and_Metadata)
- [Micro-Manager, Version 2.0 User's Guide](https://micro-manager.org/Version_2.0_Users_Guide)
- [Micro-Manager, Version 1.4 User's Guide](https://micro-manager.org/Micro-Manager_User%27s_Guide)
- [micro-manager/NDTiffStorage README (NDTiff v3 spec)](https://github.com/micro-manager/NDTiffStorage)
- [Bio-Formats, SlidebookReader supported metadata](https://bio-formats.readthedocs.io/en/stable/metadata/SlidebookReader.html)
- [Bio-Formats, SlideBook7Reader supported metadata](https://bio-formats.readthedocs.io/en/stable/metadata/SlideBook7Reader.html)
- [Bio-Formats, ZeissCZIReader supported metadata](https://bio-formats.readthedocs.io/en/stable/metadata/ZeissCZIReader.html)
- [Bio-Formats, ND2Reader supported metadata](https://bio-formats.readthedocs.io/en/stable/metadata/ND2Reader.html)
- [Bio-Formats, LIFReader supported metadata](https://bio-formats.readthedocs.io/en/stable/metadata/LIFReader.html)
- [Bio-Formats, CellSensReader supported metadata](https://bio-formats.readthedocs.io/en/stable/metadata/CellSensReader.html)
- [Bio-Formats, OIRReader supported metadata](https://bio-formats.readthedocs.io/en/stable/metadata/OIRReader.html)
- [Bio-Formats, MetamorphReader supported metadata](https://bio-formats.readthedocs.io/en/stable/metadata/MetamorphReader.html)
- [Bio-Formats, MicromanagerReader supported metadata](https://bio-formats.readthedocs.io/en/stable/metadata/MicromanagerReader.html)
- [Bio-Formats, Leica LIF format page](https://bio-formats.readthedocs.io/en/stable/formats/leica-lif.html)
- [Bio-Formats, Zeiss CZI format page](https://bio-formats.readthedocs.io/en/stable/formats/zeiss-czi.html)
- [Bio-Formats, Nikon NIS-Elements ND2 format page](https://bio-formats.readthedocs.io/en/stable/formats/nikon-nis-elements-nd2.html)
- [Bio-Formats, Nikon Elements TIFF format page](https://bio-formats.readthedocs.io/en/stable/formats/nikon-elements-tiff.html)
- [Bio-Formats, cellSens VSI format page](https://bio-formats.readthedocs.io/en/stable/formats/cellsens-vsi.html)
- [Bio-Formats, Olympus FluoView FV1000 format page](https://bio-formats.readthedocs.io/en/stable/formats/olympus-fluoview-fv1000.html)
- [Bio-Formats, Olympus OIR format page](https://bio-formats.readthedocs.io/en/stable/formats/olympus-oir.html)
- [Bio-Formats, MetaMorph Stack (STK) format page](https://bio-formats.readthedocs.io/en/stable/formats/metamorph-stack-stk.html)
- [Bio-Formats, MetaMorph 7.5 TIFF format page](https://bio-formats.readthedocs.io/en/stable/formats/metamorph-75-tiff.html)
- [Bio-Formats, Micro-Manager format page](https://bio-formats.readthedocs.io/en/stable/formats/micro-manager.html)
- [Peng et al. 2017, A BaSiC tool for background and shading correction of optical microscopy images, Nat. Commun. 8:14836 (Europe PMC full text)](https://www.ebi.ac.uk/europepmc/webservices/rest/PMC5472168/fullTextXML)
- [Leiwe, Fujimoto & Imai 2021, Post hoc correction of chromatic aberrations in large-scale volumetric images in confocal microscopy, Front. Neuroanat.](https://www.frontiersin.org/journals/neuroanatomy/articles/10.3389/fnana.2021.760063/full)

## Open questions

- Which Prime 95B mode (12-bit Sensitivity or 16-bit HDR) and which exposure did the lab use? The raw `.sld` or the SlideBook capture settings would say.
- Where were the lab's images background-subtracted (SlideBook capture, a SlideBook operation, or ImageJ), and why does one channel keep its offset?
- What is the NA of the lab's 63× (or 60× + relay) objective? The Nyquist figures in §3 assume 1.4.
- Should NoR Finder warn when a file has many exact zeros (clipped background) or values ≤ 4095 with a pile-up at 4095 (12-bit saturation)?
- Should NoR Finder run the pixel-size sanity check of §3 and flag implausible ratios?
- Could NoR Finder accept a SlideBook `.sldy` folder (NumPy + YAML) through a directory picker?
- Does SlideBook record PrimeEnhance, defect correction or the readout mode in `.sld`/`.sldy` metadata?

## Growth log

- **2026-10-30** — initial seed: camera model (EMVA 1288), sCMOS/EMCCD comparison, Prime 95B specs and on-camera processing, pixel size and Nyquist, a Bio-Formats metadata-mapping table for nine acquisition packages, multi-dimensional output layouts, a pitfalls table, and measured value statistics of 10 lab files.

## Gaps / not verified

- **photometrics.com and teledynevisionsolutions.com** returned 403 (Cloudflare). The Prime 95B datasheet and handbook were read from copies hosted by the distributor PSI (psirep.com). The UCSD-hosted datasheet copy failed TLS verification and was not used.
- **Point-scanning mechanics** (zoom setting pixel size, pixel dwell, line and frame averaging versus accumulation, 8/12/16-bit options) were not verified from a primary source. The ZEISS LSM 980 product sheet and a ZEISS application note returned 403, the Leica HyD brochure returned 403, the Jonkman et al. 2020 Nature Protocols tutorial returned 429 and is not open access, and the Evident FV4000 page is script-rendered. Only facility guides (not cited) covered these.
- **CCD** specifics (typical pixel sizes, bit depths) were not read from a primary spec sheet.
- **Light-sheet** output geometry (skewed stage-scan volumes, deskew angles) was not read from a primary source beyond 3i's mention of deskewing.
- **Export dialogs** of NIS-Elements, LAS X, cellSens, MetaMorph and SlideBook were not read. Only ZEN's export options are documented here. The 3i page's "16-bit TIFF" and "OME-TIFF" claims are marketing-level.
- **The §4 metadata table** comes from Bio-Formats' published field lists, not from running readers on real files. Partial field mappings are counted as supported.
- **Prime 95B gain per mode** (e⁻/ADU in 12-bit vs 16-bit) was not found. The handbook's ~1.18 example does not name its mode.
- **Rolling-shutter skew and Nyquist ratios** in §2.4 and §3 are this page's own arithmetic from the cited specs, not quoted figures.
- **The §7 measurements** cover 10 of 55 files. The other 45 were not checked.
