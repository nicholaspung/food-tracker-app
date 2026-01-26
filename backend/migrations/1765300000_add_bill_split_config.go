package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		// ========================================
		// Update bill_items collection
		// ========================================
		billItemsCollection, err := app.FindCollectionByNameOrId("bill_items")
		if err != nil {
			return err
		}

		// Add split_mode field (select: 'simple' or 'advanced')
		billItemsCollection.Fields.Add(&core.SelectField{
			Name:      "split_mode",
			Required:  false, // Optional for backwards compatibility
			MaxSelect: 1,
			Values:    []string{"simple", "advanced"},
		})

		// Add split_config field (JSON) to store advanced split configuration
		// Structure when advanced: [{"participant_id": "xxx", "type": "percentage"|"amount", "value": number}]
		billItemsCollection.Fields.Add(&core.JSONField{
			Name:     "split_config",
			Required: false,
			MaxSize:  10000, // Allow up to 10KB of JSON config
		})

		if err := app.Save(billItemsCollection); err != nil {
			return err
		}
		log.Println("✓ Added split_mode and split_config fields to bill_items")

		// ========================================
		// Update bill_participants collection
		// ========================================
		billParticipantsCollection, err := app.FindCollectionByNameOrId("bill_participants")
		if err != nil {
			return err
		}

		// Add custom_tip_contribution field (number, optional)
		// When set, this participant pays this fixed tip amount instead of proportional
		billParticipantsCollection.Fields.Add(&core.NumberField{
			Name:     "custom_tip_contribution",
			Required: false,
			Min:      types.Pointer(float64(0)),
		})

		if err := app.Save(billParticipantsCollection); err != nil {
			return err
		}
		log.Println("✓ Added custom_tip_contribution field to bill_participants")

		return nil
	}, func(app core.App) error {
		// Down migration - remove new fields

		// Remove from bill_items
		billItemsCollection, err := app.FindCollectionByNameOrId("bill_items")
		if err != nil {
			return err
		}
		billItemsCollection.Fields.RemoveByName("split_mode")
		billItemsCollection.Fields.RemoveByName("split_config")
		if err := app.Save(billItemsCollection); err != nil {
			return err
		}
		log.Println("✓ Removed split_mode and split_config fields from bill_items")

		// Remove from bill_participants
		billParticipantsCollection, err := app.FindCollectionByNameOrId("bill_participants")
		if err != nil {
			return err
		}
		billParticipantsCollection.Fields.RemoveByName("custom_tip_contribution")
		if err := app.Save(billParticipantsCollection); err != nil {
			return err
		}
		log.Println("✓ Removed custom_tip_contribution field from bill_participants")

		return nil
	})
}
