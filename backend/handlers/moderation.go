package handlers

import (
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"

	"myapp/lib"
)

// RegisterModerationHandlers registers admin moderation case queue endpoints.
func RegisterModerationHandlers(se *core.ServeEvent, app core.App) {
	se.Router.GET("/api/admin/moderation/cases", func(e *core.RequestEvent) error {
		if err := requireAdmin(e); err != nil {
			return err
		}

		statusFilter := strings.TrimSpace(e.Request.URL.Query().Get("status"))
		userID := strings.TrimSpace(e.Request.URL.Query().Get("userId"))
		assignment := strings.TrimSpace(e.Request.URL.Query().Get("assignment"))

		cases, err := listModerationCases(app, e.Auth, statusFilter, userID, assignment)
		if err != nil {
			log.Printf("Admin moderation case list failed: %v", err)
			return apis.NewApiError(500, "failed to load moderation cases", err)
		}

		return e.JSON(200, map[string]any{"items": cases})
	})

	se.Router.POST("/api/admin/moderation/cases/{caseId}/claim", func(e *core.RequestEvent) error {
		if err := requireAdmin(e); err != nil {
			return err
		}

		caseID := strings.TrimSpace(e.Request.PathValue("caseId"))
		if caseID == "" {
			return apis.NewBadRequestError("caseId is required", nil)
		}

		err := app.RunInTransaction(func(txApp core.App) error {
			record, err := txApp.FindRecordById("moderation_cases", caseID)
			if err != nil {
				return apis.NewNotFoundError("moderation case not found", err)
			}

			currentOwner := strings.TrimSpace(record.GetString("assignedAdmin"))
			if currentOwner != "" && currentOwner != e.Auth.Id {
				owner, _ := txApp.FindRecordById("users", currentOwner)
				return apis.NewApiError(
					409,
					fmt.Sprintf("This case is already assigned to %s.", resolveFeedbackAdminLabel(owner, currentOwner)),
					nil,
				)
			}

			beforeSnapshot := lib.RecordAuditSnapshot(record)
			record.Set("assignedAdmin", e.Auth.Id)
			record.Set("assignedAt", time.Now().UTC())
			if record.GetString("status") == lib.ModerationCaseStatusOpen {
				record.Set("status", lib.ModerationCaseStatusUnderReview)
			}
			if err := txApp.Save(record); err != nil {
				return apis.NewApiError(500, "failed to claim moderation case", err)
			}

			return lib.CreateAuditLog(txApp, lib.AuditLogInput{
				Action:           core.ModelEventTypeUpdate,
				Actor:            e.Auth,
				Before:           beforeSnapshot,
				After:            lib.RecordAuditSnapshot(record),
				Metadata:         map[string]any{"source": "admin_moderation_case_claim"},
				RequestIP:        e.RealIP(),
				RequestMethod:    e.Request.Method,
				RequestPath:      e.Request.URL.Path,
				TargetCollection: "moderation_cases",
				TargetLabel:      lib.ResolveAuditTargetLabel(record, beforeSnapshot),
				TargetRecordID:   record.Id,
				UserAgent:        e.Request.UserAgent(),
			})
		})
		if err != nil {
			return err
		}

		return e.JSON(200, map[string]any{"success": true})
	})

	se.Router.POST("/api/admin/moderation/cases/{caseId}/release", func(e *core.RequestEvent) error {
		if err := requireAdmin(e); err != nil {
			return err
		}

		caseID := strings.TrimSpace(e.Request.PathValue("caseId"))
		if caseID == "" {
			return apis.NewBadRequestError("caseId is required", nil)
		}

		err := app.RunInTransaction(func(txApp core.App) error {
			record, err := txApp.FindRecordById("moderation_cases", caseID)
			if err != nil {
				return apis.NewNotFoundError("moderation case not found", err)
			}

			currentOwner := strings.TrimSpace(record.GetString("assignedAdmin"))
			if currentOwner != "" && currentOwner != e.Auth.Id {
				return apis.NewForbiddenError("Only the assigned admin can release this case.", nil)
			}

			beforeSnapshot := lib.RecordAuditSnapshot(record)
			record.Set("assignedAdmin", "")
			record.Set("assignedAt", "")
			if record.GetString("status") == lib.ModerationCaseStatusUnderReview {
				record.Set("status", lib.ModerationCaseStatusOpen)
			}
			if err := txApp.Save(record); err != nil {
				return apis.NewApiError(500, "failed to release moderation case", err)
			}

			return lib.CreateAuditLog(txApp, lib.AuditLogInput{
				Action:           core.ModelEventTypeUpdate,
				Actor:            e.Auth,
				Before:           beforeSnapshot,
				After:            lib.RecordAuditSnapshot(record),
				Metadata:         map[string]any{"source": "admin_moderation_case_release"},
				RequestIP:        e.RealIP(),
				RequestMethod:    e.Request.Method,
				RequestPath:      e.Request.URL.Path,
				TargetCollection: "moderation_cases",
				TargetLabel:      lib.ResolveAuditTargetLabel(record, beforeSnapshot),
				TargetRecordID:   record.Id,
				UserAgent:        e.Request.UserAgent(),
			})
		})
		if err != nil {
			return err
		}

		return e.JSON(200, map[string]any{"success": true})
	})
}

func listModerationCases(
	app core.App,
	adminUser *core.Record,
	statusFilter string,
	userID string,
	assignment string,
) ([]map[string]any, error) {
	params := dbx.Params{}
	clauses := make([]string, 0, 3)

	if trimmedStatus := strings.TrimSpace(statusFilter); trimmedStatus != "" && trimmedStatus != "all" {
		if trimmedStatus == "active" {
			clauses = append(clauses, `(status = {:open} || status = {:underReview} || status = {:escalated})`)
			params["open"] = lib.ModerationCaseStatusOpen
			params["underReview"] = lib.ModerationCaseStatusUnderReview
			params["escalated"] = lib.ModerationCaseStatusEscalated
		} else {
			clauses = append(clauses, "status = {:status}")
			params["status"] = trimmedStatus
		}
	}

	if trimmedUserID := strings.TrimSpace(userID); trimmedUserID != "" {
		clauses = append(clauses, "targetUser = {:targetUser}")
		params["targetUser"] = trimmedUserID
	}

	switch strings.TrimSpace(assignment) {
	case "mine":
		clauses = append(clauses, "assignedAdmin = {:assignedAdmin}")
		params["assignedAdmin"] = adminUser.Id
	case "unassigned":
		clauses = append(clauses, "assignedAdmin = ''")
	}

	filter := strings.Join(clauses, " && ")
	records, err := app.FindRecordsByFilter("moderation_cases", filter, "-updated,-created", 100, 0, params)
	if err != nil {
		return nil, err
	}

	return serializeModerationCases(app, records)
}

func serializeModerationCases(app core.App, records []*core.Record) ([]map[string]any, error) {
	userIDs := make([]string, 0, len(records)*2)
	for _, record := range records {
		if userID := strings.TrimSpace(record.GetString("targetUser")); userID != "" {
			userIDs = append(userIDs, userID)
		}
		if adminID := strings.TrimSpace(record.GetString("assignedAdmin")); adminID != "" {
			userIDs = append(userIDs, adminID)
		}
	}

	users, err := findRecordsByIDs(app, "users", userIDs)
	if err != nil {
		return nil, err
	}
	usersByID := mapRecordsByID(users)

	result := make([]map[string]any, 0, len(records))
	for _, record := range records {
		targetUser := usersByID[record.GetString("targetUser")]
		assignedAdmin := usersByID[record.GetString("assignedAdmin")]
		result = append(result, map[string]any{
			"id":              record.Id,
			"targetType":      record.GetString("targetType"),
			"targetRecordId":  record.GetString("targetRecordId"),
			"targetCollection": record.GetString("targetCollection"),
			"targetLabel":     record.GetString("targetLabel"),
			"status":          record.GetString("status"),
			"action":          record.GetString("action"),
			"reasonCode":      record.GetString("reasonCode"),
			"moderatorNote":   record.GetString("moderatorNote"),
			"userNotice":      record.GetString("userNotice"),
			"appealState":     record.GetString("appealState"),
			"assignedAt":      record.GetString("assignedAt"),
			"resolvedAt":      record.GetString("resolvedAt"),
			"created":         record.GetString("created"),
			"updated":         record.GetString("updated"),
			"expand": map[string]any{
				"targetUser":    serializeAdminUser(targetUser),
				"assignedAdmin": serializeAdminUser(assignedAdmin),
			},
		})
	}

	return result, nil
}
