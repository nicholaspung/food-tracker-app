package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

const (
	expandedPhotoUploadMaxSizeBytes = 10 << 20
	legacyPhotoUploadMaxSizeBytes   = 3 << 20
)

var expandedPhotoUploadMimeTypes = []string{
	"image/jpeg",
	"image/png",
	"image/webp",
	"image/heic",
	"image/heif",
}

var legacyPhotoUploadMimeTypes = []string{
	"image/jpeg",
	"image/png",
	"image/webp",
}

func init() {
	m.Register(func(app core.App) error {
		for _, collectionName := range []string{"visit_photos", "note_photos"} {
			if err := updatePhotoFileField(app, collectionName, expandedPhotoUploadMaxSizeBytes, expandedPhotoUploadMimeTypes); err != nil {
				return err
			}
		}

		log.Println("✓ Expanded photo upload file constraints")
		return nil
	}, func(app core.App) error {
		for _, collectionName := range []string{"visit_photos", "note_photos"} {
			if err := updatePhotoFileField(app, collectionName, legacyPhotoUploadMaxSizeBytes, legacyPhotoUploadMimeTypes); err != nil {
				return err
			}
		}

		log.Println("✓ Restored legacy photo upload file constraints")
		return nil
	})
}

func updatePhotoFileField(
	app core.App,
	collectionName string,
	maxSize int64,
	mimeTypes []string,
) error {
	collection, err := app.FindCollectionByNameOrId(collectionName)
	if err != nil {
		return err
	}

	photoField := collection.Fields.GetByName("photo")
	if fileField, ok := photoField.(*core.FileField); ok {
		fileField.MaxSize = maxSize
		fileField.MimeTypes = mimeTypes
	}

	return app.Save(collection)
}
