## 2026-07-27 · born · the check lands (#23)
- **Mechanism:** a coded check.
- **Landed:** #23

## 2026-09-29 · moved · into its scope folder, off the manifest's list
- **Reason:** a data-only manifest lists no modules; the folder is what the loader reads for the
  scope.
- **Mechanism:** a coded check discovered from the pack's rule folder.
- **Actor:** @missingbulb (owner).
- **Model:** claude-opus-5-5

## 2026-10-09 · moved · ported from JavaScript to a Go check
- **Reason:** the repo moved off the Node engine onto cn, which runs no JavaScript checks.
- **Actor:** @missingbulb (owner), re-adoption request.
- **Model:** Claude.
- **Mechanism:** `checks/overlay_color_contrast.go` replaces `worldRules/overlay-color-contrast.mjs`, same id, behaviour, on_fail and
  original date; its cases moved from `pack.test.mjs` to the Go test beside it.

## 2026-10-31 · moved · from vascularColoring's vascular-coloring pack, scoped to studies/vascular/
- **Source:** the owner's call (D7, #620): port five of the eight checks.
- **Reason:** paths rewritten under studies/vascular/; the scan is limited to the study's files,
  since the rest of the repo is not this study's to police.
- **Actor:** @missingbulb (owner).
- **Model:** claude-opus-5-5
- **Mechanism:** unchanged coded world check, in the study's pack.
