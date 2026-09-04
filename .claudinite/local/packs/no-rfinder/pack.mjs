// no-rfinder — this repo's own pack: everything local, and portable nowhere. Its rules,
// and the checks, skills and tasks that carry them, all live here.
// Seeded empty at adoption; everything in it is this repo's to write. A lesson that
// would hold in another repo belongs in a canon pack instead — propose it upstream.
//
// The id is this directory's name and the prose is the RULES.md beside this file —
// both by convention (engine/pack_loader/pack-conventions.mjs), so neither is
// declared here.
export default {
  version: 1,
  ruleRoutingGuidance: {
    belongs: 'everything specific to this repository and portable nowhere else: its working rules, and the checks, skills and tasks carrying them',
    excludes: 'anything true beyond this repo — that belongs in a canon pack, proposed upstream',
  },
  detect: null,
  marker: null,
  worldRules: [],
};
