## 2026-07-27 · born · Claudinite growth: discover local pack vascular-coloring (#23)
- **Source:** the weekly growth-discover-packs run (#14), distilled from
  `analysis/WORKING-GUIDE.md`'s locked metric definitions.
- **Reason:** changing what a metric means changes every recorded number, so COUNT, CATEGORIZE and
  MEASURE are fixed.
- **Actor:** @missingbulb (owner).
- **Mechanism:** a RULES.md section.
- **Landed:** #23.

## 2026-07-28 · converted · Combine both prose-to-checks sweeps into one pack change (#35)
- **Source:** the prose-to-checks sweep's conversion #30.
- **Reason:** the rule's one static signature - the extraction script keeps reporting all three
  asks' fields - became a check; deletion test: the prose stays, since the definitions and the
  judgment that re-defining one is an owner call (the column keeps its name while the quantity under
  it moves, so old numbers are re-measured, never re-labelled) are not checkable.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** the blocking world check `locked-metric-fields`, parsing the metrics dict in
  `analysis/measure_vessels.py`.
- **Landed:** #35.

## 2026-08-16 · reworded · Claudinite growth: dedup local packs (#128)
- **Source:** growth dedup (#18), after research-project gained new sections.
- **Reason:** the "re-defining is an owner call, re-measured never re-labelled" clause is
  research-project's "A metric's definition is part of its identity"; kept the three definitions and
  the check.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #128.

## 2026-09-25 · reworded · heading section rewritten as a marked rule block (#512)
- **Reason:** the `##` heading sections carried no marker, so the provenance tool tracked none of
  them; each became one bold-triggered block keyed to the act, ending in its marker, its strength
  and act-time detail kept.
- **Actor:** @missingbulb (owner).
- **Landed:** #512.

## 2026-10-31 · moved · from missingbulb/vascularColoring's vascular-coloring pack into vascular-study
- **Source:** the owner: migrate vascularColoring into a new study, its requirements and Claudinite
  pack elements included.
- **Reason:** the study now lives in studies/vascular/; paths rewritten to it, and mentions of
  checks not yet ported dropped.
- **Actor:** @missingbulb (owner).
- **Model:** claude-opus-5-5
- **Mechanism:** unchanged carrier, now in the study's own local pack.
