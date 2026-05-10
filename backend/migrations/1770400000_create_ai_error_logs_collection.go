package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		collection := core.NewBaseCollection("ai_error_logs")

		collection.ListRule = types.Pointer("@request.auth.isAdmin = true")
		collection.ViewRule = types.Pointer("@request.auth.isAdmin = true")
		collection.CreateRule = nil
		collection.UpdateRule = types.Pointer("@request.auth.isAdmin = true")
		collection.DeleteRule = types.Pointer("@request.auth.isAdmin = true")

		collection.Fields.Add(&core.TextField{Name: "requestId", Required: true, Max: 100})
		collection.Fields.Add(&core.SelectField{
			Name:      "route",
			Required:  true,
			MaxSelect: 1,
			Values:    []string{"parse_menu", "find_restaurant_name"},
		})
		collection.Fields.Add(&core.SelectField{
			Name:      "useCase",
			Required:  true,
			MaxSelect: 1,
			Values:    []string{"menu_parsing", "restaurant_name_extraction"},
		})
		collection.Fields.Add(&core.SelectField{
			Name:      "provider",
			Required:  true,
			MaxSelect: 1,
			Values:    []string{"gemini"},
		})
		collection.Fields.Add(&core.TextField{Name: "model", Required: true, Max: 100})
		collection.Fields.Add(&core.SelectField{
			Name:      "status",
			Required:  true,
			MaxSelect: 1,
			Values:    []string{"failed", "invalid_response", "empty_response", "not_menu", "rate_limited"},
		})
		collection.Fields.Add(&core.NumberField{Name: "httpStatusCode", Required: false})
		collection.Fields.Add(&core.TextField{Name: "errorType", Required: false, Max: 255})
		collection.Fields.Add(&core.TextField{Name: "errorMessage", Required: false, Max: 1000})
		collection.Fields.Add(&core.NumberField{Name: "durationMs", Required: false})
		collection.Fields.Add(&core.NumberField{Name: "promptTokens", Required: false})
		collection.Fields.Add(&core.NumberField{Name: "outputTokens", Required: false})
		collection.Fields.Add(&core.NumberField{Name: "totalTokens", Required: false})
		collection.Fields.Add(&core.TextField{Name: "imageMimeType", Required: false, Max: 100})
		collection.Fields.Add(&core.NumberField{Name: "imageSizeBytes", Required: false})
		collection.Fields.Add(&core.TextField{Name: "restaurantId", Required: false, Max: 100})
		collection.Fields.Add(&core.TextField{Name: "restaurantName", Required: false, Max: 255})
		collection.Fields.Add(&core.JSONField{Name: "metadataJson", Required: false, MaxSize: 32768})
		collection.Fields.Add(&core.AutodateField{Name: "created", OnCreate: true})

		usersCollection, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			log.Printf("Warning: Could not find users collection to create ai_error_logs.user relation: %v", err)
		} else {
			collection.Fields.Add(&core.RelationField{
				Name:          "user",
				CollectionId:  usersCollection.Id,
				MaxSelect:     1,
				Required:      false,
				CascadeDelete: false,
			})
		}

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Created ai_error_logs collection")
		return nil
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("ai_error_logs")
		if err != nil {
			return err
		}

		if err := app.Delete(collection); err != nil {
			return err
		}

		log.Println("✓ Deleted ai_error_logs collection")
		return nil
	})
}
