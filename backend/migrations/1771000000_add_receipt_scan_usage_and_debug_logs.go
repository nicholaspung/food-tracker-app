package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		usageCollection, err := app.FindCollectionByNameOrId("user_monthly_usage")
		if err != nil {
			return err
		}

		minZero := float64(0)
		if usageCollection.Fields.GetByName("receipt_scans") == nil {
			usageCollection.Fields.Add(&core.NumberField{
				Name:    "receipt_scans",
				Min:     &minZero,
				OnlyInt: true,
			})
			if err := app.Save(usageCollection); err != nil {
				return err
			}
			log.Println("✓ Added receipt_scans to user_monthly_usage")
		}

		debugCollection := core.NewBaseCollection("receipt_scan_debug_logs")
		debugCollection.ListRule = types.Pointer("@request.auth.isAdmin = true")
		debugCollection.ViewRule = types.Pointer("@request.auth.isAdmin = true")
		debugCollection.CreateRule = nil
		debugCollection.UpdateRule = nil
		debugCollection.DeleteRule = types.Pointer("@request.auth.isAdmin = true")

		debugCollection.Fields.Add(&core.TextField{Name: "requestId", Required: true, Max: 100})
		debugCollection.Fields.Add(&core.SelectField{
			Name:      "status",
			Required:  true,
			MaxSelect: 1,
			Values:    []string{"success", "failed", "invalid_response", "empty_response", "not_receipt", "low_confidence"},
		})
		debugCollection.Fields.Add(&core.TextField{Name: "model", Required: false, Max: 100})
		debugCollection.Fields.Add(&core.TextField{Name: "errorType", Required: false, Max: 255})
		debugCollection.Fields.Add(&core.TextField{Name: "errorMessage", Required: false, Max: 1000})
		debugCollection.Fields.Add(&core.SelectField{
			Name:      "confidence",
			Required:  false,
			MaxSelect: 1,
			Values:    []string{"high", "medium", "low", "unknown"},
		})
		debugCollection.Fields.Add(&core.NumberField{Name: "httpStatusCode", Required: false})
		debugCollection.Fields.Add(&core.NumberField{Name: "durationMs", Required: false})
		debugCollection.Fields.Add(&core.NumberField{Name: "promptTokens", Required: false})
		debugCollection.Fields.Add(&core.NumberField{Name: "outputTokens", Required: false})
		debugCollection.Fields.Add(&core.NumberField{Name: "totalTokens", Required: false})
		debugCollection.Fields.Add(&core.TextField{Name: "imageMimeType", Required: false, Max: 100})
		debugCollection.Fields.Add(&core.NumberField{Name: "imageSizeBytes", Required: false})
		debugCollection.Fields.Add(&core.JSONField{Name: "rawOutputJson", Required: false, MaxSize: 131072})
		debugCollection.Fields.Add(&core.JSONField{Name: "metadataJson", Required: false, MaxSize: 32768})
		debugCollection.Fields.Add(&core.AutodateField{Name: "created", OnCreate: true})

		usersCollection, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			log.Printf("Warning: Could not find users collection to create receipt_scan_debug_logs.user relation: %v", err)
		} else {
			debugCollection.Fields.Add(&core.RelationField{
				Name:          "user",
				CollectionId:  usersCollection.Id,
				MaxSelect:     1,
				Required:      false,
				CascadeDelete: false,
			})
		}

		if err := app.Save(debugCollection); err != nil {
			return err
		}

		log.Println("✓ Created receipt_scan_debug_logs collection")
		return nil
	}, func(app core.App) error {
		debugCollection, err := app.FindCollectionByNameOrId("receipt_scan_debug_logs")
		if err == nil {
			if err := app.Delete(debugCollection); err != nil {
				return err
			}
			log.Println("✓ Deleted receipt_scan_debug_logs collection")
		}

		usageCollection, err := app.FindCollectionByNameOrId("user_monthly_usage")
		if err != nil {
			return err
		}
		if field := usageCollection.Fields.GetByName("receipt_scans"); field != nil {
			usageCollection.Fields.RemoveById(field.GetId())
			if err := app.Save(usageCollection); err != nil {
				return err
			}
			log.Println("✓ Removed receipt_scans from user_monthly_usage")
		}

		return nil
	})
}
