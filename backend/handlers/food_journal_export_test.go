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

func TestFoodJournalExportIncludesCreatedCatalogWithoutVisits(t *testing.T) {
	app := testutil.NewTestApp(t)
	create := func(collection string, values map[string]any) *core.Record {
		c, err := app.FindCollectionByNameOrId(collection)
		if err != nil {
			t.Fatal(err)
		}
		r := core.NewRecord(c)
		r.Load(values)
		if collection == "users" {
			r.SetPassword("test-password123")
			r.Set("defaultRestaurantVisibility", "private")
			r.Set("defaultVisitVisibility", "private")
		}
		if collection == "menu_items" {
			r.Set("visibility", "public")
		}
		if err := app.Save(r); err != nil {
			t.Fatal(err)
		}
		return r
	}
	owner := create("users", map[string]any{"email": "catalog-owner@example.test"})
	other := create("users", map[string]any{"email": "catalog-other@example.test"})
	owned := create("restaurants", map[string]any{"createdBy": owner.Id, "name": "Created restaurant", "location": "Branch", "visibility": "private"})
	empty := create("restaurants", map[string]any{"createdBy": owner.Id, "name": "Empty restaurant", "location": "Branch", "visibility": "private"})
	shared := create("restaurants", map[string]any{"createdBy": other.Id, "name": "Shared restaurant", "location": "Branch", "visibility": "public"})
	create("restaurants", map[string]any{"createdBy": other.Id, "name": "Unrelated restaurant", "location": "Branch", "visibility": "public"})
	standalone := create("menu_items", map[string]any{"createdBy": owner.Id, "restaurant": owned.Id, "name": "Standalone dish", "description": "Created without a visit"})
	sharedMenu := create("menu_items", map[string]any{"createdBy": owner.Id, "restaurant": shared.Id, "name": "My shared-restaurant dish"})
	create("menu_items", map[string]any{"createdBy": other.Id, "restaurant": owned.Id, "name": "Someone else's dish"})
	readExport := func(productsOnly bool) map[string][]map[string]any {
		t.Helper()
		var output bytes.Buffer
		if err := writeFoodJournalExport(context.Background(), app, owner.Id, &output, time.UTC, &foodJournalExportPart{number: 1, mediaLimit: foodJournalPartMediaLimit, productsOnly: productsOnly}); err != nil {
			t.Fatal(err)
		}
		archive, err := zip.NewReader(bytes.NewReader(output.Bytes()), int64(output.Len()))
		if err != nil {
			t.Fatal(err)
		}
		for _, file := range archive.File {
			if file.Name != "food-journal.json" {
				continue
			}
			r, err := file.Open()
			if err != nil {
				t.Fatal(err)
			}
			defer r.Close()
			var manifest struct {
				Restaurants, MenuItems, Records, Items []map[string]any
			}
			if err := json.NewDecoder(r).Decode(&manifest); err != nil {
				t.Fatal(err)
			}
			return map[string][]map[string]any{"restaurants": manifest.Restaurants, "menuItems": manifest.MenuItems, "records": manifest.Records, "items": manifest.Items}
		}
		t.Fatal("missing manifest")
		return nil
	}
	journal := readExport(false)
	for collection, expected := range map[string][]string{"restaurants": {owned.Id, empty.Id, shared.Id}, "menuItems": {standalone.Id, sharedMenu.Id}, "records": {}, "items": {}} {
		if len(journal[collection]) != len(expected) {
			t.Fatalf("%s: got %d records, want %d", collection, len(journal[collection]), len(expected))
		}
		for _, id := range expected {
			found := false
			for _, row := range journal[collection] {
				found = found || row["id"] == id
			}
			if !found {
				t.Fatalf("%s: missing %s", collection, id)
			}
		}
	}
	for collection, rows := range readExport(true) {
		if len(rows) != 0 {
			t.Fatalf("standalone catalog leaked into product export: %s", collection)
		}
	}
	visit := create("visits", map[string]any{"user": owner.Id, "restaurant": owned.Id, "visitDate": "2026-09-30 02:00:00.000Z", "visitLocalDate": "2026-09-29", "visibility": "private"})
	create("food_items", map[string]any{"user": owner.Id, "visit": visit.Id, "menuItem": standalone.Id, "name": "Standalone dish", "itemType": "visit-item", "rating": 4})
	journal = readExport(false)
	if len(journal["restaurants"]) != 3 || len(journal["menuItems"]) != 2 || len(journal["records"]) != 1 || len(journal["items"]) != 1 {
		t.Fatal("referencing created catalog entries must not duplicate them")
	}
}

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
	restaurant := makeRecord("restaurants", map[string]any{"name": "Synthetic restaurant", "location": "Synthetic branch", "visibility": "public", "latitude": 37.77, "longitude": -122.43})
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
		var catalog struct {
			Restaurants []struct {
				ID          string             `json:"id"`
				Coordinates map[string]float64 `json:"coordinates"`
			} `json:"restaurants"`
		}
		if err := json.Unmarshal(raw, &catalog); err != nil {
			t.Fatal(err)
		}
		if len(catalog.Restaurants) != 1 || catalog.Restaurants[0].ID != restaurant.Id || catalog.Restaurants[0].Coordinates["latitude"] != 37.77 || catalog.Restaurants[0].Coordinates["longitude"] != -122.43 {
			t.Fatal("saved restaurant coordinates missing")
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

func TestFoodJournalProductsExportScopeOwnershipMetadataAndPhotos(t *testing.T) {
	app := testutil.NewTestApp(t)
	users, _ := app.FindCollectionByNameOrId("users")
	user := core.NewRecord(users)
	user.SetEmail("product-export@example.invalid")
	user.Set("defaultRestaurantVisibility", "private")
	user.Set("defaultVisitVisibility", "private")
	user.SetPassword("synthetic-password123")
	user.SetVerified(true)
	if err := app.Save(user); err != nil {
		t.Fatal(err)
	}
	other := core.NewRecord(users)
	other.SetEmail("other-product-export@example.invalid")
	other.Set("defaultRestaurantVisibility", "private")
	other.Set("defaultVisitVisibility", "private")
	other.SetPassword("synthetic-password123")
	other.SetVerified(true)
	if err := app.Save(other); err != nil {
		t.Fatal(err)
	}
	create := func(collection string, values map[string]any) *core.Record {
		c, err := app.FindCollectionByNameOrId(collection)
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
	product := create("food_items", map[string]any{"user": user.Id, "name": "Chocolate", "itemType": "food-product", "rating": 5, "notes": "Good", "itemCategory": "Snacks", "location_text": "Market", "itemDate": "2026-09-30 02:00:00.000Z", "latitude": 37, "longitude": -122})
	create("food_items", map[string]any{"user": other.Id, "name": "Other owner's product", "itemType": "food-product", "rating": 4})
	restaurant := create("restaurants", map[string]any{"name": "Restaurant", "location": "Branch", "visibility": "private"})
	visit := create("visits", map[string]any{"user": user.Id, "restaurant": restaurant.Id, "visitLocalDate": "2026-09-29", "visitDate": "2026-09-30 02:00:00.000Z", "visibility": "private"})
	create("food_items", map[string]any{"user": user.Id, "visit": visit.Id, "name": "Visit dish", "itemType": "visit-item", "rating": 4})
	create("notes", map[string]any{"user": user.Id, "content": "Separate note", "status": "draft"})
	png, _ := base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1sAAAAASUVORK5CYII=")
	file, _ := filesystem.NewFileFromBytes(png, "synthetic.png")
	photo := create("visit_photos", map[string]any{"user": user.Id, "food_item": product.Id, "photo": file, "caption": "Product photo"})
	router, _ := apis.NewRouter(app)
	RegisterFoodJournalExportHandlers(&core.ServeEvent{App: app, Router: router}, app)
	handler, _ := router.BuildMux()
	token, _ := user.NewAuthToken()
	download := func(query, auth string) *httptest.ResponseRecorder {
		req := httptest.NewRequest("GET", "/api/food-journal/export?timezone=America%2FLos_Angeles"+query, nil)
		req.Header.Set("Authorization", auth)
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, req)
		return response
	}
	if download("&scope=food-products", "").Code != 401 {
		t.Fatal("unauthenticated export accepted")
	}
	if download("&scope=unknown", token).Code != 400 {
		t.Fatal("unknown export scope accepted")
	}
	response := download("&scope=food-products", token)
	if response.Code != 200 {
		t.Fatalf("export: %d %s", response.Code, response.Body)
	}
	if !strings.Contains(response.Header().Get("Content-Disposition"), "food-products.zip") {
		t.Fatal("wrong download filename")
	}
	reader, err := zip.NewReader(bytes.NewReader(response.Body.Bytes()), int64(response.Body.Len()))
	if err != nil {
		t.Fatal(err)
	}
	var manifest struct {
		Dataset                string `json:"dataset"`
		Restaurants, MenuItems []map[string]any
		Records, Items, Photos []map[string]any
	}
	for _, entry := range reader.File {
		if entry.Name != "food-journal.json" {
			continue
		}
		r, _ := entry.Open()
		raw, _ := io.ReadAll(r)
		r.Close()
		if err := json.Unmarshal(raw, &manifest); err != nil {
			t.Fatal(err)
		}
	}
	if len(manifest.Records) != 1 || len(manifest.Items) != 1 || len(manifest.Photos) != 1 || len(manifest.Restaurants) != 0 || len(manifest.MenuItems) != 0 {
		t.Fatalf("wrong product export counts: %+v", manifest)
	}
	record := manifest.Records[0]
	for field, expected := range map[string]string{"id": "food-product-" + product.Id, "type": "food-product", "category": "Snacks", "locationText": "Market", "notes": "Good", "date": "2026-09-29"} {
		if record[field] != expected {
			t.Fatalf("lost %s: %v", field, record[field])
		}
	}
	if manifest.Items[0]["record"] != record["id"] || manifest.Items[0]["rating"] != "5" {
		t.Fatal("wrong product item")
	}
	if manifest.Photos[0]["record"] != record["id"] || manifest.Photos[0]["item"] != product.Id || manifest.Photos[0]["id"] != "visit-photo-"+photo.Id {
		t.Fatal("lost product photo associations")
	}
	if record["coordinates"].(map[string]any)["latitude"] != float64(37) {
		t.Fatal("lost product coordinates")
	}
	retry := download("&scope=food-products&snapshot="+response.Header().Get("X-Food-Journal-Snapshot"), token)
	if retry.Code != 200 || retry.Header().Get("X-Food-Journal-Snapshot") != response.Header().Get("X-Food-Journal-Snapshot") {
		t.Fatal("unstable product snapshot")
	}
	wrongScope := download("&snapshot="+response.Header().Get("X-Food-Journal-Snapshot"), token)
	if wrongScope.Code != 409 {
		t.Fatal("product snapshot accepted for journal export")
	}
}
