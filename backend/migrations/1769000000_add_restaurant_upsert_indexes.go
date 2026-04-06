package migrations

import (
	"log"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

const (
	restaurantsPlaceIDCIIndex = "CREATE UNIQUE INDEX idx_restaurants_place_id_ci ON restaurants (LOWER(placeId)) WHERE placeId != ''"
	restaurantsNameCIIndex    = "CREATE UNIQUE INDEX idx_restaurants_name_ci ON restaurants (LOWER(name))"
)

func init() {
	m.Register(func(app core.App) error {
		if err := deduplicateRestaurantsForUpsertIndexes(app); err != nil {
			return err
		}

		collection, err := app.FindCollectionByNameOrId("restaurants")
		if err != nil {
			return err
		}

		collection.Indexes = removeCollectionIndex(collection.Indexes, restaurantsGooglePlaceIDIndex)
		if !hasCollectionIndex(collection.Indexes, restaurantsPlaceIDCIIndex) {
			collection.Indexes = append(collection.Indexes, restaurantsPlaceIDCIIndex)
		}
		if !hasCollectionIndex(collection.Indexes, restaurantsNameCIIndex) {
			collection.Indexes = append(collection.Indexes, restaurantsNameCIIndex)
		}

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Added restaurant upsert indexes")
		return nil
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("restaurants")
		if err != nil {
			return err
		}

		collection.Indexes = removeCollectionIndex(collection.Indexes, restaurantsPlaceIDCIIndex)
		collection.Indexes = removeCollectionIndex(collection.Indexes, restaurantsNameCIIndex)
		if !hasCollectionIndex(collection.Indexes, restaurantsGooglePlaceIDIndex) {
			collection.Indexes = append(collection.Indexes, restaurantsGooglePlaceIDIndex)
		}

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Removed restaurant upsert indexes")
		return nil
	})
}

func deduplicateRestaurantsForUpsertIndexes(app core.App) error {
	if _, err := app.DB().NewQuery(`
		UPDATE restaurants
		SET
			name = TRIM(COALESCE(name, '')),
			location = TRIM(COALESCE(location, '')),
			cuisineType = TRIM(COALESCE(cuisineType, '')),
			placeId = TRIM(COALESCE(placeId, ''))
	`).Execute(); err != nil {
		return err
	}

	if err := deduplicateRestaurantsByPlaceID(app); err != nil {
		return err
	}

	if err := deduplicateRestaurantsByName(app); err != nil {
		return err
	}

	return nil
}

func deduplicateRestaurantsByPlaceID(app core.App) error {
	type duplicateKeyRow struct {
		Key string `db:"key"`
	}

	rows := []duplicateKeyRow{}
	if err := app.DB().NewQuery(`
		SELECT LOWER(TRIM(placeId)) AS key
		FROM restaurants
		WHERE TRIM(COALESCE(placeId, '')) != ''
		GROUP BY LOWER(TRIM(placeId))
		HAVING COUNT(*) > 1
	`).All(&rows); err != nil {
		return err
	}

	for _, row := range rows {
		if err := mergeRestaurantDuplicateGroup(app, `
			SELECT id
			FROM restaurants
			WHERE LOWER(TRIM(COALESCE(placeId, ''))) = {:key}
			ORDER BY
				CASE WHEN COALESCE(isGooglePlace, 0) = 1 THEN 0 ELSE 1 END,
				updated DESC,
				created DESC,
				id ASC
		`, dbx.Params{"key": row.Key}); err != nil {
			return err
		}
	}

	return nil
}

func deduplicateRestaurantsByName(app core.App) error {
	type duplicateKeyRow struct {
		Key string `db:"key"`
	}

	rows := []duplicateKeyRow{}
	if err := app.DB().NewQuery(`
		SELECT LOWER(TRIM(name)) AS key
		FROM restaurants
		GROUP BY LOWER(TRIM(name))
		HAVING COUNT(*) > 1
	`).All(&rows); err != nil {
		return err
	}

	for _, row := range rows {
		if err := mergeRestaurantDuplicateGroup(app, `
			SELECT id
			FROM restaurants
			WHERE LOWER(TRIM(name)) = {:key}
			ORDER BY
				CASE WHEN TRIM(COALESCE(placeId, '')) != '' THEN 0 ELSE 1 END,
				CASE WHEN COALESCE(isGooglePlace, 0) = 1 THEN 0 ELSE 1 END,
				updated DESC,
				created DESC,
				id ASC
		`, dbx.Params{"key": row.Key}); err != nil {
			return err
		}
	}

	return nil
}

func mergeRestaurantDuplicateGroup(app core.App, query string, params dbx.Params) error {
	type restaurantIDRow struct {
		ID string `db:"id"`
	}

	rows := []restaurantIDRow{}
	if err := app.DB().NewQuery(query).Bind(params).All(&rows); err != nil {
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
