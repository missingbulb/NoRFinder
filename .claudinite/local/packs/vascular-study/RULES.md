# vascular-study — the Vascular Measurements study's own pack

The home for what is specific to the Vascular Measurements study, `studies/vascular/`: cerebral
vessels in CD31 confocal images and z-stacks, categorized, counted and measured. A study is
removable, so nothing outside `studies/vascular/` and this pack depends on it; this pack may depend
on the repo's own `nor-finder` pack, never the reverse.

- **Defining, computing or reporting a vessel metric** — the definitions are locked: COUNT =
  branch **segments** (junction-to-junction / junction-to-tip, *not* connected components, which
  are reported alongside), CATEGORIZE = **caliber**, MEASURE = **total centerline length**.
  (locked-metric-definitions)

- **Needing a fact about the samples or the acquisition that the files do not carry** (the z-step,
  a stain, an objective, which region a stack shows) — ask the owner for it in the thread, as one
  direct question, before treating it as unknown; a listed "open question" is not asking. Record
  the answer, with who gave it, where the value is read from (`studies/vascular/data/sources.json`
  for the stacks). (ask-before-unknown)
