package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		// Update tasting_sessions to allow participants to view
		sessionsCollection, err := app.FindCollectionByNameOrId("tasting_sessions")
		if err != nil {
			return err
		}

		sessionsCollection.ViewRule = types.Pointer("leader = @request.auth.id || tasting_session_participants_via_session.user ?= @request.auth.id")

		if err := app.Save(sessionsCollection); err != nil {
			return err
		}

		log.Println("✓ Updated tasting_sessions access rules for participants")

		// Update tasting_session_items to restrict to participants
		itemsCollection, err := app.FindCollectionByNameOrId("tasting_session_items")
		if err != nil {
			return err
		}

		participantCheck := "session.leader = @request.auth.id || session.tasting_session_participants_via_session.user ?= @request.auth.id"
		itemsCollection.ListRule = types.Pointer(participantCheck)
		itemsCollection.ViewRule = types.Pointer(participantCheck)

		if err := app.Save(itemsCollection); err != nil {
			return err
		}

		log.Println("✓ Updated tasting_session_items access rules for participants")

		// Update tasting_session_participants to restrict to session participants
		participantsCollection, err := app.FindCollectionByNameOrId("tasting_session_participants")
		if err != nil {
			return err
		}

		participantsCollection.ListRule = types.Pointer("session.leader = @request.auth.id || session.tasting_session_participants_via_session.user ?= @request.auth.id")
		participantsCollection.ViewRule = types.Pointer("session.leader = @request.auth.id || session.tasting_session_participants_via_session.user ?= @request.auth.id")

		if err := app.Save(participantsCollection); err != nil {
			return err
		}

		log.Println("✓ Updated tasting_session_participants access rules")

		return nil
	}, func(app core.App) error {
		// Revert to basic rules
		sessionsCollection, err := app.FindCollectionByNameOrId("tasting_sessions")
		if err != nil {
			return err
		}
		sessionsCollection.ViewRule = types.Pointer("leader = @request.auth.id")
		if err := app.Save(sessionsCollection); err != nil {
			return err
		}

		itemsCollection, err := app.FindCollectionByNameOrId("tasting_session_items")
		if err != nil {
			return err
		}
		itemsCollection.ListRule = types.Pointer("@request.auth.id != ''")
		itemsCollection.ViewRule = types.Pointer("@request.auth.id != ''")
		if err := app.Save(itemsCollection); err != nil {
			return err
		}

		participantsCollection, err := app.FindCollectionByNameOrId("tasting_session_participants")
		if err != nil {
			return err
		}
		participantsCollection.ListRule = types.Pointer("@request.auth.id != ''")
		participantsCollection.ViewRule = types.Pointer("@request.auth.id != ''")
		if err := app.Save(participantsCollection); err != nil {
			return err
		}

		log.Println("✓ Reverted tasting session access rules")
		return nil
	})
}
