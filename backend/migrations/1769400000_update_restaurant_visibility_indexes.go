package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

const (
	restaurantsPublicPlaceIDCIIndex = "CREATE UNIQUE INDEX idx_restaurants_public_place_id_ci ON restaurants (LOWER(placeId)) WHERE placeId != '' AND visibility = 'public'"
	restaurantsOwnerPlaceIDCIIndex  = "CREATE UNIQUE INDEX idx_restaurants_owner_place_id_ci ON restaurants (createdBy, LOWER(placeId)) WHERE placeId != '' AND visibility != 'public' AND isGooglePlace = 0 AND createdBy != ''"
	restaurantsOwnerNameCIIndex     = "CREATE UNIQUE INDEX idx_restaurants_owner_name_ci ON restaurants (createdBy, LOWER(name)) WHERE name != '' AND visibility != 'public' AND isGooglePlace = 0 AND createdBy != ''"
	restaurantsNameLookupCIIndex    = "CREATE INDEX idx_restaurants_name_lookup_ci ON restaurants (LOWER(name))"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("restaurants")
		if err != nil {
			return err
		}

		collection.Indexes = removeCollectionIndex(collection.Indexes, restaurantsPlaceIDCIIndex)
		collection.Indexes = removeCollectionIndex(collection.Indexes, restaurantsNameCIIndex)
		if !hasCollectionIndex(collection.Indexes, restaurantsPublicPlaceIDCIIndex) {
			collection.Indexes = append(collection.Indexes, restaurantsPublicPlaceIDCIIndex)
		}
		if !hasCollectionIndex(collection.Indexes, restaurantsOwnerPlaceIDCIIndex) {
			collection.Indexes = append(collection.Indexes, restaurantsOwnerPlaceIDCIIndex)
		}
		if !hasCollectionIndex(collection.Indexes, restaurantsOwnerNameCIIndex) {
			collection.Indexes = append(collection.Indexes, restaurantsOwnerNameCIIndex)
		}
		if !hasCollectionIndex(collection.Indexes, restaurantsNameLookupCIIndex) {
			collection.Indexes = append(collection.Indexes, restaurantsNameLookupCIIndex)
		}

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Updated restaurant visibility-safe indexes")
		return nil
	}, func(app core.App) error {
		if err := deduplicateRestaurantsForUpsertIndexes(app); err != nil {
			return err
		}

		collection, err := app.FindCollectionByNameOrId("restaurants")
		if err != nil {
			return err
		}

		collection.Indexes = removeCollectionIndex(collection.Indexes, restaurantsPublicPlaceIDCIIndex)
		collection.Indexes = removeCollectionIndex(collection.Indexes, restaurantsOwnerPlaceIDCIIndex)
		collection.Indexes = removeCollectionIndex(collection.Indexes, restaurantsOwnerNameCIIndex)
		collection.Indexes = removeCollectionIndex(collection.Indexes, restaurantsNameLookupCIIndex)
		if !hasCollectionIndex(collection.Indexes, restaurantsPlaceIDCIIndex) {
			collection.Indexes = append(collection.Indexes, restaurantsPlaceIDCIIndex)
		}
		if !hasCollectionIndex(collection.Indexes, restaurantsNameCIIndex) {
			collection.Indexes = append(collection.Indexes, restaurantsNameCIIndex)
		}

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Restored legacy restaurant upsert indexes")
		return nil
	})
}
