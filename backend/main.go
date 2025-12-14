package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"strings"
	"time"

	"github.com/joho/godotenv"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/plugins/migratecmd"

	_ "myapp/migrations"
	"myapp/handlers"
)

func main() {
	// Load environment variables from .env file
	if err := godotenv.Load(); err != nil {
		log.Printf("Warning: Error loading .env file: %v", err)
	}

	app := pocketbase.New()

	// Register migrations with automigrate enabled when running with `go run`
	isGoRun := strings.HasPrefix(os.Args[0], os.TempDir())
	migratecmd.MustRegister(app, app.RootCmd, migratecmd.Config{
		Automigrate: isGoRun,
	})

	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		// Register all API handlers
		handlers.RegisterInviteCodeHandlers(se, app)
		handlers.RegisterUserHandlers(se, app)
		handlers.RegisterMenuParsingHandlers(se, app)
		handlers.RegisterPlacesHandlers(se, app)

		// Serves static files from the provided public dir (if exists)
		// IMPORTANT: This must be registered LAST as it's a catch-all route
		se.Router.GET("/{path...}", apis.Static(os.DirFS("./pb_public"), false))

		return se.Next()
	})

	// Global map to store invite code info for marking as used after user creation
	type inviteCodeInfo struct {
		recordId string
		code     string
	}
	var pendingInviteCodes = make(map[string]inviteCodeInfo) // userEmail -> inviteCodeInfo

	// Rate limiting for invite code attempts
	type rateLimitInfo struct {
		attempts  int
		lockedUntil int64 // Unix timestamp
	}
	var inviteCodeAttempts = make(map[string]*rateLimitInfo) // IP -> rateLimitInfo
	const (
		maxAttempts     = 5      // Maximum attempts before lockout
		lockoutDuration = 15 * 60 // 15 minutes in seconds
	)

	// Hook to validate invite code before user creation
	app.OnRecordCreate("users").BindFunc(func(e *core.RecordEvent) error {
		// Try to get invite code from the HTTP request if this is called from an API request
		// We'll extract it from the form data during API calls
		return e.Next()
	})

	// Hook to validate invite code from API requests
	app.OnRecordCreateRequest("users").BindFunc(func(e *core.RecordRequestEvent) error {
		// Get client IP address for rate limiting
		clientIP := e.Request.RemoteAddr
		// Strip port if present
		if idx := strings.LastIndex(clientIP, ":"); idx != -1 {
			clientIP = clientIP[:idx]
		}

		// Check rate limiting
		now := time.Now().Unix()
		if rateLimitData, exists := inviteCodeAttempts[clientIP]; exists {
			// Check if still locked out
			if rateLimitData.lockedUntil > now {
				remainingSeconds := rateLimitData.lockedUntil - now
				remainingMinutes := remainingSeconds / 60
				log.Printf("Rate limit: IP %s is locked out for %d more seconds", clientIP, remainingSeconds)
				return apis.NewBadRequestError(fmt.Sprintf("too many failed attempts, please try again in %d minutes", remainingMinutes), nil)
			}

			// Lockout expired, reset attempts
			if rateLimitData.lockedUntil > 0 && rateLimitData.lockedUntil <= now {
				rateLimitData.attempts = 0
				rateLimitData.lockedUntil = 0
			}
		}

		// Read and parse JSON body to get invite code
		bodyBytes, err := io.ReadAll(e.Request.Body)
		if err != nil {
			return apis.NewBadRequestError("failed to read request body", nil)
		}

		// Restore the body so PocketBase can read it later
		e.Request.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))

		// Parse JSON body
		var requestData map[string]any
		if err := json.Unmarshal(bodyBytes, &requestData); err != nil {
			return apis.NewBadRequestError("invalid JSON in request body", nil)
		}

		// Get invite code from JSON
		inviteCode, ok := requestData["inviteCode"].(string)
		if !ok || inviteCode == "" {
			return apis.NewBadRequestError("invite code is required", nil)
		}

		// Find the invite code in the database
		inviteCodeRecord, err := app.FindFirstRecordByFilter(
			"invite_codes",
			"code = {:code} && used = false",
			map[string]any{"code": inviteCode},
		)

		if err != nil || inviteCodeRecord == nil {
			// Invalid invite code - increment failed attempts
			if inviteCodeAttempts[clientIP] == nil {
				inviteCodeAttempts[clientIP] = &rateLimitInfo{attempts: 0, lockedUntil: 0}
			}
			inviteCodeAttempts[clientIP].attempts++

			log.Printf("Rate limit: IP %s failed attempt %d/%d", clientIP, inviteCodeAttempts[clientIP].attempts, maxAttempts)

			// Check if should be locked out
			if inviteCodeAttempts[clientIP].attempts >= maxAttempts {
				inviteCodeAttempts[clientIP].lockedUntil = now + lockoutDuration
				log.Printf("Rate limit: IP %s locked out for %d minutes", clientIP, lockoutDuration/60)
				return apis.NewBadRequestError("too many failed attempts, please try again in 15 minutes", nil)
			}

			return apis.NewBadRequestError("invalid or already used invite code", nil)
		}

		// Valid invite code - clear any previous failed attempts
		if inviteCodeAttempts[clientIP] != nil {
			inviteCodeAttempts[clientIP].attempts = 0
			inviteCodeAttempts[clientIP].lockedUntil = 0
		}

		// Store the invite code info for marking as used after creation
		// We'll use the user's email as a temporary key since we don't have the ID yet
		userEmail, _ := requestData["email"].(string)
		if userEmail != "" {
			pendingInviteCodes[userEmail] = inviteCodeInfo{
				recordId: inviteCodeRecord.Id,
				code:     inviteCode,
			}
		}

		return e.Next()
	})

	// Hook to delete unused invite codes before user deletion
	app.OnRecordDelete("users").BindFunc(func(e *core.RecordEvent) error {
		userId := e.Record.Id
		log.Printf("User %s is being deleted, cleaning up unused invite codes...", userId)

		// Find all unused invite codes created by this user
		unusedCodes, err := app.FindRecordsByFilter(
			"invite_codes",
			"createdBy = {:userId} && used = false",
			"",
			0,
			0,
			map[string]any{"userId": userId},
		)

		if err != nil {
			log.Printf("Error finding unused invite codes for user %s: %v", userId, err)
			// Don't block deletion if we can't find codes
			return e.Next()
		}

		// Delete each unused code
		deletedCount := 0
		for _, code := range unusedCodes {
			if err := app.Delete(code); err != nil {
				log.Printf("Error deleting invite code %s: %v", code.Id, err)
			} else {
				deletedCount++
			}
		}

		log.Printf("Deleted %d unused invite codes for user %s", deletedCount, userId)
		return e.Next()
	})

	// Hook to mark invite code as used and generate new codes after successful user creation
	app.OnRecordAfterCreateSuccess("users").BindFunc(func(e *core.RecordEvent) error {
		// Get user email to look up the pending invite code
		userEmail := e.Record.Email()
		inviteCodeData, exists := pendingInviteCodes[userEmail]

		var parentInviteCode string

		if exists && inviteCodeData.recordId != "" {
			// Clean up the pending map
			delete(pendingInviteCodes, userEmail)

			// Store the parent invite code for later use
			parentInviteCode = inviteCodeData.code

			// Find and update the invite code
			inviteCodeRecord, err := app.FindRecordById("invite_codes", inviteCodeData.recordId)
			if err != nil {
				log.Printf("Error finding invite code: %v", err)
			} else {
				// Check if this invite code has no creator (initial invite code)
				createdBy := inviteCodeRecord.GetString("createdBy")
				if createdBy == "" {
					// This is the initial user, set the flag
					e.Record.Set("isInitialUser", true)
					if err := app.Save(e.Record); err != nil {
						log.Printf("Error setting isInitialUser flag: %v", err)
					} else {
						log.Printf("Set isInitialUser=true for user %s", e.Record.Id)
					}
				}

				// Mark as used
				inviteCodeRecord.Set("used", true)
				inviteCodeRecord.Set("usedBy", e.Record.Id)

				if err := app.Save(inviteCodeRecord); err != nil {
					log.Printf("Error marking invite code as used: %v", err)
				}
			}
		}

		// Generate 5 invite codes for the new user
		// Pass the parent invite code so we can propagate TEST prefix if needed
		if err := handlers.GenerateInviteCodesForUser(app, e.Record.Id, parentInviteCode); err != nil {
			log.Printf("Error generating invite codes for user %s: %v", e.Record.Id, err)
			// Don't fail user creation if code generation fails
		}

		return e.Next()
	})

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}
