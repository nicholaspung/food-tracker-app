package hooks

import (
	"fmt"
	"strings"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
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

	if err := validateOwnerBoundRelations(e.App, strings.TrimSpace(e.Auth.Id), e.Record); err != nil {
		return err
	}
	if err := enforceMenuItemTrustCreateSecurity(e.Record); err != nil {
		return err
	}

	return e.Next()
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

	if err := validateOwnerBoundRelations(e.App, strings.TrimSpace(e.Auth.Id), e.Record); err != nil {
		return err
	}
	if err := enforceMenuItemTrustUpdateSecurity(e.Record, original); err != nil {
		return err
	}

	return e.Next()
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

func validateOwnerBoundRelations(app core.App, authUserID string, record *core.Record) error {
	if app == nil || record == nil || record.Collection() == nil {
		return nil
	}

	switch record.Collection().Name {
	case "food_items":
		return requireOwnedRelation(app, "visits", record.GetString("visit"), "visit", authUserID)
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
