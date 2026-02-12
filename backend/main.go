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
	"myapp/lib"
)

func main() {
	// Load environment variables from .env file
	if err := godotenv.Load(); err != nil {
		log.Printf("Warning: Error loading .env file: %v", err)
	}

	// Validate required environment variables before starting the server
	requiredEnvVars := []string{
		"GEMINI_API_KEY",
		"GOOGLE_PLACES_API_KEY",
	}

	missingVars := []string{}
	for _, envVar := range requiredEnvVars {
		if os.Getenv(envVar) == "" {
			missingVars = append(missingVars, envVar)
		}
	}

	if len(missingVars) > 0 {
		log.Fatalf("FATAL: Missing required environment variables: %s\nPlease set these variables in your .env file or environment", strings.Join(missingVars, ", "))
	}

	log.Printf("Environment variables validated successfully")

	// Initialize PostHog analytics (optional - continues if not configured)
	if err := lib.InitAnalytics(); err != nil {
		log.Printf("Warning: Failed to initialize analytics: %v", err)
	}
	// Ensure PostHog client is closed on shutdown
	defer lib.CloseAnalytics()

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
		handlers.RegisterPostHogProxyHandlers(se)
		handlers.RegisterTastingSessionHandlers(se, app)

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

	// Rate limiting constants
	const (
		maxAttempts        = 5       // Maximum attempts before lockout
		baseLockoutSeconds = 15 * 60 // 15 minutes base lockout in seconds
	)

	// Helper function to get or create rate limit record from database
	getRateLimitRecord := func(clientIP string) (record *core.Record, err error) {
		// Try to find existing record
		record, err = app.FindFirstRecordByFilter(
			"rate_limits",
			"ip_address = {:ip}",
			map[string]any{"ip": clientIP},
		)

		// If not found, create a new one
		if err != nil || record == nil {
			collection, err := app.FindCollectionByNameOrId("rate_limits")
			if err != nil {
				return nil, fmt.Errorf("could not find rate_limits collection: %w", err)
			}

			record = core.NewRecord(collection)
			record.Set("ip_address", clientIP)
			record.Set("attempts", 0)
			record.Set("locked_until", int64(0))

			if err := app.Save(record); err != nil {
				return nil, fmt.Errorf("could not create rate limit record: %w", err)
			}
		}

		return record, nil
	}

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

		// Get or create rate limit record from database
		rateLimitRecord, err := getRateLimitRecord(clientIP)
		if err != nil {
			log.Printf("Error getting rate limit record: %v", err)
			// Continue without rate limiting if database error (fail open)
		} else {
			// Check rate limiting
			now := time.Now().Unix()
			lockedUntil := int64(rateLimitRecord.GetInt("locked_until"))

			// Check if still locked out
			if lockedUntil > now {
				remainingSeconds := lockedUntil - now
				remainingMinutes := remainingSeconds / 60
				log.Printf("Rate limit: IP %s is locked out for %d more seconds", clientIP, remainingSeconds)
				return apis.NewBadRequestError(fmt.Sprintf("too many failed attempts, please try again in %d minutes", remainingMinutes), nil)
			}

			// Lockout expired, reset attempts
			if lockedUntil > 0 && lockedUntil <= now {
				rateLimitRecord.Set("attempts", 0)
				rateLimitRecord.Set("locked_until", int64(0))
				if err := app.Save(rateLimitRecord); err != nil {
					log.Printf("Error resetting rate limit: %v", err)
				}
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
			rateLimitRecord, err := getRateLimitRecord(clientIP)
			if err != nil {
				log.Printf("Error getting rate limit record for failed attempt: %v", err)
				return apis.NewBadRequestError("invalid or already used invite code", nil)
			}

			now := time.Now().Unix()
			attempts := rateLimitRecord.GetInt("attempts") + 1
			rateLimitRecord.Set("attempts", attempts)
			rateLimitRecord.Set("last_attempt_at", time.Now())

			log.Printf("Rate limit: IP %s failed attempt %d/%d", clientIP, attempts, maxAttempts)

			// Check if should be locked out with exponential backoff
			if attempts >= maxAttempts {
				// Calculate exponential backoff: baseSeconds * 2^(attempts - maxAttempts)
				// For attempts 5, 6, 7, 8, ... this gives: 15min, 30min, 60min, 120min, ...
				backoffMultiplier := int64(1 << uint(attempts-maxAttempts))
				lockoutSeconds := baseLockoutSeconds * backoffMultiplier

				// Cap at 24 hours to prevent extremely long lockouts
				const maxLockoutSeconds = 24 * 60 * 60
				if lockoutSeconds > maxLockoutSeconds {
					lockoutSeconds = maxLockoutSeconds
				}

				rateLimitRecord.Set("locked_until", now+lockoutSeconds)
				lockoutMinutes := lockoutSeconds / 60
				log.Printf("Rate limit: IP %s locked out for %d minutes (attempt %d)", clientIP, lockoutMinutes, attempts)

				if err := app.Save(rateLimitRecord); err != nil {
					log.Printf("Error saving rate limit lockout: %v", err)
				}

				return apis.NewBadRequestError(fmt.Sprintf("too many failed attempts, please try again in %d minutes", lockoutMinutes), nil)
			}

			if err := app.Save(rateLimitRecord); err != nil {
				log.Printf("Error saving rate limit attempts: %v", err)
			}

			return apis.NewBadRequestError("invalid or already used invite code", nil)
		}

		// Valid invite code - clear any previous failed attempts
		rateLimitRecord, err = getRateLimitRecord(clientIP)
		if err == nil {
			rateLimitRecord.Set("attempts", 0)
			rateLimitRecord.Set("locked_until", int64(0))
			if err := app.Save(rateLimitRecord); err != nil {
				log.Printf("Error clearing rate limit: %v", err)
			}
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
