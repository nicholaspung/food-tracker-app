package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

const (
	userAuthTokenDurationSevenDays  int64 = 7 * 24 * 60 * 60
	userAuthTokenDurationThirtyDays int64 = 30 * 24 * 60 * 60
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			return err
		}

		collection.AuthToken.Duration = userAuthTokenDurationThirtyDays
		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Extended user auth token duration to 30 days")
		return nil
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			return err
		}

		collection.AuthToken.Duration = userAuthTokenDurationSevenDays
		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Restored user auth token duration to 7 days")
		return nil
	})
}
