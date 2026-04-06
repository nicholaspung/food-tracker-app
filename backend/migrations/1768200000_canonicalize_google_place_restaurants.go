package migrations

import (
	"fmt"
	"log"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

const restaurantsGooglePlaceIDIndex = "CREATE UNIQUE INDEX idx_restaurants_google_place_id ON restaurants (placeId) WHERE placeId != '' AND isGooglePlace = 1"

var restaurantReferenceTables = []string{
	"visits",
	"list_items",
	"menu_images",
	"menu_items",
	"menu_review_requests",
	"notes",
	"tasting_sessions",
}

func init() {
	m.Register(func(app core.App) error {
		if err := normalizeAndDeduplicateGooglePlaceRestaurants(app); err != nil {
			return err
		}

		collection, err := app.FindCollectionByNameOrId("restaurants")
		if err != nil {
			return err
		}

		if !hasCollectionIndex(collection.Indexes, restaurantsGooglePlaceIDIndex) {
			collection.Indexes = append(collection.Indexes, restaurantsGooglePlaceIDIndex)
		}

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Canonicalized Google Place restaurants")
		return nil
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("restaurants")
		if err != nil {
			return err
		}

		collection.Indexes = removeCollectionIndex(collection.Indexes, restaurantsGooglePlaceIDIndex)
		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Removed canonical Google Place restaurant index")
		return nil
	})
}

func normalizeAndDeduplicateGooglePlaceRestaurants(app core.App) error {
	if _, err := app.DB().NewQuery(`
		UPDATE restaurants
		SET createdBy = '', visibility = 'public'
		WHERE TRIM(COALESCE(placeId, '')) != '' AND COALESCE(isGooglePlace, 0) = 1
	`).Execute(); err != nil {
		return err
	}

	type duplicatePlaceIDRow struct {
		PlaceID string `db:"placeId"`
	}

	duplicatePlaceIDs := []duplicatePlaceIDRow{}
	if err := app.DB().NewQuery(`
		SELECT placeId
		FROM restaurants
		WHERE TRIM(COALESCE(placeId, '')) != '' AND COALESCE(isGooglePlace, 0) = 1
		GROUP BY placeId
		HAVING COUNT(*) > 1
	`).All(&duplicatePlaceIDs); err != nil {
		return err
	}

	for _, row := range duplicatePlaceIDs {
		if err := mergeGooglePlaceRestaurantDuplicates(app, row.PlaceID); err != nil {
			return err
		}
	}

	return nil
}

func mergeGooglePlaceRestaurantDuplicates(app core.App, placeID string) error {
	type restaurantIDRow struct {
		ID string `db:"id"`
	}

	rows := []restaurantIDRow{}
	if err := app.DB().NewQuery(`
		SELECT id
		FROM restaurants
		WHERE placeId = {:placeId} AND COALESCE(isGooglePlace, 0) = 1
		ORDER BY updated DESC, created DESC, id ASC
	`).Bind(dbx.Params{"placeId": placeID}).All(&rows); err != nil {
		return err
	}

	if len(rows) < 2 {
		return nil
	}

	canonicalID := rows[0].ID
	for _, row := range rows[1:] {
		if row.ID == canonicalID {
			continue
		}

		if err := repointRestaurantReferences(app, row.ID, canonicalID); err != nil {
			return err
		}

		if _, err := app.DB().NewQuery(`
			DELETE FROM restaurants
			WHERE id = {:id}
		`).Bind(dbx.Params{"id": row.ID}).Execute(); err != nil {
			return err
		}
	}

	return nil
}

func repointRestaurantReferences(app core.App, fromID string, toID string) error {
	params := dbx.Params{
		"fromId": fromID,
		"toId":   toID,
	}

	for _, tableName := range restaurantReferenceTables {
		query := fmt.Sprintf(`
			UPDATE %s
			SET restaurant = {:toId}
			WHERE restaurant = {:fromId}
		`, tableName)

		if _, err := app.DB().NewQuery(query).Bind(params).Execute(); err != nil {
			return err
		}
	}

	return nil
}
