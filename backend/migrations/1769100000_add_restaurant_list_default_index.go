package migrations

import (
	"log"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

const restaurantListsDefaultUserIndex = "CREATE UNIQUE INDEX idx_restaurant_lists_default_user ON restaurant_lists (user) WHERE isDefault = 1"

func init() {
	m.Register(func(app core.App) error {
		if err := normalizeDuplicateDefaultRestaurantLists(app); err != nil {
			return err
		}

		if err := addCollectionIndexes(app, "restaurant_lists", restaurantListsDefaultUserIndex); err != nil {
			return err
		}

		log.Println("✓ Added unique default restaurant list index")
		return nil
	}, func(app core.App) error {
		if err := removeCollectionIndexes(app, "restaurant_lists", restaurantListsDefaultUserIndex); err != nil {
			return err
		}

		log.Println("✓ Removed unique default restaurant list index")
		return nil
	})
}

func normalizeDuplicateDefaultRestaurantLists(app core.App) error {
	type duplicateUserRow struct {
		UserID string `db:"userId"`
	}

	duplicateUsers := []duplicateUserRow{}
	if err := app.DB().NewQuery(`
		SELECT user AS [[userId]]
		FROM restaurant_lists
		WHERE TRIM(COALESCE(user, '')) != '' AND COALESCE(isDefault, 0) = 1
		GROUP BY user
		HAVING COUNT(*) > 1
	`).All(&duplicateUsers); err != nil {
		return err
	}

	for _, row := range duplicateUsers {
		if err := keepSingleDefaultRestaurantList(app, row.UserID); err != nil {
			return err
		}
	}

	return nil
}

func keepSingleDefaultRestaurantList(app core.App, userID string) error {
	type restaurantListRow struct {
		ID string `db:"id"`
	}

	rows := []restaurantListRow{}
	if err := app.DB().NewQuery(`
		SELECT id
		FROM restaurant_lists
		WHERE user = {:userId} AND COALESCE(isDefault, 0) = 1
		ORDER BY updated DESC, created DESC, id ASC
	`).Bind(dbx.Params{"userId": userID}).All(&rows); err != nil {
		return err
	}

	if len(rows) < 2 {
		return nil
	}

	keepID := rows[0].ID
	_, err := app.DB().NewQuery(`
		UPDATE restaurant_lists
		SET isDefault = 0
		WHERE user = {:userId} AND COALESCE(isDefault, 0) = 1 AND id != {:keepId}
	`).Bind(dbx.Params{
		"userId": userID,
		"keepId": keepID,
	}).Execute()
	return err
}
