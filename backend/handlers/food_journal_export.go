package handlers

import (
	"archive/zip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"io"
	"net/http"
	"os"
	"sort"
	"strings"
	"time"
)

// This portable personal-history format excludes social, bill, list and moderation data.
func RegisterFoodJournalExportHandlers(se *core.ServeEvent, app core.App) {
	se.Router.GET("/api/food-journal/export", func(e *core.RequestEvent) error {
		if e.Auth == nil {
			return apis.NewUnauthorizedError("Sign in to export food records", nil)
		}
		e.Response.Header().Set("Cache-Control", "no-store")
		zone := e.Request.URL.Query().Get("timezone")
		if zone == "" {
			zone = "UTC"
		}
		location, err := time.LoadLocation(zone)
		if err != nil {
			return apis.NewBadRequestError("Choose a valid timezone", nil)
		}
		temp, err := os.CreateTemp("", "food-journal-*.zip")
		if err != nil {
			return apis.NewApiError(500, "Unable to prepare export", nil)
		}
		defer os.Remove(temp.Name())
		defer temp.Close()
		// Build fully before returning so missing photos cannot produce a successful-looking partial ZIP.
		if err := writeFoodJournalExport(e.Request.Context(), app, e.Auth.Id, temp, location); err != nil {
			return apis.NewApiError(500, "Export failed. Check that your photos are available and try again.", nil)
		}
		if _, err := temp.Seek(0, 0); err != nil {
			return err
		}
		e.Response.Header().Set("Content-Type", "application/zip")
		e.Response.Header().Set("Content-Disposition", `attachment; filename="food-journal.zip"`)
		e.Response.Header().Set("X-Content-Type-Options", "nosniff")
		e.Response.WriteHeader(http.StatusOK)
		_, err = io.Copy(e.Response, temp)
		return err
	})
}

func writeFoodJournalExport(ctx context.Context, app core.App, user string, output io.Writer, location *time.Location) error {
	load := func(collection string) ([]*core.Record, error) {
		return app.FindRecordsByFilter(collection, "user = {:user}", "created,id", 0, 0, dbx.Params{"user": user})
	}
	visits, err := load("visits")
	if err != nil {
		return err
	}
	foodItems, err := load("food_items")
	if err != nil {
		return err
	}
	notes, err := load("notes")
	if err != nil {
		return err
	}
	visitPhotos, err := load("visit_photos")
	if err != nil {
		return err
	}
	notePhotos, err := load("note_photos")
	if err != nil {
		return err
	}
	rows := map[string][]map[string]any{"restaurants": {}, "menuItems": {}, "records": {}, "items": {}, "photos": {}}
	restaurants := map[string]bool{}
	menus := map[string]bool{}
	records := map[string]map[string]any{}
	items := map[string]string{}
	noteRecords := map[string]string{}
	for _, v := range visits {
		restaurant := v.GetString("restaurant")
		if restaurant != "" {
			restaurants[restaurant] = true
		}
		day := v.GetString("visitLocalDate")
		if day == "" {
			raw := v.GetString("visitDate")
			if len(raw) >= 10 {
				day = raw[:10]
			}
		}
		if _, err := time.Parse("2006-01-02", day); err != nil {
			return fmt.Errorf("visit has no valid calendar day")
		}
		row := map[string]any{"id": v.Id, "restaurant": restaurant, "date": day, "notes": v.GetString("notes"), "method": "manual", "sourceCreated": v.GetString("created"), "sourceUpdated": v.GetString("updated")}
		rows["records"] = append(rows["records"], row)
		records[v.Id] = row
	}
	for _, item := range foodItems {
		parent := item.GetString("visit")
		if records[parent] == nil || item.GetString("itemType") == "food-product" {
			continue
		}
		menuID := item.GetString("menuItem")
		if menuID != "" {
			menu, err := app.FindRecordById("menu_items", menuID)
			if err != nil {
				return err
			}
			if menu.GetString("restaurant") != records[parent]["restaurant"] {
				menuID = ""
			} else {
				menus[menuID] = true
			}
		}
		rating := ""
		if value := item.GetInt("rating"); value >= 1 && value <= 5 {
			rating = fmt.Sprint(value)
		}
		rows["items"] = append(rows["items"], map[string]any{"id": item.Id, "record": parent, "menuItem": menuID, "name": item.GetString("name"), "description": item.GetString("description"), "notes": item.GetString("notes"), "rating": rating})
		items[item.Id] = parent
	}
	for _, note := range notes {
		parent := note.GetString("usedInVisit")
		if records[parent] != nil {
			original := records[parent]["notes"].(string)
			content := note.GetString("content")
			if content != "" && !strings.Contains(original, content) {
				records[parent]["notes"] = strings.TrimSpace(original + "\n\nOriginal note:\n" + content)
			}
		} else {
			parent = "note-" + note.Id
			created := note.GetString("created")
			if len(created) < 10 {
				return fmt.Errorf("note date missing")
			}
			restaurant := note.GetString("restaurant")
			if restaurant != "" {
				restaurants[restaurant] = true
			}
			content := note.GetString("content")
			if location := note.GetString("location_text"); location != "" {
				content = strings.TrimSpace(content + "\n\nLocation: " + location)
			}
			row := map[string]any{"id": parent, "restaurant": restaurant, "date": noteExportDay(created, location), "notes": content, "method": "notes", "sourceCreated": created, "sourceUpdated": note.GetString("updated")}
			rows["records"] = append(rows["records"], row)
			records[parent] = row
		}
		noteRecords[note.Id] = parent
	}
	sortedKeys := func(values map[string]bool) []string {
		keys := []string{}
		for key := range values {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		return keys
	}
	for _, id := range sortedKeys(restaurants) {
		r, err := app.FindRecordById("restaurants", id)
		if err != nil {
			return err
		}
		// Places results are not copied into the portable personal catalog. Keep the place ID;
		// a user's historical restaurant label remains necessary to interpret their own visit.
		location := r.GetString("location")
		cuisine := r.GetString("cuisineType")
		if r.GetBool("isGooglePlace") {
			location = ""
			cuisine = ""
		}
		rows["restaurants"] = append(rows["restaurants"], map[string]any{"id": id, "name": r.GetString("name"), "location": location, "cuisine": cuisine, "placeId": r.GetString("placeId")})
	}
	for _, id := range sortedKeys(menus) {
		m, err := app.FindRecordById("menu_items", id)
		if err != nil {
			return err
		}
		rows["menuItems"] = append(rows["menuItems"], map[string]any{"id": id, "restaurant": m.GetString("restaurant"), "name": m.GetString("name"), "description": m.GetString("description")})
	}
	writer := zip.NewWriter(output)
	defer writer.Close()
	fs, err := app.NewFilesystem()
	if err != nil {
		return err
	}
	defer fs.Close()
	total := int64(0)
	seen := map[string]bool{}
	addPhoto := func(photo *core.Record, parent, item, kind string) error {
		if parent == "" {
			return nil
		}
		if err := ctx.Err(); err != nil {
			return err
		}
		filename := photo.GetString("photo")
		if filename == "" {
			return fmt.Errorf("photo file missing")
		}
		reader, err := fs.GetReader(photo.BaseFilesPath() + "/" + filename)
		if err != nil {
			return err
		}
		defer reader.Close()
		// Bound the export to the importer limits; an oversized export fails explicitly.
		bytes, err := io.ReadAll(io.LimitReader(reader, 30*1024*1024+1))
		if err != nil {
			return err
		}
		if len(bytes) > 30*1024*1024 {
			return fmt.Errorf("photo too large")
		}
		total += int64(len(bytes))
		if total > 240*1024*1024 {
			return fmt.Errorf("export exceeds supported archive size")
		}
		hash := sha256.Sum256(bytes)
		checksum := hex.EncodeToString(hash[:])
		dedupe := parent + ":" + checksum
		if seen[dedupe] {
			return nil
		}
		seen[dedupe] = true
		id := kind + "-" + photo.Id
		path := "media/" + id
		entry, err := writer.CreateHeader(&zip.FileHeader{Name: path, Method: zip.Store})
		if err != nil {
			return err
		}
		if _, err := entry.Write(bytes); err != nil {
			return err
		}
		rows["photos"] = append(rows["photos"], map[string]any{"id": id, "record": parent, "item": item, "path": path, "sha256": checksum, "caption": photo.GetString("caption"), "capturedAt": photo.GetString("capturedAt")})
		return nil
	}
	for _, p := range visitPhotos {
		item := p.GetString("food_item")
		parent := items[item]
		if parent == "" {
			candidate := p.GetString("visit")
			if records[candidate] != nil {
				parent = candidate
				item = ""
			}
		}
		if err := addPhoto(p, parent, item, "visit-photo"); err != nil {
			return err
		}
	}
	for _, p := range notePhotos {
		if err := addPhoto(p, noteRecords[p.GetString("note")], "", "note-photo"); err != nil {
			return err
		}
	}
	datasetHash := sha256.Sum256([]byte("food-tracker:" + app.Settings().Meta.AppURL + ":" + user))
	manifest := map[string]any{"format": "food-journal", "version": 1, "dataset": hex.EncodeToString(datasetHash[:]), "exportedAt": time.Now().UTC().Format(time.RFC3339)}
	for key, value := range rows {
		manifest[key] = value
	}
	metadata, err := writer.Create("food-journal.json")
	if err != nil {
		return err
	}
	if err := json.NewEncoder(metadata).Encode(manifest); err != nil {
		return err
	}
	return writer.Close()
}

func noteExportDay(created string, location *time.Location) string {
	timestamp, err := time.Parse(time.RFC3339Nano, strings.Replace(created, " ", "T", 1))
	if err != nil {
		return ""
	}
	return timestamp.In(location).Format("2006-01-02")
}
