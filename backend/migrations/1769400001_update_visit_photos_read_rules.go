package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

const (
	visitPhotoVisibleStatusesRule         = `(moderationStatus = '' || moderationStatus = 'active' || moderationStatus = 'reviewed')`
	visitPhotoOwnerVisibleStatusesRule    = `(moderationStatus = '' || moderationStatus = 'active' || moderationStatus = 'reviewed' || moderationStatus = 'under_review')`
	visitVisibleStatusesRule              = `(visit.moderationStatus = '' || visit.moderationStatus = 'active' || visit.moderationStatus = 'reviewed')`
	visitOwnerVisibleStatusesRule         = `(visit.moderationStatus = '' || visit.moderationStatus = 'active' || visit.moderationStatus = 'reviewed' || visit.moderationStatus = 'under_review')`
	photoFoodItemVisibleStatusesRule      = `(food_item.moderationStatus = '' || food_item.moderationStatus = 'active' || food_item.moderationStatus = 'reviewed')`
	photoFoodItemOwnerVisibleStatusesRule = `(food_item.moderationStatus = '' || food_item.moderationStatus = 'active' || food_item.moderationStatus = 'reviewed' || food_item.moderationStatus = 'under_review')`
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("visit_photos")
		if err != nil {
			return err
		}

		friendshipWithVisitOwnerRule := `(
  (@collection.friendships.user.id ?= visit.user &&
   @collection.friendships.friend.id ?= @request.auth.id &&
   @collection.friendships.status ?= 'accepted') ||
  (@collection.friendships.user.id ?= @request.auth.id &&
   @collection.friendships.friend.id ?= visit.user &&
   @collection.friendships.status ?= 'accepted')
)`

		friendshipWithFoodItemOwnerRule := `(
  (@collection.friendships.user.id ?= food_item.user &&
   @collection.friendships.friend.id ?= @request.auth.id &&
   @collection.friendships.status ?= 'accepted') ||
  (@collection.friendships.user.id ?= @request.auth.id &&
   @collection.friendships.friend.id ?= food_item.user &&
   @collection.friendships.status ?= 'accepted')
)`

		visibleVisitBranchRule := `(
  visit != '' &&
  ` + visitVisibleStatusesRule + ` &&
  (` + photoFoodItemVisibleStatusesRule + ` || food_item = '') &&
  (
    visit.user = @request.auth.id ||
    visit.visibility = 'public' ||
    (visit.visibility = 'friends' && ` + friendshipWithVisitOwnerRule + `)
  )
)`

		ownerVisitBranchRule := `(
  visit != '' &&
  visit.user = @request.auth.id &&
  ` + visitOwnerVisibleStatusesRule + ` &&
  (` + photoFoodItemOwnerVisibleStatusesRule + ` || food_item = '')
)`

		visibleQuickTrackBranchRule := `(
  visit = '' &&
  food_item != '' &&
  ` + photoFoodItemVisibleStatusesRule + ` &&
  (
    food_item.user = @request.auth.id ||
    food_item.visibility = 'public' ||
    (food_item.visibility = 'friends' && ` + friendshipWithFoodItemOwnerRule + `)
  )
)`

		ownerQuickTrackBranchRule := `(
  visit = '' &&
  food_item != '' &&
  food_item.user = @request.auth.id &&
  ` + photoFoodItemOwnerVisibleStatusesRule + `
)`

		listRule := `@request.auth.id != '' && (
  @request.auth.isAdmin = true ||
  (
    user = @request.auth.id &&
    ` + visitPhotoOwnerVisibleStatusesRule + ` &&
    (` + ownerVisitBranchRule + ` || ` + ownerQuickTrackBranchRule + `)
  ) ||
  (
    user != @request.auth.id &&
    ` + visitPhotoVisibleStatusesRule + ` &&
    (` + visibleVisitBranchRule + ` || ` + visibleQuickTrackBranchRule + `)
  )
)`

		collection.ListRule = types.Pointer(listRule)
		collection.ViewRule = types.Pointer(listRule)
		collection.CreateRule = types.Pointer("@request.auth.id != ''")
		collection.UpdateRule = types.Pointer("user = @request.auth.id")
		collection.DeleteRule = types.Pointer("user = @request.auth.id")

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Updated visit_photos read rules for visible linked content")
		return nil
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("visit_photos")
		if err != nil {
			return err
		}

		collection.ListRule = types.Pointer("user = @request.auth.id")
		collection.ViewRule = types.Pointer("user = @request.auth.id")
		collection.CreateRule = types.Pointer("@request.auth.id != ''")
		collection.UpdateRule = types.Pointer("user = @request.auth.id")
		collection.DeleteRule = types.Pointer("user = @request.auth.id")

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Restored owner-only visit_photos read rules")
		return nil
	})
}
