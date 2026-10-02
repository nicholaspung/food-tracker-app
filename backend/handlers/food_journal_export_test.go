package handlers

import (
	"archive/zip"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/filesystem"
	"io"
	"myapp/testutil"
	"net/http/httptest"
	"strings"
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
	otherVisit := makeRecord("visits", map[string]any{"user": other.Id, "restaurant": restaurant.Id, "visitDate": "2026-09-30 02:00:00.000Z", "visitLocalDate": "2026-09-29", "visibility": "friends"})
	makeRecord("notes", map[string]any{"user": user.Id, "content": "Original synthetic note", "status": "used", "usedInVisit": visit.Id})
	png, _ := base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1sAAAAASUVORK5CYII=")
	file, err := filesystem.NewFileFromBytes(png, "synthetic.png")
	if err != nil {
		t.Fatal(err)
	}
	photo := makeRecord("visit_photos", map[string]any{"user": user.Id, "visit": visit.Id, "food_item": dish.Id, "photo": file, "caption": "Synthetic caption"})
	var buffer bytes.Buffer
	location, _ := time.LoadLocation("America/Los_Angeles")
	if err := writeFoodJournalExport(context.Background(), app, user.Id, &buffer, location, &foodJournalExportPart{number: 1, mediaLimit: foodJournalPartMediaLimit}); err != nil {
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
	var originalSnapshot string
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
		if tc.status == 200 {
			originalSnapshot = response.Header().Get("X-Food-Journal-Snapshot")
			if response.Header().Get("Cache-Control") != "no-store" {
				t.Fatal("private export response is cacheable")
			}
			if response.Header().Get("X-Food-Journal-Parts") != "1" || len(originalSnapshot) != 64 || !strings.Contains(response.Header().Get("Access-Control-Expose-Headers"), "X-Food-Journal-Snapshot") {
				t.Fatal("export session headers missing")
			}
		}
	}

	if got := noteExportDay("2026-09-30 02:00:00.000Z", location); got != "2026-09-29" {
		t.Fatalf("note shifted calendar day: %s", got)
	}

	// Small injected budgets exercise real stored files without allocating a
	// production-sized archive. The parts must cover every original exactly once.
	secondPNG := append(append([]byte{}, png...), byte(1))
	secondFile, err := filesystem.NewFileFromBytes(secondPNG, "second.png")
	if err != nil {
		t.Fatal(err)
	}
	secondPhoto := makeRecord("visit_photos", map[string]any{"user": user.Id, "visit": visit.Id, "food_item": dish.Id, "photo": secondFile})
	otherDish := makeRecord("food_items", map[string]any{"user": other.Id, "visit": otherVisit.Id, "name": "Other dish", "rating": 4, "itemType": "visit-item"})
	makeRecord("visit_photos", map[string]any{"user": other.Id, "visit": otherVisit.Id, "food_item": otherDish.Id, "photo": file})
	var snapshot, dataset string
	allPhotos := map[string]bool{}
	for number := 1; number <= 2; number++ {
		part := foodJournalExportPart{number: number, mediaLimit: int64(len(secondPNG)), expectedSnapshot: snapshot}
		var output bytes.Buffer
		if err := writeFoodJournalExport(context.Background(), app, user.Id, &output, location, &part); err != nil {
			t.Fatal(err)
		}
		if part.count != 2 || len(part.snapshot) != 64 {
			t.Fatal("multipart plan missing")
		}
		if number == 1 {
			snapshot = part.snapshot
		} else if snapshot != part.snapshot {
			t.Fatal("snapshot changed across unchanged parts")
		}
		archive, err := zip.NewReader(bytes.NewReader(output.Bytes()), int64(output.Len()))
		if err != nil {
			t.Fatal(err)
		}
		manifestFile, err := archive.Open("food-journal.json")
		if err != nil {
			t.Fatal(err)
		}
		var manifest struct {
			Dataset string `json:"dataset"`
			Records []struct {
				ID string `json:"id"`
			} `json:"records"`
			Items []struct {
				ID string `json:"id"`
			} `json:"items"`
			Photos []struct {
				ID     string `json:"id"`
				Path   string `json:"path"`
				SHA256 string `json:"sha256"`
				Record string `json:"record"`
				Item   string `json:"item"`
			} `json:"photos"`
		}
		err = json.NewDecoder(manifestFile).Decode(&manifest)
		manifestFile.Close()
		if err != nil {
			t.Fatal(err)
		}
		if len(manifest.Records) != 1 || manifest.Records[0].ID != visit.Id || len(manifest.Items) != 1 || manifest.Items[0].ID != dish.Id {
			t.Fatal("parts do not reuse record identities")
		}
		if number == 1 {
			dataset = manifest.Dataset
		} else if dataset != manifest.Dataset {
			t.Fatal("dataset changed across parts")
		}
		if len(manifest.Photos) != 1 || len(archive.File) != 2 {
			t.Fatal("part did not obey its photo budget")
		}
		p := manifest.Photos[0]
		if allPhotos[p.ID] || p.Record != visit.Id || p.Item != dish.Id {
			t.Fatal("photo duplicated or relationship lost")
		}
		allPhotos[p.ID] = true
		media, err := archive.Open(p.Path)
		if err != nil {
			t.Fatal(err)
		}
		content, err := io.ReadAll(media)
		media.Close()
		if err != nil {
			t.Fatal(err)
		}
		hash := sha256.Sum256(content)
		if p.SHA256 != hex.EncodeToString(hash[:]) {
			t.Fatal("multipart checksum incorrect")
		}
		want := png
		if p.ID == "visit-photo-"+secondPhoto.Id {
			want = secondPNG
		}
		if !bytes.Equal(content, want) {
			t.Fatal("multipart original changed")
		}
	}
	if !allPhotos["visit-photo-"+photo.Id] || !allPhotos["visit-photo-"+secondPhoto.Id] {
		t.Fatal("multipart export omitted an original")
	}
	var discard bytes.Buffer
	if err := writeFoodJournalExport(context.Background(), app, user.Id, &discard, location, &foodJournalExportPart{number: 3, mediaLimit: int64(len(secondPNG))}); !errors.Is(err, errFoodJournalPartMissing) {
		t.Fatal("invalid part accepted")
	}
	secondPhoto.Set("caption", "Changed synthetic caption")
	if err := app.Save(secondPhoto); err != nil {
		t.Fatal(err)
	}
	discard.Reset()
	if err := writeFoodJournalExport(context.Background(), app, user.Id, &discard, location, &foodJournalExportPart{number: 2, mediaLimit: int64(len(secondPNG)), expectedSnapshot: snapshot}); !errors.Is(err, errFoodJournalChanged) {
		t.Fatal("changed source accepted across parts")
	}
	for _, tc := range []struct {
		query  string
		status int
	}{
		{"&part=0", 400}, {"&part=2", 400}, {"&part=2&snapshot=" + originalSnapshot, 409},
	} {
		request := httptest.NewRequest("GET", "/api/food-journal/export?timezone=America%2FLos_Angeles"+tc.query, nil)
		request.Header.Set("Authorization", token)
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != tc.status || strings.Contains(response.Body.String(), "Changed synthetic caption") {
			t.Fatal("unsafe or incorrect export error response")
		}
	}
}
