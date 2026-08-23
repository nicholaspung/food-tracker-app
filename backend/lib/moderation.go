package lib

import (
	"fmt"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase/core"
)

const (
	ContentModerationStatusActive      = "active"
	ContentModerationStatusReviewed    = "reviewed"
	ContentModerationStatusUnderReview = "under_review"
	ContentModerationStatusHidden      = "hidden"
	ContentModerationStatusRemoved     = "removed"
	ContentModerationStatusEscalated   = "escalated"

	UserModerationStateActive     = "active"
	UserModerationStateWarned     = "warned"
	UserModerationStateRestricted = "restricted"
	UserModerationStateBanned     = "banned"

	ContentModerationModeNormal    = "normal"
	ContentModerationModePreReview = "pre_review"

	ModerationCaseStatusOpen                 = "open"
	ModerationCaseStatusUnderReview          = "under_review"
	ModerationCaseStatusReviewed             = "reviewed"
	ModerationCaseStatusHidden               = "hidden"
	ModerationCaseStatusRemoved              = "removed"
	ModerationCaseStatusRestored             = "restored"
	ModerationCaseStatusEscalated            = "escalated"
	ModerationCaseStatusRestrictedVisibility = "restricted_visibility"
	ModerationCaseStatusWarned               = "warned"
	ModerationCaseStatusRestricted           = "restricted"
	ModerationCaseStatusBanned               = "banned"

	ModerationActionMarkReviewed       = "mark_reviewed"
	ModerationActionQuarantine         = "quarantine"
	ModerationActionHide               = "hide"
	ModerationActionRemove             = "remove"
	ModerationActionRestore            = "restore"
	ModerationActionEscalate           = "escalate"
	ModerationActionRestrictVisibility = "restrict_visibility"
	ModerationActionWarn               = "warn"
	ModerationActionRestrict           = "restrict"
	ModerationActionBan                = "ban"

	ModerationAppealStateNone      = "none"
	ModerationAppealStateRequested = "requested"
	ModerationAppealStateApproved  = "approved"
	ModerationAppealStateDenied    = "denied"
)

type ModerationCaseInput struct {
	Action           string
	AppealState      string
	AssignedAdminID  string
	ModeratorNote    string
	ReasonCode       string
	Status           string
	TargetCollection string
	TargetLabel      string
	TargetRecordID   string
	TargetType       string
	TargetUserID     string
	UserNotice       string
}

type ContentReportInput struct {
	ModerationCaseID string
	Notes            string
	ReasonCode       string
	ReporterID       string
	TargetCollection string
	TargetRecordID   string
	TargetType       string
	TargetUserID     string
}

var postingModerationCollections = map[string]struct{}{
	"visits":           {},
	"food_items":       {},
	"notes":            {},
	"restaurant_lists": {},
	"list_items":       {},
}

var photoModerationCollections = map[string]struct{}{
	"visit_photos": {},
	"note_photos":  {},
}

func IsPostingModerationCollection(collectionName string) bool {
	_, ok := postingModerationCollections[strings.TrimSpace(collectionName)]
	return ok
}

func IsPhotoModerationCollection(collectionName string) bool {
	_, ok := photoModerationCollections[strings.TrimSpace(collectionName)]
	return ok
}

func ContentWriteRequiresPreReview(user *core.Record, collectionName string) bool {
	return IsUserInPreReviewMode(user) &&
		(IsPostingModerationCollection(collectionName) || IsPhotoModerationCollection(collectionName))
}

func ApplyPreReviewModerationPolicy(user *core.Record, record *core.Record) bool {
	if user == nil || record == nil || !ContentWriteRequiresPreReview(user, record.Collection().Name) {
		return false
	}

	original := record.Original()
	if original.Id != "" && isProtectedContentModerationStatus(original.GetString("moderationStatus")) {
		return false
	}

	record.Set("moderationStatus", ContentModerationStatusUnderReview)
	record.Set("moderatedAt", "")
	record.Set("moderatedBy", "")
	return true
}

func isProtectedContentModerationStatus(status string) bool {
	switch strings.TrimSpace(status) {
	case ContentModerationStatusHidden,
		ContentModerationStatusRemoved,
		ContentModerationStatusEscalated:
		return true
	default:
		return false
	}
}

func IsVisibleContentModerationStatus(status string) bool {
	switch strings.TrimSpace(status) {
	case "", ContentModerationStatusActive, ContentModerationStatusReviewed:
		return true
	default:
		return false
	}
}

func IsUserInPreReviewMode(user *core.Record) bool {
	if user == nil {
		return false
	}

	return strings.TrimSpace(user.GetString("contentModerationMode")) == ContentModerationModePreReview
}

func IsUserPostingBlocked(user *core.Record) (bool, string) {
	if user == nil {
		return false, ""
	}

	if strings.TrimSpace(user.GetString("moderationState")) == UserModerationStateBanned {
		return true, "Your account is suspended from posting."
	}

	until := user.GetDateTime("postingSuspendedUntil")
	if !until.IsZero() && until.Time().After(time.Now().UTC()) {
		return true, fmt.Sprintf("Posting is suspended until %s.", until.Time().Format(time.RFC3339))
	}

	return false, ""
}

func IsUserPhotoUploadBlocked(user *core.Record) (bool, string) {
	if user == nil {
		return false, ""
	}

	if strings.TrimSpace(user.GetString("moderationState")) == UserModerationStateBanned {
		return true, "Your account is suspended from uploading photos."
	}

	until := user.GetDateTime("photoSuspendedUntil")
	if !until.IsZero() && until.Time().After(time.Now().UTC()) {
		return true, fmt.Sprintf("Photo uploads are suspended until %s.", until.Time().Format(time.RFC3339))
	}

	return false, ""
}

func ApplyContentModerationState(record *core.Record, status string, moderatorID string) {
	if record == nil {
		return
	}

	record.Set("moderationStatus", strings.TrimSpace(status))
	record.Set("moderatedAt", time.Now().UTC())
	record.Set("moderatedBy", strings.TrimSpace(moderatorID))
}

func UpsertModerationCase(app core.App, input ModerationCaseInput) (*core.Record, error) {
	collection, err := app.FindCollectionByNameOrId("moderation_cases")
	if err != nil {
		return nil, err
	}

	targetType := strings.TrimSpace(input.TargetType)
	targetRecordID := strings.TrimSpace(input.TargetRecordID)
	if targetType == "" || targetRecordID == "" {
		return nil, fmt.Errorf("target type and record id are required")
	}

	existing, err := app.FindFirstRecordByFilter(
		"moderation_cases",
		"targetType = {:targetType} && targetRecordId = {:targetRecordId}",
		map[string]any{
			"targetType":     targetType,
			"targetRecordId": targetRecordID,
		},
	)
	if err != nil {
		existing = nil
	}

	record := existing
	if record == nil {
		record = core.NewRecord(collection)
		record.Set("targetType", targetType)
		record.Set("targetRecordId", targetRecordID)
	}

	record.Set("targetCollection", strings.TrimSpace(input.TargetCollection))
	record.Set("targetLabel", strings.TrimSpace(input.TargetLabel))
	record.Set("targetUser", strings.TrimSpace(input.TargetUserID))
	record.Set("status", normalizeModerationCaseStatus(input.Status))
	record.Set("action", strings.TrimSpace(input.Action))
	record.Set("reasonCode", strings.TrimSpace(input.ReasonCode))
	record.Set("moderatorNote", strings.TrimSpace(input.ModeratorNote))
	record.Set("userNotice", strings.TrimSpace(input.UserNotice))
	record.Set("appealState", normalizeModerationAppealState(input.AppealState))

	if strings.TrimSpace(input.AssignedAdminID) != "" {
		record.Set("assignedAdmin", strings.TrimSpace(input.AssignedAdminID))
		if record.GetDateTime("assignedAt").IsZero() {
			record.Set("assignedAt", time.Now().UTC())
		}
	}

	if isModerationCaseResolved(record.GetString("status")) {
		record.Set("resolvedAt", time.Now().UTC())
	} else {
		record.Set("resolvedAt", "")
	}

	if err := app.Save(record); err != nil {
		return nil, err
	}

	return record, nil
}

func UpsertPreReviewModerationCase(app core.App, record *core.Record) (*core.Record, error) {
	if record == nil {
		return nil, fmt.Errorf("record is required")
	}

	collectionName := record.Collection().Name
	return UpsertModerationCase(app, ModerationCaseInput{
		Action:           ModerationActionQuarantine,
		ReasonCode:       "pre_review",
		Status:           ModerationCaseStatusUnderReview,
		TargetCollection: collectionName,
		TargetLabel:      ResolveAuditTargetLabel(record, RecordAuditSnapshot(record)),
		TargetRecordID:   record.Id,
		TargetType:       mapModerationTargetType(collectionName, record),
		TargetUserID:     resolveModerationTargetUserID(record),
	})
}

func resolveModerationTargetUserID(record *core.Record) string {
	if record == nil {
		return ""
	}

	switch {
	case strings.TrimSpace(record.GetString("user")) != "":
		return strings.TrimSpace(record.GetString("user"))
	case strings.TrimSpace(record.GetString("addedBy")) != "":
		return strings.TrimSpace(record.GetString("addedBy"))
	case strings.TrimSpace(record.GetString("createdBy")) != "":
		return strings.TrimSpace(record.GetString("createdBy"))
	default:
		return ""
	}
}

func mapModerationTargetType(collectionName string, record *core.Record) string {
	switch collectionName {
	case "visits":
		return "visit"
	case "food_items":
		if isFoodProductRecord(record) {
			return "food-product"
		}
		return "food-item"
	case "restaurant_lists":
		return "list"
	case "list_items":
		return "list-item"
	case "notes":
		return "note"
	case "visit_photos", "note_photos":
		return "photo"
	default:
		return collectionName
	}
}

func isFoodProductRecord(record *core.Record) bool {
	if record == nil {
		return false
	}

	return strings.TrimSpace(record.GetString("itemType")) == "food-product"
}

func UpsertContentReport(app core.App, input ContentReportInput) (*core.Record, error) {
	collection, err := app.FindCollectionByNameOrId("content_reports")
	if err != nil {
		return nil, err
	}

	reporterID := strings.TrimSpace(input.ReporterID)
	targetType := strings.TrimSpace(input.TargetType)
	targetRecordID := strings.TrimSpace(input.TargetRecordID)
	if reporterID == "" || targetType == "" || targetRecordID == "" {
		return nil, fmt.Errorf("reporter, target type, and target record id are required")
	}

	existing, err := app.FindFirstRecordByFilter(
		"content_reports",
		"reporter = {:reporter} && targetType = {:targetType} && targetRecordId = {:targetRecordId}",
		map[string]any{
			"reporter":       reporterID,
			"targetType":     targetType,
			"targetRecordId": targetRecordID,
		},
	)
	if err != nil {
		existing = nil
	}

	record := existing
	if record == nil {
		record = core.NewRecord(collection)
		record.Set("reporter", reporterID)
		record.Set("targetType", targetType)
		record.Set("targetRecordId", targetRecordID)
	}

	record.Set("targetCollection", strings.TrimSpace(input.TargetCollection))
	record.Set("targetUser", strings.TrimSpace(input.TargetUserID))
	record.Set("moderationCase", strings.TrimSpace(input.ModerationCaseID))
	record.Set("reasonCode", strings.TrimSpace(input.ReasonCode))
	record.Set("notes", strings.TrimSpace(input.Notes))

	if err := app.Save(record); err != nil {
		return nil, err
	}

	return record, nil
}

func normalizeModerationCaseStatus(status string) string {
	switch strings.TrimSpace(status) {
	case
		ModerationCaseStatusOpen,
		ModerationCaseStatusUnderReview,
		ModerationCaseStatusReviewed,
		ModerationCaseStatusHidden,
		ModerationCaseStatusRemoved,
		ModerationCaseStatusRestored,
		ModerationCaseStatusEscalated,
		ModerationCaseStatusRestrictedVisibility,
		ModerationCaseStatusWarned,
		ModerationCaseStatusRestricted,
		ModerationCaseStatusBanned:
		return strings.TrimSpace(status)
	default:
		return ModerationCaseStatusOpen
	}
}

func normalizeModerationAppealState(state string) string {
	switch strings.TrimSpace(state) {
	case
		ModerationAppealStateRequested,
		ModerationAppealStateApproved,
		ModerationAppealStateDenied:
		return strings.TrimSpace(state)
	default:
		return ModerationAppealStateNone
	}
}

func isModerationCaseResolved(status string) bool {
	switch strings.TrimSpace(status) {
	case
		ModerationCaseStatusReviewed,
		ModerationCaseStatusHidden,
		ModerationCaseStatusRemoved,
		ModerationCaseStatusRestored,
		ModerationCaseStatusRestrictedVisibility,
		ModerationCaseStatusWarned,
		ModerationCaseStatusRestricted,
		ModerationCaseStatusBanned:
		return true
	default:
		return false
	}
}
