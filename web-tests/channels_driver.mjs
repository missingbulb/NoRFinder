// Checks how the viewer names and colours each channel of an image (web/channels.js): what the study says
// first, then what the file says, then red, green and blue in order (a single channel grey); and the
// lookup that turns a channel's black and white points into its colour. Exits 1 on a failed check.
//   node web-tests/channels_driver.mjs
import { resolve, ramp } from "../web/channels.js";

let failed = false;
const check = (ok, what, seen) => { console.log((ok ? "ok: " : "FAILED: ") + what + (ok ? "" : ": " + JSON.stringify(seen))); failed ||= !ok; };

const study = [{ name: "DAPI", colour: "#8000ff", about: "Nuclei.", shown: true, black: 10, white: 200 }];
const file = [{ name: "C1", colour: "#0000ff" }, { name: "Caspr", colour: "#00ff00" }, {}, { name: "C4" }];
const r = resolve(study, file, 5);
check(r.length === 5, "one channel per plane", r);
check(r[0].name === "DAPI" && r[0].colour === "#8000ff" && r[0].about === "Nuclei." && r[0].fileName === "C1", "the study's words win, the file's name kept beside them", r[0]);
check(r[0].black === 10 && r[0].white === 200, "with the study's black and white points", r[0]);
check(r[1].name === "Caspr" && r[1].colour === "#00ff00" && r[1].fileName === null, "the file names and colours a channel the study does not", r[1]);
check(r[2].name === "Blue" && r[2].colour === "#0000ff", "a channel neither names is red, green or blue by its place", r[2]);
check(r[3].name === "C4" && r[3].colour !== r[0].colour && /^#[0-9a-f]{6}$/.test(r[3].colour), "a fourth channel the file names but does not colour gets a colour of its own", r[3]);
check(r.every((c) => c.shown === true || c === r[0]) && r[4].black === 0 && r[4].white === 255, "shown, from black to white, unless the study says otherwise", r[4]);
const coloured = resolve([], [{ colour: "#0000FF" }, { colour: "#00ff00" }, { colour: "#123456" }], 3);
check(coloured.map((c) => c.name).join() === "Blue,Green,Channel 3", "a channel the file colours but does not name is named for its colour", coloured);
const plain = resolve([], [], 3);
check(plain.map((c) => c.name + c.colour).join() === "Red#ff0000,Green#00ff00,Blue#0000ff", "nothing said: red, green and blue", plain);
check(resolve([], [], 1)[0].name === "Grey" && resolve([], [], 1)[0].colour === "#ffffff", "a single channel nothing names is grey");
check(resolve([], [{ name: "Ch1", colour: "#00ff00" }], 1)[0].fileName === null, "a name the channel already shows is not repeated");

const [R, G, B] = ramp({ colour: "#ff8000", black: 50, white: 150 });
check(R[0] === 0 && R[50] === 0 && R[150] === 255 && R[255] === 255 && R[100] === 128, "below the black point dark, above the white point full", [R[50], R[100], R[150]]);
check(G[150] === 128 && B[150] === 0, "full in the channel's own colour", [G[150], B[150]]);
process.exit(failed ? 1 : 0);
