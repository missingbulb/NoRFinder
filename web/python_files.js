// What a study's Python downloads: Python itself, from Pyodide's CDN, and the packages its study.json names, from
// Pyodide's own set and the wheels the build vendors. The worker downloads them; making a study available offline keeps them.
export const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v314.0.7/full/";
// Python itself: what loadPyodide fetches before any package
export const CORE = ["pyodide.mjs", "pyodide.asm.mjs", "pyodide.asm.wasm", "python_stdlib.zip", "pyodide-lock.json"].map((f) => PYODIDE + f);

// [{url, sha256}] a study's packages (sha256 only for Pyodide's own): python, its study.json's python; lock,
// Pyodide's pyodide-lock.json; vendored, the build's vendor/wheels.json, whose files are under vendorBase
export function packagesOf(python, lock, vendored, vendorBase) {
  // the build vendors every study's wheels; this study's are the ones its study.json pins, by name and version
  const wheel = (pin) => pin.replace("==", "-").replace(/-/g, "_").toLowerCase();
  const own = vendored.filter((w) => python.wheels.some((pin) => w.toLowerCase().replace(/-/g, "_").startsWith(wheel(pin) + "_")));
  return python.packages
    .map((n) => ({ url: PYODIDE + lock.packages[n].file_name, sha256: lock.packages[n].sha256 }))
    .concat(own.map((w) => ({ url: new URL(w, vendorBase).href })));
}

// {name: address} the modules directly in a study's folders, its Python's bases in the order the importer tries them,
// as the release's offline list names them (listing: its offline.json; app: the address its paths are from); null
// without a listing, when every name is asked of the site
export function studyModules(listing, bases, app) {
  if (!listing) return null;
  const found = {}, urls = new Set(listing.files.map((f) => new URL(f.path, app).href));
  for (const base of bases) {
    for (const url of urls) {
      if (!url.startsWith(base)) continue;
      const name = url.slice(base.length);
      if (/^\w+\.py$/.test(name) && !(name.slice(0, -3) in found)) found[name.slice(0, -3)] = url;
    }
  }
  return found;
}
