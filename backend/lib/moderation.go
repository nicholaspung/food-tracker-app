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

	ModerationCaseStatusOpen               = "open"
	ModerationCaseStatusUnderReview        = "under_review"
	ModerationCaseStatusReviewed           = "reviewed"
	ModerationCaseStatusHidden             = "hidden"
	ModerationCaseStatusRemoved            = "removed"
	ModerationCaseStatusRestored           = "restored"
	ModerationCaseStatusEscalated          = "escalated"
	ModerationCaseStatusRestrictedVisibility = "restricted_visibility"
	ModerationCaseStatusWarned             = "warned"
	ModerationCaseStatusRestricted         = "restricted"
	ModerationCaseStatusBanned             = "banned"

	ModerationActionMarkReviewed      = "mark_reviewed"
	ModerationActionQuarantine        = "quarantine"
	ModerationActionHide              = "hide"
	ModerationActionRemove            = "remove"
	ModerationActionRestore           = "restore"
	ModerationActionEscalate          = "escalate"
	ModerationActionRestrictVisibility = "restrict_visibility"
	ModerationActionWarn              = "warn"
	ModerationActionRestrict          = "restrict"
	ModerationActionBan               = "ban"

	ModerationAppealStateNone      = "none"
	ModerationAppealStateRequested = "requested"
	ModerationAppealStateApproved  = "approved"
	ModerationAppealStateDenied    = "denied"
)

type ModerationCaseInput struct {
	Action          string
	AppealState     string
	AssignedAdminID string
	ModeratorNote   string
	ReasonCode      string
	Status          string
	TargetCollection string
	TargetLabel     string
	TargetRecordID  string
	TargetType      string
	TargetUserID    string
	UserNotice      string
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
			"targetType":    targetType,
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
