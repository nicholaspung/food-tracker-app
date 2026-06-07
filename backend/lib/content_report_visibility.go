package lib

import (
	"database/sql"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// ReportedContentHiddenForViewer returns true when the viewer has reported the
// target content, without applying global visibility changes for other users.
func ReportedContentHiddenForViewer(app core.App, reporterID string, collectionName string, record *core.Record) (bool, error) {
	if app == nil || record == nil || strings.TrimSpace(reporterID) == "" {
		return false, nil
	}

	switch collectionName {
	case "visits":
		return ContentReportExistsForViewer(app, reporterID, "visit", record.Id)
	case "food_items":
		if IsFoodProductForReportVisibility(record) {
			if hidden, err := ContentReportExistsForViewer(app, reporterID, "food-product", record.Id); hidden || err != nil {
				return hidden, err
			}
		}
		if visitID := strings.TrimSpace(record.GetString("visit")); visitID != "" {
			return ContentReportExistsForViewer(app, reporterID, "visit", visitID)
		}
	case "visit_photos":
		if visitID := strings.TrimSpace(record.GetString("visit")); visitID != "" {
			if hidden, err := ContentReportExistsForViewer(app, reporterID, "visit", visitID); hidden || err != nil {
				return hidden, err
			}
		}
		if foodItemID := strings.TrimSpace(record.GetString("food_item")); foodItemID != "" {
			return ContentReportExistsForViewer(app, reporterID, "food-product", foodItemID)
		}
	}

	return false, nil
}

func IsFoodProductForReportVisibility(record *core.Record) bool {
	if record == nil {
		return false
	}

	return strings.TrimSpace(record.GetString("itemType")) == "food-product" || strings.TrimSpace(record.GetString("visit")) == ""
}

func ContentReportExistsForViewer(app core.App, reporterID string, targetType string, targetRecordID string) (bool, error) {
	if strings.TrimSpace(reporterID) == "" || strings.TrimSpace(targetType) == "" || strings.TrimSpace(targetRecordID) == "" {
		return false, nil
	}

	record, err := app.FindFirstRecordByFilter(
		"content_reports",
		"reporter = {:reporter} && targetType = {:targetType} && targetRecordId = {:targetRecordId}",
		dbx.Params{
			"reporter":       strings.TrimSpace(reporterID),
			"targetType":     strings.TrimSpace(targetType),
			"targetRecordId": strings.TrimSpace(targetRecordID),
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
