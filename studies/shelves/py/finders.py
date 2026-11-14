"""The Bookshelf Reader's finders side by side, as the page's list (web/algorithms.json) offers them: each version's
module, and the books a version finds. Each module's find(rgb, text) takes the text finder's map where the page ran it
(the list's reads_text)."""
import importlib

VERSIONS = {'r8': 'books', 'r5': 'r5_edges'}


def find(version, rgb, text=None):
    return importlib.import_module(VERSIONS[version]).find(rgb, text)
