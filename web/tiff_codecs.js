// The TIFF compressions Python's tifffile reads only through imagecodecs, which Pyodide does not carry, decoded
// in Python by the page's own TIFF reader instead: LZW, what ImageJ and bfconvert write when asked to compress.
import { lzw } from "./split.js";

// into a Python, taking hold of tifffile when it is first imported, so a study that never reads a TIFF pays nothing
export function tiffCodecs(py) {
  py.globals.set("js_lzw", lzw);
  py.runPython(`
import sys

if 'TiffCodecs' not in globals():
    from pyodide.ffi import to_js

    def lzw_decode(data, /, *, out=None, **_):
        if not isinstance(out, int):
            raise ValueError('an LZW strip of unknown size')
        return js_lzw(to_js(memoryview(data)), out).to_bytes()

    def with_codecs(tifffile):
        tifffile.TIFF.DECOMPRESSORS._codecs.setdefault(5, lzw_decode)

    class TiffCodecs:
        def find_spec(self, name, path=None, target=None):
            if name != 'tifffile':
                return None
            import importlib.machinery
            spec = importlib.machinery.PathFinder.find_spec(name, path)
            if spec is not None:
                run = spec.loader.exec_module
                def exec_module(module):
                    run(module)
                    with_codecs(module)
                spec.loader.exec_module = exec_module
            return spec

    if 'tifffile' in sys.modules:
        with_codecs(sys.modules['tifffile'])
    else:
        sys.meta_path.insert(0, TiffCodecs())
`);
}
