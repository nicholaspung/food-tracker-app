package migrations

import (
	"fmt"
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		if err := setVisitPhotoAccess(app, buildVisitPhotoReadRule(false), true); err != nil {
			return err
		}

		log.Println("✓ Removed legacy public visit branch from visit photo reads")
		return nil
	}, func(app core.App) error {
		return setVisitPhotoAccess(app, buildVisitPhotoReadRule(true), false)
	})
}

func buildVisitPhotoReadRule(includeLegacyPublicVisit bool) string {
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

	visitVisibilityRule := `(visit.visibility = 'friends' && ` + friendshipWithVisitOwnerRule + `)`
	if includeLegacyPublicVisit {
		visitVisibilityRule = `(visit.visibility = 'public' || ` + visitVisibilityRule + `)`
	}

	visibleVisitBranchRule := `(
  visit != '' &&
  ` + visitVisibleStatusesRule + ` &&
  (` + photoFoodItemVisibleStatusesRule + ` || food_item = '') &&
  (
    visit.user = @request.auth.id ||
    ` + visitVisibilityRule + `
  )
)`

	ownerVisitBranchRule := `(
  visit != '' &&
  visit.user = @request.auth.id &&
  ` + visitOwnerVisibleStatusesRule + ` &&
  (` + photoFoodItemOwnerVisibleStatusesRule + ` || food_item = '')
)`

	visibleFoodProductBranchRule := `(
  visit = '' &&
  food_item != '' &&
  ` + photoFoodItemVisibleStatusesRule + ` &&
  (
    food_item.user = @request.auth.id ||
    food_item.visibility = 'public' ||
    (food_item.visibility = 'friends' && ` + friendshipWithFoodItemOwnerRule + `)
  )
)`

	ownerFoodProductBranchRule := `(
  visit = '' &&
  food_item != '' &&
  food_item.user = @request.auth.id &&
  ` + photoFoodItemOwnerVisibleStatusesRule + `
)`

	return `@request.auth.id != '' && (
  @request.auth.isAdmin = true ||
  (
    user = @request.auth.id &&
    ` + visitPhotoOwnerVisibleStatusesRule + ` &&
    (` + ownerVisitBranchRule + ` || ` + ownerFoodProductBranchRule + `)
  ) ||
  (
    user != @request.auth.id &&
    ` + visitPhotoVisibleStatusesRule + ` &&
    (` + visibleVisitBranchRule + ` || ` + visibleFoodProductBranchRule + `)
  )
)`
}

func setVisitPhotoAccess(app core.App, rule string, protectFiles bool) error {
	collection, err := app.FindCollectionByNameOrId("visit_photos")
	if err != nil {
		return err
	}
	photoField, ok := collection.Fields.GetByName("photo").(*core.FileField)
	if !ok {
		return fmt.Errorf("visit_photos.photo is not a file field")
	}

	collection.ListRule = types.Pointer(rule)
	collection.ViewRule = types.Pointer(rule)
	photoField.Protected = protectFiles
	return app.Save(collection)
}
