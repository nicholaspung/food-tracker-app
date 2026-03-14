package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		collection := core.NewBaseCollection("audit_logs")

		collection.ListRule = types.Pointer("@request.auth.isAdmin = true")
		collection.ViewRule = types.Pointer("@request.auth.isAdmin = true")
		collection.CreateRule = nil
		collection.UpdateRule = nil
		collection.DeleteRule = nil

		collection.Fields.Add(&core.SelectField{
			Name:      "action",
			Required:  true,
			MaxSelect: 1,
			Values:    []string{"create", "update", "delete"},
		})

		collection.Fields.Add(&core.TextField{
			Name:     "actorEmail",
			Required: false,
			Max:      255,
		})

		collection.Fields.Add(&core.TextField{
			Name:     "summary",
			Required: false,
			Max:      500,
		})

		collection.Fields.Add(&core.TextField{
			Name:     "targetCollection",
			Required: true,
			Max:      100,
		})

		collection.Fields.Add(&core.TextField{
			Name:     "targetRecordId",
			Required: true,
			Max:      100,
		})

		collection.Fields.Add(&core.TextField{
			Name:     "targetLabel",
			Required: false,
			Max:      255,
		})

		collection.Fields.Add(&core.TextField{
			Name:     "requestMethod",
			Required: false,
			Max:      16,
		})

		collection.Fields.Add(&core.TextField{
			Name:     "requestPath",
			Required: false,
			Max:      500,
		})

		collection.Fields.Add(&core.TextField{
			Name:     "requestIp",
			Required: false,
			Max:      64,
		})

		collection.Fields.Add(&core.TextField{
			Name:     "userAgent",
			Required: false,
			Max:      1000,
		})

		collection.Fields.Add(&core.JSONField{
			Name:     "changedFields",
			Required: false,
			MaxSize:  10000,
		})

		collection.Fields.Add(&core.JSONField{
			Name:     "beforeJson",
			Required: false,
			MaxSize:  131072,
		})

		collection.Fields.Add(&core.JSONField{
			Name:     "afterJson",
			Required: false,
			MaxSize:  131072,
		})

		collection.Fields.Add(&core.JSONField{
			Name:     "metadataJson",
			Required: false,
			MaxSize:  32768,
		})

		collection.Fields.Add(&core.AutodateField{
			Name:     "created",
			OnCreate: true,
		})

		usersCollection, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			log.Printf("Warning: Could not find users collection to create audit_logs.actor relation: %v", err)
		} else {
			collection.Fields.Add(&core.RelationField{
				Name:          "actor",
				CollectionId:  usersCollection.Id,
				MaxSelect:     1,
				Required:      false,
				CascadeDelete: false,
			})
		}

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Created audit_logs collection")
		return nil
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("audit_logs")
		if err != nil {
			return err
		}

		if err := app.Delete(collection); err != nil {
			return err
		}

		log.Println("✓ Deleted audit_logs collection")
		return nil
	})
}
