# Version history

Records for `packs/research-project/pack.mjs`'s `version` field, one row per version, newest first.
A version is cut on `main` after its changes land, so a row names the pull requests that
landed between the previous version and this one; the weekly history task writes the rows
a version is missing and leaves every row that already stands.

| Version | Date | What changed |
|---|---|---|
| 60902.1 | 2026-09-02 | The playbook framing (three paragraphs on what the pack is and how to adapt it) goes to the pack README; the interaction cadence becomes bullets. |
| 60901.1 | 2026-09-01 | Recovers the rationale #467 cut from the naive-baseline rule into a new `references.md` (#1571). |
| 60822.1 | 2026-08-22 | The manifest stops restating its own tree (#1246): `id`, `prose`, `badge`, `skills`, `worldRules` and `workRules` are resolved from the pack directory and an absent `detect`/`marker` means no fingerprint. Coded rules move into `worldRules/`/`workRules/` and tests into `test/`, which no vendor set ships. `minEngineVersion` rises to the engine release that reads all of it. |
| 60820.1 | 2026-08-20 | Engine and pack versions become date-anchored `<day>.<n>` (#1105) |
| 2 | 2026-08-18 | Index every pack's rules and checks with words, severity and reason (#915); Bump every pack whose content was edited without a version bump (#969) |
| 1 | 2026-08-12 | Context-relief architecture: packs (prose + checks) and skills, with enforcement (#128); Growth promote (2026-07-11): portable lessons into canon (#222); No pack is active by default — the basics pack (né universal) is declared explicitly (#232); Tighten every RULES.md to when + what + one non-obvious fact (#467); Growth: promote 5 lessons from the fleet's local packs (#497); Pack badges: a mark per pack, and a README row bootstrap and baselining maintain (#525); Growth promote: 10 lessons from 7 members into the canon (#541); Pack manifest as the single source: routing guidance, skills, scoped rules (#555); growth-promote: dedupe PR #740's rule additions and cut the language (#751); Versioned updates Phase 0: version scaffolding (#769) |
