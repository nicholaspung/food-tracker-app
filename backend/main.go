package main

import (
	"bytes"
	"crypto/rand"
	"encoding/base32"
	"encoding/json"
	"io"
	"log"
	"os"
	"strings"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/plugins/migratecmd"

	_ "myapp/migrations"
)

func main() {
	app := pocketbase.New()

	// Register migrations with automigrate enabled when running with `go run`
	isGoRun := strings.HasPrefix(os.Args[0], os.TempDir())
	migratecmd.MustRegister(app, app.RootCmd, migratecmd.Config{
		Automigrate: isGoRun,
	})

	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		// Serves static files from the provided public dir (if exists)
		se.Router.GET("/{path...}", apis.Static(os.DirFS("./pb_public"), false))

		return se.Next()
	})

	// Global map to store invite code IDs for marking as used after user creation
	var pendingInviteCodes = make(map[string]string) // userId -> inviteCodeRecordId

	// Hook to validate invite code before user creation
	app.OnRecordCreate("users").BindFunc(func(e *core.RecordEvent) error {
		// Try to get invite code from the HTTP request if this is called from an API request
		// We'll extract it from the form data during API calls
		return e.Next()
	})

	// Hook to validate invite code from API requests
	app.OnRecordCreateRequest("users").BindFunc(func(e *core.RecordRequestEvent) error {
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
			return apis.NewBadRequestError("invalid or already used invite code", nil)
		}

		// Store the invite code record ID for marking as used after creation
		// We'll use the user's email as a temporary key since we don't have the ID yet
		userEmail, _ := requestData["email"].(string)
		if userEmail != "" {
			pendingInviteCodes[userEmail] = inviteCodeRecord.Id
		}

		return e.Next()
	})

	// Hook to mark invite code as used and generate new codes after successful user creation
	app.OnRecordAfterCreateSuccess("users").BindFunc(func(e *core.RecordEvent) error {
		// Get user email to look up the pending invite code
		userEmail := e.Record.Email()
		inviteCodeId, exists := pendingInviteCodes[userEmail]

		if exists && inviteCodeId != "" {
			// Clean up the pending map
			delete(pendingInviteCodes, userEmail)

			// Find and update the invite code
			inviteCodeRecord, err := app.FindRecordById("invite_codes", inviteCodeId)
			if err != nil {
				log.Printf("Error finding invite code: %v", err)
			} else {
				// Mark as used
				inviteCodeRecord.Set("used", true)
				inviteCodeRecord.Set("usedBy", e.Record.Id)

				if err := app.Save(inviteCodeRecord); err != nil {
					log.Printf("Error marking invite code as used: %v", err)
				}
			}
		}

		// Generate 5 invite codes for the new user
		if err := generateInviteCodesForUser(app, e.Record.Id); err != nil {
			log.Printf("Error generating invite codes for user %s: %v", e.Record.Id, err)
			// Don't fail user creation if code generation fails
		}

		return e.Next()
	})

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}

// generateRandomCode creates a random invite code
func generateRandomCode() (string, error) {
	// Generate 10 random bytes (will encode to ~16 characters)
	bytes := make([]byte, 10)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}

	// Encode to base32 (removes ambiguous characters)
	code := base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(bytes)

	// Convert to lowercase and take first 12 characters
	code = strings.ToLower(code)[:12]

	return code, nil
}

// generateInviteCodesForUser creates 5 invite codes for a user
func generateInviteCodesForUser(app core.App, userId string) error {
	// Get the invite_codes collection
	collection, err := app.FindCollectionByNameOrId("invite_codes")
	if err != nil {
		return err
	}

	// Generate 5 codes
	for i := 0; i < 5; i++ {
		// Generate random code
		code, err := generateRandomCode()
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
