package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

const webPhotoViewerThumbSize = "1600x1600f"

func init() {
	m.Register(func(app core.App) error {
		for _, collectionName := range []string{"visit_photos", "note_photos"} {
			if err := addPhotoThumbSize(app, collectionName, webPhotoViewerThumbSize); err != nil {
				return err
			}
		}

		log.Println("✓ Added web photo viewer thumb size")
		return nil
	}, func(app core.App) error {
		for _, collectionName := range []string{"visit_photos", "note_photos"} {
			if err := removePhotoThumbSize(app, collectionName, webPhotoViewerThumbSize); err != nil {
				return err
			}
		}

		log.Println("✓ Removed web photo viewer thumb size")
		return nil
	})
}

func addPhotoThumbSize(app core.App, collectionName string, thumbSize string) error {
	collection, err := app.FindCollectionByNameOrId(collectionName)
	if err != nil {
		return err
	}

	photoField := collection.Fields.GetByName("photo")
	fileField, ok := photoField.(*core.FileField)
	if !ok {
		return app.Save(collection)
	}

	for _, existingThumbSize := range fileField.Thumbs {
		if existingThumbSize == thumbSize {
			return app.Save(collection)
		}
	}

	fileField.Thumbs = append(fileField.Thumbs, thumbSize)
	return app.Save(collection)
}

func removePhotoThumbSize(app core.App, collectionName string, thumbSize string) error {
	collection, err := app.FindCollectionByNameOrId(collectionName)
	if err != nil {
		return err
	}

	photoField := collection.Fields.GetByName("photo")
	fileField, ok := photoField.(*core.FileField)
	if !ok {
		return app.Save(collection)
	}

	nextThumbs := make([]string, 0, len(fileField.Thumbs))
	for _, existingThumbSize := range fileField.Thumbs {
		if existingThumbSize != thumbSize {
			nextThumbs = append(nextThumbs, existingThumbSize)
		}
	}

	fileField.Thumbs = nextThumbs
	return app.Save(collection)
}
