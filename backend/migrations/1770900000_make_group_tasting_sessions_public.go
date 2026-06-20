package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

const (
	tastingSessionPublicReadRule       = "@request.auth.id != '' && (leader = @request.auth.id || tasting_session_participants_via_session.user ?= @request.auth.id)"
	tastingSessionPublicCreateRule     = "@request.auth.id != '' && leader = @request.auth.id"
	tastingSessionScopedPublicReadRule = "@request.auth.id != '' && (session.leader = @request.auth.id || session.tasting_session_participants_via_session.user ?= @request.auth.id)"
	tastingInvitePublicReadRule        = "@request.auth.id != '' && session.leader = @request.auth.id"
	tastingLeaderScopedPublicReadRule  = "@request.auth.id != '' && session.leader = @request.auth.id"
)

func init() {
	m.Register(func(app core.App) error {
		if err := setTastingCollectionRules(app, "tasting_sessions", tastingSessionPublicReadRule, tastingSessionPublicReadRule, types.Pointer(tastingSessionPublicCreateRule), nil, nil); err != nil {
			return err
		}

		for _, collectionName := range []string{
			"tasting_session_participants",
			"tasting_session_restaurants",
			"tasting_session_items",
			"tasting_session_ratings",
		} {
			if err := setTastingCollectionRules(app, collectionName, tastingSessionScopedPublicReadRule, tastingSessionScopedPublicReadRule, nil, nil, nil); err != nil {
				return err
			}
		}

		if err := setTastingCollectionRules(app, "tasting_session_invites", tastingInvitePublicReadRule, tastingInvitePublicReadRule, nil, nil, nil); err != nil {
			return err
		}

		if err := setTastingCollectionRules(app, "tasting_session_blocks", tastingLeaderScopedPublicReadRule, tastingLeaderScopedPublicReadRule, nil, nil, nil); err != nil {
			return err
		}

		log.Println("✓ Made group tasting session access available to authenticated users")
		return nil
	}, func(app core.App) error {
		if err := setTastingCollectionRules(
			app,
			"tasting_sessions",
			"@request.auth.isAdmin = true",
			"@request.auth.isAdmin = true",
			types.Pointer("@request.auth.isAdmin = true && leader = @request.auth.id"),
			nil,
			nil,
		); err != nil {
			return err
		}

		for _, collectionName := range []string{
			"tasting_session_participants",
			"tasting_session_invites",
			"tasting_session_restaurants",
			"tasting_session_items",
			"tasting_session_ratings",
		} {
			if err := setTastingCollectionRules(app, collectionName, "@request.auth.isAdmin = true", "@request.auth.isAdmin = true", nil, nil, nil); err != nil {
				return err
			}
		}

		if err := setTastingCollectionRules(app, "tasting_session_blocks", "@request.auth.isAdmin = true && session.leader = @request.auth.id", "@request.auth.isAdmin = true && session.leader = @request.auth.id", nil, nil, nil); err != nil {
			return err
		}

		log.Println("✓ Restored admin-only group tasting session access")
		return nil
	})
}

func setTastingCollectionRules(
	app core.App,
	collectionName string,
	listRule string,
	viewRule string,
	createRule *string,
	updateRule *string,
	deleteRule *string,
) error {
	collection, err := app.FindCollectionByNameOrId(collectionName)
	if err != nil {
		return err
	}

	collection.ListRule = types.Pointer(listRule)
	collection.ViewRule = types.Pointer(viewRule)
	collection.CreateRule = createRule
	collection.UpdateRule = updateRule
	collection.DeleteRule = deleteRule

	return app.Save(collection)
}
