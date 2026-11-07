// The vascular study's channels in its own order, CD31 first (req/shell/image/open): a two-channel stack is an original,
// DAPI then CD31 (data/README.md, established by looking at the four originals' max projections); a single-channel one
// is CD31 cut from them.
export const order = (im) => (im.channels.length === 2 ? [1, 0] : []);
