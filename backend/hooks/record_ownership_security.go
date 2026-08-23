package hooks

import (
	"fmt"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"

	"myapp/lib"
)

var ownerBoundCollectionFields = map[string]string{
	"food_items":       "user",
	"menu_items":       "createdBy",
	"note_photos":      "user",
	"notes":            "user",
	"ratings":          "user",
	"restaurant_lists": "user",
	"restaurants":      "createdBy",
	"visit_photos":     "user",
	"visits":           "user",
}

// RegisterRecordOwnershipHooks enforces owner-bound create/update constraints
// for raw collection API requests.
func RegisterRecordOwnershipHooks(app core.App) {
	app.OnRecordCreateRequest().BindFunc(func(e *core.RecordRequestEvent) error {
		return EnforceOwnerBoundCreateRequestSecurity(e)
	})

	app.OnRecordUpdateRequest().BindFunc(func(e *core.RecordRequestEvent) error {
		return EnforceOwnerBoundUpdateRequestSecurity(e)
	})
}

func EnforceOwnerBoundCreateRequestSecurity(e *core.RecordRequestEvent) error {
	if e == nil || e.Collection == nil {
		return nil
	}
	if e.Collection.Name == "bill_participants" {
		return enforceBillParticipantCreateRequestSecurity(e)
	}

	ownerField, ok := ownerBoundCollectionFields[e.Collection.Name]
	if !ok {
		return e.Next()
	}

	if e.HasSuperuserAuth() {
		return e.Next()
	}

	if e.Auth == nil {
		return apis.NewUnauthorizedError("authentication required", nil)
	}

	if strings.TrimSpace(e.Record.GetString(ownerField)) != strings.TrimSpace(e.Auth.Id) {
		return apis.NewForbiddenError(fmt.Sprintf("%s must match the authenticated user", ownerField), nil)
	}

	if err := validateOwnerBoundRelations(e.App, strings.TrimSpace(e.Auth.Id), e.Auth.GetBool("isAdmin"), e.Record); err != nil {
		return err
	}
	if err := enforceMenuItemTrustCreateSecurity(e.Record); err != nil {
		return err
	}
	if err := enforceRestaurantGoogleCatalogTrustCreateSecurity(e.Record); err != nil {
		return err
	}

	return e.Next()
}

func enforceBillParticipantCreateRequestSecurity(e *core.RecordRequestEvent) error {
	if e.HasSuperuserAuth() {
		return e.Next()
	}
	if e.Auth == nil {
		return apis.NewUnauthorizedError("authentication required", nil)
	}

	billID := strings.TrimSpace(e.Record.GetString("bill"))
	if billID == "" {
		return apis.NewBadRequestError("bill is required", nil)
	}
	bill, err := e.App.FindRecordById("bills", billID)
	if err != nil {
		return apis.NewBadRequestError("invalid bill", err)
	}
	if strings.TrimSpace(bill.GetString("creator_user")) != e.Auth.Id {
		return apis.NewForbiddenError("only the Bill creator can add participants", nil)
	}

	participantUserID := strings.TrimSpace(e.Record.GetString("user"))
	if participantUserID == "" || participantUserID == e.Auth.Id {
		return e.Next()
	}

	row := struct {
		Count int `db:"count"`
	}{}
	if err := e.App.DB().NewQuery(`
		SELECT COUNT(*) AS [[count]]
		FROM friendships
		WHERE status = 'accepted'
		  AND ((user = {:actorId} AND friend = {:participantId})
		    OR (user = {:participantId} AND friend = {:actorId}))
	`).Bind(dbx.Params{
		"actorId":       e.Auth.Id,
		"participantId": participantUserID,
	}).One(&row); err != nil {
		return apis.NewApiError(500, "failed to validate Bill participant", err)
	}
	if row.Count == 0 {
		return apis.NewForbiddenError("Bill participants must be accepted friends", nil)
	}

	return e.Next()
}

func enforceRestaurantGoogleCatalogTrustCreateSecurity(record *core.Record) error {
	if record == nil || record.Collection() == nil || record.Collection().Name != "restaurants" {
		return nil
	}

	if record.GetBool("isGooglePlace") ||
		strings.TrimSpace(record.GetString("googlePlaceCachedAt")) != "" ||
		isPublicRestaurantPlaceIDClaim(record) {
		return apis.NewForbiddenError("Google Place catalog trust is server controlled", nil)
	}

	return nil
}

func enforceMenuItemTrustCreateSecurity(record *core.Record) error {
	if record == nil || record.Collection() == nil || record.Collection().Name != "menu_items" {
		return nil
	}

	approvalStatus := strings.TrimSpace(record.GetString("approvalStatus"))
	if approvalStatus == "" {
		record.Set("approvalStatus", "unreviewed")
	} else if approvalStatus != "unreviewed" {
		return apis.NewForbiddenError("menu item approval state is admin controlled", nil)
	}

	if strings.TrimSpace(record.GetString("approvalReviewedBy")) != "" ||
		strings.TrimSpace(record.GetString("approvalReviewedAt")) != "" ||
		strings.TrimSpace(record.GetString("promotedFrom")) != "" ||
		strings.TrimSpace(record.GetString("promotedTo")) != "" ||
		record.GetBool("groupSuitable") {
		return apis.NewForbiddenError("menu item catalog trust fields are admin controlled", nil)
	}

	return nil
}

func EnforceOwnerBoundUpdateRequestSecurity(e *core.RecordRequestEvent) error {
	if e == nil || e.Collection == nil {
		return nil
	}
	if e.Collection.Name == "list_items" {
		return enforceImmutableListItemParent(e)
	}

	ownerField, ok := ownerBoundCollectionFields[e.Collection.Name]
	if !ok {
		return e.Next()
	}

	if e.HasSuperuserAuth() {
		return e.Next()
	}

	if e.Auth == nil {
		return apis.NewUnauthorizedError("authentication required", nil)
	}

	original := e.Record.Original()
	if original == nil {
		return apis.NewBadRequestError("existing record is required", nil)
	}

	if strings.TrimSpace(e.Record.GetString(ownerField)) != strings.TrimSpace(original.GetString(ownerField)) {
		return apis.NewForbiddenError(fmt.Sprintf("%s cannot be modified", ownerField), nil)
	}

	if err := validateOwnerBoundRelations(e.App, strings.TrimSpace(e.Auth.Id), e.Auth.GetBool("isAdmin"), e.Record); err != nil {
		return err
	}
	if err := enforceMenuItemTrustUpdateSecurity(e.Record, original); err != nil {
		return err
	}
	if err := enforceRestaurantGoogleCatalogTrustUpdateSecurity(e.Record, original); err != nil {
		return err
	}

	return e.Next()
}

func enforceRestaurantGoogleCatalogTrustUpdateSecurity(record *core.Record, original *core.Record) error {
	if record == nil || original == nil || record.Collection() == nil || record.Collection().Name != "restaurants" {
		return nil
	}

	if record.GetBool("isGooglePlace") != original.GetBool("isGooglePlace") ||
		strings.TrimSpace(record.GetString("googlePlaceCachedAt")) != strings.TrimSpace(original.GetString("googlePlaceCachedAt")) ||
		isPublicRestaurantPlaceIDClaim(record) {
		return apis.NewForbiddenError("Google Place catalog trust is server controlled", nil)
	}

	return nil
}

func isPublicRestaurantPlaceIDClaim(record *core.Record) bool {
	return record != nil &&
		strings.TrimSpace(record.GetString("visibility")) == "public" &&
		strings.TrimSpace(record.GetString("placeId")) != ""
}

func enforceImmutableListItemParent(e *core.RecordRequestEvent) error {
	if e.HasSuperuserAuth() {
		return e.Next()
	}
	if e.Auth == nil {
		return apis.NewUnauthorizedError("authentication required", nil)
	}

	original := e.Record.Original()
	if original == nil {
		return apis.NewBadRequestError("existing record is required", nil)
	}
	if strings.TrimSpace(e.Record.GetString("list")) != strings.TrimSpace(original.GetString("list")) {
		return apis.NewForbiddenError("list cannot be modified", nil)
	}

	return e.Next()
}

func enforceMenuItemTrustUpdateSecurity(record *core.Record, original *core.Record) error {
	if record == nil || original == nil || record.Collection() == nil || record.Collection().Name != "menu_items" {
		return nil
	}

	for _, field := range []string{
		"approvalStatus",
		"approvalReviewedBy",
		"approvalReviewedAt",
		"promotedFrom",
		"promotedTo",
	} {
		if strings.TrimSpace(record.GetString(field)) != strings.TrimSpace(original.GetString(field)) {
			return apis.NewForbiddenError("menu item catalog trust fields are admin controlled", nil)
		}
	}
	if record.GetBool("groupSuitable") != original.GetBool("groupSuitable") {
		return apis.NewForbiddenError("menu item catalog trust fields are admin controlled", nil)
	}

	if menuItemHasAdminTrustState(original) {
		return apis.NewForbiddenError("reviewed menu items must be updated through the audited admin API", nil)
	}

	return nil
}

func menuItemHasAdminTrustState(record *core.Record) bool {
	if record == nil {
		return false
	}

	approvalStatus := strings.TrimSpace(record.GetString("approvalStatus"))
	return (approvalStatus != "" && approvalStatus != "unreviewed") ||
		strings.TrimSpace(record.GetString("approvalReviewedBy")) != "" ||
		strings.TrimSpace(record.GetString("approvalReviewedAt")) != "" ||
		strings.TrimSpace(record.GetString("promotedFrom")) != "" ||
		strings.TrimSpace(record.GetString("promotedTo")) != "" ||
		record.GetBool("groupSuitable")
}

func validateOwnerBoundRelations(app core.App, authUserID string, isAdmin bool, record *core.Record) error {
	if app == nil || record == nil || record.Collection() == nil {
		return nil
	}

	switch record.Collection().Name {
	case "food_items":
		return requireOwnedRelation(app, "visits", record.GetString("visit"), "visit", authUserID)
	case "visits":
		return validateVisitRestaurantRelation(app, authUserID, isAdmin, record)
	case "notes":
		if err := requireOwnedRelation(app, "visits", record.GetString("usedInVisit"), "usedInVisit", authUserID); err != nil {
			return err
		}
		return requireOwnedRelation(app, "food_items", record.GetString("usedInFoodItem"), "usedInFoodItem", authUserID)
	case "note_photos":
		return requireOwnedRelation(app, "notes", record.GetString("note"), "note", authUserID)
	case "visit_photos":
		return validateVisitPhotoRelations(app, authUserID, record)
	default:
		return nil
	}
}

func validateVisitRestaurantRelation(app core.App, authUserID string, isAdmin bool, visit *core.Record) error {
	restaurantID := strings.TrimSpace(visit.GetString("restaurant"))
	if restaurantID == "" {
		return nil
	}

	if original := visit.Original(); original != nil &&
		restaurantID == strings.TrimSpace(original.GetString("restaurant")) {
		return nil
	}

	restaurant, err := app.FindRecordById("restaurants", restaurantID)
	if err != nil {
		return apis.NewBadRequestError("restaurant is invalid", err)
	}

	acceptedFriendIDs := map[string]struct{}{}
	if !isAdmin {
		rows := []struct {
			FriendID string `db:"friendId"`
		}{}
		if err := app.DB().NewQuery(`
			SELECT friend AS [[friendId]]
			FROM friendships
			WHERE user = {:userId} AND status = 'accepted'
			UNION
			SELECT user AS [[friendId]]
			FROM friendships
			WHERE friend = {:userId} AND status = 'accepted'
		`).Bind(dbx.Params{"userId": authUserID}).All(&rows); err != nil {
			return apis.NewApiError(500, "failed to validate restaurant visibility", err)
		}
		for _, row := range rows {
			friendID := strings.TrimSpace(row.FriendID)
			if friendID != "" {
				acceptedFriendIDs[friendID] = struct{}{}
			}
		}
	}

	if !lib.CanAccessRestaurant(
		restaurant.GetString("createdBy"),
		restaurant.GetString("visibility"),
		authUserID,
		isAdmin,
		acceptedFriendIDs,
	) {
		return apis.NewForbiddenError("restaurant is not accessible", nil)
	}

	return nil
}

func requireOwnedRelation(
	app core.App,
	collectionName string,
	recordID string,
	fieldName string,
	authUserID string,
) error {
	trimmedRecordID := strings.TrimSpace(recordID)
	if trimmedRecordID == "" {
		return nil
	}

	record, err := app.FindRecordById(collectionName, trimmedRecordID)
	if err != nil {
		return apis.NewBadRequestError(fmt.Sprintf("%s is invalid", fieldName), err)
	}

	if strings.TrimSpace(record.GetString("user")) != authUserID {
		return apis.NewForbiddenError(fmt.Sprintf("%s must belong to the authenticated user", fieldName), nil)
	}

	return nil
}

func validateVisitPhotoRelations(app core.App, authUserID string, record *core.Record) error {
	foodItemID := strings.TrimSpace(record.GetString("food_item"))
	if foodItemID == "" {
		return apis.NewBadRequestError("food_item is required", nil)
	}

	foodItemRecord, err := app.FindRecordById("food_items", foodItemID)
	if err != nil {
		return apis.NewBadRequestError("food_item is invalid", err)
	}

	if strings.TrimSpace(foodItemRecord.GetString("user")) != authUserID {
		return apis.NewForbiddenError("food_item must belong to the authenticated user", nil)
	}

	visitID := strings.TrimSpace(record.GetString("visit"))
	foodItemVisitID := strings.TrimSpace(foodItemRecord.GetString("visit"))

	if visitID == "" {
		if foodItemVisitID != "" {
			return apis.NewBadRequestError("visit is required for photos attached to visited items", nil)
		}

		return nil
	}

	visitRecord, err := app.FindRecordById("visits", visitID)
	if err != nil {
		return apis.NewBadRequestError("visit is invalid", err)
	}

	if strings.TrimSpace(visitRecord.GetString("user")) != authUserID {
		return apis.NewForbiddenError("visit must belong to the authenticated user", nil)
	}

	if foodItemVisitID != "" && foodItemVisitID != visitID {
		return apis.NewBadRequestError("visit must match the food item's visit", nil)
	}

	return nil
}
