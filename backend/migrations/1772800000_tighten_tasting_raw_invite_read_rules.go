package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

const (
	legacyTastingSessionInviteReadRule       = "@request.auth.id != '' && (leader = @request.auth.id || tasting_session_participants_via_session.user ?= @request.auth.id || tasting_session_invites_via_session.invited_user ?= @request.auth.id)"
	legacyTastingSessionScopedInviteReadRule = "@request.auth.id != '' && (session.leader = @request.auth.id || session.tasting_session_participants_via_session.user ?= @request.auth.id || session.tasting_session_invites_via_session.invited_user ?= @request.auth.id)"
	legacyTastingInvitePublicReadRule        = "@request.auth.id != '' && (session.leader = @request.auth.id || invited_user = @request.auth.id)"
)

func init() {
	m.Register(func(app core.App) error {
		if err := applyTastingRawInviteReadRules(app, tastingSessionPublicReadRule, tastingSessionScopedPublicReadRule, tastingInvitePublicReadRule); err != nil {
			return err
		}

		log.Println("✓ Tightened tasting session raw invite read rules")
		return nil
	}, func(app core.App) error {
		if err := applyTastingRawInviteReadRules(app, legacyTastingSessionInviteReadRule, legacyTastingSessionScopedInviteReadRule, legacyTastingInvitePublicReadRule); err != nil {
			return err
		}

		log.Println("✓ Restored tasting session raw invite read rules")
		return nil
	})
}

func applyTastingRawInviteReadRules(
	app core.App,
	sessionReadRule string,
	scopedReadRule string,
	inviteReadRule string,
) error {
	if err := setTastingCollectionReadRules(app, "tasting_sessions", sessionReadRule, sessionReadRule); err != nil {
		return err
	}

	for _, collectionName := range []string{
		"tasting_session_participants",
		"tasting_session_restaurants",
		"tasting_session_items",
		"tasting_session_ratings",
	} {
		if err := setTastingCollectionReadRules(app, collectionName, scopedReadRule, scopedReadRule); err != nil {
			return err
		}
	}

	return setTastingCollectionReadRules(app, "tasting_session_invites", inviteReadRule, inviteReadRule)
}

func setTastingCollectionReadRules(app core.App, collectionName string, listRule string, viewRule string) error {
	collection, err := app.FindCollectionByNameOrId(collectionName)
	if err != nil {
		return err
	}

	collection.ListRule = &listRule
	collection.ViewRule = &viewRule

	return app.Save(collection)
}
