## 2026-11-04 · born · the owner does not review the shell-states harness (#756)
- **Source:** the owner: "I will not review the files you create. I consider this entire mechanism
  as a harness for development, requirement evolution, regression prevention, and potentially future
  abstractions based on findings from the file. Do not consider the files reviewed, but use them to
  ask me questions."
- **Actor:** @missingbulb (owner).
- **Mechanism:** prose in RULES.md: deciding which case is a question for the owner is judgment no
  check can make.
- **Retire when:** the owner reviews the shell-states files, or the mechanism is retired.
- **Landed:** #756

## 2026-11-05 · scope-changed · the fixture study's elements moved into its own states.json
- **Reason:** the owner moved each study's part of the shell's states under that study's folder
  (req/checks/spec-layout); the harness now spans two files.
- **Actor:** @missingbulb (owner).
- **Mechanism:** prose, the same rule; only its trigger names the second file.
