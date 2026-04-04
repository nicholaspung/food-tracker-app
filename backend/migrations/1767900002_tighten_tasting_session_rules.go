package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

const (
	tastingSessionAccessRule             = "leader = @request.auth.id || tasting_session_participants_via_session.user ?= @request.auth.id"
	tastingSessionInviteLeaderOnlyRule   = "session.leader = @request.auth.id"
	tastingSessionInviteCreateRule       = "@request.auth.id != '' && session.leader = @request.auth.id && created_by = @request.auth.id"
	tastingSessionLegacyListRule         = "@request.auth.id != ''"
	tastingSessionLegacyInviteCreateRule = "@request.auth.id != '' && session.leader = @request.auth.id"
)

func init() {
	m.Register(func(app core.App) error {
		if err := updateTastingCollectionRule(app, "tasting_sessions", tastingSessionAccessRule, tastingSessionAccessRule); err != nil {
			return err
		}

		if err := updateTastingSessionInviteRules(
			app,
			tastingSessionInviteLeaderOnlyRule,
			tastingSessionInviteLeaderOnlyRule,
			tastingSessionInviteCreateRule,
		); err != nil {
			return err
		}

		log.Println("✓ Tightened tasting session access rules")
		return nil
	}, func(app core.App) error {
		if err := updateTastingCollectionRule(app, "tasting_sessions", tastingSessionLegacyListRule, tastingSessionAccessRule); err != nil {
			return err
		}

		if err := updateTastingSessionInviteRules(
			app,
			tastingSessionLegacyListRule,
			tastingSessionLegacyListRule,
			tastingSessionLegacyInviteCreateRule,
		); err != nil {
			return err
		}

		log.Println("✓ Restored legacy tasting session access rules")
		return nil
	})
}

func updateTastingCollectionRule(app core.App, collectionName string, listRule string, viewRule string) error {
	collection, err := app.FindCollectionByNameOrId(collectionName)
	if err != nil {
		return err
	}

	collection.ListRule = types.Pointer(listRule)
	collection.ViewRule = types.Pointer(viewRule)

	return app.Save(collection)
}

func updateTastingSessionInviteRules(app core.App, listRule string, viewRule string, createRule string) error {
	collection, err := app.FindCollectionByNameOrId("tasting_session_invites")
	if err != nil {
		return err
	}

	collection.ListRule = types.Pointer(listRule)
	collection.ViewRule = types.Pointer(viewRule)
	collection.CreateRule = types.Pointer(createRule)

	return app.Save(collection)
}
