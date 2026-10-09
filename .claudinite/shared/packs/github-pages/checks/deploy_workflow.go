package checks

import (
	"regexp"
	"strings"

	"claudinite.com/checksdk"
)

var (
	// pagesPublishes is a publishing step a Pages repo reaches for.
	pagesPublishes   = regexp.MustCompile(`actions\/(deploy-pages|upload-pages-artifact|configure-pages)`)
	workflowName     = regexp.MustCompile(`(?m)^name:\s*['"]?(.+?)['"]?\s*$`)
	dispatchTrigger  = regexp.MustCompile(`(?m)^\s*workflow_dispatch:`)
	pushTrigger      = regexp.MustCompile(`(?m)^\s*push:`)
	commentedOutLine = regexp.MustCompile(`^\s*#`)
)

func init() {
	checksdk.Register(checksdk.Check{
		ID:     "deploy-workflow",
		Tags:   []string{"world"},
		OnFail: "block",
		Since:  "2026-09-17",
		Doc:    doc,
		Why:    "the release task dispatches this workflow at the commit it released; a second publisher or a push trigger deploys a tree with no version cut and no park lane",
		Run:    deployWorkflow,
	})
}

func deployWorkflow(repo checksdk.Repo) []checksdk.Finding {
	if !adoptedPages(repo) {
		return nil
	}
	var out []checksdk.Finding
	if text, ok := repo.Read(deployWorkflowPath); !ok {
		out = append(out, checksdk.Finding{
			Path:     deployWorkflowPath,
			Sentence: "missing — the release task dispatches this workflow to deploy, and a Pages deploy runs only from the repo's own .github/",
			Fix:      "copy it from the pack's stubs/workflows/" + deployWorkflowFile,
		})
	} else {
		name := ""
		if m := workflowName.FindStringSubmatch(text); m != nil {
			name = m[1]
		}
		if name != deployWorkflowName || !dispatchTrigger.MatchString(text) || !strings.Contains(text, "build-site.mjs") {
			out = append(out, checksdk.Finding{
				Path:     deployWorkflowPath,
				Sentence: "is not the pack's deploy workflow (named, dispatchable, building from the mount)",
				Fix:      "re-copy it from the pack's stubs/workflows/" + deployWorkflowFile,
			})
		}
		if pushTrigger.MatchString(text) {
			out = append(out, checksdk.Finding{
				Path:     deployWorkflowPath,
				Sentence: "has a push: trigger — the site-release task is the one path to production, and a push would deploy behind it with no version cut",
				Fix:      "re-copy it from the pack's stubs/workflows/" + deployWorkflowFile + "; force a release with `gh workflow run claudinite-scheduler.yml -f wake=github-pages/site-release`",
			})
		}
	}
	for _, file := range checksdk.WorkflowFiles(repo) {
		if file == deployWorkflowPath {
			continue
		}
		text, ok := repo.Read(file)
		if !ok {
			continue
		}
		for i, line := range strings.Split(text, "\n") {
			if commentedOutLine.MatchString(line) || !pagesPublishes.MatchString(line) {
				continue
			}
			out = append(out, checksdk.Finding{
				Path:     file,
				Line:     i + 1,
				Sentence: file + " publishes the site from a second workflow",
				Fix:      "delete it — the site-release task dispatches the vendored deploy workflow at the commit it released, and a second publisher ships a tree with no version cut and no park lane",
			})
		}
	}
	return out
}
