package main

import (
	"errors"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/joho/godotenv"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/plugins/migratecmd"

	"myapp/handlers"
	"myapp/hooks"
	"myapp/lib"
	_ "myapp/migrations"
)

func main() {
	// Load environment variables from .env file
	if err := godotenv.Load(); err != nil {
		log.Printf("Warning: Error loading .env file: %v", err)
	}

	runtimeResources, err := validateStartupConfiguration()
	if err != nil {
		log.Fatalf("FATAL: %v", err)
	}

	log.Printf("Environment variables validated successfully")
	log.Printf(
		"Runtime environment configured: env=%s api=%s app=%s admin=%s marketing=%s pocketbase=%s",
		runtimeResources.Environment,
		runtimeResources.APIBaseURL,
		runtimeResources.AppURL,
		runtimeResources.AdminURL,
		runtimeResources.MarketingURL,
		runtimeResources.PocketBaseURL,
	)

	// Initialize PostHog analytics (optional - continues if not configured)
	if err := lib.InitAnalytics(); err != nil {
		log.Printf("Warning: Failed to initialize analytics: %v", err)
	}
	// Ensure PostHog client is closed on shutdown
	defer lib.CloseAnalytics()

	app := pocketbase.New()
	hooks.RegisterEmailVerificationHooks(app)
	hooks.RegisterAuthActionEmailHooks(app, runtimeResources)

	// Register migrations with automigrate enabled when running with `go run`
	isGoRun := strings.HasPrefix(os.Args[0], os.TempDir())
	migratecmd.MustRegister(app, app.RootCmd, migratecmd.Config{
		Automigrate: isGoRun,
	})

	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		configureTrustedProxyHeaders(app)
		configureSecurityRateLimitRules(app)

		// Register all API handlers
		handlers.RegisterInviteCodeHandlers(se, app)
		handlers.RegisterWaitlistHandlers(se, app, runtimeResources)
		handlers.RegisterContentReportHandlers(se, app)
		handlers.RegisterUserHandlers(se, app)
		handlers.RegisterAdminMenuInventoryHandlers(se, app)
		handlers.RegisterModerationHandlers(se, app)
		handlers.RegisterFeedbackHandlers(se, app)
		handlers.RegisterFriendHandlers(se, app)
		handlers.RegisterFeatureSummaryHandlers(se, app)
		handlers.RegisterFeatureWriteHandlers(se, app)
		handlers.RegisterMenuWorkflowHandlers(se, app)
		handlers.RegisterUsageLimitHandlers(se, app)
		handlers.RegisterMenuParsingHandlers(se, app)
		handlers.RegisterPlacesHandlers(se, app)
		handlers.RegisterPostHogProxyHandlers(se)
		handlers.RegisterNotificationHandlers(se, app)
		handlers.RegisterTastingSessionHandlers(se, app)

		// Serves static files from the provided public dir (if exists)
		// IMPORTANT: This must be registered LAST as it's a catch-all route
		se.Router.GET("/{path...}", apis.Static(os.DirFS("./pb_public"), false))

		return se.Next()
	})

	// Hook to validate invite code before user creation
	app.OnRecordCreate("users").BindFunc(func(e *core.RecordEvent) error {
		// Ensure required visibility defaults are always present for new users.
		// Some clients may omit these fields, but product default is "friends".
		if strings.TrimSpace(e.Record.GetString("defaultVisitVisibility")) == "" {
			e.Record.Set("defaultVisitVisibility", "friends")
		}

		if strings.TrimSpace(e.Record.GetString("defaultRestaurantVisibility")) == "" {
			e.Record.Set("defaultRestaurantVisibility", "friends")
		}

		if strings.TrimSpace(e.Record.GetString("defaultHomeFeedMode")) == "" {
			e.Record.Set("defaultHomeFeedMode", "mine")
		}

		if strings.TrimSpace(e.Record.GetString("defaultHomeFeedTypeFilter")) == "" {
			e.Record.Set("defaultHomeFeedTypeFilter", "visits")
		}

		if strings.TrimSpace(e.Record.GetString("defaultHomeFeedSort")) == "" {
			e.Record.Set("defaultHomeFeedSort", "created")
		}

		if strings.TrimSpace(e.Record.GetString("moderationState")) == "" {
			e.Record.Set("moderationState", "active")
		}

		if strings.TrimSpace(e.Record.GetString("contentModerationMode")) == "" {
			e.Record.Set("contentModerationMode", "normal")
		}

		if strings.TrimSpace(e.Record.GetString("friendCode")) == "" {
			friendCode, err := lib.EnsureUserFriendCode(e.App, e.Record)
			if err != nil {
				return apis.NewApiError(500, "failed to assign friend code", err)
			}
			e.Record.Set("friendCode", friendCode)
		}

		return e.Next()
	})

	// Hook to validate invite code from API requests
	app.OnRecordCreateRequest("users").BindFunc(func(e *core.RecordRequestEvent) error {
		clientIP := resolveSignupClientIP(e)
		if clientIP == "" {
			return apis.NewBadRequestError("unable to determine client IP", nil)
		}

		rateLimitRecord, err := getOrCreateRateLimitRecord(e.App, clientIP)
		if err != nil {
			log.Printf("Signup rate limit unavailable for IP %s: %v", clientIP, err)
			return apis.NewApiError(503, signupRateLimitUnavailableMessage, err)
		}

		now := time.Now().UTC()
		if remainingSeconds := remainingSignupLockout(rateLimitRecord, now); remainingSeconds > 0 {
			remainingMinutes := remainingSeconds / 60
			if remainingSeconds%60 != 0 {
				remainingMinutes++
			}

			log.Printf("Rate limit: IP %s is locked out for %d more seconds", clientIP, remainingSeconds)
			return apis.NewBadRequestError(
				fmt.Sprintf("too many failed attempts, please try again in %d minutes", remainingMinutes),
				nil,
			)
		}

		if rateLimitRecord.GetInt("locked_until") > 0 {
			if err := clearSignupRateLimit(e.App, rateLimitRecord); err != nil {
				log.Printf("Failed to clear expired signup rate limit for IP %s: %v", clientIP, err)
				return apis.NewApiError(503, signupRateLimitUnavailableMessage, err)
			}
		}

		requestInfo, err := e.RequestInfo()
		if err != nil {
			return apis.NewBadRequestError("invalid request body", err)
		}

		inviteCode, ok := requestInfo.Body["inviteCode"].(string)
		inviteCode = strings.TrimSpace(inviteCode)

		var inviteCodeReservation *inviteCodeReservation
		var waitlistEntry *core.Record

		if ok && inviteCode != "" {
			inviteCodeReservation, err = reserveInviteCode(e.App, inviteCode)
		} else {
			email, _ := requestInfo.Body["email"].(string)
			waitlistEntry, err = handlers.FindApprovedWaitlistEntryByEmail(e.App, email)
		}

		if err != nil {
			lockoutMinutes, locked, rateErr := incrementSignupFailure(e.App, rateLimitRecord, now)
			if rateErr != nil {
				log.Printf("Failed to update signup rate limit for IP %s: %v", clientIP, rateErr)
				return apis.NewApiError(503, signupRateLimitUnavailableMessage, rateErr)
			}

			if locked {
				log.Printf("Rate limit: IP %s locked out for %d minutes", clientIP, lockoutMinutes)
				return apis.NewBadRequestError(
					fmt.Sprintf("too many failed attempts, please try again in %d minutes", lockoutMinutes),
					nil,
				)
			}

			if errors.Is(err, errInviteCodeUnavailable) {
				log.Printf(
					"Rate limit: IP %s failed invite validation attempt %d/%d",
					clientIP,
					rateLimitRecord.GetInt("attempts"),
					signupRateLimitMaxAttempts,
				)
				return apis.NewBadRequestError("invalid or already used invite code", nil)
			}

			if waitlistEntry == nil && inviteCode == "" {
				log.Printf("Rate limit: IP %s failed waitlist approval attempt %d/%d", clientIP, rateLimitRecord.GetInt("attempts"), signupRateLimitMaxAttempts)
				return apis.NewBadRequestError("email is not approved for signup", nil)
			}

			log.Printf("Failed to reserve invite code for IP %s: %v", clientIP, err)
			return apis.NewApiError(500, "failed to validate invite code", err)
		}

		if err := clearSignupRateLimit(e.App, rateLimitRecord); err != nil {
			log.Printf("Failed to clear signup rate limit for IP %s: %v", clientIP, err)
			if releaseErr := releaseInviteCodeReservation(e.App, inviteCodeReservation); releaseErr != nil {
				log.Printf("Failed to release invite reservation after rate limit error: %v", releaseErr)
			}
			return apis.NewApiError(503, signupRateLimitUnavailableMessage, err)
		}

		err = e.Next()
		if err != nil {
			if releaseErr := releaseInviteCodeReservation(e.App, inviteCodeReservation); releaseErr != nil {
				log.Printf("Failed to release invite reservation after signup error: %v", releaseErr)
			}
			return err
		}

		applySignupEmailPreferences(e.App, e.Record, requestInfo.Body)

		if inviteCodeReservation != nil && inviteCodeReservation.CreatedBy == "" {
			e.Record.Set("isInitialUser", true)
			if err := e.App.Save(e.Record); err != nil {
				log.Printf("Error setting isInitialUser flag: %v", err)
			} else {
				log.Printf("Set isInitialUser=true for user %s", e.Record.Id)
			}
		}

		if err := finalizeInviteCodeReservation(e.App, inviteCodeReservation, e.Record.Id); err != nil {
			log.Printf("Error finalizing invite code reservation: %v", err)
		}

		if err := handlers.MarkWaitlistEntrySignedUp(e.App, runtimeResources, waitlistEntry, e.Record); err != nil {
			log.Printf("Error marking waitlist signup for user %s: %v", e.Record.Id, err)
		}

		parentInviteCode := ""
		if inviteCodeReservation != nil {
			parentInviteCode = inviteCodeReservation.Code
		}
		if err := handlers.GenerateInviteCodesForUser(e.App, e.Record.Id, parentInviteCode); err != nil {
			log.Printf("Error generating invite codes for user %s: %v", e.Record.Id, err)
		}

		return nil
	})

	hooks.RegisterUsageLimitHooks(app)
	hooks.RegisterRecordOwnershipHooks(app)
	hooks.RegisterFriendshipSecurityHooks(app)
	hooks.RegisterUserProfileSecurityHooks(app)
	hooks.RegisterRestaurantGroupMembershipSecurityHooks(app)
	hooks.RegisterRestaurantListCountHooks(app)
	hooks.RegisterFeedbackSecurityHooks(app)
	hooks.RegisterFeedbackMessageSecurityHooks(app)
	hooks.RegisterModerationHooks(app)
	hooks.RegisterAuditHooks(app)

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

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}

func applySignupEmailPreferences(app core.App, user *core.Record, body map[string]any) {
	if app == nil || user == nil {
		return
	}

	usersCollection, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		return
	}

	changed := false
	setBoolField := func(fieldName string) {
		if usersCollection.Fields.GetByName(fieldName) == nil {
			return
		}
		if value, ok := body[fieldName].(bool); ok {
			user.Set(fieldName, value)
			changed = true
		}
	}
	setStringField := func(fieldName string) {
		if usersCollection.Fields.GetByName(fieldName) == nil {
			return
		}
		if value, ok := body[fieldName].(string); ok {
			user.Set(fieldName, strings.TrimSpace(value))
			changed = true
		}
	}

	setBoolField("productUpdatesConsent")
	setBoolField("marketingConsent")
	setBoolField("onboardingEmailsAcknowledged")
	setStringField("emailConsentVersion")

	if usersCollection.Fields.GetByName("emailConsentCapturedAt") != nil {
		user.Set("emailConsentCapturedAt", time.Now().UTC())
		changed = true
	}

	if changed {
		if err := app.Save(user); err != nil {
			log.Printf("Failed to save signup email preferences for user %s: %v", user.Id, err)
		}
	}
}
