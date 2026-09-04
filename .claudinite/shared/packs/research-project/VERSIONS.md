# Version history

Records for `packs/research-project/pack.mjs`'s `version` field, one row per bump — added going forward from
the version this file was introduced beside (60820.1); earlier bumps are not backfilled.

| Version | Date | What changed |
|---|---|---|
| 60902.1 | 2026-09-02 | The playbook framing (three paragraphs on what the pack is and how to adapt it) goes to the pack README; the interaction cadence becomes bullets. |
| 60822.1 | 2026-08-22 | The manifest stops restating its own tree (#1246): `id`, `prose`, `badge`, `skills`, `worldRules` and `workRules` are resolved from the pack directory and an absent `detect`/`marker` means no fingerprint. Coded rules move into `worldRules/`/`workRules/` and tests into `test/`, which no vendor set ships. `minEngineVersion` rises to the engine release that reads all of it. |
| 60901.1 | 2026-09-01 | Recovers the rationale #467 cut from the naive-baseline rule into a new `references.md` (#1571). |
