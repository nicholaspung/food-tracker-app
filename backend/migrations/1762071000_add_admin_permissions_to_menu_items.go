package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("menu_items")
		if err != nil {
			return err
		}

		// Update UpdateRule and DeleteRule to allow admins to edit/delete any menu item
		// Keep existing rules but add admin bypass
		currentUpdateRule := collection.UpdateRule
		currentDeleteRule := collection.DeleteRule

		// If there's an existing rule, add admin bypass with OR
		// Otherwise, just set admin-only rule
		if currentUpdateRule != nil && *currentUpdateRule != "" {
			newUpdateRule := "@request.auth.isAdmin = true || (" + *currentUpdateRule + ")"
			collection.UpdateRule = types.Pointer(newUpdateRule)
		} else {
			collection.UpdateRule = types.Pointer("@request.auth.isAdmin = true")
		}

		if currentDeleteRule != nil && *currentDeleteRule != "" {
			newDeleteRule := "@request.auth.isAdmin = true || (" + *currentDeleteRule + ")"
			collection.DeleteRule = types.Pointer(newDeleteRule)
		} else {
			collection.DeleteRule = types.Pointer("@request.auth.isAdmin = true")
		}

		// Save the updated collection
		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Updated menu_items collection to allow admin edit/delete")
		return nil
	}, func(app core.App) error {
		// Down migration - revert to previous rules
		collection, err := app.FindCollectionByNameOrId("menu_items")
		if err != nil {
			return err
		}

		// Revert to creator-only permissions
		collection.UpdateRule = types.Pointer("createdBy = @request.auth.id")
		collection.DeleteRule = types.Pointer("createdBy = @request.auth.id")

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Reverted menu_items collection to creator-only permissions")
		return nil
	})
}
