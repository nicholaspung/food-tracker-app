package migrations

import (
	"log"
	"path/filepath"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/rwcarlsen/goexif/exif"
)

const notePhotoCapturedAtFieldName = "capturedAt"

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("note_photos")
		if err != nil {
			return err
		}

		if collection.Fields.GetByName(notePhotoCapturedAtFieldName) == nil {
			collection.Fields.Add(&core.DateField{
				Name:     notePhotoCapturedAtFieldName,
				Required: false,
			})
			if err := app.Save(collection); err != nil {
				return err
			}
		}

		backfillNotePhotoCapturedAt(app)

		log.Println("✓ Added capturedAt field to note_photos collection")
		return nil
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("note_photos")
		if err != nil {
			return err
		}

		if collection.Fields.GetByName(notePhotoCapturedAtFieldName) != nil {
			collection.Fields.RemoveByName(notePhotoCapturedAtFieldName)
			if err := app.Save(collection); err != nil {
				return err
			}
		}

		log.Println("✓ Removed capturedAt field from note_photos collection")
		return nil
	})
}

func backfillNotePhotoCapturedAt(app core.App) {
	records, err := app.FindRecordsByFilter(
		"note_photos",
		"capturedAt = '' && photo != ''",
		"",
		0,
		0,
	)
	if err != nil {
		log.Printf("note_photos capturedAt backfill skipped: failed to load records: %v", err)
		return
	}

	fsys, err := app.NewFilesystem()
	if err != nil {
		log.Printf("note_photos capturedAt backfill skipped: failed to initialize filesystem: %v", err)
		return
	}
	defer fsys.Close()

	scanned := 0
	backfilled := 0
	skipped := 0

	for _, record := range records {
		scanned++
		filename := strings.TrimSpace(record.GetString("photo"))
		if filename == "" || !isNotePhotoJpegFilename(filename) {
			skipped++
			continue
		}

		reader, err := fsys.GetReader(record.BaseFilesPath() + "/" + filename)
		if err != nil {
			skipped++
			continue
		}

		capturedAt, err := extractNotePhotoExifCapturedAt(reader)
		closeErr := reader.Close()
		if err != nil || closeErr != nil || capturedAt.IsZero() {
			skipped++
			continue
		}

		record.Set(notePhotoCapturedAtFieldName, capturedAt.UTC().Format(time.RFC3339Nano))
		if err := app.Save(record); err != nil {
			log.Printf("note_photos capturedAt backfill skipped record=%s: failed to save: %v", record.Id, err)
			skipped++
			continue
		}

		backfilled++
	}

	log.Printf(
		"note_photos capturedAt backfill complete: scanned=%d backfilled=%d skipped=%d",
		scanned,
		backfilled,
		skipped,
	)
}

func isNotePhotoJpegFilename(filename string) bool {
	extension := strings.ToLower(filepath.Ext(filename))
	return extension == ".jpg" || extension == ".jpeg"
}

func extractNotePhotoExifCapturedAt(reader interface {
	Read([]byte) (int, error)
}) (time.Time, error) {
	exifData, err := exif.Decode(reader)
	if err != nil {
		return time.Time{}, err
	}

	for _, fieldName := range []exif.FieldName{
		exif.DateTimeOriginal,
		exif.DateTimeDigitized,
		exif.DateTime,
	} {
		capturedAt, err := parseNotePhotoExifDateField(exifData, fieldName)
		if err == nil && !capturedAt.IsZero() {
			return capturedAt, nil
		}
	}

	return time.Time{}, exif.TagNotPresentError("note photo EXIF capture date not found")
}

func parseNotePhotoExifDateField(exifData *exif.Exif, fieldName exif.FieldName) (time.Time, error) {
	tag, err := exifData.Get(fieldName)
	if err != nil {
		return time.Time{}, err
	}

	rawValue, err := tag.StringVal()
	if err != nil {
		return time.Time{}, err
	}

	trimmedValue := strings.TrimSpace(strings.TrimRight(rawValue, "\x00"))
	if trimmedValue == "" {
		return time.Time{}, exif.TagNotPresentError(fieldName)
	}

	return time.ParseInLocation("2006:01:02 15:04:05", trimmedValue, time.Local)
}
