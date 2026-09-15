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
  // The image ships no scientific Python, so every session otherwise re-installs it before it
  // can run the detector or its invariance test. Declared here rather than in the web pack's
  // setup body, which is generic for every project.
  //
  // requirements.txt is the single place the dependency set is named -- listing the packages
  // again here would be a second copy to drift.
  env: {
    label: 'Python imaging stack (numpy, scipy, pillow, matplotlib)',
    setup: 'python3 -m pip install --quiet --root-user-action=ignore -r requirements.txt',
    probe: 'python3 -c "import numpy, scipy, PIL, matplotlib" >/dev/null 2>&1',
  },
};
