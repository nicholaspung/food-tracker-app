package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("notes")
		if err != nil {
			return err
		}

		collection.Fields.Add(&core.DateField{
			Name:     "usedAt",
			Required: false,
		})

		if err := app.Save(collection); err != nil {
			return err
		}

		usedNotes, err := app.FindRecordsByFilter(
			"notes",
			"status = 'used'",
			"",
			0,
			0,
		)
		if err != nil {
			return err
		}

		for _, note := range usedNotes {
			if note.GetString("usedAt") != "" {
				continue
			}

			usedAt := note.GetString("updated")
			if usedAt == "" {
				usedAt = note.GetString("created")
			}

			if usedAt == "" {
				continue
			}

			note.Set("usedAt", usedAt)
			if err := app.Save(note); err != nil {
				return err
			}
		}

		log.Println("✓ Added usedAt field to notes collection")
		return nil
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("notes")
		if err != nil {
			return err
		}

		collection.Fields.RemoveByName("usedAt")

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Removed usedAt field from notes collection")
		return nil
	})
}
