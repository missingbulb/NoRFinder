// How the viewer shows an image's channels: each channel's name, colour and description, and the lookup that
// maps its pixels, between its black and white points, onto its colour.

// a channel neither the study nor the file colours, by its place: red, green and blue, then more; and a channel
// neither names, by its colour when it is one of these
const PLACES = [["Red", "#ff0000"], ["Green", "#00ff00"], ["Blue", "#0000ff"], ["Magenta", "#ff00ff"], ["Cyan", "#00ffff"],
  ["Yellow", "#ffff00"], ["Orange", "#ff8000"], ["Grey", "#ffffff"]];
const NAMED = Object.fromEntries(PLACES.map(([name, colour]) => [colour, name]));

// One entry per plane: what the study says of the channel at that place wins, then what the file says
// (fileChannels, from the study's Python), then the channel's place; a lone channel nothing colours is grey.
// fileName: the file's own name for a channel the study names otherwise, null when there is nothing to add.
export function resolve(studyChannels, fileChannels, n) {
  return Array.from({ length: n }, (_, k) => {
    const s = studyChannels?.[k] || {}, f = fileChannels?.[k] || {};
    const place = n === 1 ? "#ffffff" : PLACES[k % PLACES.length][1];
    const colour = (s.colour || f.colour || place).toLowerCase(), name = s.name || f.name || NAMED[colour] || `Channel ${k + 1}`;
    return {
      name, colour, about: s.about || "",
      fileName: f.name && f.name !== name ? f.name : null,
      shown: s.shown ?? true, black: s.black ?? 0, white: s.white ?? 255,
    };
  });
}

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

// [red, green, blue] lookups of 256 entries: a pixel at or below the black point is dark, one at or above the
// white point the channel's full colour, and the ones between in proportion
export function ramp({ colour, black, white }) {
  const c = rgb(colour), out = c.map(() => new Uint8Array(256));
  for (let v = 0; v < 256; v++) {
    const t = Math.min(1, Math.max(0, (v - black) / Math.max(1, white - black)));
    for (let k = 0; k < 3; k++) out[k][v] = Math.round(t * c[k]);
  }
  return out;
}
