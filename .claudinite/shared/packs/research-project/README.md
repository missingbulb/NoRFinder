# research-project pack

A project-class pack (prose-only, declared — no fingerprint) for the recurring class: run an algorithm over similarly-formatted inputs, score against user ground truth, improve in reviewable iterations. Its 14 sections are all prose (methodology and judgment, no static signatures to check).

## Rules (`RULES.md`)

| Rule | Severity | Reason | Enforcement |
|---|---|---|---|
| Never annotate in the signal's own colour | medium | correctness | prose: 63 words |
| Show where the method breaks | high | correctness | prose: 71 words |
| Say which reported numbers are trustworthy | high | correctness | prose: 112 words |
| Show the owner pictures, proactively | medium | complexity | prose: 35 words |
| Leave finished work committed and pushed | medium | complexity | prose: 24 words |
| The owner's annotations are the ground truth. | high | correctness | prose: 24 words |
| Ground truth is annotated, never fabricated. | critical | correctness | prose: 38 words |
| Separate source-of-truth from generated artifacts. | high | correctness | prose: 52 words |
| Make extraction deterministic and self-checking. | high | correctness | prose: 34 words |
| Auto-detect annotation conventions from the data | medium | correctness | prose: 53 words |
| Verify the annotation parses before scoring | high | correctness | prose: 42 words |
| State the input format explicitly | medium | complexity | prose: 26 words |
| Name the target regime and its scope | medium | complexity | prose: 42 words |
| Scale-awareness is a first-class concern. | medium | correctness | prose: 50 words |
| No single-input special-casing. | high | correctness | prose: 35 words |
| Keep the measured prior out of decisions | high | correctness | prose: 50 words |
| Prefer scale-free rules over pixel/absolute constants. | medium | correctness | prose: 34 words |
| Name the constraint the task can't trade | medium | complexity | prose: 52 words |
| Register each domain assumption's failure mode | high | correctness | prose: 74 words |
| Guard the wins with regression tests. | high | correctness | prose: 29 words |
| What was wrong | low | complexity | prose: 14 words |
| What changed | low | complexity | prose: 12 words |
| The metric delta | medium | complexity | prose: 13 words |
| What you tried and rejected, and why | medium | complexity | prose: 28 words |
| Source updated — never the generated artifacts. | high | correctness | prose: 10 words |
| Artifacts regenerated | medium | correctness | prose: 7 words |
| Tests green | medium | correctness | prose: 12 words |
| Committed with a clear message and pushed | medium | complexity | prose: 22 words |
| Learnings cached | medium | complexity | prose: 27 words |
| Separate work into explicit phases | medium | complexity | prose: 46 words |
| Distinguish research spikes from the maintained pipeline. | medium | complexity | prose: 46 words |
| Keep a deferred-items list | medium | complexity | prose: 25 words |
| Write self-contained notes on the source | medium | complexity | prose: 40 words |
| Capture the method inside a figure | medium | complexity | prose: 58 words |
| Write down what the source omits | medium | complexity | prose: 63 words |
| Record where you diverge from the reference | low | complexity | prose: 12 words |
| State what you deliberately omitted | medium | complexity | prose: 65 words |
| Samples | medium | correctness | prose: 35 words |
| Render documents with a library | medium | correctness | prose: 62 words |
| Verify an extracted image against its input | medium | correctness | prose: 43 words |
| Grow the corpus from matching public sources | medium | correctness | prose: 35 words |
| Make ingestion a committed, repeatable fetch script | medium | complexity | prose: 18 words |
| Don't mix the two validation tiers | high | correctness | prose: 78 words |
| External data is rarely drop-in. | medium | correctness | prose: 26 words |
| A fresh container has nothing installed. | medium | complexity | prose: 47 words |
| Gate and isolate a heavy learned route | medium | complexity | prose: 43 words |
| Route around missing system binaries with libraries | low | complexity | prose: 29 words |
| Take an exhausted direction seriously | medium | complexity | prose: 40 words |
| Evaluate it like any other change | medium | correctness | prose: 29 words |
| Beat the naive baseline, or drop it. | high | correctness | prose: 84 words |
| Document the outcome fully | medium | complexity | prose: 50 words |
| Complementary routes are not competitors. | low | complexity | prose: 25 words |
| Commit and push | medium | complexity | prose: 16 words |
| Maintain a session warm-up doc | low | complexity | prose: 43 words |
| Maintain a continuation guide | medium | complexity | prose: 29 words |
| Capture the owner's new way durably | medium | complexity | prose: 140 words |
