package handlers

import (
	"crypto/rand"
	"encoding/base32"
	"log"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

// RegisterInviteCodeHandlers registers all invite code related endpoints
func RegisterInviteCodeHandlers(se *core.ServeEvent, app core.App) {
	// Custom API endpoint: Get inviter info from invite code (public endpoint for signup)
	se.Router.GET("/api/invite-codes/inviter/{code}", func(e *core.RequestEvent) error {
		inviteCode := strings.TrimSpace(e.Request.PathValue("code"))
		if inviteCode == "" {
			return apis.NewBadRequestError("invite code is required", nil)
		}

		// Find the invite code
		inviteCodeRecord, err := app.FindFirstRecordByFilter(
			"invite_codes",
			"LOWER(code) = LOWER({:code})",
			map[string]any{"code": inviteCode},
		)

		if err != nil || inviteCodeRecord == nil {
			return apis.NewNotFoundError("invite code not found", nil)
		}

		// Get the creator user ID
		createdBy := inviteCodeRecord.GetString("createdBy")
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
				"id":    inviterRecord.Id,
				"email": inviterRecord.Email(),
				"name":  inviterRecord.GetString("name"),
			},
		})
	})

	// Custom API endpoint: Find user by friend code
	se.Router.GET("/api/users/by-friend-code/{code}", func(e *core.RequestEvent) error {
		authRecord := e.Auth
		if authRecord == nil {
			return apis.NewUnauthorizedError("authentication required", nil)
		}

		friendCode := e.Request.PathValue("code")
		if friendCode == "" {
			return apis.NewBadRequestError("friend code is required", nil)
		}

		// Friend code is the first 8 chars of user ID (uppercase, alphanumeric only)
		// We need to search all users to find matching ID
		users, err := app.FindRecordsByFilter(
			"users",
			"", // no filter - we'll check IDs in Go
			"",
			0,
			0,
			nil,
		)

		if err != nil {
			return apis.NewApiError(500, "failed to search users", err)
		}

		// Find user whose ID matches the friend code
		for _, user := range users {
			// Generate friend code from user ID
			cleanId := ""
			for _, char := range user.Id {
				if (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || (char >= '0' && char <= '9') {
					cleanId += string(char)
				}
			}
			cleanId = strings.ToUpper(cleanId)
			if len(cleanId) > 8 {
				cleanId = cleanId[:8]
			}

			if cleanId == strings.ToUpper(friendCode) {
				// Found matching user
				return e.JSON(200, map[string]any{
					"found": true,
					"user": map[string]any{
						"id":    user.Id,
						"email": user.Email(),
						"name":  user.GetString("name"),
					},
				})
			}
		}

		// No matching user found
		return e.JSON(200, map[string]any{
			"found": false,
		})
	})

	// Custom API endpoint: Get unused invite codes for authenticated user
	se.Router.GET("/api/invite-codes", func(e *core.RequestEvent) error {
		authRecord := e.Auth
		log.Printf("GET /api/invite-codes - Auth record: %v", authRecord)
		if authRecord == nil {
			log.Printf("GET /api/invite-codes - No auth record found")
			return apis.NewUnauthorizedError("authentication required", nil)
		}
		log.Printf("GET /api/invite-codes - User ID: %s", authRecord.Id)

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
			log.Printf("GET /api/invite-codes - Error fetching records: %v", err)
			return apis.NewApiError(500, "failed to fetch invite codes: "+err.Error(), err)
		}

		log.Printf("GET /api/invite-codes - Found %d records", len(records))

		// Map records to simple response format with lock status
		codes := make([]map[string]any, len(records))
		for i, record := range records {
			locked := false
			lockedUntil := ""
			lockedUntilStr := record.GetString("locked_until")
			log.Printf("Code %s - locked_until field: '%s'", record.GetString("code"), lockedUntilStr)

			if lockedUntilStr != "" {
				lockedUntilTime := record.GetDateTime("locked_until")
				log.Printf("Code %s - parsed time: %v, isZero: %v", record.GetString("code"), lockedUntilTime, lockedUntilTime.IsZero())

				if !lockedUntilTime.IsZero() && lockedUntilTime.Time().After(time.Now()) {
					locked = true
					lockedUntil = lockedUntilStr
					log.Printf("Code %s - LOCKED (until %v)", record.GetString("code"), lockedUntilTime.Time())
				} else {
					log.Printf("Code %s - NOT locked (expired or zero time)", record.GetString("code"))
				}
			} else {
				log.Printf("Code %s - NOT locked (no locked_until)", record.GetString("code"))
			}

			codes[i] = map[string]any{
				"id":          record.Id,
				"code":        record.GetString("code"),
				"locked":      locked,
				"lockedUntil": lockedUntil,
			}
			log.Printf("Code %s - Final data: locked=%v, lockedUntil=%s", record.GetString("code"), locked, lockedUntil)
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
			log.Printf("Error saving invite code %s for user %s: %v", code, userId, err)
			continue
		}

		log.Printf("Generated invite code %s for user %s", code, userId)
	}

	return nil
}
