"""v5, no short islands: v4, then a vessel that touches no junction at either end is dropped when it is
shorter than a typical capillary segment.

The owner's rule (2026-10-29): short vessels connected to no junction are not interesting even when
they are traced correctly; they are noise for the network. The owner left "short" to us. It is the
median length of one capillary segment in cortex, about 45 µm (Ji 2021, Smith 2019;
references/BIOLOGY-INVARIANTS.md): a lone piece shorter than one segment carries no branching to
measure and cannot be told from a stretch of a vessel that dips in and out of the stack. Longer lone
vessels stay. Candidates count too: a candidate island is dropped the same way.
"""
import os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.join(HERE, '..'))
import score as sc
import v2_scored_repair as v2
import v4_line_evidence as v4

NAME = 'v5-no-short-islands'

ISLAND_UM = 45.0   # BIOLOGY: median cortical capillary segment length (Ji 2021: 46 µm; Smith 2019: 44.8 µm); fails where segments are much shorter, e.g. dense CA1 beds


def extract(vol, um, source, z_step):
    m = v4.extract(vol, um, source, z_step)
    m['repairs']['short_islands_dropped'] = drop_short_islands(m)
    v2.renumber(m)
    m['algorithm'] = NAME
    return m


def drop_short_islands(m):
    """Each edge whose two ends meet nothing else, live edges of any state counted, goes when shorter than ISLAND_UM."""
    deg = v2.degrees(m, only_confirmed=False)
    nodes = v2.nodes_of(m)
    out = 0
    for e in list(m['edges']):
        if e.get('state') == 'rejected' or e['a'] == e['b']:
            continue
        if deg.get(e['a']) == 1 and deg.get(e['b']) == 1 and sc.edge_length_um(e, nodes) < ISLAND_UM:
            m['edges'].remove(e); out += 1
    return out
