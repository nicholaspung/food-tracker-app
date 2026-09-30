package handlers

import (
	"archive/zip"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/filesystem"
	"io"
	"myapp/testutil"
	"net/http/httptest"
	"testing"
	"time"
)

func TestFoodJournalExportOwnRecordsAndLocalDays(t *testing.T) {
	app := testutil.NewTestApp(t)
	users, _ := app.FindCollectionByNameOrId("users")
	makeUser := func(email string) *core.Record {
		u := core.NewRecord(users)
		u.Set("email", email)
		u.Set("defaultRestaurantVisibility", "private")
		u.Set("defaultVisitVisibility", "private")
		u.SetVerified(true)
		u.SetPassword("test-password123")
		if err := app.Save(u); err != nil {
			t.Fatal(err)
		}
		return u
	}
	user, other := makeUser("export-synthetic@example.com"), makeUser("export-other@example.com")
	makeRecord := func(name string, values map[string]any) *core.Record {
		c, err := app.FindCollectionByNameOrId(name)
		if err != nil {
			t.Fatal(err)
		}
		r := core.NewRecord(c)
		for k, v := range values {
			r.Set(k, v)
		}
		if err := app.Save(r); err != nil {
			t.Fatal(err)
		}
		return r
	}
	restaurant := makeRecord("restaurants", map[string]any{"name": "Synthetic restaurant", "location": "Synthetic branch", "visibility": "public"})
	visit := makeRecord("visits", map[string]any{"user": user.Id, "restaurant": restaurant.Id, "visitDate": "2026-09-30 02:00:00.000Z", "visitLocalDate": "2026-09-29", "visibility": "private"})
	dish := makeRecord("food_items", map[string]any{"user": user.Id, "visit": visit.Id, "name": "Synthetic dish", "rating": 4, "itemType": "visit-item"})
	makeRecord("visits", map[string]any{"user": other.Id, "restaurant": restaurant.Id, "visitDate": "2026-09-30 02:00:00.000Z", "visitLocalDate": "2026-09-29", "visibility": "friends"})
	makeRecord("notes", map[string]any{"user": user.Id, "content": "Original synthetic note", "status": "used", "usedInVisit": visit.Id})
	png, _ := base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1sAAAAASUVORK5CYII=")
	file, err := filesystem.NewFileFromBytes(png, "synthetic.png")
	if err != nil {
		t.Fatal(err)
	}
	photo := makeRecord("visit_photos", map[string]any{"user": user.Id, "visit": visit.Id, "food_item": dish.Id, "photo": file, "caption": "Synthetic caption"})
	var buffer bytes.Buffer
	location, _ := time.LoadLocation("America/Los_Angeles")
	if err := writeFoodJournalExport(context.Background(), app, user.Id, &buffer, location); err != nil {
		t.Fatal(err)
	}
	reader, err := zip.NewReader(bytes.NewReader(buffer.Bytes()), int64(buffer.Len()))
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, file := range reader.File {
		if file.Name != "food-journal.json" {
			continue
		}
		found = true
		r, _ := file.Open()
		raw, _ := io.ReadAll(r)
		r.Close()
		var result struct {
			Format  string `json:"format"`
			Records []struct {
				Date  string `json:"date"`
				Notes string `json:"notes"`
			} `json:"records"`
			Items  []any `json:"items"`
			Photos []struct {
				ID     string `json:"id"`
				Item   string `json:"item"`
				Path   string `json:"path"`
				SHA256 string `json:"sha256"`
			} `json:"photos"`
		}
		if err := json.Unmarshal(raw, &result); err != nil {
			t.Fatal(err)
		}
		if result.Format != "food-journal" || len(result.Records) != 1 || len(result.Items) != 1 {
			t.Fatalf("wrong export counts: %s", raw)
		}
		if result.Records[0].Date != "2026-09-29" || result.Records[0].Notes != "Original note:\nOriginal synthetic note" {
			t.Fatalf("history not preserved: %s", raw)
		}
		if len(result.Photos) != 1 || result.Photos[0].ID != "visit-photo-"+photo.Id || result.Photos[0].Item != dish.Id {
			t.Fatalf("photo relationships missing: %s", raw)
		}
		p := result.Photos[0]
		media, err := reader.Open(p.Path)
		if err != nil {
			t.Fatal(err)
		}
		contents, err := io.ReadAll(media)
		media.Close()
		if err != nil {
			t.Fatal(err)
		}
		hash := sha256.Sum256(contents)
		if !bytes.Equal(contents, png) || p.SHA256 != hex.EncodeToString(hash[:]) {
			t.Fatal("original photo or checksum changed")
		}
	}
	if !found {
		t.Fatal("manifest missing")
	}
	router, err := apis.NewRouter(app)
	if err != nil {
		t.Fatal(err)
	}
	RegisterFoodJournalExportHandlers(&core.ServeEvent{App: app, Router: router}, app)
	handler, err := router.BuildMux()
	if err != nil {
		t.Fatal(err)
	}
	token, _ := user.NewAuthToken()
	for _, tc := range []struct {
		token  string
		status int
	}{{"", 401}, {token, 200}} {
		request := httptest.NewRequest("GET", "/api/food-journal/export?timezone=America%2FLos_Angeles", nil)
		request.Header.Set("Authorization", tc.token)
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != tc.status {
			t.Fatalf("export status %d, want %d: %s", response.Code, tc.status, response.Body)
		}
		if tc.status == 200 && response.Header().Get("Cache-Control") != "no-store" {
			t.Fatal("private export response is cacheable")
		}
	}

	if got := noteExportDay("2026-09-30 02:00:00.000Z", location); got != "2026-09-29" {
		t.Fatalf("note shifted calendar day: %s", got)
	}
}
