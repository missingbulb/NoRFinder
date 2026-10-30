// The release's gate: has the default branch moved since the last release went out?
//
// This is the task's own term because no built-in asks the question a release asks.
// `substantive-change` excludes task-authored commits, so a recount another task
// landed — a real change to what the site serves — would read as silence and never
// ship. `any-commit` includes them but measures a WINDOW, so the release's own bump
// commit keeps the window non-empty and every night re-releases the same bytes under
// a fresh version number.
//
// What ends that loop is position, not membership: the newest release commit is a
// high-water mark, and only what sits above it is unreleased. That is the same guard
// `[skip ci]` used to be, stated as a fact about the branch rather than as a flag on
// a commit message — nothing can accidentally re-arm a release by rewording a commit.

// Which commits are the release's own, read structurally off the `Claudinite-Task:`
// trailer every task-authored commit carries. The worker stamps it from the queue's
// own `CLAUDINITE_PACK`/`CLAUDINITE_TASK`; the test holds this literal against the
// two directory names those are derived from.
export const RELEASE_TASK_ID = 'cloudflare-site/site-release';

// The `commits` signal lists the window's default-branch commits NEWEST FIRST — the
// order the GitHub commits API returns and the collector preserves — which is what
// makes "above the high-water mark" a slice.
export function unreleasedCommits(list = []) {
  const mark = list.findIndex((c) => c?.task === RELEASE_TASK_ID);
  return (mark === -1 ? list : list.slice(0, mark)).filter((c) => c?.task !== RELEASE_TASK_ID);
}

export const terms = {
  'unreleased-commits': {
    signals: ['commits'],
    holds(signals) {
      const list = signals?.commits?.list ?? [];
      const unreleased = unreleasedCommits(list);
      if (!unreleased.length) {
        return {
          holds: false,
          reason: list.length
            ? 'the newest default-branch commit is the last release itself — nothing has landed since it'
            : 'no commit landed on the default branch in the window',
        };
      }
      return {
        holds: true,
        reason: `${unreleased.length} commit(s) landed on the default branch since the last release`,
        context: [`Releasing ${unreleased.length} commit(s), newest first: ${unreleased.map((c) => String(c.sha ?? '?').slice(0, 7)).join(', ')}.`],
      };
    },
  },
};
