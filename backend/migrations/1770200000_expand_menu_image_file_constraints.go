package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		if err := updateMenuImageFileField(app, expandedPhotoUploadMaxSizeBytes, expandedPhotoUploadMimeTypes); err != nil {
			return err
		}

		log.Println("✓ Expanded menu image file constraints")
		return nil
	}, func(app core.App) error {
		if err := updateMenuImageFileField(app, 5242880, legacyPhotoUploadMimeTypes); err != nil {
			return err
		}

		log.Println("✓ Restored legacy menu image file constraints")
		return nil
	})
}

func updateMenuImageFileField(app core.App, maxSize int64, mimeTypes []string) error {
	collection, err := app.FindCollectionByNameOrId("menu_images")
	if err != nil {
		return err
	}

	imageField := collection.Fields.GetByName("image")
	if fileField, ok := imageField.(*core.FileField); ok {
		fileField.MaxSize = maxSize
		fileField.MimeTypes = mimeTypes
	}

	return app.Save(collection)
}
