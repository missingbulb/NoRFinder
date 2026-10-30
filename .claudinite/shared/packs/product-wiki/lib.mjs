// The one path constant the manifest still reads from code: the human-reviewed
// product-requirements sink, which doubles as the pack's fingerprint marker.
// Every other path the standard hangs off — the index README, the wiki-page
// classifier, the section/bullet/date grammar — lives as data in
// declared-checks.json beside this file, run by the declarative engine
// (engine/checks/helpers/pattern-rules.mjs); the wiki set itself is STRUCTURAL
// (a README.md at depth >= 2 under product-wiki/, outside the sink and
// sample-data/ subtrees), so nothing has to be kept in sync by hand.
export const SINK_README = 'product-wiki/product-requirements/README.md';
