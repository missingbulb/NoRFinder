# NoR detection: how the algorithm was improved, and who drove what

Sources: thread "First pass NoR detection", thread "NoR detection, fresh run", the project timeline, naive_nor.py, nor3.py and the output folders. Message ids below are abbreviated (last 8 characters). [fact] means read directly from a message or file; [inferred] means an interpretation.

## 1. Stages
| # | Folder / script | Change | Driven by | Outcome |
|---|---|---|---|---|
| S0 | naive_nor.py → root (redgreen, overlay_yellow, contact_sheet) | Ran the repo's nor.detect: red and green thresholded separately, a red blob between greens counts. Numbered contact sheet and 1-px yellow ellipses. | Ariel set the method and the QA views | 606 detections. Many false positives on lone red dots and grainy tissue. |
| S1 | --blue-mask → blue_masked/ | DAPI mask: blur σ=2, keep above 0.45×Otsu, drop blobs <30 px, fill holes, dilate 2 px. Masked pixels set to background median and left out of thresholds. | Ariel (root message; made it the first step in …1YF27oHe) | 537. Of 84 removed, 72 were in nuclei; 15 new appeared. Mask covers 14%. Approved in …FHjjcgWk. |
| S2 | overlay_yellow_traced(_zoom) | Outline traces each element's own shape, 1/3 px wide | Ariel ("thick wand", not circles) | 537 |
| S3 | three_segment/ | Green-red-green segmentation. Checks V1–V4: three parts, in order, greens separate, purity <10% (1-px boundary rim left out, a deviation). | Ariel set the criteria and said to use them as the tuning metric (…1QNjYPQB) | 279 pass of 1,649 red blobs; 1,109 had fewer than 2 greens |
| S4 | three_segment_v2/ | Green area balance ≥1/3; stick shape length/mean width ≥3; touch distance 2→4 px; angle 120→100°. Blue outlines 60% opacity, red segment fainter. Numbered list with µm measurements. | Ariel set criteria, left thresholds to Claude (…MnY97iZ7) | 284 pass. Balance rejected 88, stick rejected 1. |
| S5 | all_candidates/ | All candidates drawn, pink pass / blue fail, letters A–G, legend and list | Ariel (…FsmxUzJW) | 1,172 shown. A467 B47 C63 D152 E70 F88 G1. |
| S6 | all_candidates_v2/ (only brightness_bands.png is original) | Brightness filter I (weakest segment ≥3.5 noise units, cutoff at a histogram dip); green brightness balance H ≥1/3; borders 40% transparent | Ariel set criteria; threshold came from data (…KYVtiY4Z) | 215 pass. I rejected 41, H 28. |
| S7 | all_candidates_v3/ | Purity limit 20% | Ariel's judgement (…ARZdGTE6) | 272 pass. D 152→84, E 70→31; F, H, I rose. |
| S8 | v4_blobs_reordered/ | Each filter measured alone, reordered H,F,I,D,C,G,E; new duplicate filter J | Ariel's method (…TNFGN8wN) | G redundant (48 alone, 45 shared). Order doesn't change pass count. J removed 28 double counts: 244 pass from 1,649. |
| S9 | nor3.py walk → v4_walk/ | Walk-along-fibre finder from the "explain it to a child" exercise | Ariel's method and acceptance rule | 248 pass from 1,382 candidates vs 244 from 1,649; kept. A (one green) still 415. |
| S10 | not saved | Scale-free stop condition; cut segments at "half brightness" | Ariel (…33uhRfAq) | In progress, 196–212 pass |

[fact] all_candidates_v2/nor_candidates.csv has the same checksum as v4_walk's (overwritten). [fact] The S3/S4 rendering code and the zoom and band renders are not in any saved script.

## 2. Ariel's messages, classified
A = expert judgement, B = research method that can be automated, C = presentation and QA.
- …GyvxabZB: "blue (only areas where it is bright) as a negative mask" → A (nuclei are a false-positive source). "start naively… border off all NoR suspected areas" → B (baseline first). "crop them out… one next to the other" and "thin bright yellow line… don't cover any other areas… detect false positives and negatives" → C.
- …RBmYft9Z, …3QkPsDqs: environment only.
- …1YF27oHe: "implement the blue channel masking out… much to be gained" → A (prioritisation).
- …FHjjcgWk: "The blue areas you marked are great for me" → A (mask approval). "thick wand… yellow lines are circles" → A+C. "still dealing with masking so I'll be able to give better feedback" → A.
- …1QNjYPQB: "3 segments… green-red-green… two green areas aren't touching… <10%" → A turned into B (a validation function). "Use this validation function to know if you got a good masking algorithm" → B (the metric). "if you don't get any progress – show me" → B (a stop rule).
- …MnY97iZ7: "wildly different green blocks… You decide the acceptable ratio" and "short stick… more than X (you decide)" → A turned into B, thresholds delegated. "we can filter less on previous segmentations" → B (loosen upstream when downstream is strict). "40% transparent, make them blue… list… top to bottom… lengths, ratio" → C.
- …FsmxUzJW: "see all the filtered stages… pink… blue… a letter" → C+B (visual audit of each filter).
- …KYVtiY4Z: "40% transparency" → C. "only bright NoRs… avoid the mushy candidates… find a meaningful threshold" → A turned into B. "similar in total brightness" → A turned into B.
- …ARZdGTE6: "Allow… up to 20%" → A (threshold correction by eye; reason not stated [inferred]).
- …TNFGN8wN: "biggest problem… misformed original candidates" → A (diagnosis). "explain to a child… basis to an algorithm" → B (redesign procedure). "more candidates that pass the filters, for less original candidates – keep it" → B (acceptance metric). "test how many items each filter cuts… toughest judge goes first" → B (ablation); noticing G was useless → A.
- …33uhRfAq: "Don't use absolute pixel sizes… different stop condition" → B (scale-free rule). "(5) wasn't explained well enough to a child. Try again" → A+B.

Patterns [inferred]:
- Ariel gives rules, not labels. Claude asked twice for false positives/negatives by number and got none.
- Priorities come from visual impressions.
- Thresholds are corrected after seeing the rejects.
- Method instructions are reusable procedures.
- QA preferences accumulate round to round.

## 3. Checkpoints
Must stay human:
- H1: approve the blue mask for each new image.
- H2: decide whether the bottleneck is the candidate finder or a filter.
- H3: judge whether a threshold is too strict, from a contact sheet of candidates only that filter rejects.
- H4: approve any new structural criterion.
- H5: label a reference set (recommended; not yet done).
- H6: sign off on a new version when metrics trade off.

Can run on their own:
- implementing Ariel's criteria
- choosing delegated thresholds from histogram dips or a 1/3 default
- filter ablation, reordering, redundancy flags (only-reason <10% of standalone rejects)
- duplicate resolution
- accepting a new candidate finder only if passes go up and candidates go down
- the scale-free check
- rendering versioned QA outputs
- escalating after two iterations with no gain

Proposed metrics per version:
- candidates, passes, yield
- rejects by letter: first reason, standalone, only-reason
- fraction of candidate centres inside the blue mask (should be 0)
- median and IQR of length and red length (reference ~4.7 and ~1.6 µm)
- passes within 10% of each threshold (fragile)
- kept / lost / gained passes vs previous version
- counts by image quadrant
- precision, recall, F1 once labels exist

Caveats:
- [fact] No ground truth; pass count is only a proxy.
- [fact] Only one image processed.
- [fact] S10 not saved.
