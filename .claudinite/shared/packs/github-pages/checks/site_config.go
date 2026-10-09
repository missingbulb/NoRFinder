// Package checks holds github-pages' checks. The site config's reading
// mirrors the pack's lib.mjs, which the deploy's build step and the
// release task read; a test holds the two equal.
package checks

import (
	"fmt"
	"regexp"
	"strings"

	"claudinite.com/checksdk"
)

const (
	configPath         = ".github/site.config"
	deployWorkflowFile = "github-pages-deploy.yml"
	deployWorkflowName = "Deploy to GitHub Pages"
	deployWorkflowPath = ".github/workflows/" + deployWorkflowFile
	doc                = "packs/github-pages/skills/github-pages-pipeline/SKILL.md"
)

// neverPublished are the tooling and dependency directories a publish set
// never names.
var neverPublished = []string{".claude", ".claudinite", ".github", "node_modules"}

// configKey is one key of the site config: allowEmpty marks the value
// whose empty form is a stated answer, optional the key a config may omit.
type configKey struct {
	name                 string
	allowEmpty, optional bool
}

var (
	configKeys = []configKey{
		{name: "publish_root"},
		{name: "publish_paths"},
		{name: "build_command", allowEmpty: true},
		{name: "build_vars", allowEmpty: true, optional: true},
	}
	envName = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*$`)
)

func keyNames(requiredOnly bool) []string {
	var out []string
	for _, k := range configKeys {
		if !requiredOnly || !k.optional {
			out = append(out, k.name)
		}
	}
	return out
}

// parseConfig reads KEY=value lines, # comments and blank lines skipped,
// a value optionally wrapped in matching quotes.
func parseConfig(text string) (values map[string]string, errs []string) {
	values = map[string]string{}
	known := map[string]bool{}
	for _, k := range configKeys {
		known[k.name] = true
	}
	for i, raw := range strings.Split(text, "\n") {
		line := strings.TrimSpace(raw)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		eq := strings.Index(line, "=")
		if eq < 1 {
			errs = append(errs, fmt.Sprintf("%s:%d: '%s' is not KEY=value", configPath, i+1, line))
			continue
		}
		key := strings.TrimSpace(line[:eq])
		value := strings.TrimSpace(line[eq+1:])
		if len(value) >= 2 && (value[0] == '"' || value[0] == '\'') && value[len(value)-1] == value[0] {
			value = value[1 : len(value)-1]
		}
		if !known[key] {
			errs = append(errs, fmt.Sprintf("%s:%d: unknown key '%s' — the keys are %s", configPath, i+1, key, strings.Join(keyNames(false), ", ")))
			continue
		}
		if _, twice := values[key]; twice {
			errs = append(errs, fmt.Sprintf("%s:%d: '%s' is set twice", configPath, i+1, key))
		}
		values[key] = value
	}
	for _, k := range configKeys {
		v, ok := values[k.name]
		switch {
		case !ok && !k.optional:
			errs = append(errs, fmt.Sprintf("%s: required key '%s' is missing", configPath, k.name))
		case ok && !k.allowEmpty && v == "":
			errs = append(errs, fmt.Sprintf("%s: '%s' is empty — it must name a real path", configPath, k.name))
		}
	}
	for _, name := range strings.Fields(values["build_vars"]) {
		if !envName.MatchString(name) {
			errs = append(errs, fmt.Sprintf("%s: build_vars entry '%s' is not a variable name — list the repo variable NAMES to export, space-separated, never their values", configPath, name))
		}
	}
	return values, errs
}

// publishSet is the publish set: root as written, siteRoot as a prefix
// ("" for the repo root), the paths as written.
type publishSet struct {
	root, siteRoot string
	paths          []string
}

func newPublishSet(values map[string]string) publishSet {
	root := values["publish_root"]
	if root == "" {
		root = "."
	}
	siteRoot := ""
	if root != "." {
		siteRoot = strings.TrimRight(strings.TrimPrefix(root, "./"), "/") + "/"
	}
	return publishSet{root: root, siteRoot: siteRoot, paths: strings.Fields(values["publish_paths"])}
}

// fullOf is where a publish path sits in the repo.
func (s publishSet) fullOf(p string) string {
	if p == "." {
		if r := strings.TrimSuffix(s.siteRoot, "/"); r != "" {
			return r
		}
		return "."
	}
	return s.siteRoot + p
}

// adoptedPages: either the config or the vendored workflow is enough, so
// the one artifact a check catches missing never silences it.
func adoptedPages(repo checksdk.Repo) bool {
	_, config := repo.Read(configPath)
	_, workflow := repo.Read(deployWorkflowPath)
	return config || workflow
}

func has(xs []string, x string) bool {
	for _, y := range xs {
		if y == x {
			return true
		}
	}
	return false
}

func init() {
	checksdk.Register(checksdk.Check{
		ID:     "site-config",
		Tags:   []string{"world"},
		OnFail: "block",
		Since:  "2026-09-17",
		Doc:    doc,
		Why:    "the published artifact is an explicit list, so a stale entry silently drops a page from the live site and an unknown key silently does nothing",
		Run:    siteConfig,
	})
}

func siteConfig(repo checksdk.Repo) []checksdk.Finding {
	if !adoptedPages(repo) {
		return nil
	}
	text, ok := repo.Read(configPath)
	if !ok {
		return []checksdk.Finding{{
			Path:     configPath,
			Sentence: "missing — the deploy reads every repo value from it (" + strings.Join(keyNames(true), ", ") + ")",
			Fix:      "write " + configPath + " with all three required keys, explicitly (see the github-pages-pipeline skill)",
		}}
	}
	values, errs := parseConfig(text)
	var out []checksdk.Finding
	for _, e := range errs {
		e = strings.Replace(e, configPath+": ", "", 1)
		e = strings.Replace(e, configPath+":", "line ", 1)
		out = append(out, checksdk.Finding{
			Path:     configPath,
			Sentence: e,
			Fix:      "fix the key (the three are required and fully explicit — there are no defaults to fall back on; build_vars is the one key a config may omit)",
		})
	}
	tracked := repo.Tracked()
	set := newPublishSet(values)
	for _, p := range set.paths {
		full := set.fullOf(p)
		whole := p == "." && full == "."
		if has(neverPublished, p) || has(neverPublished, full) || whole {
			f := checksdk.Finding{
				Path:     configPath,
				Sentence: fmt.Sprintf(`publishes "%s" — tooling and dependency directories are never part of a published site`, p),
				Fix:      fmt.Sprintf(`drop "%s" from publish_paths and name the site's own files instead`, p),
			}
			if whole {
				f.Sentence = "publishes the whole repo root — the mount, the tooling and the workflows would all reach a public URL"
				f.Fix = `name the site's own files in publish_paths, or root the site in a subdirectory and publish "." under that publish_root`
			}
			out = append(out, f)
			continue
		}
		matched := false
		for _, f := range tracked {
			if f == full || strings.HasPrefix(f, full+"/") {
				matched = true
				break
			}
		}
		if !matched {
			out = append(out, checksdk.Finding{
				Path:     configPath,
				Sentence: fmt.Sprintf(`publish path "%s" matches nothing tracked at "%s" — the deploy fails on it, or quietly ships a smaller site than intended`, p, full),
				Fix:      fmt.Sprintf(`remove the entry, or fix the path (publish paths are relative to publish_root "%s")`, set.root),
			})
		}
	}
	publishesIndex := false
	for _, p := range set.paths {
		full := set.fullOf(p)
		prefix := full + "/"
		if full == "." {
			prefix = ""
		}
		if full == set.siteRoot+"index.html" || has(tracked, prefix+"index.html") {
			publishesIndex = true
			break
		}
	}
	if len(set.paths) > 0 && !publishesIndex {
		out = append(out, checksdk.Finding{
			Path:     configPath,
			Sentence: `no publish path carries an index.html — the deployed site's "/" would 404`,
			Fix:      "add the site's index.html (or the directory holding it) to publish_paths",
		})
	}
	return out
}
