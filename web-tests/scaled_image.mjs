// The fixture's image as a file that records a pixel's size, for a test that opens it at a scale: an ImageJ TIFF of
// the answers' grey plane (ANSWERS, written by test_study_runs.py), its pixel um[0] µm wide and um[1] µm tall.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { writeTiff } from "../web/split.js";

export function scaledImage(answers, um) {
  const A = JSON.parse(fs.readFileSync(answers, "utf8")), plane = Buffer.from(A.images, "base64");
  const res = (side) => [1e6, Math.round(side * 1e6)];
  const tiff = writeTiff({ w: A.opened.W, h: A.opened.H, bps: 1, planes: [new Uint8Array(plane)], xres: res(um[0]), yres: res(um[1]),
    description: "ImageJ=1.54f\nunit=micron\n" });
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "scaled-")), "squares.tif");
  fs.writeFileSync(out, tiff);
  return out;
}
