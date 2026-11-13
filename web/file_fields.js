// What an image file says about itself, read from its own bytes with no decoding of its pixels
// (req/shell/image/file-info): a TIFF's tags and ImageJ header, a photo's EXIF, JFIF and XMP, a HEIC's container, a
// PNG's chunks. Each field is [label, text]; binary blobs (a maker note, a profile's bytes, a thumbnail, a list of more
// than MOST values) are left out.
"use strict";
import { ifdAt } from "./split.js";

const MOST = 16, LONGEST = 500;

// {format: "tiff" | "heic" | "jpeg" | "png" | "image", fields, facts: {camera?, taken?, bits?}}
export function fileFields(b) {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength), four = (at) => String.fromCharCode(...b.subarray(at, at + 4));
  const out = { format: "image", fields: [], facts: {} };
  try {
    if ((b[0] === 0x49 && b[1] === 0x49) || (b[0] === 0x4d && b[1] === 0x4d)) Object.assign(out, { format: "tiff" }, tiff(b, v));
    else if (b[0] === 0xff && b[1] === 0xd8) Object.assign(out, { format: "jpeg" }, jpeg(b, v));
    else if (b[0] === 0x89 && four(1) === "PNG\r") Object.assign(out, { format: "png" }, png(b, v));
    else if (four(4) === "ftyp") Object.assign(out, { format: "heic" }, heif(b, v));
  } catch (e) { console.warn("the file's details could not all be read:", e); }
  return out;
}

// ---------- EXIF and TIFF tags ----------
const TAGS = {
  0x00fe: "NewSubfileType", 0x0100: "ImageWidth", 0x0101: "ImageLength", 0x0102: "BitsPerSample", 0x0103: "Compression",
  0x0106: "PhotometricInterpretation", 0x010d: "DocumentName", 0x010e: "ImageDescription", 0x010f: "Make", 0x0110: "Model",
  0x0112: "Orientation", 0x0115: "SamplesPerPixel", 0x0116: "RowsPerStrip", 0x011a: "XResolution", 0x011b: "YResolution",
  0x011c: "PlanarConfiguration", 0x0128: "ResolutionUnit", 0x0131: "Software", 0x0132: "DateTime", 0x013b: "Artist",
  0x013c: "HostComputer", 0x013d: "Predictor", 0x0142: "TileWidth", 0x0143: "TileLength", 0x0152: "ExtraSamples",
  0x0153: "SampleFormat", 0x0213: "YCbCrPositioning", 0x0211: "YCbCrCoefficients", 0x0212: "YCbCrSubSampling",
  0x013e: "WhitePoint", 0x013f: "PrimaryChromaticities", 0x0214: "ReferenceBlackWhite", 0x8298: "Copyright",
  0x829a: "ExposureTime", 0x829d: "FNumber", 0x8822: "ExposureProgram", 0x8824: "SpectralSensitivity", 0x8827: "ISOSpeedRatings",
  0x8830: "SensitivityType", 0x8832: "RecommendedExposureIndex", 0x9000: "ExifVersion", 0x9003: "DateTimeOriginal",
  0x9004: "DateTimeDigitized", 0x9010: "OffsetTime", 0x9011: "OffsetTimeOriginal", 0x9012: "OffsetTimeDigitized",
  0x9101: "ComponentsConfiguration", 0x9102: "CompressedBitsPerPixel", 0x9201: "ShutterSpeedValue", 0x9202: "ApertureValue",
  0x9203: "BrightnessValue", 0x9204: "ExposureBiasValue", 0x9205: "MaxApertureValue", 0x9206: "SubjectDistance",
  0x9207: "MeteringMode", 0x9208: "LightSource", 0x9209: "Flash", 0x920a: "FocalLength", 0x9214: "SubjectArea",
  0x9286: "UserComment", 0x9290: "SubsecTime", 0x9291: "SubsecTimeOriginal", 0x9292: "SubsecTimeDigitized",
  0xa000: "FlashpixVersion", 0xa001: "ColorSpace", 0xa002: "PixelXDimension", 0xa003: "PixelYDimension",
  0xa20e: "FocalPlaneXResolution", 0xa20f: "FocalPlaneYResolution", 0xa210: "FocalPlaneResolutionUnit",
  0xa214: "SubjectLocation", 0xa215: "ExposureIndex", 0xa217: "SensingMethod", 0xa300: "FileSource", 0xa301: "SceneType",
  0xa401: "CustomRendered", 0xa402: "ExposureMode", 0xa403: "WhiteBalance", 0xa404: "DigitalZoomRatio",
  0xa405: "FocalLengthIn35mmFilm", 0xa406: "SceneCaptureType", 0xa407: "GainControl", 0xa408: "Contrast",
  0xa409: "Saturation", 0xa40a: "Sharpness", 0xa40c: "SubjectDistanceRange", 0xa420: "ImageUniqueID",
  0xa430: "CameraOwnerName", 0xa431: "BodySerialNumber", 0xa432: "LensSpecification", 0xa433: "LensMake",
  0xa434: "LensModel", 0xa435: "LensSerialNumber", 0xa460: "CompositeImage", 0xa461: "CompositeImageCount",
  0xa462: "CompositeImageExposureTimes", 0x8769: "ExifIFD", 0x8825: "GPSIFD", 0xa005: "InteropIFD",
};
const GPS_TAGS = ["GPSVersionID", "GPSLatitudeRef", "GPSLatitude", "GPSLongitudeRef", "GPSLongitude", "GPSAltitudeRef",
  "GPSAltitude", "GPSTimeStamp", "GPSSatellites", "GPSStatus", "GPSMeasureMode", "GPSDOP", "GPSSpeedRef", "GPSSpeed",
  "GPSTrackRef", "GPSTrack", "GPSImgDirectionRef", "GPSImgDirection", "GPSMapDatum", "GPSDestLatitudeRef", "GPSDestLatitude",
  "GPSDestLongitudeRef", "GPSDestLongitude", "GPSDestBearingRef", "GPSDestBearing", "GPSDestDistanceRef", "GPSDestDistance",
  "GPSProcessingMethod", "GPSAreaInformation", "GPSDateStamp", "GPSDifferential", "GPSHPositioningError"];
const INTEROP_TAGS = { 1: "InteroperabilityIndex", 2: "InteroperabilityVersion" };
// tags that hold where other data lies, or a blob: the pixels' offsets, the maker's own block, a profile, XMP, IPTC,
// ImageJ's binary metadata, a thumbnail's bytes
const SKIP = new Set([0x0111, 0x0117, 0x0144, 0x0145, 0x0201, 0x0202, 0x927c, 0x8773, 0x02bc, 0x83bb, 50838, 50839, 0x014a, 0x8769, 0x8825, 0xa005]);

// a rational as its fraction where that is how it is read (1/8 s), else as a short decimal
const ratio = ([n, d], fraction) => (!d ? String(n) : d === 1 ? String(n) : fraction && n > 0 && n < d && d % n === 0 ? `1/${d / n}` : String(+(n / d).toPrecision(6)));
const printable = (u) => u.every((c) => c === 0 || (c >= 32 && c < 127));

// a tag's text; null for a blob
function text(tag, val) {
  if (typeof val === "string") { const t = val.trim(); return t.length > LONGEST ? t.slice(0, LONGEST) + "…" : t; }
  if (val instanceof Uint8Array) {
    if (tag === 0x9286 && val.length > 8 && String.fromCharCode(...val.subarray(0, 5)) === "ASCII") val = val.subarray(8);
    if (val.length <= 64 && printable([...val]) && val.some((c) => c >= 32)) return String.fromCharCode(...val).replace(/\0+$/, "").trim();
    return val.length <= 8 ? [...val].join(", ") : null;
  }
  if (val.length > MOST) return null;
  const seconds = tag === 0x829a;
  return val.map((x) => (Array.isArray(x) ? ratio(x, seconds) : seconds && x > 0 && x < 1 && Number.isInteger(+(1 / x).toFixed(6)) ? `1/${Math.round(1 / x)}`
    : String(Number.isInteger(x) ? x : +x.toPrecision(6)))).join(", ");
}

// the fields of an IFD and the EXIF, GPS and interoperability IFDs it points at, offsets counted from v's start
function exifFields(v, at, little, skip = new Set()) {
  const fields = [], all = {};
  const take = (ifd, names) => {
    for (const [k, val] of Object.entries(ifd)) {
      const tag = +k;
      if (SKIP.has(tag) || skip.has(tag)) continue;
      const t = text(tag, val), name = names[tag];
      if (t !== null && t !== "") { fields.push([name || `Tag 0x${tag.toString(16).padStart(4, "0")}`, t]); all[name] = t; }
    }
  };
  const ifd0 = ifdAt(v, at, little);
  take(ifd0, TAGS);
  const sub = (tag) => ifd0[tag]?.[0] ?? null;
  let exif = {};
  if (sub(0x8769) !== null) take((exif = ifdAt(v, sub(0x8769), little)), TAGS);
  if (sub(0x8825) !== null) take(ifdAt(v, sub(0x8825), little), GPS_TAGS);
  if (exif[0xa005]?.[0] != null) take(ifdAt(v, exif[0xa005][0], little), INTEROP_TAGS);
  return { fields, all };
}
// the EXIF block that starts at a TIFF header (MM or II), as fields and the camera and when it was taken
function exifAt(b, start) {
  const v = new DataView(b.buffer, b.byteOffset + start, b.byteLength - start), little = v.getUint16(0) === 0x4949;
  const { fields, all } = exifFields(v, v.getUint32(4, little), little);
  return { fields, facts: photoFacts(all) };
}
function photoFacts(all) {
  const make = all.Make || "", model = all.Model || "";
  const camera = model.toLowerCase().startsWith(make.toLowerCase()) ? model : [make, model].filter(Boolean).join(" ");
  const when = all.DateTimeOriginal || all.DateTime || "", m = when.match(/^(\d{4}):(\d\d):(\d\d) (.*)$/);
  const taken = m ? [`${m[1]}-${m[2]}-${m[3]} ${m[4]}`, all.OffsetTimeOriginal || ""].filter(Boolean).join(" ") : when;
  return { ...(camera ? { camera } : {}), ...(taken ? { taken } : {}) };
}

function tiff(b, v) {
  const little = b[0] === 0x49;
  if (v.getUint16(2, little) !== 42) return {};
  const ifd = v.getUint32(4, little), desc = ifdAt(v, ifd, little)[270];
  const ij = typeof desc === "string" && desc.startsWith("ImageJ=");
  const { fields, all } = exifFields(v, ifd, little, new Set(ij ? [270] : []));
  if (ij) for (const l of desc.split("\n")) { const m = l.match(/^([^=]+)=(.*)$/); if (m && m[2].trim()) fields.push([`ImageJ ${m[1].trim()}`, m[2].trim().slice(0, LONGEST)]); }
  return { fields, facts: photoFacts(all) };
}

// ---------- JPEG ----------
function jpeg(b, v) {
  const fields = [], icc = [];
  let facts = {};
  for (let at = 2; at + 4 <= b.length && b[at] === 0xff;) {
    const kind = b[at + 1], n = v.getUint16(at + 2), body = b.subarray(at + 4, at + 2 + n), tag = (s) => String.fromCharCode(...body.subarray(0, s.length)) === s;
    if (kind === 0xda || kind === 0xd9) break;
    if (kind === 0xe0 && tag("JFIF\0")) {
      fields.push(["JFIF version", `${body[5]}.${body[6]}`]);
      const x = (body[8] << 8) | body[9], y = (body[10] << 8) | body[11];
      fields.push(["Density", body[7] === 0 ? `${x}:${y} (no unit)` : `${x} × ${y} ${body[7] === 1 ? "dpi" : "dots/cm"}`]);
    } else if (kind === 0xe1 && tag("Exif\0\0")) {
      const e = exifAt(b, at + 10); fields.push(...e.fields); facts = { ...facts, ...e.facts };
    } else if (kind === 0xe1 && tag("http://ns.adobe.com/xap/1.0/\0")) fields.push(...xmp(body.subarray(29)));
    else if (kind === 0xe2 && tag("ICC_PROFILE\0")) icc.push(body.subarray(14));
    else if (kind === 0xfe) fields.push(["Comment", String.fromCharCode(...body.subarray(0, LONGEST)).trim()]);
    else if (kind >= 0xc0 && kind <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(kind)) {
      facts.bits = body[0];
      fields.push(["Coding", [0xc2, 0xc6, 0xca, 0xce].includes(kind) ? "progressive" : kind === 0xc3 || kind === 0xc7 ? "lossless" : "baseline"]);
      fields.push(["Components", String(body[5])]);
    }
    at += 2 + n;
  }
  if (icc.length) { const p = iccName(concat(icc)); if (p) fields.push(["Colour profile", p]); }
  return { fields, facts };
}
const concat = (parts) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };

// an XMP packet's simple properties, attributes and leaf elements alike
function xmp(u) {
  const s = new TextDecoder().decode(u), out = [], seen = new Set();
  const add = (k, val) => { val = val.trim(); if (!val || seen.has(k) || /^(xmlns|rdf|x):/.test(k)) return; seen.add(k); out.push([`XMP ${k}`, val.slice(0, LONGEST)]); };
  for (const m of s.matchAll(/\s([\w-]+:[\w-]+)="([^"]*)"/g)) add(m[1], m[2]);
  for (const m of s.matchAll(/<([\w-]+:[\w-]+)>([^<]+)<\/\1>/g)) add(m[1], m[2]);
  return out;
}
// an ICC profile's description: its desc tag, as v2 ('desc') or v4 ('mluc') writes it
function iccName(p) {
  if (p.length < 132) return null;
  const v = new DataView(p.buffer, p.byteOffset, p.byteLength), n = v.getUint32(128);
  for (let i = 0; i < n && 144 + 12 * i <= p.length; i++) {
    const e = 132 + 12 * i;
    if (String.fromCharCode(...p.subarray(e, e + 4)) !== "desc") continue;
    const at = v.getUint32(e + 4), kind = String.fromCharCode(...p.subarray(at, at + 4));
    if (kind === "desc") return String.fromCharCode(...p.subarray(at + 12, at + 12 + v.getUint32(at + 8))).replace(/\0+$/, "").trim();
    if (kind === "mluc") { const len = v.getUint32(at + 20), off = v.getUint32(at + 24); return new TextDecoder("utf-16be").decode(p.subarray(at + off, at + off + len)).replace(/\0+$/, "").trim(); }
  }
  return null;
}

// ---------- PNG ----------
const PNG_COLOUR = { 0: "grey", 2: "RGB", 3: "palette", 4: "grey and alpha", 6: "RGBA" };
function png(b, v) {
  const fields = [], latin = (u) => new TextDecoder("latin1").decode(u);
  let facts = {};
  for (let at = 8; at + 12 <= b.length;) {
    const n = v.getUint32(at), kind = latin(b.subarray(at + 4, at + 8)), d = b.subarray(at + 8, at + 8 + n), dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
    if (kind === "IEND") break;
    if (kind === "IHDR") { facts.bits = d[8]; fields.push(["Colour type", PNG_COLOUR[d[9]] || String(d[9])], ["Interlace", d[12] ? "Adam7" : "none"]); }
    else if (kind === "pHYs") fields.push(["Pixel density", `${dv.getUint32(0)} × ${dv.getUint32(4)} ${d[8] === 1 ? "px/m" : "(aspect, no unit)"}`]);
    else if (kind === "tEXt") { const z = d.indexOf(0); fields.push([latin(d.subarray(0, z)), latin(d.subarray(z + 1, z + 1 + LONGEST)).trim()]); }
    else if (kind === "iTXt") {
      const z = d.indexOf(0), key = latin(d.subarray(0, z));
      if (d[z + 1] === 0) { let o = d.indexOf(0, z + 3); o = d.indexOf(0, o + 1); const t = new TextDecoder().decode(d.subarray(o + 1)).trim();
        if (key === "XML:com.adobe.xmp") fields.push(...xmp(d.subarray(o + 1))); else fields.push([key, t.slice(0, LONGEST)]); }
    } else if (kind === "tIME") fields.push(["Modified", `${dv.getUint16(0)}-${String(d[2]).padStart(2, "0")}-${String(d[3]).padStart(2, "0")} ${[d[4], d[5], d[6]].map((x) => String(x).padStart(2, "0")).join(":")}`]);
    else if (kind === "gAMA") fields.push(["Gamma", String(dv.getUint32(0) / 100000)]);
    else if (kind === "sRGB") fields.push(["sRGB intent", String(d[0])]);
    else if (kind === "iCCP") fields.push(["Colour profile", latin(d.subarray(0, d.indexOf(0)))]);
    else if (kind === "acTL") fields.push(["Frames", String(dv.getUint32(0))]);
    else if (kind === "eXIf") { const e = exifAt(b, at + 8); fields.push(...e.fields); facts = { ...facts, ...e.facts }; }
    at += 12 + n;
  }
  return { fields, facts };
}

// ---------- HEIC ----------
// the boxes in b from start to end: [{type, at (its contents), end}]
function boxes(b, v, start, end) {
  const out = [];
  for (let at = start; at + 8 <= end;) {
    let size = v.getUint32(at), head = 8;
    const type = String.fromCharCode(...b.subarray(at + 4, at + 8));
    if (size === 1) { size = Number(v.getBigUint64(at + 8)); head = 16; } else if (size === 0) size = end - at;
    if (size < head) break;
    out.push({ type, at: at + head, end: Math.min(end, at + size) });
    at += size;
  }
  return out;
}
function heif(b, v) {
  const fields = [], facts = {}, top = boxes(b, v, 0, b.length), ftyp = top.find((x) => x.type === "ftyp");
  const four = (at) => String.fromCharCode(...b.subarray(at, at + 4));
  if (ftyp) {
    const brands = []; for (let at = ftyp.at + 8; at + 4 <= ftyp.end; at += 4) brands.push(four(at));
    fields.push(["Brand", four(ftyp.at)], ["Compatible brands", brands.join(", ")]);
  }
  const meta = top.find((x) => x.type === "meta");
  if (!meta) return { fields, facts };
  const kids = boxes(b, v, meta.at + 4, meta.end), get = (t) => kids.find((x) => x.type === t);
  const primary = get("pitm") ? (b[get("pitm").at] ? v.getUint32(get("pitm").at + 4) : v.getUint16(get("pitm").at + 4)) : null;
  // the items: id → type
  const items = new Map(), iinf = get("iinf");
  if (iinf) {
    const ver = b[iinf.at];
    for (const e of boxes(b, v, iinf.at + (ver ? 8 : 6), iinf.end).filter((x) => x.type === "infe")) {
      const ev = b[e.at], wide = ev >= 3, id = wide ? v.getUint32(e.at + 4) : v.getUint16(e.at + 4), o = e.at + 4 + (wide ? 4 : 2) + 2;
      if (ev >= 2) items.set(id, four(o));
    }
  }
  // references: thmb, auxl, dimg, cdsc from an item to the ones it names
  const refs = [], iref = get("iref");
  if (iref) {
    const wide = b[iref.at] === 1;
    for (const r of boxes(b, v, iref.at + 4, iref.end)) {
      const from = wide ? v.getUint32(r.at) : v.getUint16(r.at), n = v.getUint16(r.at + (wide ? 4 : 2)), to = [];
      for (let i = 0; i < n; i++) to.push(wide ? v.getUint32(r.at + 6 + 4 * i) : v.getUint16(r.at + 4 + 2 * i));
      refs.push({ type: r.type, from, to });
    }
  }
  // the item properties, and which item has which
  const props = [], assoc = new Map(), iprp = get("iprp");
  if (iprp) {
    const parts = boxes(b, v, iprp.at, iprp.end), ipco = parts.find((x) => x.type === "ipco"), ipma = parts.find((x) => x.type === "ipma");
    if (ipco) props.push(...boxes(b, v, ipco.at, ipco.end));
    if (ipma) {
      const ver = b[ipma.at], flags = b[ipma.at + 3];
      let o = ipma.at + 8;
      for (let i = 0, n = v.getUint32(ipma.at + 4); i < n; i++) {
        const id = ver < 1 ? v.getUint16(o) : v.getUint32(o); o += ver < 1 ? 2 : 4;
        const k = b[o++], list = [];
        for (let j = 0; j < k; j++) { const x = flags & 1 ? v.getUint16(o) & 0x7fff : b[o] & 0x7f; o += flags & 1 ? 2 : 1; list.push(props[x - 1]); }
        assoc.set(id, list.filter(Boolean));
      }
    }
  }
  const prop = (id, t) => (assoc.get(id) || []).find((p) => p.type === t);
  const derived = new Set(refs.filter((r) => ["thmb", "auxl", "cdsc"].includes(r.type)).map((r) => r.from));
  const tiles = new Set(refs.filter((r) => r.type === "dimg").flatMap((r) => r.to));
  const images = [...items].filter(([id, t]) => t !== "Exif" && t !== "mime" && !derived.has(id) && !tiles.has(id));
  fields.push(["Images", String(images.length)]);
  const size = (id) => { const p = prop(id, "ispe"); return p ? `${v.getUint32(p.at + 4)} × ${v.getUint32(p.at + 8)} px` : null; };
  const thumbs = refs.filter((r) => r.type === "thmb" && r.to.includes(primary)).map((r) => size(r.from)).filter(Boolean);
  if (thumbs.length) fields.push(["Thumbnails", thumbs.join(", ")]);
  const aux = refs.filter((r) => r.type === "auxl" && r.to.includes(primary)).map((r) => {
    const c = prop(r.from, "auxC"); return c ? new TextDecoder().decode(b.subarray(c.at + 4, c.end)).replace(/\0[\s\S]*$/, "") : "auxiliary";
  });
  if (aux.length) fields.push(["Auxiliary images", aux.join(", ")]);
  if (primary !== null) {
    const pixi = prop(primary, "pixi");
    if (pixi) { facts.bits = b[pixi.at + 5]; fields.push(["Channels in file", String(b[pixi.at + 4])]); }
    const irot = prop(primary, "irot");
    const turn = irot ? (b[irot.at] & 3) * 90 : 0;
    if (turn) fields.push(["Rotation", turn === 270 ? "90° clockwise" : `${turn}° anticlockwise`]);
    const colr = prop(primary, "colr");
    if (colr) {
      const k = four(colr.at);
      if (k === "prof" || k === "rICC") { const p = iccName(b.subarray(colr.at + 4, colr.end)); if (p) fields.push(["Colour profile", p]); }
      else if (k === "nclx") fields.push(["Colour primaries", String(v.getUint16(colr.at + 4))], ["Transfer", String(v.getUint16(colr.at + 6))]);
    }
  }
  // the EXIF item the primary image carries, where iloc says it lies
  const exifId = [...items].find(([id, t]) => t === "Exif" && refs.some((r) => r.type === "cdsc" && r.from === id && r.to.includes(primary)))?.[0]
    ?? [...items].find(([, t]) => t === "Exif")?.[0];
  const at = exifId != null && get("iloc") ? itemAt(b, v, get("iloc"), exifId) : null;
  if (at !== null && at + 4 <= b.length) {
    const e = exifAt(b, at + 4 + v.getUint32(at));
    fields.push(...e.fields); Object.assign(facts, e.facts);
  }
  return { fields, facts };
}
// where an item's data starts in the file, from the iloc box (its first extent; data in the file itself)
function itemAt(b, v, iloc, want) {
  const ver = b[iloc.at], sizes = (b[iloc.at + 4] << 8) | b[iloc.at + 5];
  const offSize = sizes >> 12, lenSize = (sizes >> 8) & 15, baseSize = (sizes >> 4) & 15, idxSize = ver ? sizes & 15 : 0;
  const num = (o, n) => (n === 8 ? Number(v.getBigUint64(o)) : n === 4 ? v.getUint32(o) : n === 2 ? v.getUint16(o) : 0);
  let o = iloc.at + 6;
  const count = ver < 2 ? v.getUint16(o) : v.getUint32(o); o += ver < 2 ? 2 : 4;
  for (let i = 0; i < count; i++) {
    const id = ver < 2 ? v.getUint16(o) : v.getUint32(o); o += ver < 2 ? 2 : 4;
    const method = ver ? v.getUint16(o) & 15 : 0; if (ver) o += 2;
    o += 2;
    const base = num(o, baseSize); o += baseSize;
    const n = v.getUint16(o); o += 2;
    let first = null;
    for (let j = 0; j < n; j++) { o += idxSize; const off = num(o, offSize); o += offSize + lenSize; if (j === 0) first = base + off; }
    if (id === want) return method === 0 ? first : null;
  }
  return null;
}
