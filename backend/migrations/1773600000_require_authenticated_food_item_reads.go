package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

var authenticatedFoodItemsReadRule = `@request.auth.id != '' && (` + foodItemsNoLegacyPublicVisitReadRule + `)`

func init() {
	m.Register(func(app core.App) error {
		if err := setFoodItemReadRule(app, authenticatedFoodItemsReadRule); err != nil {
			return err
		}

		log.Println("✓ Required authentication for raw Food Item reads")
		return nil
	}, func(app core.App) error {
		return setFoodItemReadRule(app, foodItemsNoLegacyPublicVisitReadRule)
	})
}
