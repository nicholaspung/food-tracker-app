package handlers

import (
	"archive/zip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"io"
	"net/http"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"
)

const foodJournalPartMediaLimit = 224 * 1024 * 1024

var (
	errFoodJournalChanged          = errors.New("export source changed")
	errFoodJournalPartMissing      = errors.New("export part does not exist")
	errFoodJournalPhotoTooLarge    = errors.New("export photo exceeds 30 MiB")
	errFoodJournalMetadataTooLarge = errors.New("export metadata exceeds importer limits")
)

type foodJournalExportPart struct {
	productsOnly     bool
	number           int
	count            int
	mediaLimit       int64
	expectedSnapshot string
	snapshot         string
}

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
		scope := e.Request.URL.Query().Get("scope")
		if scope != "" && scope != "journal" && scope != "food-products" {
			return apis.NewBadRequestError("Choose a valid export type", nil)
		}
		part := foodJournalExportPart{number: 1, mediaLimit: foodJournalPartMediaLimit, productsOnly: scope == "food-products"}
		if value := e.Request.URL.Query().Get("part"); value != "" {
			part.number, err = strconv.Atoi(value)
			if err != nil || part.number < 1 {
				return apis.NewBadRequestError("Choose a valid export part", nil)
			}
		}
		part.expectedSnapshot = e.Request.URL.Query().Get("snapshot")
		if part.number > 1 && part.expectedSnapshot == "" {
			return apis.NewBadRequestError("Download part 1 before requesting another part", nil)
		}
		temp, err := os.CreateTemp("", "food-journal-*.zip")
		if err != nil {
			return apis.NewApiError(500, "Unable to prepare export", nil)
		}
		defer os.Remove(temp.Name())
		defer temp.Close()
		// Build fully before returning so missing photos cannot produce a successful-looking partial ZIP.
		if err := writeFoodJournalExport(e.Request.Context(), app, e.Auth.Id, temp, location, &part); err != nil {
			switch {
			case errors.Is(err, errFoodJournalChanged):
				return apis.NewApiError(409, "Your records changed during export. Start a new export and download every part again.", nil)
			case errors.Is(err, errFoodJournalPartMissing):
				return apis.NewBadRequestError("This export part does not exist", nil)
			case errors.Is(err, errFoodJournalPhotoTooLarge):
				return apis.NewBadRequestError("A photo exceeds the importer's 30 MiB limit", nil)
			case errors.Is(err, errFoodJournalMetadataTooLarge):
				return apis.NewApiError(413, "Record metadata exceeds the supported import size", nil)
			}
			return apis.NewApiError(500, "Export failed. Check that your photos are available and try again.", nil)
		}
		info, err := temp.Stat()
		if err != nil {
			return err
		}
		if info.Size() > 256*1024*1024 {
			return apis.NewApiError(413, "Record metadata exceeds the supported import size", nil)
		}
		if _, err := temp.Seek(0, 0); err != nil {
			return err
		}
		e.Response.Header().Set("Content-Type", "application/zip")
		baseName := "food-journal"
		if part.productsOnly {
			baseName = "food-products"
		}
		filename := baseName + ".zip"
		if part.count > 1 {
			filename = fmt.Sprintf("%s-part-%d-of-%d.zip", baseName, part.number, part.count)
		}
		e.Response.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
		e.Response.Header().Set("X-Food-Journal-Parts", strconv.Itoa(part.count))
		e.Response.Header().Set("X-Food-Journal-Snapshot", part.snapshot)
		e.Response.Header().Set("Access-Control-Expose-Headers", "X-Food-Journal-Parts, X-Food-Journal-Snapshot")
		e.Response.Header().Set("X-Content-Type-Options", "nosniff")
		e.Response.WriteHeader(http.StatusOK)
		_, err = io.Copy(e.Response, temp)
		return err
	})
}

func writeFoodJournalExport(ctx context.Context, app core.App, user string, output io.Writer, location *time.Location, part *foodJournalExportPart) error {
	load := func(collection string) ([]*core.Record, error) {
		if part.productsOnly && collection != "food_items" && collection != "visit_photos" {
			return nil, nil
		}
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
	if part.productsOnly {
		visits = nil
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
		row := map[string]any{"id": v.Id, "restaurant": restaurant, "date": day, "notes": v.GetString("notes"), "method": "manual", "type": "visit", "sourceCreated": v.GetString("created"), "sourceUpdated": v.GetString("updated")}
		rows["records"] = append(rows["records"], row)
		records[v.Id] = row
	}
	for _, item := range foodItems {
		parent := item.GetString("visit")
		if isFoodProductRecord(item) {
			if !part.productsOnly {
				continue
			}
			parent = "food-product-" + item.Id
			tracked := item.GetString("itemDate")
			if tracked == "" {
				tracked = item.GetString("created")
			}
			day := noteExportDay(tracked, location)
			if day == "" {
				return fmt.Errorf("food product has no valid tracked date")
			}
			restaurant := ""
			if visitID := item.GetString("visit"); visitID != "" {
				visit, err := app.FindRecordById("visits", visitID)
				if err != nil {
					return err
				}
				if visit.GetString("user") == user {
					restaurant = visit.GetString("restaurant")
				}
			}
			if restaurant != "" {
				restaurants[restaurant] = true
			}
			row := map[string]any{"id": parent, "restaurant": restaurant, "date": day, "notes": item.GetString("notes"), "method": "manual", "type": "food-product", "category": item.GetString("itemCategory"), "locationText": item.GetString("location_text"), "sourceCreated": item.GetString("created"), "sourceUpdated": item.GetString("updated")}
			lat, lon := item.GetFloat("latitude"), item.GetFloat("longitude")
			if (lat != 0 || lon != 0) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180 {
				row["coordinates"] = map[string]float64{"latitude": lat, "longitude": lon}
			}
			records[parent] = row
			rows["records"] = append(rows["records"], row)
		} else if part.productsOnly || records[parent] == nil {
			continue
		}
		menuID := item.GetString("menuItem")
		if part.productsOnly {
			menuID = ""
		}
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
		itemNotes := item.GetString("notes")
		if part.productsOnly {
			itemNotes = ""
		} // Already preserved on the product record.
		rows["items"] = append(rows["items"], map[string]any{"id": item.Id, "record": parent, "menuItem": menuID, "name": item.GetString("name"), "description": item.GetString("description"), "notes": itemNotes, "rating": rating})
		items[item.Id] = parent
	}
	for _, note := range notes {
		if part.productsOnly {
			continue
		}
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
			row := map[string]any{"id": parent, "restaurant": restaurant, "date": noteExportDay(created, location), "notes": content, "method": "notes", "type": "note", "sourceCreated": created, "sourceUpdated": note.GetString("updated")}
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
		// Keep the place identity and saved coordinates for portable map pins;
		// omit other Places metadata from the personal catalog.
		location := r.GetString("location")
		cuisine := r.GetString("cuisineType")
		if r.GetBool("isGooglePlace") {
			location = ""
			cuisine = ""
		}
		row := map[string]any{"id": id, "name": r.GetString("name"), "location": location, "cuisine": cuisine, "placeId": r.GetString("placeId")}
		// Portable saved locations let the destination map work without another lookup.
		lat, lon := r.GetFloat("latitude"), r.GetFloat("longitude")
		if (lat != 0 || lon != 0) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180 {
			row["coordinates"] = map[string]float64{"latitude": lat, "longitude": lon}
		}
		rows["restaurants"] = append(rows["restaurants"], row)
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
	// Every part repeats the catalog and record metadata; source identities remain
	// stable so importing later parts reuses records and only adds their photos.
	fingerprint := sha256.New()
	stateEncoder := json.NewEncoder(fingerprint)
	if err := stateEncoder.Encode([]any{app.Settings().Meta.AppURL, user, location.String(), part.mediaLimit, part.productsOnly, rows}); err != nil {
		return err
	}
	currentPart := 1
	partBytes := int64(0)
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
		// Partition original media while keeping each photo below the importer limit.
		bytes, err := io.ReadAll(io.LimitReader(reader, 30*1024*1024+1))
		if err != nil {
			return err
		}
		if len(bytes) > 30*1024*1024 {
			return errFoodJournalPhotoTooLarge
		}
		hash := sha256.Sum256(bytes)
		checksum := hex.EncodeToString(hash[:])
		dedupe := parent + ":" + checksum
		if seen[dedupe] {
			return nil
		}
		seen[dedupe] = true
		if partBytes > 0 && partBytes+int64(len(bytes)) > part.mediaLimit {
			currentPart++
			partBytes = 0
		}
		partBytes += int64(len(bytes))
		id := kind + "-" + photo.Id
		path := "media/" + id
		row := map[string]any{"id": id, "record": parent, "item": item, "path": path, "sha256": checksum, "caption": photo.GetString("caption"), "capturedAt": photo.GetString("capturedAt")}
		if err := stateEncoder.Encode(row); err != nil {
			return err
		}
		if currentPart != part.number {
			return nil
		}
		entry, err := writer.CreateHeader(&zip.FileHeader{Name: path, Method: zip.Store})
		if err != nil {
			return err
		}
		if _, err := entry.Write(bytes); err != nil {
			return err
		}
		rows["photos"] = append(rows["photos"], row)
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
	part.count = currentPart
	part.snapshot = hex.EncodeToString(fingerprint.Sum(nil))
	if part.expectedSnapshot != "" && part.expectedSnapshot != part.snapshot {
		return errFoodJournalChanged
	}
	if part.number > part.count {
		return errFoodJournalPartMissing
	}
	datasetHash := sha256.Sum256([]byte("food-tracker:" + app.Settings().Meta.AppURL + ":" + user))
	manifest := map[string]any{"format": "food-journal", "version": 1, "dataset": hex.EncodeToString(datasetHash[:]), "exportedAt": time.Now().UTC().Format(time.RFC3339)}
	for key, value := range rows {
		manifest[key] = value
	}
	manifestBytes, err := json.Marshal(manifest)
	if err != nil {
		return err
	}
	if len(manifestBytes) > 25*1024*1024 {
		return errFoodJournalMetadataTooLarge
	}
	metadata, err := writer.Create("food-journal.json")
	if err != nil {
		return err
	}
	if _, err := metadata.Write(manifestBytes); err != nil {
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
