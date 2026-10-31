package checks

import (
	"os"
	"path/filepath"
	"regexp"
	"testing"

	"claudinite.com/checksdk"
)

// measureScript is the vascular study's extraction script, which several checks read.
const measureScript = "studies/vascular/analysis/measure_vessels.py"

// run is check's findings over files written under a fresh root, with tracked
// as the index (none when nil).
func run(t *testing.T, check func(checksdk.Repo) []checksdk.Finding, files map[string]string, tracked ...string) []checksdk.Finding {
	t.Helper()
	root := t.TempDir()
	for rel, text := range files {
		p := filepath.Join(root, filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte(text), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	if tracked == nil {
		tracked = []string{}
	}
	return check((&checksdk.Fake{Tracked: tracked}).Repo(root))
}

func wantCount(t *testing.T, fs []checksdk.Finding, n int) {
	t.Helper()
	if len(fs) != n {
		t.Fatalf("got %d findings, want %d: %+v", len(fs), n, fs)
	}
}

func wantLine(t *testing.T, f checksdk.Finding, line int) {
	t.Helper()
	if f.Line != line {
		t.Errorf("finding at line %d, want %d: %+v", f.Line, line, f)
	}
}

func wantMatch(t *testing.T, s, pattern string) {
	t.Helper()
	if !regexp.MustCompile(pattern).MatchString(s) {
		t.Errorf("%q does not match /%s/", s, pattern)
	}
}
