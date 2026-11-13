"""The Bookshelf Reader's finders side by side: each version's module, the one the page runs first, and the books a
version finds. A version's module carries its menu (TITLE, ICON, READS_TEXT, TUNED, STEPS) and find(rgb[, text])."""
import importlib

VERSIONS = {'r8': 'books', 'r5': 'r5_edges'}
DEFAULT = 'r8'


def find(version, rgb, text=None):
    mod = importlib.import_module(VERSIONS[version])
    return mod.find(rgb, text) if mod.READS_TEXT else mod.find(rgb)
