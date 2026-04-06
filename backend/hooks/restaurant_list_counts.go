package hooks

import (
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// RegisterRestaurantListCountHooks keeps denormalized list summary counts in sync.
func RegisterRestaurantListCountHooks(app core.App) {
	app.OnRecordCreate("list_items").BindFunc(func(e *core.RecordEvent) error {
		listID := e.Record.GetString("list")

		if err := e.Next(); err != nil {
			return err
		}

		return refreshRestaurantListCounts(e.App, []string{listID})
	})

	app.OnRecordUpdate("list_items").BindFunc(func(e *core.RecordEvent) error {
		originalListID := e.Record.Original().GetString("list")
		if persistedRecord, err := e.App.FindRecordById("list_items", e.Record.Id); err == nil {
			originalListID = persistedRecord.GetString("list")
		}
		currentListID := e.Record.GetString("list")

		if err := e.Next(); err != nil {
			return err
		}

		return refreshRestaurantListCounts(e.App, []string{originalListID, currentListID})
	})

	app.OnRecordDelete("list_items").BindFunc(func(e *core.RecordEvent) error {
		listID := e.Record.GetString("list")

		if err := e.Next(); err != nil {
			return err
		}

		return refreshRestaurantListCounts(e.App, []string{listID})
	})
}

func refreshRestaurantListCounts(app core.App, listIDs []string) error {
	seen := make(map[string]struct{}, len(listIDs))

	for _, rawListID := range listIDs {
		listID := strings.TrimSpace(rawListID)
		if listID == "" {
			continue
		}

		if _, exists := seen[listID]; exists {
			continue
		}
		seen[listID] = struct{}{}

		if _, err := app.DB().NewQuery(`
			UPDATE restaurant_lists
			SET
				"restaurantCount" = COALESCE(
					(
						SELECT COUNT(DISTINCT restaurant)
						FROM list_items
						WHERE "list" = {:listId}
					),
					0
				),
				"menuItemCount" = COALESCE(
					(
						SELECT COUNT(*)
						FROM list_items
						WHERE "list" = {:listId}
					),
					0
				)
			WHERE id = {:listId}
		`).Bind(dbx.Params{"listId": listID}).Execute(); err != nil {
			return err
		}
	}

	return nil
}
