// The `barriers` pack was absorbed into `basics` (#1681). Its check, its
// contribution seam and its guide moved; the engine's rename map resolves the id,
// so a member's packs activate correctly whether or not this record has run.
//
// WHAT ONLY THIS RECORD CAN DO is the declaration's SHAPE. The rename map moves an
// id; it does not move the parameters underneath one, and a repo's folder-access
// graph is exactly that — an array the owner wrote, which no reader could relocate
// on its own without inventing a second place to look for it forever. So the
// entry's `config` nests under `barriers` on the surviving `basics` entry, which
// is where the absorbed check now reads it.
//
// The recorded `goals` answer goes with it. It answered the barriers pack's one
// adoption question, which #1681 removed — the pack was never chosen (no
// fingerprint, pulled in by `requires` everywhere the baseline is declared), so the
// interview was guiding an adoption that never happened. Left in place it would
// read as an answer to a question `basics` does not ask, which is an
// interview-hygiene finding with no edit that clears it.
//
// GATED ON THE MOUNT, BY CONTENT. The nesting is `absorbedPackConfig`, a named op in
// the ENGINE's registry, and an engine that predates it would run the rename and skip
// the nesting — leaving the graph flat on the basics entry where nothing reads it, a
// silently unenforced barrier. So `appliesTo` probes the member's own mounted registry
// for the op rather than trusting a version; an unreadable mount reads as "not
// capable". The canon runs the same probe against its own tree (two-root form).
//
// WHAT SATISFIES THAT GATE IS RUN ORDER, NOT A RELEASE. A member's converge clones
// canon HEAD and replaces its engine subtree wholesale, whatever `ENGINE_VERSION`
// says, and the engine flow runs BEFORE the pack flow (tasks/update/worker.mjs) so
// that packs are never checked against yesterday's engine. So the op is already in the
// mount by the time this record runs, on the same converge that delivers it.
//
// WHICH MATTERS BECAUSE THERE IS ONLY ONE SHOT. `migrationApplies` is `want > have`
// against the stamped pack version, and pack-update stamps this pack at the manifest's
// number in the same run that applies its records. A cycle where the gate read false
// would stamp anyway, and the record would be out of range — and out of the vendor set
// — from then on, with nothing to bring it back but a redelivery record (#1545 is that
// repair done once already). The ordering above is what keeps that from happening.
//
// NOTHING DEPENDS ON THIS HAVING RUN. The rename map resolves the id and the
// absorbed check keeps a legacy read of the old placement until #1682, so a member
// is correct either way. What it buys is the day both tolerances can come out.
const REGISTRY = 'engine/migrations/registry.mjs';
const mountNestsAbsorbedConfig = async (read) => {
  const text = (await read(`.claudinite/shared/${REGISTRY}`)) ?? (await read(REGISTRY));
  return Boolean(text) && text.includes('absorbedPackConfig');
};

export default {
  id: 'barriers-absorbed',
  landed: '2026-09-04',
  version: '60904.1',
  summary: 'the barriers pack is absorbed into basics (#1681) — the declared entry is renamed and its folder-access graph nests under `config.barriers` on the basics entry',

  appliesTo: mountNestsAbsorbedConfig,

  // The ids come from the engine's rename map (renamed-packs.mjs); this record adds
  // only what the map cannot say — that `barriers` was absorbed rather than
  // renamed, so its parameters nest and its answer is retired with its question.
  renameDeclaredPacks: true,
  absorbedPackConfig: [{ id: 'barriers', dropAnswers: ['goals'] }],
};
