package handlers

import (
	"fmt"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"

	"myapp/lib"
)

const accountDeleteBatchSize = 200

type deleteAccountRequest struct {
	CurrentPassword string `json:"currentPassword"`
}

type accountDeleteCleanupSummary struct {
	deleted map[string]int
	updated map[string]int
}

func registerAccountDeletionHandler(se *core.ServeEvent, app core.App) {
	se.Router.POST("/api/account/delete", func(e *core.RequestEvent) error {
		if e.Auth == nil {
			return apis.NewUnauthorizedError("authentication required", nil)
		}

		payload := deleteAccountRequest{}
		if err := e.BindBody(&payload); err != nil {
			return apis.NewBadRequestError("invalid request body", err)
		}

		currentPassword := payload.CurrentPassword
		if strings.TrimSpace(currentPassword) == "" {
			return apis.NewBadRequestError("current password is required", nil)
		}

		if _, err := app.FindRecordById("users", e.Auth.Id); err != nil {
			return apis.NewUnauthorizedError("account not found", err)
		}

		if err := app.RunInTransaction(func(txApp core.App) error {
			user, err := txApp.FindRecordById("users", e.Auth.Id)
			if err != nil {
				return apis.NewUnauthorizedError("account not found", err)
			}

			if !user.ValidatePassword(currentPassword) {
				return apis.NewBadRequestError("current password is incorrect", nil)
			}

			beforeSnapshot := lib.RecordAuditSnapshot(user)

			cleanupSummary, err := cleanupForAccountDeletion(txApp, user)
			if err != nil {
				return apis.NewApiError(500, "failed to clean up account data", err)
			}

			// Rotate the auth token key before deletion so existing sessions are invalidated
			// even if another request races with the final delete commit.
			user.RefreshTokenKey()
			if err := txApp.Save(user); err != nil {
				return apis.NewApiError(500, "failed to revoke active sessions", err)
			}

			if err := lib.CreateAuditLog(txApp, lib.AuditLogInput{
				Action:           core.ModelEventTypeDelete,
				Actor:            user,
				Before:           beforeSnapshot,
				Metadata:         cleanupSummary.metadata(),
				RequestIP:        e.RealIP(),
				RequestMethod:    e.Request.Method,
				RequestPath:      e.Request.URL.Path,
				Summary:          fmt.Sprintf("Deleted account for %s", strings.TrimSpace(user.Email())),
				TargetCollection: "users",
				TargetLabel:      lib.ResolveAuditTargetLabel(user, beforeSnapshot),
				TargetRecordID:   user.Id,
				UserAgent:        e.Request.UserAgent(),
			}); err != nil {
				return apis.NewApiError(500, "failed to audit account deletion", err)
			}

			if err := txApp.Delete(user); err != nil {
				return apis.NewApiError(500, "failed to delete account", err)
			}

			return nil
		}); err != nil {
			return err
		}

		return e.JSON(200, map[string]any{"success": true})
	})
}

func cleanupForAccountDeletion(app core.App, user *core.Record) (*accountDeleteCleanupSummary, error) {
	summary := &accountDeleteCleanupSummary{
		deleted: map[string]int{},
		updated: map[string]int{},
	}

	if user == nil {
		return summary, fmt.Errorf("user is required")
	}

	userID := strings.TrimSpace(user.Id)
	if userID == "" {
		return summary, fmt.Errorf("user id is required")
	}

	userFoodItemIDs, err := findOwnedRecordIDs(app, "food_items", userID)
	if err != nil {
		return nil, err
	}

	listItemOwnerFields := existingFieldNames(app, "list_items", "addedBy", "sourceUser")
	if count, err := deleteMatchingRecords(
		app,
		"list_items",
		buildAnyFieldEqualsFilter(listItemOwnerFields...),
		dbx.Params{"userId": userID},
	); err != nil {
		return nil, err
	} else {
		summary.addDeleted("list_items", count)
	}

	if collectionHasField(app, "bill_participants", "user") {
		if count, err := updateMatchingRecords(
			app,
			"bill_participants",
			"user = {:userId}",
			dbx.Params{"userId": userID},
			func(record *core.Record) error {
				record.Set("user", "")
				if strings.TrimSpace(record.GetString("participant_name")) == "" {
					record.Set("participant_name", resolveDeletedParticipantName(user))
				}
				return app.Save(record)
			},
		); err != nil {
			return nil, err
		} else {
			summary.addUpdated("bill_participants", count)
		}
	}

	if collectionHasField(app, "tasting_session_invites", "used_by") {
		if count, err := updateMatchingRecords(
			app,
			"tasting_session_invites",
			"used_by = {:userId}",
			dbx.Params{"userId": userID},
			func(record *core.Record) error {
				record.Set("used_by", "")
				return app.Save(record)
			},
		); err != nil {
			return nil, err
		} else {
			summary.addUpdated("tasting_session_invites", count)
		}
	}

	if collectionHasField(app, "invite_codes", "createdBy") {
		if count, err := deleteMatchingRecords(
			app,
			"invite_codes",
			"createdBy = {:userId}",
			dbx.Params{"userId": userID},
		); err != nil {
			return nil, err
		} else {
			summary.addDeleted("invite_codes", count)
		}
	}

	if collectionHasField(app, "invite_codes", "usedBy") {
		if count, err := updateMatchingRecords(
			app,
			"invite_codes",
			"usedBy = {:userId}",
			dbx.Params{"userId": userID},
			func(record *core.Record) error {
				record.Set("usedBy", "")
				return app.Save(record)
			},
		); err != nil {
			return nil, err
		} else {
			summary.addUpdated("invite_codes", count)
		}
	}

	if collectionHasField(app, "menu_review_requests", "requestedBy") {
		if count, err := deleteMatchingRecords(
			app,
			"menu_review_requests",
			"requestedBy = {:userId}",
			dbx.Params{"userId": userID},
		); err != nil {
			return nil, err
		} else {
			summary.addDeleted("menu_review_requests", count)
		}
	}

	if collectionHasField(app, "restaurants", "createdBy") {
		if count, err := updateMatchingRecords(
			app,
			"restaurants",
			"createdBy = {:userId}",
			dbx.Params{"userId": userID},
			func(record *core.Record) error {
				record.Set("createdBy", "")
				return app.Save(record)
			},
		); err != nil {
			return nil, err
		} else {
			summary.addUpdated("restaurants", count)
		}
	}

	if collectionHasField(app, "menu_items", "createdBy") {
		if count, err := updateMatchingRecords(
			app,
			"menu_items",
			"createdBy = {:userId}",
			dbx.Params{"userId": userID},
			func(record *core.Record) error {
				record.Set("createdBy", "")
				return app.Save(record)
			},
		); err != nil {
			return nil, err
		} else {
			summary.addUpdated("menu_items", count)
		}
	}

	if len(userFoodItemIDs) > 0 {
		if count, err := clearListItemUserFoodItemReferences(app, userFoodItemIDs); err != nil {
			return nil, err
		} else {
			summary.addUpdated("list_items.userFoodItem", count)
		}
	}

	return summary, nil
}

func resolveDeletedParticipantName(user *core.Record) string {
	if user == nil {
		return "Deleted account"
	}

	candidate := strings.TrimSpace(user.GetString("name"))
	if candidate == "" {
		candidate = strings.TrimSpace(user.Email())
	}
	if candidate == "" {
		candidate = "Deleted account"
	}
	if len(candidate) > 100 {
		candidate = candidate[:100]
	}

	return candidate
}

func findOwnedRecordIDs(app core.App, collectionName string, userID string) ([]string, error) {
	records, err := app.FindRecordsByFilter(
		collectionName,
		"user = {:userId}",
		"",
		2000,
		0,
		dbx.Params{"userId": userID},
	)
	if err != nil {
		return nil, err
	}

	return extractRecordIDs(records), nil
}

func clearListItemUserFoodItemReferences(app core.App, foodItemIDs []string) (int, error) {
	collection, err := app.FindCollectionByNameOrId("list_items")
	if err != nil || collection.Fields.GetByName("userFoodItem") == nil {
		return 0, nil
	}

	total := 0
	records, err := findRecordsByRelationValues(app, "list_items", "userFoodItem", foodItemIDs, "")
	if err != nil {
		return total, err
	}

	for _, record := range records {
		record.Set("userFoodItem", "")
		if err := app.Save(record); err != nil {
			return total, err
		}
		total++
	}

	return total, nil
}

func existingFieldNames(app core.App, collectionName string, fieldNames ...string) []string {
	collection, err := app.FindCollectionByNameOrId(collectionName)
	if err != nil || collection == nil {
		return nil
	}

	result := make([]string, 0, len(fieldNames))
	for _, fieldName := range fieldNames {
		if collection.Fields.GetByName(fieldName) != nil {
			result = append(result, fieldName)
		}
	}

	return result
}

func collectionHasField(app core.App, collectionName string, fieldName string) bool {
	collection, err := app.FindCollectionByNameOrId(collectionName)
	if err != nil || collection == nil {
		return false
	}

	return collection.Fields.GetByName(fieldName) != nil
}

func buildAnyFieldEqualsFilter(fieldNames ...string) string {
	clauses := make([]string, 0, len(fieldNames))
	for _, fieldName := range fieldNames {
		trimmed := strings.TrimSpace(fieldName)
		if trimmed == "" {
			continue
		}

		clauses = append(clauses, fmt.Sprintf("%s = {:userId}", trimmed))
	}

	if len(clauses) == 0 {
		return ""
	}
	if len(clauses) == 1 {
		return clauses[0]
	}

	return "(" + strings.Join(clauses, " || ") + ")"
}

func deleteMatchingRecords(
	app core.App,
	collectionName string,
	filter string,
	params dbx.Params,
) (int, error) {
	return processMatchingRecords(app, collectionName, filter, params, func(record *core.Record) error {
		return app.Delete(record)
	})
}

func updateMatchingRecords(
	app core.App,
	collectionName string,
	filter string,
	params dbx.Params,
	update func(record *core.Record) error,
) (int, error) {
	return processMatchingRecords(app, collectionName, filter, params, update)
}

func processMatchingRecords(
	app core.App,
	collectionName string,
	filter string,
	params dbx.Params,
	process func(record *core.Record) error,
) (int, error) {
	if strings.TrimSpace(filter) == "" {
		return 0, nil
	}

	collection, err := app.FindCollectionByNameOrId(collectionName)
	if err != nil || collection == nil {
		return 0, nil
	}

	total := 0
	for {
		records, err := app.FindRecordsByFilter(collectionName, filter, "", accountDeleteBatchSize, 0, params)
		if err != nil {
			return total, err
		}
		if len(records) == 0 {
			return total, nil
		}

		for _, record := range records {
			if err := process(record); err != nil {
				return total, err
			}
			total++
		}
	}
}

func (s *accountDeleteCleanupSummary) addDeleted(collectionName string, count int) {
	if s == nil || count <= 0 {
		return
	}

	s.deleted[collectionName] += count
}

func (s *accountDeleteCleanupSummary) addUpdated(collectionName string, count int) {
	if s == nil || count <= 0 {
		return
	}

	s.updated[collectionName] += count
}

func (s *accountDeleteCleanupSummary) metadata() map[string]any {
	if s == nil {
		return map[string]any{
			"reauth": "password",
			"source": "account_delete",
		}
	}

	return map[string]any{
		"cleanupDeleted": s.deleted,
		"cleanupUpdated": s.updated,
		"reauth":         "password",
		"source":         "account_delete",
	}
}
