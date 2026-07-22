package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

const visitsAuthenticatedReadRule = `@request.auth.id != '' && (
  @request.auth.isAdmin = true ||
  (user = @request.auth.id && ` + ownerAccessibleModerationStatusesRule + `) ||
  (` + visibleModerationStatusesRule + ` && visibility = 'friends' && (
    @collection.friendships.user ?= user && @collection.friendships.friend ?= @request.auth.id && @collection.friendships.status ?= 'accepted' ||
    @collection.friendships.user ?= @request.auth.id && @collection.friendships.friend ?= user && @collection.friendships.status ?= 'accepted'
  ))
)`

const visitsLegacyPublicReadRule = `@request.auth.isAdmin = true || (
(user = @request.auth.id && ` + ownerAccessibleModerationStatusesRule + `) ||
(` + visibleModerationStatusesRule + ` && (
visibility = 'public' ||
(visibility = 'friends' && (
  @collection.friendships.user ?= user && @collection.friendships.friend ?= @request.auth.id && @collection.friendships.status ?= 'accepted' ||
  @collection.friendships.user ?= @request.auth.id && @collection.friendships.friend ?= user && @collection.friendships.status ?= 'accepted'
))
))
)`

func init() {
	m.Register(func(app core.App) error {
		if err := removeLegacyPublicVisitAccess(app); err != nil {
			return err
		}

		log.Println("✓ Migrated legacy public visits and removed anonymous visit reads")
		return nil
	}, func(app core.App) error {
		return setVisitReadRule(app, visitsLegacyPublicReadRule)
	})
}

func removeLegacyPublicVisitAccess(app core.App) error {
	if _, err := app.DB().NewQuery(`
		UPDATE visits
		SET visibility = 'friends'
		WHERE visibility = 'public'
	`).Execute(); err != nil {
		return err
	}

	return setVisitReadRule(app, visitsAuthenticatedReadRule)
}

func setVisitReadRule(app core.App, rule string) error {
	collection, err := app.FindCollectionByNameOrId("visits")
	if err != nil {
		return err
	}

	collection.ListRule = types.Pointer(rule)
	collection.ViewRule = types.Pointer(rule)
	return app.Save(collection)
}
