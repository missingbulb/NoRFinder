package checks

import (
	"fmt"
	"regexp"
	"strings"

	"claudinite.com/checksdk"
)

const (
	doc = "packs/cloudflare-site/RULES.md"
	// beaconPlaceholder is the token value the committed loader carries;
	// lib.mjs spells it for the release, which substitutes the real one.
	beaconPlaceholder = "REPLACE_WITH_CLOUDFLARE_WEB_ANALYTICS_TOKEN"
)

var (
	// beaconToken is a token as Cloudflare's loader carries it: the token
	// field of a data-cf-beacon attribute, or the same key in a script.
	beaconToken = regexp.MustCompile(`(?i)["']?token["']?\s*:\s*["']([0-9a-f]{16,})["']`)
	scriptFile  = regexp.MustCompile(`\.(js|mjs|cjs)$`)
	// publishes is a publishing step a site repo reaches for: GitHub
	// Pages' three actions, the wrangler action, a bare wrangler deploy.
	publishes   = regexp.MustCompile(`actions\/(deploy-pages|upload-pages-artifact|configure-pages)|cloudflare\/wrangler-action|wrangler(@\S+)?\s+(pages\s+)?deploy`)
	commentLine = regexp.MustCompile(`^\s*#`)
)

func init() {
	checksdk.Register(checksdk.Check{
		ID:     "beacon-token-is-not-committed",
		Tags:   []string{"world"},
		OnFail: "block",
		Since:  "2026-09-13",
		Doc:    doc,
		Why:    "a committed token beacons from every checkout and fork into the production site's numbers, and the page looks identical either way",
		Run:    beaconTokenIsNotCommitted,
	})
	checksdk.Register(checksdk.Check{
		ID:     "no-second-publisher",
		Tags:   []string{"world"},
		OnFail: "block",
		Since:  "2026-09-13",
		Doc:    doc,
		Why:    "a second publisher ships the tree with no version cut, no gate and no park lane — and its green run looks exactly like success",
		Run:    noSecondPublisher,
	})
	checksdk.Register(checksdk.Check{
		ID:     "publishes-a-site-directory",
		Tags:   []string{"world"},
		OnFail: "block",
		Since:  "2026-09-13",
		Doc:    doc,
		Why:    "assets.directory is the only boundary between the published site and the repo holding the mount, the packs and the queue workers",
		Run:    publishesASiteDirectory,
	})
}

// published is the tree the repo's wrangler config publishes, or "".
func published(repo checksdk.Repo) string {
	path := wranglerConfigPath(repo.Tracked())
	if path == "" {
		return ""
	}
	text, ok := repo.Read(path)
	if !ok {
		return ""
	}
	config, ok := parseWranglerConfig(text)
	if !ok {
		return ""
	}
	return publishedDir(config, path)
}

func beaconTokenIsNotCommitted(repo checksdk.Repo) []checksdk.Finding {
	dir := published(repo)
	if dir == "" {
		return nil
	}
	var out []checksdk.Finding
	for _, file := range repo.Tracked() {
		if !strings.HasPrefix(file, dir+"/") {
			continue
		}
		text, ok := repo.Read(file)
		if !ok {
			continue
		}
		if scriptFile.MatchString(file) {
			text = checksdk.StripComments(text)
		}
		for i, line := range strings.Split(text, "\n") {
			for _, m := range beaconToken.FindAllStringSubmatch(line, -1) {
				out = append(out, checksdk.Finding{
					Path:     file,
					Line:     i + 1,
					Sentence: fmt.Sprintf("a Cloudflare beacon token is committed (%s…)", m[1][:6]),
					Fix:      "put " + beaconPlaceholder + " back as the token's only value here and set the token as the CLOUDFLARE_ANALYTICS_TOKEN repository variable — the release substitutes it into the copy it uploads, and the committed file never carries it",
				})
			}
		}
	}
	return out
}

func noSecondPublisher(repo checksdk.Repo) []checksdk.Finding {
	var out []checksdk.Finding
	for _, file := range checksdk.WorkflowFiles(repo) {
		text, ok := repo.Read(file)
		if !ok {
			continue
		}
		for i, line := range strings.Split(text, "\n") {
			if commentLine.MatchString(line) || !publishes.MatchString(line) {
				continue
			}
			out = append(out, checksdk.Finding{
				Path:     file,
				Line:     i + 1,
				Sentence: file + " publishes the site from a workflow",
				Fix:      "publish from the site-release task instead — `wrangler` is a CLI, so the release needs no `uses:` step, and the task is what cuts the version and parks when Cloudflare refuses",
			})
		}
	}
	if dir := published(repo); dir != "" {
		for _, file := range repo.Tracked() {
			if file == dir+"/CNAME" {
				out = append(out, checksdk.Finding{
					Path:     file,
					Sentence: file + " claims the domain for GitHub Pages",
					Fix:      "delete it — the custom domains are the wrangler config's routes, Cloudflare writes the DNS record as the deploy attaches them, and a CNAME file left here keeps the old host claiming the same name",
				})
			}
		}
	}
	return out
}

func publishesASiteDirectory(repo checksdk.Repo) []checksdk.Finding {
	tracked := repo.Tracked()
	path := wranglerConfigPath(tracked)
	if path == "" {
		return []checksdk.Finding{{
			Path:     wranglerConfigs[0],
			Sentence: "no wrangler.json or wrangler.jsonc at the repo root or one directory down",
			Fix:      "add the wrangler config the release reads — it names the tree to upload (assets.directory) and the custom domains to attach; a TOML config is a wrangler setup this pack does not read",
		}}
	}
	text, _ := repo.Read(path)
	config, ok := parseWranglerConfig(text)
	if !ok {
		return []checksdk.Finding{{
			Path:     path,
			Sentence: path + " does not parse as JSON",
			Fix:      "fix the syntax — the release and these checks all read this file, and a config they cannot parse stops the release at the gate",
		}}
	}
	var out []checksdk.Finding
	dir := publishedDir(config, path)
	configDir := ""
	if i := strings.LastIndex(path, "/"); i >= 0 {
		configDir = path[:i]
	}
	switch {
	case dir == "":
		out = append(out, checksdk.Finding{
			Path:     path,
			Sentence: "the config declares no assets.directory",
			Fix:      "set assets.directory to the one tree the site publishes — without it wrangler deploy has no target at all",
		})
	case dir == "." || dir == configDir:
		shown := dir
		if dir == "." {
			shown = "the repo root"
		}
		out = append(out, checksdk.Finding{
			Path:     path,
			Sentence: "assets.directory publishes " + shown,
			Fix:      "point assets.directory at a subdirectory holding the site and nothing else — publishing the tree that holds it publishes the vendored mount, the packs and the queue workers to a public URL",
		})
	case !anyUnder(tracked, dir):
		out = append(out, checksdk.Finding{
			Path:     path,
			Sentence: "assets.directory names " + dir + ", which holds no tracked file",
			Fix:      "create " + dir + " with the site in it, or point assets.directory at the tree that is actually published — a deploy of an empty directory serves a 404 to every visitor and reports success",
		})
	}
	if !truthy(field(config, "compatibility_date")) {
		out = append(out, checksdk.Finding{
			Path:     path,
			Sentence: "the config declares no compatibility_date",
			Fix:      "pin compatibility_date, so the runtime a release lands on is a value in the repo rather than whatever the deploy day defaults to",
		})
	}
	return out
}

func anyUnder(files []string, dir string) bool {
	for _, f := range files {
		if strings.HasPrefix(f, dir+"/") {
			return true
		}
	}
	return false
}
