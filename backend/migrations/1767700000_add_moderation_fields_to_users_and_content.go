package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

const visibleModerationStatusesRule = `(moderationStatus = '' || moderationStatus = 'active' || moderationStatus = 'reviewed')`
const visibleVisitModerationStatusesRule = `(visit.moderationStatus = '' || visit.moderationStatus = 'active' || visit.moderationStatus = 'reviewed')`
const visibleFoodItemModerationStatusesRule = `(food_item.moderationStatus = '' || food_item.moderationStatus = 'active' || food_item.moderationStatus = 'reviewed')`
const visibleListModerationStatusesRule = `(@collection.restaurant_lists.moderationStatus = '' || @collection.restaurant_lists.moderationStatus = 'active' || @collection.restaurant_lists.moderationStatus = 'reviewed')`
const visibleNoteModerationStatusesRule = `(note.moderationStatus = '' || note.moderationStatus = 'active' || note.moderationStatus = 'reviewed')`

func init() {
	m.Register(func(app core.App) error {
		if err := addModerationFieldsToUsers(app); err != nil {
			return err
		}

		if err := addModerationFieldsToContentCollection(app, "visits"); err != nil {
			return err
		}
		if err := addModerationFieldsToContentCollection(app, "food_items"); err != nil {
			return err
		}
		if err := addModerationFieldsToContentCollection(app, "restaurant_lists"); err != nil {
			return err
		}
		if err := addModerationFieldsToContentCollection(app, "list_items"); err != nil {
			return err
		}
		if err := addModerationFieldsToContentCollection(app, "notes"); err != nil {
			return err
		}
		if err := addModerationFieldsToContentCollection(app, "visit_photos"); err != nil {
			return err
		}
		if err := addModerationFieldsToContentCollection(app, "note_photos"); err != nil {
			return err
		}

		if err := updateModerationAwareRules(app); err != nil {
			return err
		}

		log.Println("✓ Added moderation fields to users and content collections")
		return nil
	}, func(app core.App) error {
		if err := removeModerationFieldsFromUsers(app); err != nil {
			return err
		}

		for _, collectionName := range []string{"visits", "food_items", "restaurant_lists", "list_items", "notes", "visit_photos", "note_photos"} {
			if err := removeModerationFieldsFromContentCollection(app, collectionName); err != nil {
				return err
			}
		}

		if err := revertModerationAwareRules(app); err != nil {
			return err
		}

		log.Println("✓ Removed moderation fields from users and content collections")
		return nil
	})
}

func addModerationFieldsToUsers(app core.App) error {
	collection, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		return err
	}

	collection.Fields.Add(&core.SelectField{
		Name:      "moderationState",
		Required:  false,
		MaxSelect: 1,
		Values:    []string{"active", "warned", "restricted", "banned"},
	})
	collection.Fields.Add(&core.SelectField{
		Name:      "contentModerationMode",
		Required:  false,
		MaxSelect: 1,
		Values:    []string{"normal", "pre_review"},
	})
	collection.Fields.Add(&core.NumberField{
		Name:     "warningCount",
		Required: false,
		Min:      types.Pointer(float64(0)),
	})
	collection.Fields.Add(&core.TextField{
		Name:     "moderationNotes",
		Required: false,
		Max:      2000,
	})
	collection.Fields.Add(&core.TextField{
		Name:     "moderationNotice",
		Required: false,
		Max:      1000,
	})
	collection.Fields.Add(&core.DateField{
		Name:     "postingSuspendedUntil",
		Required: false,
	})
	collection.Fields.Add(&core.DateField{
		Name:     "photoSuspendedUntil",
		Required: false,
	})
	collection.Fields.Add(&core.DateField{
		Name:     "moderatedAt",
		Required: false,
	})

	usersCollection, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		return err
	}

	collection.Fields.Add(&core.RelationField{
		Name:          "moderatedBy",
		CollectionId:  usersCollection.Id,
		MaxSelect:     1,
		Required:      false,
		CascadeDelete: false,
	})

	return app.Save(collection)
}

func addModerationFieldsToContentCollection(app core.App, collectionName string) error {
	collection, err := app.FindCollectionByNameOrId(collectionName)
	if err != nil {
		return err
	}

	collection.Fields.Add(&core.SelectField{
		Name:      "moderationStatus",
		Required:  false,
		MaxSelect: 1,
		Values:    []string{"active", "reviewed", "under_review", "hidden", "removed", "escalated"},
	})
	collection.Fields.Add(&core.DateField{
		Name:     "moderatedAt",
		Required: false,
	})

	usersCollection, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		return err
	}

	collection.Fields.Add(&core.RelationField{
		Name:          "moderatedBy",
		CollectionId:  usersCollection.Id,
		MaxSelect:     1,
		Required:      false,
		CascadeDelete: false,
	})

	return app.Save(collection)
}

func updateModerationAwareRules(app core.App) error {
	if err := updateVisitsModerationRules(app); err != nil {
		return err
	}
	if err := updateFoodItemsModerationRules(app); err != nil {
		return err
	}
	if err := updateRestaurantListsModerationRules(app); err != nil {
		return err
	}
	if err := updateListItemsModerationRules(app); err != nil {
		return err
	}
	if err := updateNotesModerationRules(app); err != nil {
		return err
	}
	if err := updateVisitPhotosModerationRules(app); err != nil {
		return err
	}
	if err := updateNotePhotosModerationRules(app); err != nil {
		return err
	}

	return nil
}

func updateVisitsModerationRules(app core.App) error {
	collection, err := app.FindCollectionByNameOrId("visits")
	if err != nil {
		return err
	}

	rule := `@request.auth.isAdmin = true || (` + visibleModerationStatusesRule + ` && (
user = @request.auth.id ||
visibility = 'public' ||
(visibility = 'friends' && (
  @collection.friendships.user ?= user && @collection.friendships.friend ?= @request.auth.id && @collection.friendships.status ?= 'accepted' ||
  @collection.friendships.user ?= @request.auth.id && @collection.friendships.friend ?= user && @collection.friendships.status ?= 'accepted'
))))`

	collection.ListRule = types.Pointer(rule)
	collection.ViewRule = types.Pointer(rule)
	collection.UpdateRule = types.Pointer(`@request.auth.isAdmin = true || (user = @request.auth.id && ` + visibleModerationStatusesRule + `)`)
	collection.DeleteRule = types.Pointer(`@request.auth.isAdmin = true || (user = @request.auth.id && ` + visibleModerationStatusesRule + `)`)
	return app.Save(collection)
}

func updateFoodItemsModerationRules(app core.App) error {
	collection, err := app.FindCollectionByNameOrId("food_items")
	if err != nil {
		return err
	}

	rule := `@request.auth.isAdmin = true || (` + visibleModerationStatusesRule + ` && (
user = @request.auth.id ||
(visit != '' && ` + visibleVisitModerationStatusesRule + ` && (
  visit.visibility = 'public' ||
  (visit.visibility = 'friends' && (
    visit.user.id ?~ @request.auth.friendships_via_user.friend.id ||
    visit.user.id ?~ @request.auth.friendships_via_friend.user.id
  ))
)) ||
(isQuickTrack = true && visibility = 'friends' && (
  user.id ?~ @request.auth.friendships_via_user.friend.id ||
  user.id ?~ @request.auth.friendships_via_friend.user.id
))))`

	collection.ListRule = types.Pointer(rule)
	collection.ViewRule = types.Pointer(rule)
	collection.UpdateRule = types.Pointer(`@request.auth.isAdmin = true || (user = @request.auth.id && ` + visibleModerationStatusesRule + `)`)
	collection.DeleteRule = types.Pointer(`@request.auth.isAdmin = true || (user = @request.auth.id && ` + visibleModerationStatusesRule + `)`)
	return app.Save(collection)
}

func updateRestaurantListsModerationRules(app core.App) error {
	collection, err := app.FindCollectionByNameOrId("restaurant_lists")
	if err != nil {
		return err
	}

	rule := `@request.auth.isAdmin = true || (` + visibleModerationStatusesRule + ` && (
visibility = 'public' ||
user = @request.auth.id ||
(visibility = 'friends' && (
  (@collection.friendships.user.id ?= user &&
   @collection.friendships.friend.id ?= @request.auth.id &&
   @collection.friendships.status ?= 'accepted') ||
  (@collection.friendships.user.id ?= @request.auth.id &&
   @collection.friendships.friend.id ?= user &&
   @collection.friendships.status ?= 'accepted')
))))`

	collection.ListRule = types.Pointer(rule)
	collection.ViewRule = types.Pointer(rule)
	collection.UpdateRule = types.Pointer(`@request.auth.isAdmin = true || (user = @request.auth.id && ` + visibleModerationStatusesRule + `)`)
	collection.DeleteRule = types.Pointer(`@request.auth.isAdmin = true || (user = @request.auth.id && ` + visibleModerationStatusesRule + `)`)
	return app.Save(collection)
}

func updateListItemsModerationRules(app core.App) error {
	collection, err := app.FindCollectionByNameOrId("list_items")
	if err != nil {
		return err
	}

	rule := `@request.auth.isAdmin = true || (` + visibleModerationStatusesRule + ` && ` + visibleListModerationStatusesRule + ` && (
  @collection.restaurant_lists.id ?= list &&
  (@collection.restaurant_lists.visibility ?= 'public' ||
   @collection.restaurant_lists.user ?= @request.auth.id ||
   (@collection.restaurant_lists.visibility ?= 'friends' && (
     (@collection.friendships.user.id ?= @collection.restaurant_lists.user &&
      @collection.friendships.friend.id ?= @request.auth.id &&
      @collection.friendships.status ?= 'accepted') ||
     (@collection.friendships.user.id ?= @request.auth.id &&
      @collection.friendships.friend.id ?= @collection.restaurant_lists.user &&
      @collection.friendships.status ?= 'accepted')
   )))
))`

	collection.ListRule = types.Pointer(rule)
	collection.ViewRule = types.Pointer(rule)
	collection.UpdateRule = types.Pointer(`@request.auth.isAdmin = true || ((addedBy = @request.auth.id || @collection.restaurant_lists.user = @request.auth.id) && ` + visibleModerationStatusesRule + ` && ` + visibleListModerationStatusesRule + `)`)
	collection.DeleteRule = types.Pointer(`@request.auth.isAdmin = true || ((addedBy = @request.auth.id || @collection.restaurant_lists.user = @request.auth.id) && ` + visibleModerationStatusesRule + ` && ` + visibleListModerationStatusesRule + `)`)
	return app.Save(collection)
}

func updateNotesModerationRules(app core.App) error {
	collection, err := app.FindCollectionByNameOrId("notes")
	if err != nil {
		return err
	}

	rule := `@request.auth.isAdmin = true || (user = @request.auth.id && ` + visibleModerationStatusesRule + `)`
	collection.ListRule = types.Pointer(rule)
	collection.ViewRule = types.Pointer(rule)
	collection.UpdateRule = types.Pointer(rule)
	collection.DeleteRule = types.Pointer(rule)
	return app.Save(collection)
}

func updateVisitPhotosModerationRules(app core.App) error {
	collection, err := app.FindCollectionByNameOrId("visit_photos")
	if err != nil {
		return err
	}

	rule := `@request.auth.isAdmin = true || (user = @request.auth.id && ` + visibleModerationStatusesRule + ` && ` + visibleFoodItemModerationStatusesRule + ` && (visit = '' || ` + visibleVisitModerationStatusesRule + `))`
	collection.ListRule = types.Pointer(rule)
	collection.ViewRule = types.Pointer(rule)
	collection.UpdateRule = types.Pointer(rule)
	collection.DeleteRule = types.Pointer(rule)
	return app.Save(collection)
}

func updateNotePhotosModerationRules(app core.App) error {
	collection, err := app.FindCollectionByNameOrId("note_photos")
	if err != nil {
		return err
	}

	rule := `@request.auth.isAdmin = true || (user = @request.auth.id && ` + visibleModerationStatusesRule + ` && ` + visibleNoteModerationStatusesRule + `)`
	collection.ListRule = types.Pointer(rule)
	collection.ViewRule = types.Pointer(rule)
	collection.UpdateRule = types.Pointer(rule)
	collection.DeleteRule = types.Pointer(rule)
	return app.Save(collection)
}

func removeModerationFieldsFromUsers(app core.App) error {
	collection, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		return err
	}

	for _, fieldName := range []string{
		"moderationState",
		"contentModerationMode",
		"warningCount",
		"moderationNotes",
		"moderationNotice",
		"postingSuspendedUntil",
		"photoSuspendedUntil",
		"moderatedAt",
		"moderatedBy",
	} {
		collection.Fields.RemoveByName(fieldName)
	}

	return app.Save(collection)
}

func removeModerationFieldsFromContentCollection(app core.App, collectionName string) error {
	collection, err := app.FindCollectionByNameOrId(collectionName)
	if err != nil {
		return err
	}

	collection.Fields.RemoveByName("moderationStatus")
	collection.Fields.RemoveByName("moderatedAt")
	collection.Fields.RemoveByName("moderatedBy")
	return app.Save(collection)
}

func revertModerationAwareRules(app core.App) error {
	// Keep down migration scoped to field removal; historical rule migrations remain the source of truth.
	return nil
}
