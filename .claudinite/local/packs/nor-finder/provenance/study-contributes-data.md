## 2026-11-14 · born · studies contribute data, the shell decides
- **Source:** the owner, on PR #936: "I would really want the algorithms to be viewed as data that
  each study contributes. In general we should strive for that - as little code making decisions in
  the studies, just provide data for the shell decision-maker."
- **Reason:** each study had grown its own generator for the shell's list of algorithms, three
  near-copies.
- **Actor:** @missingbulb (owner).
- **Model:** claude-opus-5-5
- **Mechanism:** prose in the repo's pack: whether study code "decides" is a judgment no check can
  read.
- **Retire when:** the study contract (study.json's schema) has no room for study code in the
  shell's place.
- **Landed:** #936
