package handlers

import (
	"database/sql"
	"fmt"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"

	"myapp/lib"
)

type contentReportRequest struct {
	ContentType string  `json:"contentType"`
	Notes       *string `json:"notes"`
	ReasonCode  string  `json:"reasonCode"`
	RecordID    string  `json:"recordId"`
}

type contentReportTarget struct {
	record           *core.Record
	targetCollection string
	targetType       string
	targetUserID     string
}

// RegisterContentReportHandlers registers user-facing content reporting endpoints.
func RegisterContentReportHandlers(se *core.ServeEvent, app core.App) {
	se.Router.POST("/api/content-reports", func(e *core.RequestEvent) error {
		if e.Auth == nil {
			return apis.NewUnauthorizedError("authentication required", nil)
		}

		requestBody := contentReportRequest{}
		if err := e.BindBody(&requestBody); err != nil {
			return apis.NewBadRequestError("invalid request body", err)
		}

		targetType, err := normalizeReportedContentType(requestBody.ContentType)
		if err != nil {
			return apis.NewBadRequestError(err.Error(), nil)
		}

		recordID := strings.TrimSpace(requestBody.RecordID)
		if recordID == "" {
			return apis.NewBadRequestError("recordId is required", nil)
		}

		reasonCode, err := normalizeContentReportReasonCode(requestBody.ReasonCode)
		if err != nil {
			return apis.NewBadRequestError(err.Error(), nil)
		}

		existingReport, err := findExistingContentReport(app, e.Auth.Id, targetType, recordID)
		if err != nil {
			return apis.NewApiError(500, "failed to resolve existing content report", err)
		}

		target, err := resolveContentReportTarget(app, e.Auth.Id, targetType, recordID, existingReport != nil)
		if err != nil {
			return err
		}

		if target.targetUserID == e.Auth.Id {
			return apis.NewBadRequestError("you cannot report your own content", nil)
		}

		responseBody := map[string]any{}
		err = app.RunInTransaction(func(txApp core.App) error {
			targetRecord, err := resolveModerationTargetRecord(txApp, target.targetUserID, targetType, recordID)
			if err != nil {
				return err
			}

			moderationStatus := strings.TrimSpace(targetRecord.GetString("moderationStatus"))
			canUpdateExistingReport := existingReport != nil && moderationStatus == lib.ContentModerationStatusUnderReview
			if !canUpdateExistingReport && !lib.IsVisibleContentModerationStatus(moderationStatus) {
				return apis.NewForbiddenError("this content can no longer be reported", nil)
			}

			targetLabel, err := resolveReportedContentLabel(txApp, targetType, targetRecord)
			if err != nil {
				return apis.NewApiError(500, "failed to resolve reported content label", err)
			}

			caseRecord, err := lib.UpsertModerationCase(txApp, lib.ModerationCaseInput{
				Action:           lib.ModerationActionQuarantine,
				ReasonCode:       reasonCode,
				Status:           lib.ModerationCaseStatusUnderReview,
				TargetCollection: target.targetCollection,
				TargetLabel:      targetLabel,
				TargetRecordID:   targetRecord.Id,
				TargetType:       target.targetType,
				TargetUserID:     target.targetUserID,
			})
			if err != nil {
				return apis.NewApiError(500, "failed to record moderation case", err)
			}

			reportRecord, err := lib.UpsertContentReport(txApp, lib.ContentReportInput{
				ModerationCaseID: caseRecord.Id,
				Notes:            optionalStringValue(requestBody.Notes),
				ReasonCode:       reasonCode,
				ReporterID:       e.Auth.Id,
				TargetCollection: target.targetCollection,
				TargetRecordID:   targetRecord.Id,
				TargetType:       target.targetType,
				TargetUserID:     target.targetUserID,
			})
			if err != nil {
				return apis.NewApiError(500, "failed to save content report", err)
			}

			if lib.IsVisibleContentModerationStatus(moderationStatus) {
				lib.ApplyContentModerationState(targetRecord, lib.ContentModerationStatusUnderReview, "")
				if err := txApp.Save(targetRecord); err != nil {
					return apis.NewApiError(500, "failed to quarantine reported content", err)
				}
			}

			responseBody = map[string]any{
				"caseId":   caseRecord.Id,
				"reportId": reportRecord.Id,
				"status":   lib.ContentModerationStatusUnderReview,
			}
			return nil
		})
		if err != nil {
			return err
		}

		return e.JSON(200, responseBody)
	})
}

func normalizeReportedContentType(value string) (string, error) {
	switch strings.TrimSpace(value) {
	case "visit":
		return "visit", nil
	case "quick-track":
		return "quick-track", nil
	default:
		return "", fmt.Errorf("unsupported report content type")
	}
}

func normalizeContentReportReasonCode(value string) (string, error) {
	switch strings.TrimSpace(value) {
	case "spam", "harassment", "hate", "sexual", "violence", "privacy", "other":
		return strings.TrimSpace(value), nil
	default:
		return "", fmt.Errorf("unsupported report reason code")
	}
}

func findExistingContentReport(
	app core.App,
	reporterID string,
	targetType string,
	targetRecordID string,
) (*core.Record, error) {
	record, err := app.FindFirstRecordByFilter(
		"content_reports",
		"reporter = {:reporter} && targetType = {:targetType} && targetRecordId = {:targetRecordId}",
		dbx.Params{
			"reporter":       reporterID,
			"targetType":     targetType,
			"targetRecordId": targetRecordID,
		},
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}

	return record, nil
}

func resolveContentReportTarget(
	app core.App,
	reporterID string,
	targetType string,
	recordID string,
	allowExistingReportUpdate bool,
) (*contentReportTarget, error) {
	switch targetType {
	case "visit":
		record, err := app.FindRecordById("visits", recordID)
		if err != nil {
			return nil, apis.NewNotFoundError("visit not found", err)
		}

		targetUserID := strings.TrimSpace(record.GetString("user"))
		if targetUserID == "" {
			return nil, apis.NewNotFoundError("visit not found", nil)
		}

		if !canReportVisit(app, reporterID, record, allowExistingReportUpdate) {
			return nil, apis.NewNotFoundError("visit not found", nil)
		}

		return &contentReportTarget{
			record:           record,
			targetCollection: "visits",
			targetType:       "visit",
			targetUserID:     targetUserID,
		}, nil
	case "quick-track":
		record, err := app.FindRecordById("food_items", recordID)
		if err != nil {
			return nil, apis.NewNotFoundError("quick track not found", err)
		}
		if !record.GetBool("isQuickTrack") {
			return nil, apis.NewNotFoundError("quick track not found", nil)
		}

		targetUserID := strings.TrimSpace(record.GetString("user"))
		if targetUserID == "" {
			return nil, apis.NewNotFoundError("quick track not found", nil)
		}

		if !canReportQuickTrack(app, reporterID, record, allowExistingReportUpdate) {
			return nil, apis.NewNotFoundError("quick track not found", nil)
		}

		return &contentReportTarget{
			record:           record,
			targetCollection: "food_items",
			targetType:       "quick-track",
			targetUserID:     targetUserID,
		}, nil
	default:
		return nil, apis.NewBadRequestError("unsupported report content type", nil)
	}
}

func canReportVisit(app core.App, reporterID string, record *core.Record, allowExistingReportUpdate bool) bool {
	if record == nil {
		return false
	}

	ownerID := strings.TrimSpace(record.GetString("user"))
	if ownerID == "" || ownerID == reporterID {
		return false
	}

	moderationStatus := strings.TrimSpace(record.GetString("moderationStatus"))
	if allowExistingReportUpdate && moderationStatus == lib.ContentModerationStatusUnderReview {
		return true
	}
	if !lib.IsVisibleContentModerationStatus(moderationStatus) {
		return false
	}

	visibility := strings.TrimSpace(record.GetString("visibility"))
	if visibility == "public" {
		return true
	}
	if visibility != "friends" {
		return false
	}

	isFriend, err := usersAreAcceptedFriends(app, reporterID, ownerID)
	if err != nil {
		return false
	}

	return isFriend
}

func canReportQuickTrack(app core.App, reporterID string, record *core.Record, allowExistingReportUpdate bool) bool {
	if record == nil {
		return false
	}

	ownerID := strings.TrimSpace(record.GetString("user"))
	if ownerID == "" || ownerID == reporterID {
		return false
	}

	moderationStatus := strings.TrimSpace(record.GetString("moderationStatus"))
	if allowExistingReportUpdate && moderationStatus == lib.ContentModerationStatusUnderReview {
		return true
	}
	if !lib.IsVisibleContentModerationStatus(moderationStatus) {
		return false
	}

	visibility := strings.TrimSpace(record.GetString("visibility"))
	if visibility == "public" {
		return true
	}
	if visibility != "friends" {
		return false
	}

	isFriend, err := usersAreAcceptedFriends(app, reporterID, ownerID)
	if err != nil {
		return false
	}

	return isFriend
}

func usersAreAcceptedFriends(app core.App, leftUserID string, rightUserID string) (bool, error) {
	if strings.TrimSpace(leftUserID) == "" || strings.TrimSpace(rightUserID) == "" {
		return false, nil
	}

	record, err := app.FindFirstRecordByFilter(
		"friendships",
		"status = 'accepted' && ((user = {:leftUser} && friend = {:rightUser}) || (user = {:rightUser} && friend = {:leftUser}))",
		dbx.Params{
			"leftUser":  leftUserID,
			"rightUser": rightUserID,
		},
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return false, nil
		}
		return false, err
	}

	return record != nil, nil
}

func resolveReportedContentLabel(app core.App, targetType string, record *core.Record) (string, error) {
	if record == nil {
		return "", nil
	}

	switch targetType {
	case "visit":
		restaurantID := strings.TrimSpace(record.GetString("restaurant"))
		if restaurantID == "" {
			return "Visit", nil
		}

		restaurant, err := app.FindRecordById("restaurants", restaurantID)
		if err != nil {
			return "", err
		}

		if name := strings.TrimSpace(restaurant.GetString("name")); name != "" {
			return name, nil
		}

		return "Visit", nil
	case "quick-track":
		if name := strings.TrimSpace(record.GetString("name")); name != "" {
			return name, nil
		}
		if location := strings.TrimSpace(record.GetString("location_text")); location != "" {
			return location, nil
		}
		return "Quick Track", nil
	default:
		return lib.ResolveAuditTargetLabel(record, lib.RecordAuditSnapshot(record)), nil
	}
}
