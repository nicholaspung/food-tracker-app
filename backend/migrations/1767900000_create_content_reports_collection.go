package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		collection := core.NewBaseCollection("content_reports")

		collection.ListRule = types.Pointer("@request.auth.isAdmin = true")
		collection.ViewRule = types.Pointer("@request.auth.isAdmin = true")
		collection.CreateRule = types.Pointer("@request.auth.isAdmin = true")
		collection.UpdateRule = types.Pointer("@request.auth.isAdmin = true")
		collection.DeleteRule = types.Pointer("@request.auth.isAdmin = true")

		usersCollection, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			return err
		}

		moderationCasesCollection, err := app.FindCollectionByNameOrId("moderation_cases")
		if err != nil {
			return err
		}

		collection.Fields.Add(&core.RelationField{
			Name:          "reporter",
			CollectionId:  usersCollection.Id,
			MaxSelect:     1,
			Required:      true,
			CascadeDelete: true,
		})
		collection.Fields.Add(&core.SelectField{
			Name:      "targetType",
			Required:  true,
			MaxSelect: 1,
			Values:    []string{"visit", "quick-track"},
		})
		collection.Fields.Add(&core.TextField{
			Name:     "targetRecordId",
			Required: true,
			Max:      80,
		})
		collection.Fields.Add(&core.TextField{
			Name:     "targetCollection",
			Required: true,
			Max:      80,
		})
		collection.Fields.Add(&core.RelationField{
			Name:          "targetUser",
			CollectionId:  usersCollection.Id,
			MaxSelect:     1,
			Required:      true,
			CascadeDelete: true,
		})
		collection.Fields.Add(&core.RelationField{
			Name:          "moderationCase",
			CollectionId:  moderationCasesCollection.Id,
			MaxSelect:     1,
			Required:      true,
			CascadeDelete: true,
		})
		collection.Fields.Add(&core.SelectField{
			Name:      "reasonCode",
			Required:  true,
			MaxSelect: 1,
			Values:    []string{"spam", "harassment", "hate", "sexual", "violence", "privacy", "other"},
		})
		collection.Fields.Add(&core.TextField{
			Name:     "notes",
			Required: false,
			Max:      2000,
		})
		collection.Fields.Add(&core.AutodateField{
			Name:     "created",
			OnCreate: true,
		})
		collection.Fields.Add(&core.AutodateField{
			Name:     "updated",
			OnUpdate: true,
		})

		collection.Indexes = []string{
			"CREATE UNIQUE INDEX idx_content_reports_reporter_target ON content_reports (reporter, targetType, targetRecordId)",
			"CREATE INDEX idx_content_reports_case ON content_reports (moderationCase)",
		}

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Created content_reports collection")
		return nil
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("content_reports")
		if err != nil {
			return err
		}

		if err := app.Delete(collection); err != nil {
			return err
		}

		log.Println("✓ Deleted content_reports collection")
		return nil
	})
}
