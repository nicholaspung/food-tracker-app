package migrations

import (
	"database/sql"
	"errors"
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		for _, collectionName := range []string{
			"tasting_session_ratings",
			"tasting_session_items",
			"tasting_session_restaurants",
			"tasting_session_blocks",
			"tasting_session_invites",
			"tasting_session_participants",
			"tasting_sessions",
		} {
			if err := deleteCollectionIfExists(app, collectionName); err != nil {
				return err
			}
		}

		usersCollection, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			return err
		}
		restaurantsCollection, err := app.FindCollectionByNameOrId("restaurants")
		if err != nil {
			return err
		}
		menuItemsCollection, err := app.FindCollectionByNameOrId("menu_items")
		if err != nil {
			return err
		}
		visitsCollection, err := app.FindCollectionByNameOrId("visits")
		if err != nil {
			return err
		}
		foodItemsCollection, err := app.FindCollectionByNameOrId("food_items")
		if err != nil {
			return err
		}

		sessions := core.NewBaseCollection("tasting_sessions")
		sessions.ListRule = types.Pointer("@request.auth.isAdmin = true")
		sessions.ViewRule = types.Pointer("@request.auth.isAdmin = true")
		sessions.CreateRule = types.Pointer("@request.auth.isAdmin = true && leader = @request.auth.id")
		sessions.UpdateRule = nil
		sessions.DeleteRule = nil
		sessions.Fields.Add(&core.TextField{Name: "name", Required: true, Max: 200})
		sessions.Fields.Add(&core.RelationField{Name: "leader", CollectionId: usersCollection.Id, MaxSelect: 1, Required: true, CascadeDelete: true})
		sessions.Fields.Add(&core.RelationField{Name: "restaurant", CollectionId: restaurantsCollection.Id, MaxSelect: 1, Required: false, CascadeDelete: false})
		sessions.Fields.Add(&core.SelectField{Name: "status", Required: true, MaxSelect: 1, Values: []string{"lobby", "planning", "tasting", "completed", "adding_items", "rating"}})
		sessions.Fields.Add(&core.DateField{Name: "join_expires_at", Required: false})
		sessions.Fields.Add(&core.TextField{Name: "invite_code", Required: false, Max: 10, Pattern: "^[A-Z0-9]{6}$"})
		sessions.Fields.Add(&core.NumberField{Name: "max_participants", Required: false})
		sessions.Fields.Add(&core.NumberField{Name: "max_restaurants", Required: false})
		sessions.Fields.Add(&core.NumberField{Name: "max_approved_items", Required: false})
		sessions.Fields.Add(&core.BoolField{Name: "locked", Required: false})
		sessions.Fields.Add(&core.AutodateField{Name: "created", OnCreate: true})
		sessions.Fields.Add(&core.AutodateField{Name: "updated", OnUpdate: true})
		sessions.Indexes = []string{"CREATE UNIQUE INDEX idx_tasting_sessions_invite_code ON tasting_sessions (invite_code)"}
		if err := app.Save(sessions); err != nil {
			return err
		}

		participants := core.NewBaseCollection("tasting_session_participants")
		participants.ListRule = types.Pointer("@request.auth.isAdmin = true")
		participants.ViewRule = participants.ListRule
		participants.CreateRule = nil
		participants.UpdateRule = nil
		participants.DeleteRule = nil
		participants.Fields.Add(&core.RelationField{Name: "session", CollectionId: sessions.Id, MaxSelect: 1, Required: true, CascadeDelete: true})
		participants.Fields.Add(&core.RelationField{Name: "user", CollectionId: usersCollection.Id, MaxSelect: 1, Required: true, CascadeDelete: true})
		participants.Fields.Add(&core.SelectField{Name: "role", Required: false, MaxSelect: 1, Values: []string{"leader", "participant"}})
		participants.Fields.Add(&core.DateField{Name: "submitted_at", Required: false})
		participants.Fields.Add(&core.AutodateField{Name: "created", OnCreate: true})
		participants.Fields.Add(&core.AutodateField{Name: "updated", OnUpdate: true})
		participants.Indexes = []string{"CREATE UNIQUE INDEX idx_tasting_participants_session_user ON tasting_session_participants (session, user)"}
		if err := app.Save(participants); err != nil {
			return err
		}

		invites := core.NewBaseCollection("tasting_session_invites")
		invites.ListRule = types.Pointer("@request.auth.isAdmin = true")
		invites.ViewRule = invites.ListRule
		invites.CreateRule = nil
		invites.UpdateRule = nil
		invites.DeleteRule = nil
		invites.Fields.Add(&core.RelationField{Name: "session", CollectionId: sessions.Id, MaxSelect: 1, Required: true, CascadeDelete: true})
		invites.Fields.Add(&core.RelationField{Name: "invited_user", CollectionId: usersCollection.Id, MaxSelect: 1, Required: false, CascadeDelete: true})
		invites.Fields.Add(&core.TextField{Name: "code", Required: false, Max: 10, Pattern: "^[A-Z0-9]{6}$"})
		invites.Fields.Add(&core.RelationField{Name: "created_by", CollectionId: usersCollection.Id, MaxSelect: 1, Required: false, CascadeDelete: true})
		invites.Fields.Add(&core.RelationField{Name: "used_by", CollectionId: usersCollection.Id, MaxSelect: 1, Required: false, CascadeDelete: false})
		invites.Fields.Add(&core.SelectField{Name: "status", Required: false, MaxSelect: 1, Values: []string{"pending", "accepted", "dismissed", "revoked"}})
		invites.Fields.Add(&core.DateField{Name: "expires_at", Required: false})
		invites.Fields.Add(&core.AutodateField{Name: "created", OnCreate: true})
		invites.Fields.Add(&core.AutodateField{Name: "updated", OnUpdate: true})
		invites.Indexes = []string{"CREATE UNIQUE INDEX idx_tasting_invites_session_user ON tasting_session_invites (session, invited_user)"}
		if err := app.Save(invites); err != nil {
			return err
		}

		blocks := core.NewBaseCollection("tasting_session_blocks")
		blocks.ListRule = types.Pointer("@request.auth.isAdmin = true && session.leader = @request.auth.id")
		blocks.ViewRule = blocks.ListRule
		blocks.CreateRule = nil
		blocks.UpdateRule = nil
		blocks.DeleteRule = nil
		blocks.Fields.Add(&core.RelationField{Name: "session", CollectionId: sessions.Id, MaxSelect: 1, Required: true, CascadeDelete: true})
		blocks.Fields.Add(&core.RelationField{Name: "user", CollectionId: usersCollection.Id, MaxSelect: 1, Required: true, CascadeDelete: true})
		blocks.Fields.Add(&core.RelationField{Name: "blocked_by", CollectionId: usersCollection.Id, MaxSelect: 1, Required: true, CascadeDelete: true})
		blocks.Fields.Add(&core.TextField{Name: "reason", Required: false, Max: 100})
		blocks.Fields.Add(&core.AutodateField{Name: "created", OnCreate: true})
		blocks.Indexes = []string{"CREATE UNIQUE INDEX idx_tasting_blocks_session_user ON tasting_session_blocks (session, user)"}
		if err := app.Save(blocks); err != nil {
			return err
		}

		restaurantSuggestions := core.NewBaseCollection("tasting_session_restaurants")
		restaurantSuggestions.ListRule = participants.ListRule
		restaurantSuggestions.ViewRule = participants.ListRule
		restaurantSuggestions.CreateRule = nil
		restaurantSuggestions.UpdateRule = nil
		restaurantSuggestions.DeleteRule = nil
		restaurantSuggestions.Fields.Add(&core.RelationField{Name: "session", CollectionId: sessions.Id, MaxSelect: 1, Required: true, CascadeDelete: true})
		restaurantSuggestions.Fields.Add(&core.RelationField{Name: "restaurant", CollectionId: restaurantsCollection.Id, MaxSelect: 1, Required: true, CascadeDelete: false})
		restaurantSuggestions.Fields.Add(&core.RelationField{Name: "suggested_by_participant", CollectionId: participants.Id, MaxSelect: 1, Required: true, CascadeDelete: false})
		restaurantSuggestions.Fields.Add(&core.SelectField{Name: "status", Required: true, MaxSelect: 1, Values: []string{"pending", "approved", "rejected"}})
		restaurantSuggestions.Fields.Add(&core.AutodateField{Name: "created", OnCreate: true})
		restaurantSuggestions.Fields.Add(&core.AutodateField{Name: "updated", OnUpdate: true})
		if err := app.Save(restaurantSuggestions); err != nil {
			return err
		}

		items := core.NewBaseCollection("tasting_session_items")
		items.ListRule = participants.ListRule
		items.ViewRule = participants.ListRule
		items.CreateRule = nil
		items.UpdateRule = nil
		items.DeleteRule = nil
		items.Fields.Add(&core.RelationField{Name: "session", CollectionId: sessions.Id, MaxSelect: 1, Required: true, CascadeDelete: true})
		items.Fields.Add(&core.RelationField{Name: "restaurant_suggestion", CollectionId: restaurantSuggestions.Id, MaxSelect: 1, Required: false, CascadeDelete: true})
		items.Fields.Add(&core.RelationField{Name: "menu_item", CollectionId: menuItemsCollection.Id, MaxSelect: 1, Required: false, CascadeDelete: false})
		items.Fields.Add(&core.RelationField{Name: "suggested_by_participant", CollectionId: participants.Id, MaxSelect: 1, Required: false, CascadeDelete: false})
		items.Fields.Add(&core.RelationField{Name: "added_by", CollectionId: usersCollection.Id, MaxSelect: 1, Required: false, CascadeDelete: false})
		items.Fields.Add(&core.TextField{Name: "name", Required: false, Max: 300})
		items.Fields.Add(&core.TextField{Name: "description", Required: false, Max: 500})
		items.Fields.Add(&core.SelectField{Name: "status", Required: false, MaxSelect: 1, Values: []string{"pending", "approved", "rejected"}})
		items.Fields.Add(&core.AutodateField{Name: "created", OnCreate: true})
		items.Fields.Add(&core.AutodateField{Name: "updated", OnUpdate: true})
		if err := app.Save(items); err != nil {
			return err
		}

		ratings := core.NewBaseCollection("tasting_session_ratings")
		ratings.ListRule = participants.ListRule
		ratings.ViewRule = participants.ListRule
		ratings.CreateRule = nil
		ratings.UpdateRule = nil
		ratings.DeleteRule = nil
		ratings.Fields.Add(&core.RelationField{Name: "session", CollectionId: sessions.Id, MaxSelect: 1, Required: true, CascadeDelete: true})
		ratings.Fields.Add(&core.RelationField{Name: "restaurant_suggestion", CollectionId: restaurantSuggestions.Id, MaxSelect: 1, Required: false, CascadeDelete: true})
		ratings.Fields.Add(&core.RelationField{Name: "item", CollectionId: items.Id, MaxSelect: 1, Required: true, CascadeDelete: true})
		ratings.Fields.Add(&core.RelationField{Name: "participant", CollectionId: participants.Id, MaxSelect: 1, Required: false, CascadeDelete: true})
		ratings.Fields.Add(&core.RelationField{Name: "user", CollectionId: usersCollection.Id, MaxSelect: 1, Required: true, CascadeDelete: true})
		ratings.Fields.Add(&core.NumberField{Name: "rating", Required: true})
		ratings.Fields.Add(&core.TextField{Name: "note", Required: false, Max: 500})
		ratings.Fields.Add(&core.TextField{Name: "notes", Required: false, Max: 500})
		ratings.Fields.Add(&core.RelationField{Name: "generated_visit", CollectionId: visitsCollection.Id, MaxSelect: 1, Required: false, CascadeDelete: false})
		ratings.Fields.Add(&core.RelationField{Name: "generated_food_item", CollectionId: foodItemsCollection.Id, MaxSelect: 1, Required: false, CascadeDelete: false})
		ratings.Fields.Add(&core.AutodateField{Name: "created", OnCreate: true})
		ratings.Fields.Add(&core.AutodateField{Name: "updated", OnUpdate: true})
		ratings.Indexes = []string{"CREATE UNIQUE INDEX idx_tasting_ratings_session_item_user ON tasting_session_ratings (session, item, user)"}
		if err := app.Save(ratings); err != nil {
			return err
		}

		log.Println("✓ Reset group tasting session collections")
		return nil
	}, func(app core.App) error {
		for _, collectionName := range []string{
			"tasting_session_ratings",
			"tasting_session_items",
			"tasting_session_restaurants",
			"tasting_session_blocks",
			"tasting_session_invites",
			"tasting_session_participants",
			"tasting_sessions",
		} {
			if err := deleteCollectionIfExists(app, collectionName); err != nil {
				return err
			}
		}
		log.Println("✓ Removed reset group tasting session collections")
		return nil
	})
}

func deleteCollectionIfExists(app core.App, collectionName string) error {
	collection, err := app.FindCollectionByNameOrId(collectionName)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil
		}
		return err
	}
	return app.Delete(collection)
}
