package testutil

import (
	"path/filepath"
	"runtime"
	"testing"

	pbtests "github.com/pocketbase/pocketbase/tests"
)

// NewTestApp creates a PocketBase test app backed by a fresh temporary data dir.
// The committed fixture contains schema and settings only, with app/user data removed.
func NewTestApp(t testing.TB) *pbtests.TestApp {
	t.Helper()

	_, currentFile, _, _ := runtime.Caller(0)
	fixtureDir := filepath.Join(filepath.Dir(currentFile), "..", "testdata", "pb_data")

	app, err := pbtests.NewTestApp(fixtureDir)
	if err != nil {
		t.Fatalf("failed to initialize test app: %v", err)
	}

	t.Cleanup(app.Cleanup)
	return app
}
