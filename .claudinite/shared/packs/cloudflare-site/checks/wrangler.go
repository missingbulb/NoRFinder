// Package checks holds cloudflare-site's checks. Each reads the repo's own
// wrangler config for the one fact it needs, the published tree; the
// readings below mirror the pack's lib.mjs, which the release task reads,
// and a test holds the two equal.
package checks

import (
	"encoding/json"
	"sort"
	"strings"
)

// wranglerConfigs are the config filenames wrangler resolves, in its own
// precedence order; a TOML config is not one this pack reads.
var wranglerConfigs = []string{"wrangler.json", "wrangler.jsonc"}

func configRank(p string) int {
	name := p[strings.LastIndex(p, "/")+1:]
	for i, c := range wranglerConfigs {
		if c == name {
			return i
		}
	}
	return -1
}

// wranglerConfigPath is the config among paths at the repo root or one
// directory down, shallowest first, or "".
func wranglerConfigPath(paths []string) string {
	var candidates []string
	for _, p := range paths {
		if strings.Count(p, "/") <= 1 && configRank(p) >= 0 {
			candidates = append(candidates, p)
		}
	}
	sort.SliceStable(candidates, func(i, j int) bool {
		a, b := strings.Count(candidates[i], "/"), strings.Count(candidates[j], "/")
		if a != b {
			return a < b
		}
		return configRank(candidates[i]) < configRank(candidates[j])
	})
	if len(candidates) == 0 {
		return ""
	}
	return candidates[0]
}

// stripJSONComments drops the // and /* */ comments outside a string.
func stripJSONComments(text string) string {
	var out strings.Builder
	inString, inLine, inBlock := false, false, false
	for i := 0; i < len(text); i++ {
		c := text[i]
		var next byte
		if i+1 < len(text) {
			next = text[i+1]
		}
		switch {
		case inLine:
			if c == '\n' {
				inLine = false
				out.WriteByte(c)
			}
		case inBlock:
			if c == '*' && next == '/' {
				inBlock = false
				i++
			}
		case inString:
			out.WriteByte(c)
			if c == '\\' {
				if i+1 < len(text) {
					out.WriteByte(next)
				}
				i++
			} else if c == '"' {
				inString = false
			}
		case c == '"':
			inString = true
			out.WriteByte(c)
		case c == '/' && next == '/':
			inLine = true
			i++
		case c == '/' && next == '*':
			inBlock = true
			i++
		default:
			out.WriteByte(c)
		}
	}
	return out.String()
}

// parseWranglerConfig is the parsed config; ok is false when it does not
// parse.
func parseWranglerConfig(text string) (config any, ok bool) {
	if err := json.Unmarshal([]byte(stripJSONComments(text)), &config); err != nil {
		return nil, false
	}
	return config, true
}

func field(v any, key string) any {
	if m, ok := v.(map[string]any); ok {
		return m[key]
	}
	return nil
}

// publishedDir is assets.directory resolved against the config's own
// directory, as wrangler resolves it, or "".
func publishedDir(config any, configPath string) string {
	dir, ok := field(field(config, "assets"), "directory").(string)
	if !ok || strings.TrimSpace(dir) == "" {
		return ""
	}
	base := ""
	if i := strings.LastIndex(configPath, "/"); i >= 0 {
		base = configPath[:i+1]
	}
	dir = strings.TrimPrefix(dir, "./")
	dir = strings.TrimRight(dir, "/")
	return base + dir
}

// truthy is a JSON value as JavaScript's truthiness reads it.
func truthy(v any) bool {
	switch x := v.(type) {
	case nil:
		return false
	case bool:
		return x
	case string:
		return x != ""
	case float64:
		return x != 0
	}
	return true
}
