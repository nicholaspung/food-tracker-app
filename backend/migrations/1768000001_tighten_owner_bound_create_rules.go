package migrations

import (
	"database/sql"
	"errors"
	"log"
	"strings"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		for collectionName, createRule := range map[string]string{
			"food_items":       "@request.auth.id != '' && user = @request.auth.id && (visit = '' || visit.user = @request.auth.id)",
			"menu_items":       "@request.auth.id != '' && createdBy = @request.auth.id",
			"note_photos":      "@request.auth.id != '' && user = @request.auth.id && note.user = @request.auth.id",
			"notes":            "@request.auth.id != '' && user = @request.auth.id",
			"ratings":          "@request.auth.id != '' && user = @request.auth.id",
			"restaurant_lists": "@request.auth.id != '' && user = @request.auth.id",
			"restaurants":      "@request.auth.id != '' && createdBy = @request.auth.id",
			"visit_photos":     "@request.auth.id != '' && user = @request.auth.id && food_item.user = @request.auth.id && (visit = '' || visit.user = @request.auth.id)",
			"visits":           "@request.auth.id != '' && user = @request.auth.id",
		} {
			collection, err := app.FindCollectionByNameOrId(collectionName)
			if err != nil {
				if isMissingCollectionError(err) {
					continue
				}
				return err
			}

			collection.CreateRule = types.Pointer(createRule)
			if err := app.Save(collection); err != nil {
				return err
			}
		}

		log.Println("✓ Tightened owner-bound create rules")
		return nil
	}, func(app core.App) error {
		for _, collectionName := range []string{
			"food_items",
			"menu_items",
			"note_photos",
			"notes",
			"ratings",
			"restaurant_lists",
			"restaurants",
			"visit_photos",
			"visits",
		} {
			collection, err := app.FindCollectionByNameOrId(collectionName)
			if err != nil {
				if isMissingCollectionError(err) {
					continue
				}
				return err
			}

			collection.CreateRule = types.Pointer("@request.auth.id != ''")
			if err := app.Save(collection); err != nil {
				return err
			}
		}

		log.Println("✓ Restored legacy owner-bound create rules")
		return nil
	})
}

func isMissingCollectionError(err error) bool {
	return errors.Is(err, sql.ErrNoRows) || strings.Contains(strings.ToLower(err.Error()), "no rows")
}
