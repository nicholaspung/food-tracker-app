package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		collection := core.NewBaseCollection("moderation_cases")

		collection.ListRule = types.Pointer("@request.auth.isAdmin = true")
		collection.ViewRule = types.Pointer("@request.auth.isAdmin = true")
		collection.CreateRule = types.Pointer("@request.auth.isAdmin = true")
		collection.UpdateRule = types.Pointer("@request.auth.isAdmin = true")
		collection.DeleteRule = types.Pointer("@request.auth.isAdmin = true")

		collection.Fields.Add(&core.SelectField{
			Name:      "targetType",
			Required:  true,
			MaxSelect: 1,
			Values:    []string{"visit", "food-item", "quick-track", "list", "list-item", "note", "photo", "user"},
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
		collection.Fields.Add(&core.TextField{
			Name:     "targetLabel",
			Required: false,
			Max:      200,
		})
		collection.Fields.Add(&core.SelectField{
			Name:      "status",
			Required:  true,
			MaxSelect: 1,
			Values: []string{
				"open",
				"under_review",
				"reviewed",
				"hidden",
				"removed",
				"restored",
				"escalated",
				"restricted_visibility",
				"warned",
				"restricted",
				"banned",
			},
		})
		collection.Fields.Add(&core.SelectField{
			Name:      "action",
			Required:  false,
			MaxSelect: 1,
			Values: []string{
				"mark_reviewed",
				"quarantine",
				"hide",
				"remove",
				"restore",
				"escalate",
				"restrict_visibility",
				"warn",
				"restrict",
				"ban",
			},
		})
		collection.Fields.Add(&core.SelectField{
			Name:      "reasonCode",
			Required:  false,
			MaxSelect: 1,
			Values: []string{
				"spam",
				"harassment",
				"hate",
				"sexual",
				"violence",
				"self_harm",
				"illegal",
				"privacy",
				"copyright",
				"misinformation",
				"other",
				"pre_review",
			},
		})
		collection.Fields.Add(&core.TextField{
			Name:     "moderatorNote",
			Required: false,
			Max:      4000,
		})
		collection.Fields.Add(&core.TextField{
			Name:     "userNotice",
			Required: false,
			Max:      2000,
		})
		collection.Fields.Add(&core.SelectField{
			Name:      "appealState",
			Required:  false,
			MaxSelect: 1,
			Values:    []string{"none", "requested", "approved", "denied"},
		})
		collection.Fields.Add(&core.DateField{
			Name:     "assignedAt",
			Required: false,
		})
		collection.Fields.Add(&core.DateField{
			Name:     "resolvedAt",
			Required: false,
		})
		collection.Fields.Add(&core.AutodateField{
			Name:     "created",
			OnCreate: true,
		})
		collection.Fields.Add(&core.AutodateField{
			Name:     "updated",
			OnUpdate: true,
		})

		usersCollection, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			return err
		}

		collection.Fields.Add(&core.RelationField{
			Name:          "targetUser",
			CollectionId:  usersCollection.Id,
			MaxSelect:     1,
			Required:      true,
			CascadeDelete: true,
		})
		collection.Fields.Add(&core.RelationField{
			Name:          "assignedAdmin",
			CollectionId:  usersCollection.Id,
			MaxSelect:     1,
			Required:      false,
			CascadeDelete: false,
		})

		collection.Indexes = []string{
			"CREATE UNIQUE INDEX idx_moderation_cases_target ON moderation_cases (targetType, targetRecordId)",
		}

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Created moderation_cases collection")
		return nil
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("moderation_cases")
		if err != nil {
			return err
		}

		if err := app.Delete(collection); err != nil {
			return err
		}

		log.Println("✓ Deleted moderation_cases collection")
		return nil
	})
}
