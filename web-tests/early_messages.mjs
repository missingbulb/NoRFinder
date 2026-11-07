// The start of a stand-in worker's source: the page posts the image's file and its first call as soon as it starts
// Python, and a stand-in that awaits its answers before it sets onmessage would lose them; these keep them, in
// order, for the handler it sets.
export const EARLY = `{
  const early = []; let handler = null;
  self.addEventListener("message", (e) => (handler ? handler(e) : early.push(e)));
  Object.defineProperty(self, "onmessage", { configurable: true, get: () => handler, set: (f) => { handler = f; for (const e of early.splice(0)) f(e); } });
}
`;
