package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		if err := setTastingCollectionReadRules(app, "tasting_session_ratings", tastingRatingPublicReadRule, tastingRatingPublicReadRule); err != nil {
			return err
		}

		log.Println("✓ Enforced blind Tasting Rating reads")
		return nil
	}, func(app core.App) error {
		if err := setTastingCollectionReadRules(app, "tasting_session_ratings", tastingSessionScopedPublicReadRule, tastingSessionScopedPublicReadRule); err != nil {
			return err
		}

		log.Println("✓ Restored shared Tasting Rating read rules")
		return nil
	})
}
