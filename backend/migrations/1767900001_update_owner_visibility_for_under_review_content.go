package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

const ownerAccessibleModerationStatusesRule = `(moderationStatus = '' || moderationStatus = 'active' || moderationStatus = 'reviewed' || moderationStatus = 'under_review')`
const ownerAccessibleVisitModerationStatusesRule = `(visit.moderationStatus = '' || visit.moderationStatus = 'active' || visit.moderationStatus = 'reviewed' || visit.moderationStatus = 'under_review')`
const ownerAccessibleFoodItemModerationStatusesRule = `(food_item.moderationStatus = '' || food_item.moderationStatus = 'active' || food_item.moderationStatus = 'reviewed' || food_item.moderationStatus = 'under_review')`

func init() {
	m.Register(func(app core.App) error {
		if err := updateVisitOwnerReviewRules(app); err != nil {
			return err
		}

		if err := updateFoodItemOwnerReviewRules(app); err != nil {
			return err
		}

		if err := updateVisitPhotoOwnerReviewRules(app); err != nil {
			return err
		}

		return nil
	}, func(app core.App) error {
		if err := updateVisitsModerationRules(app); err != nil {
			return err
		}

		if err := updateFoodItemsModerationRules(app); err != nil {
			return err
		}

		if err := updateVisitPhotosModerationRules(app); err != nil {
			return err
		}

		return nil
	})
}

func updateVisitOwnerReviewRules(app core.App) error {
	collection, err := app.FindCollectionByNameOrId("visits")
	if err != nil {
		return err
	}

	rule := `@request.auth.isAdmin = true || (
(user = @request.auth.id && ` + ownerAccessibleModerationStatusesRule + `) ||
(` + visibleModerationStatusesRule + ` && (
visibility = 'public' ||
(visibility = 'friends' && (
  @collection.friendships.user ?= user && @collection.friendships.friend ?= @request.auth.id && @collection.friendships.status ?= 'accepted' ||
  @collection.friendships.user ?= @request.auth.id && @collection.friendships.friend ?= user && @collection.friendships.status ?= 'accepted'
))
))
)`

	collection.ListRule = types.Pointer(rule)
	collection.ViewRule = types.Pointer(rule)
	collection.UpdateRule = types.Pointer(`@request.auth.isAdmin = true || (user = @request.auth.id && ` + ownerAccessibleModerationStatusesRule + `)`)
	collection.DeleteRule = types.Pointer(`@request.auth.isAdmin = true || (user = @request.auth.id && ` + ownerAccessibleModerationStatusesRule + `)`)
	return app.Save(collection)
}

func updateFoodItemOwnerReviewRules(app core.App) error {
	collection, err := app.FindCollectionByNameOrId("food_items")
	if err != nil {
		return err
	}

	rule := `@request.auth.isAdmin = true || (
(user = @request.auth.id && ` + ownerAccessibleModerationStatusesRule + `) ||
(` + visibleModerationStatusesRule + ` && (
(visit != '' && ` + visibleVisitModerationStatusesRule + ` && (
  visit.visibility = 'public' ||
  (visit.visibility = 'friends' && (
    visit.user.id ?~ @request.auth.friendships_via_user.friend.id ||
    visit.user.id ?~ @request.auth.friendships_via_friend.user.id
  ))
)) ||
(isQuickTrack = true && visibility = 'public') ||
(isQuickTrack = true && visibility = 'friends' && (
  user.id ?~ @request.auth.friendships_via_user.friend.id ||
  user.id ?~ @request.auth.friendships_via_friend.user.id
))
))
)`

	collection.ListRule = types.Pointer(rule)
	collection.ViewRule = types.Pointer(rule)
	collection.UpdateRule = types.Pointer(`@request.auth.isAdmin = true || (user = @request.auth.id && ` + ownerAccessibleModerationStatusesRule + `)`)
	collection.DeleteRule = types.Pointer(`@request.auth.isAdmin = true || (user = @request.auth.id && ` + ownerAccessibleModerationStatusesRule + `)`)
	return app.Save(collection)
}

func updateVisitPhotoOwnerReviewRules(app core.App) error {
	collection, err := app.FindCollectionByNameOrId("visit_photos")
	if err != nil {
		return err
	}

	rule := `@request.auth.isAdmin = true || (user = @request.auth.id && ` + ownerAccessibleModerationStatusesRule + ` && (food_item = '' || ` + ownerAccessibleFoodItemModerationStatusesRule + `) && (visit = '' || ` + ownerAccessibleVisitModerationStatusesRule + `))`
	collection.ListRule = types.Pointer(rule)
	collection.ViewRule = types.Pointer(rule)
	collection.UpdateRule = types.Pointer(rule)
	collection.DeleteRule = types.Pointer(rule)
	return app.Save(collection)
}
