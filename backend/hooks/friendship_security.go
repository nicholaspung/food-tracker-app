package hooks

import (
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

var friendshipUpdateIgnoredFields = map[string]struct{}{
	"updated": {},
}

// RegisterFriendshipSecurityHooks enforces participant and status constraints
// on raw friendship collection requests.
func RegisterFriendshipSecurityHooks(app core.App) {
	app.OnRecordCreateRequest("friendships").BindFunc(func(e *core.RecordRequestEvent) error {
		return EnforceFriendshipCreateRequestSecurity(e)
	})

	app.OnRecordUpdateRequest("friendships").BindFunc(func(e *core.RecordRequestEvent) error {
		return EnforceFriendshipUpdateRequestSecurity(e)
	})
}

func EnforceFriendshipCreateRequestSecurity(e *core.RecordRequestEvent) error {
	if e == nil {
		return nil
	}

	if e.HasSuperuserAuth() {
		return e.Next()
	}

	if e.Auth == nil {
		return apis.NewUnauthorizedError("authentication required", nil)
	}

	requesterID := strings.TrimSpace(e.Auth.Id)
	userID := strings.TrimSpace(e.Record.GetString("user"))
	friendID := strings.TrimSpace(e.Record.GetString("friend"))
	status := strings.TrimSpace(e.Record.GetString("status"))

	if userID != requesterID {
		return apis.NewForbiddenError("friend requests must be created by the authenticated user", nil)
	}

	if friendID == "" {
		return apis.NewBadRequestError("friend is required", nil)
	}

	if friendID == requesterID {
		return apis.NewBadRequestError("cannot create a friendship with yourself", nil)
	}

	if status != "pending" {
		return apis.NewForbiddenError("friend requests must start in pending status", nil)
	}

	if err := ensureNoExistingFriendshipPair(e.App, requesterID, friendID, ""); err != nil {
		if errors.Is(err, errExistingFriendshipPair) {
			return apis.NewBadRequestError("friend request already exists", nil)
		}

		return apis.NewApiError(500, "failed to validate friend request", err)
	}

	return e.Next()
}

func EnforceFriendshipUpdateRequestSecurity(e *core.RecordRequestEvent) error {
	if e == nil {
		return nil
	}

	if e.HasSuperuserAuth() {
		return e.Next()
	}

	if e.Auth == nil {
		return apis.NewUnauthorizedError("authentication required", nil)
	}

	original := e.Record.Original()
	if original == nil {
		return apis.NewBadRequestError("existing friendship is required", nil)
	}

	if strings.TrimSpace(original.GetString("friend")) != strings.TrimSpace(e.Auth.Id) {
		return apis.NewForbiddenError("only the invited user can update this friendship", nil)
	}

	if strings.TrimSpace(e.Record.GetString("user")) != strings.TrimSpace(original.GetString("user")) ||
		strings.TrimSpace(e.Record.GetString("friend")) != strings.TrimSpace(original.GetString("friend")) {
		return apis.NewForbiddenError("friendship participants cannot be changed", nil)
	}

	changedFields := changedRecordFields(e.Record, friendshipUpdateIgnoredFields)
	if len(changedFields) == 0 {
		return e.Next()
	}

	if len(changedFields) != 1 || changedFields[0] != "status" {
		return apis.NewForbiddenError("only the friendship status can be updated", nil)
	}

	if strings.TrimSpace(original.GetString("status")) != "pending" {
		return apis.NewForbiddenError("only pending friendships can be updated", nil)
	}

	switch strings.TrimSpace(e.Record.GetString("status")) {
	case "accepted", "blocked":
		return e.Next()
	default:
		return apis.NewBadRequestError("friendship status must be accepted or blocked", nil)
	}
}

var errExistingFriendshipPair = errors.New("friendship pair already exists")

func ensureNoExistingFriendshipPair(app core.App, leftUserID string, rightUserID string, excludeID string) error {
	filter := "((user = {:leftUser} && friend = {:rightUser}) || (user = {:rightUser} && friend = {:leftUser}))"
	params := dbx.Params{
		"leftUser":  leftUserID,
		"rightUser": rightUserID,
	}

	if trimmedExcludeID := strings.TrimSpace(excludeID); trimmedExcludeID != "" {
		filter += " && id != {:excludeId}"
		params["excludeId"] = trimmedExcludeID
	}

	record, err := app.FindFirstRecordByFilter("friendships", filter, params)
	if err == nil && record != nil {
		return errExistingFriendshipPair
	}
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return fmt.Errorf("resolve existing friendship: %w", err)
	}

	return nil
}
