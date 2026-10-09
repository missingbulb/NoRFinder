## 2026-10-03 · born · the owner asked for a daily ground-truth intake, by code, then an agent run
- **Source:** the owner, in the project thread on the ground-truth workflow: "a daily task that goes
  over all open issues and if there are issues marked with new-ground-truth label - take them, add
  them to the repo … Do all of this in code, not agentic work. After those were added - run the
  agentic part (run on opus5.5)."
- **Reason:** submissions from the page arrive as GitHub issues; nobody should have to copy them into
  the repo by hand, and the finders should be re-tuned whenever the reference improves.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a scheduled task in the local pack: its own precondition term (an open issue wears
  the label), code-work that ingests and re-records the baseline, and an opus agent phase following
  the improve-on-ground-truth skill.

## 2026-10-03 · policy-changed · the intake's pull request stays open for the agent
- **Source:** the owner, in the project thread on the intake run: "The PR closes before the agent
  works and that breaks the agentic flow that expects an open PR (fix the coded part to not merge
  the PR)."
- **Reason:** the executor's generated-file delivery lands a pull request wherever the repo allows
  auto-merge, whatever the task's own `automerge`, so #306 merged before the agent started and the
  agent had nothing to push onto.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** the worker opens the pull request itself and hands it to the landing lane as a
  review delivery, which starts its checks and merges nothing.

## 2026-10-09 · policy-changed · the worker moved onto cn's task SDK with the repo's move off the Node engine
- **Reason:** the Node tasks pack's delivery and trailer helpers it imported are gone under cn.
- **Actor:** @missingbulb (owner), re-adoption onto cn.
- **Model:** Claude.
- **Mechanism:** the commit carries the SDK's trailers, the push goes through the SDK's `git`, and
  the pull request opens through `github.openPr`; the task's `automerge: nothing` keeps it open for
  the agent, which replaces the old explicit review delivery. Refusal comments go through
  `github.createComment`; reading issues and comments and removing the label stay REST calls under
  the job token.
