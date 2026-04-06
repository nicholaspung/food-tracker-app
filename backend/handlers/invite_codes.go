package handlers

import (
	"crypto/rand"
	"database/sql"
	"encoding/base32"
	"errors"
	"log"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"

	"myapp/lib"
)

// RegisterInviteCodeHandlers registers all invite code related endpoints
func RegisterInviteCodeHandlers(se *core.ServeEvent, app core.App) {
	// Custom API endpoint: Get inviter info from invite code (public endpoint for signup)
	se.Router.GET("/api/invite-codes/inviter/{code}", func(e *core.RequestEvent) error {
		inviteCode := strings.TrimSpace(e.Request.PathValue("code"))
		if inviteCode == "" {
			return apis.NewBadRequestError("invite code is required", nil)
		}
		if len(inviteCode) > 32 {
			return apis.NewBadRequestError("invite code is invalid", nil)
		}

		var inviteLookup struct {
			CreatedBy sql.NullString `db:"createdBy"`
		}

		err := app.DB().NewQuery(`
			SELECT createdBy
			FROM invite_codes
			WHERE LOWER(code) = LOWER({:code})
			LIMIT 1
		`).
			Bind(dbx.Params{"code": inviteCode}).
			One(&inviteLookup)
		if errors.Is(err, sql.ErrNoRows) {
			return apis.NewNotFoundError("invite code not found", nil)
		}
		if err != nil {
			return apis.NewApiError(500, "failed to look up invite code", err)
		}

		// Get the creator user ID
		createdBy := strings.TrimSpace(inviteLookup.CreatedBy.String)
		if createdBy == "" {
			// No creator (initial invite code)
			return e.JSON(200, map[string]any{
				"hasInviter": false,
			})
		}

		// Fetch the creator user record
		inviterRecord, err := app.FindRecordById("users", createdBy)
		if err != nil {
			return apis.NewNotFoundError("inviter user not found", nil)
		}

		// Return inviter info (email and name are safe to expose here since it's for friend suggestion)
		return e.JSON(200, map[string]any{
			"hasInviter": true,
			"inviter": map[string]any{
				"id":          inviterRecord.Id,
				"displayName": lib.ResolveUserDisplayName(inviterRecord),
			},
		})
	})

	// Custom API endpoint: Find user by friend code
	se.Router.GET("/api/users/by-friend-code/{code}", func(e *core.RequestEvent) error {
		authRecord := e.Auth
		if authRecord == nil {
			return apis.NewUnauthorizedError("authentication required", nil)
		}

		friendCode := lib.NormalizeFriendCode(e.Request.PathValue("code"))
		if friendCode == "" {
			return apis.NewBadRequestError("friend code is required", nil)
		}
		if len(friendCode) != lib.FriendCodeLength {
			return apis.NewBadRequestError("friend code is invalid", nil)
		}

		user, err := app.FindFirstRecordByFilter(
			"users",
			"friendCode = {:code}",
			map[string]any{"code": friendCode},
		)
		if err == nil && user != nil {
			return e.JSON(200, map[string]any{
				"found": true,
				"user": map[string]any{
					"id":          user.Id,
					"displayName": lib.ResolveUserDisplayName(user),
				},
			})
		}
		if err != nil && !strings.Contains(strings.ToLower(err.Error()), "no rows") {
			return apis.NewApiError(500, "failed to search users", err)
		}

		// No matching user found
		return e.JSON(200, map[string]any{
			"found": false,
		})
	})

	// Custom API endpoint: Get unused invite codes for authenticated user
	se.Router.GET("/api/invite-codes", func(e *core.RequestEvent) error {
		authRecord := e.Auth
		if authRecord == nil {
			return apis.NewUnauthorizedError("authentication required", nil)
		}

		// Find all unused codes created by this user (including locked ones)
		records, err := app.FindRecordsByFilter(
			"invite_codes",
			"createdBy = {:userId} && used = false",
			"", // no sorting
			0,  // no limit
			0,  // no offset
			map[string]any{"userId": authRecord.Id},
		)

		if err != nil {
			log.Printf("Invite code list lookup failed for user %s: %v", authRecord.Id, err)
			return apis.NewApiError(500, "failed to fetch invite codes: "+err.Error(), err)
		}

		// Map records to simple response format with lock status
		codes := make([]map[string]any, len(records))
		for i, record := range records {
			locked := false
			lockedUntil := ""
			lockedUntilStr := record.GetString("locked_until")

			if lockedUntilStr != "" {
				lockedUntilTime := record.GetDateTime("locked_until")

				if !lockedUntilTime.IsZero() && lockedUntilTime.Time().After(time.Now()) {
					locked = true
					lockedUntil = lockedUntilStr
				}
			}

			codes[i] = map[string]any{
				"id":          record.Id,
				"code":        record.GetString("code"),
				"locked":      locked,
				"lockedUntil": lockedUntil,
			}
		}

		return e.JSON(200, map[string]any{
			"codes": codes,
		})
	})

	// Custom API endpoint: Lock an invite code for 7 days
	se.Router.POST("/api/invite-codes/lock", func(e *core.RequestEvent) error {
		authRecord := e.Auth
		if authRecord == nil {
			return apis.NewUnauthorizedError("authentication required", nil)
		}

		// Parse request body
		data := struct {
			CodeId string `json:"codeId"`
		}{}
		if err := e.BindBody(&data); err != nil {
			return apis.NewBadRequestError("invalid request body", err)
		}

		if data.CodeId == "" {
			return apis.NewBadRequestError("codeId is required", nil)
		}

		// Find the invite code
		record, err := app.FindRecordById("invite_codes", data.CodeId)
		if err != nil {
			return apis.NewNotFoundError("invite code not found", err)
		}

		// Verify the user owns this code
		if record.GetString("createdBy") != authRecord.Id {
			return apis.NewForbiddenError("you don't own this invite code", nil)
		}

		// Verify the code is not already used
		if record.GetBool("used") {
			return apis.NewBadRequestError("this invite code has already been used", nil)
		}

		// Allow re-locking - extend the lock period if already locked
		// This allows users to copy the code again if needed

		// Set locked_until to 7 days from now
		sevenDaysFromNow := time.Now().AddDate(0, 0, 7)
		record.Set("locked_until", sevenDaysFromNow)

		// Save the record
		if err := app.Save(record); err != nil {
			return apis.NewApiError(500, "failed to lock invite code", err)
		}

		return e.JSON(200, map[string]any{
			"success":     true,
			"lockedUntil": sevenDaysFromNow,
			"message":     "Invite code locked for 7 days",
		})
	})

	// Custom API endpoint: Generate invite codes (initial user only)
	se.Router.POST("/api/invite-codes/generate", func(e *core.RequestEvent) error {
		authRecord := e.Auth
		if authRecord == nil {
			return apis.NewUnauthorizedError("authentication required", nil)
		}

		// Check if this user is the initial user
		isInitialUser := authRecord.GetBool("isInitialUser")
		if !isInitialUser {
			return apis.NewForbiddenError("only the initial user can generate unlimited invite codes", nil)
		}

		// Generate 5 new invite codes for this user
		if err := GenerateInviteCodesForUser(app, authRecord.Id, ""); err != nil {
			return apis.NewApiError(500, "failed to generate invite codes", err)
		}

		return e.JSON(200, map[string]any{
			"success":   true,
			"generated": 5,
			"message":   "Successfully generated 5 new invite codes",
		})
	})
}

// generateRandomCode creates a random invite code
// If prefix is provided, it will be prepended to the generated code
func generateRandomCode(prefix string) (string, error) {
	// Generate 10 random bytes (will encode to ~16 characters)
	bytes := make([]byte, 10)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}

	// Encode to base32 (removes ambiguous characters)
	code := base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(bytes)

	// Convert to lowercase and take first 12 characters
	code = strings.ToLower(code)[:12]

	// Prepend prefix if provided
	if prefix != "" {
		code = prefix + code
	}

	return code, nil
}

// GenerateInviteCodesForUser creates 5 invite codes for a user
// If the parent invite code starts with "TEST", the generated codes will also have the TEST prefix
// This function is exported so it can be used by hooks in main.go
func GenerateInviteCodesForUser(app core.App, userId string, parentInviteCode string) error {
	// Get the invite_codes collection
	collection, err := app.FindCollectionByNameOrId("invite_codes")
	if err != nil {
		return err
	}

	// Check if parent invite code is a test code
	var prefix string
	if strings.HasPrefix(strings.ToUpper(parentInviteCode), "TEST") {
		prefix = "TEST"
		log.Printf("Parent invite code is a test code, generated codes will have TEST prefix")
	}

	// Generate 5 codes
	generatedCount := 0
	for i := 0; i < 5; i++ {
		// Generate random code with prefix if applicable
		code, err := generateRandomCode(prefix)
		if err != nil {
			log.Printf("Error generating random code: %v", err)
			continue
		}

		// Create the invite code record
		record := core.NewRecord(collection)
		record.Set("code", code)
		record.Set("used", false)
		record.Set("createdBy", userId)

		// Save the record
		if err := app.Save(record); err != nil {
			log.Printf("Error saving generated invite code for user %s: %v", userId, err)
			continue
		}

		generatedCount++
	}

	log.Printf("Generated %d invite codes for user %s", generatedCount, userId)

	return nil
}
