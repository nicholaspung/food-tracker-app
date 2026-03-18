package handlers

import (
	"fmt"
	"log"
	"sort"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"

	"myapp/lib"
)

type adminUserModerationInput struct {
	Action                string  `json:"action"`
	ContentModerationMode *string `json:"contentModerationMode"`
	ModerationNotice      *string `json:"moderationNotice"`
	ModerationNotes       *string `json:"moderationNotes"`
	ModerationState       *string `json:"moderationState"`
	PhotoSuspendedUntil   *string `json:"photoSuspendedUntil"`
	PostingSuspendedUntil *string `json:"postingSuspendedUntil"`
	WarningCount          *int    `json:"warningCount"`
}

type adminContentModerationInput struct {
	Action        string  `json:"action"`
	AppealState   *string `json:"appealState"`
	ModeratorNote *string `json:"moderatorNote"`
	ReasonCode    *string `json:"reasonCode"`
	UserNotice    *string `json:"userNotice"`
}

// RegisterUserHandlers registers all user management endpoints.
func RegisterUserHandlers(se *core.ServeEvent, app core.App) {
	se.Router.GET("/api/admin/users", func(e *core.RequestEvent) error {
		if err := requireAdmin(e); err != nil {
			return err
		}

		searchTerm := strings.TrimSpace(e.Request.URL.Query().Get("search"))
		users, err := findAdminUsers(app, searchTerm)
		if err != nil {
			log.Printf("Admin user search failed for %q: %v", searchTerm, err)
			return apis.NewApiError(500, "failed to search users", err)
		}

		response := make([]map[string]any, 0, len(users))
		for _, user := range users {
			response = append(response, serializeAdminUser(user))
		}

		return e.JSON(200, map[string]any{
			"items": response,
		})
	})

	se.Router.GET("/api/admin/users/lookup", func(e *core.RequestEvent) error {
		if err := requireAdmin(e); err != nil {
			return err
		}

		email := strings.TrimSpace(e.Request.URL.Query().Get("email"))
		if email == "" {
			return apis.NewBadRequestError("email is required", nil)
		}

		user, err := findUserByEmail(app, email)
		if err != nil {
			log.Printf("Admin user lookup failed for %q: %v", email, err)
			return apis.NewNotFoundError("No user was found for that email address.", err)
		}
		if user == nil {
			return apis.NewNotFoundError("No user was found for that email address.", nil)
		}

		if err := logAdminUserView(
			app,
			e,
			user,
			"admin_access_controls",
			fmt.Sprintf("Viewed user access for %s", user.Email()),
		); err != nil {
			log.Printf("Admin user access view audit failed for %q: %v", email, err)
		}

		return e.JSON(200, serializeAdminUser(user))
	})

	se.Router.GET("/api/admin/users/{userId}/profile", func(e *core.RequestEvent) error {
		if err := requireAdmin(e); err != nil {
			return err
		}

		userID := strings.TrimSpace(e.Request.PathValue("userId"))
		if userID == "" {
			return apis.NewBadRequestError("userId is required", nil)
		}

		user, profile, err := loadUserModerationProfile(app, userID)
		if err != nil {
			log.Printf("Admin user profile load failed for %q: %v", userID, err)
			return apis.NewApiError(500, "failed to load user profile", err)
		}

		if err := logAdminUserView(
			app,
			e,
			user,
			"admin_user_profile",
			fmt.Sprintf("Viewed user profile for %s", user.Email()),
		); err != nil {
			log.Printf("Admin user profile audit failed for %q: %v", userID, err)
		}

		return e.JSON(200, profile)
	})

	se.Router.PATCH("/api/admin/users/{userId}/moderation", func(e *core.RequestEvent) error {
		if err := requireAdmin(e); err != nil {
			return err
		}

		userID := strings.TrimSpace(e.Request.PathValue("userId"))
		if userID == "" {
			return apis.NewBadRequestError("userId is required", nil)
		}

		data := adminUserModerationInput{}
		if err := e.BindBody(&data); err != nil {
			return apis.NewBadRequestError("invalid request body", err)
		}

		err := app.RunInTransaction(func(txApp core.App) error {
			user, err := txApp.FindRecordById("users", userID)
			if err != nil {
				return apis.NewNotFoundError("user not found", err)
			}

			beforeSnapshot := lib.RecordAuditSnapshot(user)
			if err := applyUserModerationUpdate(user, e.Auth.Id, data); err != nil {
				return apis.NewBadRequestError(err.Error(), nil)
			}
			if err := txApp.Save(user); err != nil {
				return apis.NewApiError(500, "failed to update user moderation state", err)
			}

			if _, caseErr := lib.UpsertModerationCase(txApp, lib.ModerationCaseInput{
				Action:           resolveUserModerationAction(data.Action, user.GetString("moderationState")),
				ModeratorNote:    optionalStringValue(data.ModerationNotes),
				Status:           resolveUserModerationCaseStatus(data.Action, user.GetString("moderationState")),
				TargetCollection: "users",
				TargetLabel:      user.Email(),
				TargetRecordID:   user.Id,
				TargetType:       "user",
				TargetUserID:     user.Id,
				UserNotice:       optionalStringValue(data.ModerationNotice),
			}); caseErr != nil {
				return apis.NewApiError(500, "failed to record user moderation case", caseErr)
			}

			return lib.CreateAuditLog(txApp, lib.AuditLogInput{
				Action:           core.ModelEventTypeUpdate,
				Actor:            e.Auth,
				Before:           beforeSnapshot,
				After:            lib.RecordAuditSnapshot(user),
				Metadata:         map[string]any{"source": "admin_user_moderation"},
				RequestIP:        e.RealIP(),
				RequestMethod:    e.Request.Method,
				RequestPath:      e.Request.URL.Path,
				TargetCollection: "users",
				TargetLabel:      lib.ResolveAuditTargetLabel(user, beforeSnapshot),
				TargetRecordID:   user.Id,
				UserAgent:        e.Request.UserAgent(),
			})
		})
		if err != nil {
			return err
		}

		user, err := app.FindRecordById("users", userID)
		if err != nil {
			return apis.NewNotFoundError("user not found", err)
		}

		return e.JSON(200, serializeAdminUser(user))
	})

	se.Router.PATCH("/api/admin/users/{userId}/content/{contentType}/{recordId}/moderation", func(e *core.RequestEvent) error {
		if err := requireAdmin(e); err != nil {
			return err
		}

		userID := strings.TrimSpace(e.Request.PathValue("userId"))
		contentType := strings.TrimSpace(e.Request.PathValue("contentType"))
		recordID := strings.TrimSpace(e.Request.PathValue("recordId"))
		if userID == "" || contentType == "" || recordID == "" {
			return apis.NewBadRequestError("userId, contentType, and recordId are required", nil)
		}

		data := adminContentModerationInput{}
		if err := e.BindBody(&data); err != nil {
			return apis.NewBadRequestError("invalid request body", err)
		}

		err := app.RunInTransaction(func(txApp core.App) error {
			record, err := resolveModerationTargetRecord(txApp, userID, contentType, recordID)
			if err != nil {
				return err
			}

			beforeSnapshot := lib.RecordAuditSnapshot(record)
			if err := applyContentModerationAction(record, data.Action, e.Auth.Id); err != nil {
				return apis.NewBadRequestError(err.Error(), nil)
			}
			if err := txApp.Save(record); err != nil {
				return apis.NewApiError(500, "failed to update moderated content", err)
			}

			if _, caseErr := lib.UpsertModerationCase(txApp, lib.ModerationCaseInput{
				Action:           data.Action,
				AppealState:      optionalStringValue(data.AppealState),
				ModeratorNote:    optionalStringValue(data.ModeratorNote),
				ReasonCode:       optionalStringValue(data.ReasonCode),
				Status:           resolveContentModerationCaseStatus(data.Action),
				TargetCollection: record.Collection().Name,
				TargetLabel:      lib.ResolveAuditTargetLabel(record, beforeSnapshot),
				TargetRecordID:   record.Id,
				TargetType:       normalizeModerationTargetType(contentType),
				TargetUserID:     userID,
				UserNotice:       optionalStringValue(data.UserNotice),
			}); caseErr != nil {
				return apis.NewApiError(500, "failed to record content moderation case", caseErr)
			}

			return lib.CreateAuditLog(txApp, lib.AuditLogInput{
				Action:           core.ModelEventTypeUpdate,
				Actor:            e.Auth,
				Before:           beforeSnapshot,
				After:            lib.RecordAuditSnapshot(record),
				Metadata:         map[string]any{"source": "admin_content_moderation", "action": data.Action, "reasonCode": optionalStringValue(data.ReasonCode)},
				RequestIP:        e.RealIP(),
				RequestMethod:    e.Request.Method,
				RequestPath:      e.Request.URL.Path,
				TargetCollection: record.Collection().Name,
				TargetLabel:      lib.ResolveAuditTargetLabel(record, beforeSnapshot),
				TargetRecordID:   record.Id,
				UserAgent:        e.Request.UserAgent(),
			})
		})
		if err != nil {
			return err
		}

		return e.JSON(200, map[string]any{"success": true})
	})

	se.Router.DELETE("/api/admin/users/{userId}/content/{contentType}/{recordId}", func(e *core.RequestEvent) error {
		if err := requireAdmin(e); err != nil {
			return err
		}

		userID := strings.TrimSpace(e.Request.PathValue("userId"))
		contentType := strings.TrimSpace(e.Request.PathValue("contentType"))
		recordID := strings.TrimSpace(e.Request.PathValue("recordId"))
		if userID == "" || contentType == "" || recordID == "" {
			return apis.NewBadRequestError("userId, contentType, and recordId are required", nil)
		}

		err := app.RunInTransaction(func(txApp core.App) error {
			record, err := resolveModerationTargetRecord(txApp, userID, contentType, recordID)
			if err != nil {
				return err
			}

			beforeSnapshot := lib.RecordAuditSnapshot(record)
			if _, caseErr := lib.UpsertModerationCase(txApp, lib.ModerationCaseInput{
				Action:           lib.ModerationActionRemove,
				ModeratorNote:    "Record was permanently deleted by an admin.",
				Status:           lib.ModerationCaseStatusRemoved,
				TargetCollection: record.Collection().Name,
				TargetLabel:      lib.ResolveAuditTargetLabel(record, beforeSnapshot),
				TargetRecordID:   record.Id,
				TargetType:       normalizeModerationTargetType(contentType),
				TargetUserID:     userID,
			}); caseErr != nil {
				return apis.NewApiError(500, "failed to record deletion moderation case", caseErr)
			}

			if err := txApp.Delete(record); err != nil {
				return apis.NewApiError(500, "failed to delete moderated content", err)
			}

			if auditErr := lib.CreateAuditLog(txApp, lib.AuditLogInput{
				Action:           core.ModelEventTypeDelete,
				Actor:            e.Auth,
				Before:           beforeSnapshot,
				Metadata:         map[string]any{"source": "admin_content_moderation", "contentType": contentType, "userId": userID},
				RequestIP:        e.RealIP(),
				RequestMethod:    e.Request.Method,
				RequestPath:      e.Request.URL.Path,
				TargetCollection: record.Collection().Name,
				TargetLabel:      lib.ResolveAuditTargetLabel(record, beforeSnapshot),
				TargetRecordID:   record.Id,
				UserAgent:        e.Request.UserAgent(),
			}); auditErr != nil {
				return apis.NewApiError(500, "failed to audit moderated content deletion", auditErr)
			}

			return nil
		})
		if err != nil {
			return err
		}

		return e.JSON(200, map[string]any{"success": true})
	})

	se.Router.PATCH("/api/admin/users/{userId}/access", func(e *core.RequestEvent) error {
		if err := requireAdmin(e); err != nil {
			return err
		}

		userID := strings.TrimSpace(e.Request.PathValue("userId"))
		if userID == "" {
			return apis.NewBadRequestError("userId is required", nil)
		}

		data := struct {
			IsSubscriber bool `json:"isSubscriber"`
			IsBetaUser   bool `json:"isBetaUser"`
		}{}
		if err := e.BindBody(&data); err != nil {
			return apis.NewBadRequestError("invalid request body", err)
		}

		user, err := app.FindRecordById("users", userID)
		if err != nil {
			return apis.NewNotFoundError("user not found", err)
		}

		beforeSnapshot := lib.RecordAuditSnapshot(user)

		user.Set("isSubscriber", data.IsSubscriber)
		user.Set("isBetaUser", data.IsBetaUser)
		if err := app.Save(user); err != nil {
			log.Printf("Admin access update failed for user %s: %v", userID, err)
			return apis.NewApiError(500, "failed to update user access", err)
		}

		if err := lib.CreateAuditLog(app, lib.AuditLogInput{
			Action:           core.ModelEventTypeUpdate,
			Actor:            e.Auth,
			Before:           beforeSnapshot,
			After:            lib.RecordAuditSnapshot(user),
			Metadata:         map[string]any{"source": "admin_access_controls"},
			RequestIP:        e.RealIP(),
			RequestMethod:    e.Request.Method,
			RequestPath:      e.Request.URL.Path,
			TargetCollection: "users",
			TargetLabel:      lib.ResolveAuditTargetLabel(user, beforeSnapshot),
			TargetRecordID:   user.Id,
			UserAgent:        e.Request.UserAgent(),
		}); err != nil {
			log.Printf("Admin access audit log failed for user %s: %v", userID, err)
		}

		return e.JSON(200, serializeAdminUser(user))
	})

	// Legacy custom API endpoint preserved for compatibility.
	se.Router.POST("/api/users/elevate-subscriber", func(e *core.RequestEvent) error {
		if err := requireAdmin(e); err != nil {
			return err
		}

		data := struct {
			Email string `json:"email"`
		}{}
		if err := e.BindBody(&data); err != nil {
			return apis.NewBadRequestError("invalid request body", err)
		}

		if strings.TrimSpace(data.Email) == "" {
			return apis.NewBadRequestError("email is required", nil)
		}

		user, err := findUserByEmail(app, data.Email)
		if err != nil {
			log.Printf("User lookup error for email %s: %v", data.Email, err)
			return apis.NewNotFoundError("user not found with that email address", err)
		}
		if user == nil {
			return apis.NewNotFoundError("user not found with that email address", nil)
		}

		user.Set("isSubscriber", true)
		if err := app.Save(user); err != nil {
			log.Printf("Failed to update user %s to subscriber: %v", user.Id, err)
			return apis.NewApiError(500, "failed to elevate user to subscriber", err)
		}

		log.Printf("Admin %s elevated user %s (%s) to subscriber", e.Auth.Id, user.Id, data.Email)

		return e.JSON(200, map[string]any{
			"success": true,
			"message": "User successfully elevated to subscriber",
			"userId":  user.Id,
			"email":   user.Email(),
		})
	})
}

func requireAdmin(e *core.RequestEvent) error {
	if e.Auth == nil {
		return apis.NewUnauthorizedError("authentication required", nil)
	}

	if !e.Auth.GetBool("isAdmin") {
		return apis.NewForbiddenError("only admins can access this endpoint", nil)
	}

	return nil
}

func findAdminUsers(app core.App, searchTerm string) ([]*core.Record, error) {
	users, err := app.FindRecordsByFilter(
		"users",
		"",
		"-created",
		200,
		0,
		nil,
	)
	if err != nil {
		return nil, err
	}

	normalizedSearch := strings.ToLower(strings.TrimSpace(searchTerm))
	if normalizedSearch == "" {
		return users, nil
	}

	filtered := make([]*core.Record, 0, len(users))
	for _, user := range users {
		name := strings.ToLower(strings.TrimSpace(user.GetString("name")))
		email := strings.ToLower(strings.TrimSpace(user.Email()))
		id := strings.ToLower(user.Id)

		if strings.Contains(name, normalizedSearch) ||
			strings.Contains(email, normalizedSearch) ||
			strings.Contains(id, normalizedSearch) {
			filtered = append(filtered, user)
		}
	}

	return filtered, nil
}

func findUserByEmail(app core.App, email string) (*core.Record, error) {
	users, err := app.FindRecordsByFilter(
		"users",
		"",
		"-created",
		200,
		0,
		nil,
	)
	if err != nil {
		return nil, err
	}

	normalizedEmail := strings.ToLower(strings.TrimSpace(email))
	for _, user := range users {
		if strings.ToLower(strings.TrimSpace(user.Email())) == normalizedEmail {
			return user, nil
		}
	}

	return nil, nil
}

func serializeAdminUser(user *core.Record) map[string]any {
	if user == nil {
		return nil
	}

	return map[string]any{
		"id":                    user.Id,
		"email":                 user.Email(),
		"name":                  strings.TrimSpace(user.GetString("name")),
		"isAdmin":               user.GetBool("isAdmin"),
		"isSubscriber":          user.GetBool("isSubscriber"),
		"isBetaUser":            user.GetBool("isBetaUser"),
		"moderationState":       strings.TrimSpace(user.GetString("moderationState")),
		"contentModerationMode": strings.TrimSpace(user.GetString("contentModerationMode")),
		"warningCount":          user.GetFloat("warningCount"),
		"moderationNotes":       strings.TrimSpace(user.GetString("moderationNotes")),
		"moderationNotice":      strings.TrimSpace(user.GetString("moderationNotice")),
		"postingSuspendedUntil": user.GetString("postingSuspendedUntil"),
		"photoSuspendedUntil":   user.GetString("photoSuspendedUntil"),
		"created":               user.GetString("created"),
		"updated":               user.GetString("updated"),
	}
}

func logAdminUserView(
	app core.App,
	requestEvent *core.RequestEvent,
	user *core.Record,
	source string,
	summary string,
) error {
	if user == nil {
		return nil
	}

	return lib.CreateAuditLog(app, lib.AuditLogInput{
		Action:           lib.AuditActionView,
		Actor:            requestEvent.Auth,
		After:            serializeAdminUser(user),
		Metadata:         map[string]any{"source": source},
		RequestIP:        requestEvent.RealIP(),
		RequestMethod:    requestEvent.Request.Method,
		RequestPath:      requestEvent.Request.URL.Path,
		Summary:          summary,
		TargetCollection: "users",
		TargetLabel:      lib.ResolveAuditTargetLabel(user, serializeAdminUser(user)),
		TargetRecordID:   user.Id,
		UserAgent:        requestEvent.Request.UserAgent(),
	})
}

func loadUserModerationProfile(app core.App, userID string) (*core.Record, map[string]any, error) {
	user, err := app.FindRecordById("users", userID)
	if err != nil {
		return nil, nil, err
	}

	params := dbx.Params{"userId": userID}
	visits, err := app.FindRecordsByFilter("visits", "user = {:userId}", "-visitDate,-created", 10, 0, params)
	if err != nil {
		return nil, nil, err
	}

	foodItems, err := app.FindRecordsByFilter("food_items", "user = {:userId}", "-created", 10, 0, params)
	if err != nil {
		return nil, nil, err
	}

	notes, err := app.FindRecordsByFilter("notes", "user = {:userId}", "-created", 10, 0, params)
	if err != nil {
		return nil, nil, err
	}

	feedback, err := app.FindRecordsByFilter("feedback", "user = {:userId}", "-updated", 10, 0, params)
	if err != nil {
		return nil, nil, err
	}

	photos, err := app.FindRecordsByFilter("visit_photos", "user = {:userId}", "-created", 10, 0, params)
	if err != nil {
		return nil, nil, err
	}

	restaurants, err := app.FindRecordsByFilter("restaurants", "createdBy = {:userId}", "-created", 10, 0, params)
	if err != nil {
		return nil, nil, err
	}

	menuItems, err := app.FindRecordsByFilter("menu_items", "createdBy = {:userId}", "-created", 10, 0, params)
	if err != nil {
		return nil, nil, err
	}

	bills, err := loadModerationBills(app, userID)
	if err != nil {
		return nil, nil, err
	}

	feedEntries, err := loadModerationFeedEntries(app, userID)
	if err != nil {
		return nil, nil, err
	}

	restaurantLists, err := loadModerationRestaurantLists(app, userID)
	if err != nil {
		return nil, nil, err
	}

	moderationCases, err := loadUserModerationCases(app, userID)
	if err != nil {
		return nil, nil, err
	}

	sort.SliceStable(feedback, func(i, j int) bool {
		return feedback[i].GetString("updated") > feedback[j].GetString("updated")
	})

	restaurantNames, err := resolveRestaurantNames(app, visits, restaurants, menuItems)
	if err != nil {
		return nil, nil, err
	}

	return user, map[string]any{
		"user":              serializeAdminUser(user),
		"recentVisits":      serializeVisits(visits, restaurantNames),
		"recentFoodItems":   serializeFoodItems(foodItems),
		"recentNotes":       serializeNotes(notes),
		"recentFeedback":    serializeFeedback(feedback),
		"recentPhotos":      serializePhotos(photos),
		"recentRestaurants": serializeRestaurants(restaurants),
		"recentMenuItems":   serializeMenuItems(menuItems, restaurantNames),
		"recentBills":       bills,
		"feedEntries":       feedEntries,
		"restaurantLists":   restaurantLists,
		"moderationCases":   moderationCases,
	}, nil
}

func resolveRestaurantNames(
	app core.App,
	visits []*core.Record,
	restaurants []*core.Record,
	menuItems []*core.Record,
) (map[string]string, error) {
	restaurantNames := make(map[string]string, len(restaurants))
	for _, restaurant := range restaurants {
		restaurantNames[restaurant.Id] = strings.TrimSpace(restaurant.GetString("name"))
	}

	for _, menuItem := range menuItems {
		restaurantID := strings.TrimSpace(menuItem.GetString("restaurant"))
		if restaurantID == "" {
			continue
		}
		if _, ok := restaurantNames[restaurantID]; ok {
			continue
		}

		restaurant, err := app.FindRecordById("restaurants", restaurantID)
		if err != nil {
			return nil, err
		}

		restaurantNames[restaurantID] = strings.TrimSpace(restaurant.GetString("name"))
	}

	for _, visit := range visits {
		restaurantID := strings.TrimSpace(visit.GetString("restaurant"))
		if restaurantID == "" {
			continue
		}
		if _, ok := restaurantNames[restaurantID]; ok {
			continue
		}

		restaurant, err := app.FindRecordById("restaurants", restaurantID)
		if err != nil {
			return nil, err
		}

		restaurantNames[restaurantID] = strings.TrimSpace(restaurant.GetString("name"))
	}

	return restaurantNames, nil
}

func loadModerationFeedEntries(app core.App, userID string) ([]map[string]any, error) {
	params := dbx.Params{"userId": userID}

	visits, err := app.FindRecordsByFilter("visits", "user = {:userId}", "-visitDate,-created", 100, 0, params)
	if err != nil {
		return nil, err
	}

	quickTracks, err := app.FindRecordsByFilter(
		"food_items",
		"user = {:userId} && isQuickTrack = true",
		"-itemDate,-created",
		100,
		0,
		params,
	)
	if err != nil {
		return nil, err
	}

	visitIDs := extractRecordIDs(visits)
	visitItems, err := findRecordsByRelationValues(app, "food_items", "visit", visitIDs, "-created")
	if err != nil {
		return nil, err
	}
	itemsByVisitID := groupRecordsByField(visitItems, "visit")

	quickTrackVisitIDs := make([]string, 0, len(quickTracks))
	photoFoodItemIDs := extractRecordIDs(visitItems)
	for _, quickTrack := range quickTracks {
		photoFoodItemIDs = append(photoFoodItemIDs, quickTrack.Id)
		if visitID := strings.TrimSpace(quickTrack.GetString("visit")); visitID != "" {
			quickTrackVisitIDs = append(quickTrackVisitIDs, visitID)
		}
	}

	quickTrackVisits, err := findRecordsByIDs(app, "visits", quickTrackVisitIDs)
	if err != nil {
		return nil, err
	}
	quickTrackVisitsByID := mapRecordsByID(quickTrackVisits)

	restaurantIDs := make([]string, 0, len(visits)+len(quickTrackVisits))
	for _, visit := range visits {
		if restaurantID := strings.TrimSpace(visit.GetString("restaurant")); restaurantID != "" {
			restaurantIDs = append(restaurantIDs, restaurantID)
		}
	}
	for _, visit := range quickTrackVisits {
		if restaurantID := strings.TrimSpace(visit.GetString("restaurant")); restaurantID != "" {
			restaurantIDs = append(restaurantIDs, restaurantID)
		}
	}

	restaurants, err := findRecordsByIDs(app, "restaurants", restaurantIDs)
	if err != nil {
		return nil, err
	}
	restaurantsByID := mapRecordsByID(restaurants)

	photos, err := findRecordsByRelationValues(app, "visit_photos", "food_item", photoFoodItemIDs, "-created")
	if err != nil {
		return nil, err
	}
	photosByFoodItemID := groupRecordsByField(photos, "food_item")

	entries := make([]map[string]any, 0, len(visits)+len(quickTracks))
	for _, visit := range visits {
		eventAt := strings.TrimSpace(visit.GetString("visitDate"))
		if eventAt == "" {
			eventAt = visit.GetString("created")
		}

		restaurant := restaurantsByID[visit.GetString("restaurant")]
		entries = append(entries, map[string]any{
			"id":                    visit.Id,
			"contentType":           "visit",
			"moderationStatus":      strings.TrimSpace(visit.GetString("moderationStatus")),
			"eventAt":               eventAt,
			"created":               visit.GetString("created"),
			"updated":               visit.GetString("updated"),
			"visibility":            visit.GetString("visibility"),
			"restaurantId":          visit.GetString("restaurant"),
			"restaurantName":        resolveRestaurantName(restaurant),
			"restaurantLocation":    resolveRestaurantLocation(restaurant),
			"restaurantCuisineType": resolveRestaurantCuisine(restaurant),
			"items":                 serializeModerationFeedItems(itemsByVisitID[visit.Id], photosByFoodItemID),
		})
	}

	for _, quickTrack := range quickTracks {
		eventAt := strings.TrimSpace(quickTrack.GetString("itemDate"))
		if eventAt == "" {
			eventAt = quickTrack.GetString("created")
		}

		linkedVisit := quickTrackVisitsByID[quickTrack.GetString("visit")]
		linkedRestaurant := (*core.Record)(nil)
		if linkedVisit != nil {
			linkedRestaurant = restaurantsByID[linkedVisit.GetString("restaurant")]
		}

		restaurantName := strings.TrimSpace(quickTrack.GetString("location_text"))
		if restaurantName == "" {
			restaurantName = resolveRestaurantName(linkedRestaurant)
		}
		if restaurantName == "" {
			restaurantName = "Quick Track"
		}

		entries = append(entries, map[string]any{
			"id":               quickTrack.Id,
			"contentType":      "quick-track",
			"moderationStatus": strings.TrimSpace(quickTrack.GetString("moderationStatus")),
			"eventAt":          eventAt,
			"created":          quickTrack.GetString("created"),
			"updated":          quickTrack.GetString("updated"),
			"visibility":       quickTrack.GetString("visibility"),
			"restaurantName":   restaurantName,
			"locationText":     strings.TrimSpace(quickTrack.GetString("location_text")),
			"itemName":         quickTrack.GetString("name"),
			"itemCategory":     quickTrack.GetString("itemCategory"),
			"rating":           quickTrack.GetFloat("rating"),
			"notes":            quickTrack.GetString("notes"),
			"photos":           serializeModerationPhotos(photosByFoodItemID[quickTrack.Id]),
		})
	}

	sort.SliceStable(entries, func(i, j int) bool {
		return fmt.Sprint(entries[i]["eventAt"]) > fmt.Sprint(entries[j]["eventAt"])
	})

	return entries, nil
}

func loadModerationRestaurantLists(app core.App, userID string) ([]map[string]any, error) {
	params := dbx.Params{"userId": userID}
	lists, err := app.FindRecordsByFilter("restaurant_lists", "user = {:userId}", "-updated", 50, 0, params)
	if err != nil {
		return nil, err
	}

	listItems, err := findRecordsByRelationValues(app, "list_items", "list", extractRecordIDs(lists), "position,-created")
	if err != nil {
		return nil, err
	}
	itemsByListID := groupRecordsByField(listItems, "list")

	restaurantIDs := make([]string, 0, len(listItems))
	foodItemIDs := make([]string, 0, len(listItems)*2)
	for _, item := range listItems {
		if restaurantID := strings.TrimSpace(item.GetString("restaurant")); restaurantID != "" {
			restaurantIDs = append(restaurantIDs, restaurantID)
		}
		if foodItemID := strings.TrimSpace(item.GetString("foodItem")); foodItemID != "" {
			foodItemIDs = append(foodItemIDs, foodItemID)
		}
		if userFoodItemID := strings.TrimSpace(item.GetString("userFoodItem")); userFoodItemID != "" {
			foodItemIDs = append(foodItemIDs, userFoodItemID)
		}
	}

	restaurants, err := findRecordsByIDs(app, "restaurants", restaurantIDs)
	if err != nil {
		return nil, err
	}
	restaurantsByID := mapRecordsByID(restaurants)

	foodItems, err := findRecordsByIDs(app, "food_items", foodItemIDs)
	if err != nil {
		return nil, err
	}
	foodItemsByID := mapRecordsByID(foodItems)

	result := make([]map[string]any, 0, len(lists))
	for _, list := range lists {
		result = append(result, map[string]any{
			"id":               list.Id,
			"name":             list.GetString("name"),
			"moderationStatus": strings.TrimSpace(list.GetString("moderationStatus")),
			"description":      list.GetString("description"),
			"visibility":       list.GetString("visibility"),
			"isDefault":        list.GetBool("isDefault"),
			"isCollaborative":  list.GetBool("isCollaborative"),
			"created":          list.GetString("created"),
			"updated":          list.GetString("updated"),
			"items":            serializeModerationListItems(itemsByListID[list.Id], restaurantsByID, foodItemsByID),
		})
	}

	return result, nil
}

func loadModerationBills(app core.App, userID string) ([]map[string]any, error) {
	params := dbx.Params{"userId": userID}
	createdBills, err := app.FindRecordsByFilter("bills", "creator_user = {:userId}", "-updated", 50, 0, params)
	if err != nil {
		return nil, err
	}

	userParticipantRecords, err := app.FindRecordsByFilter("bill_participants", "user = {:userId}", "-updated", 200, 0, params)
	if err != nil {
		return nil, err
	}

	participantBills, err := findRecordsByRelationValues(
		app,
		"bills",
		"id",
		extractRelationFieldValues(userParticipantRecords, "bill"),
		"",
	)
	if err != nil {
		return nil, err
	}

	billsByID := make(map[string]*core.Record, len(createdBills)+len(participantBills))
	for _, bill := range createdBills {
		billsByID[bill.Id] = bill
	}
	for _, bill := range participantBills {
		billsByID[bill.Id] = bill
	}

	bills := make([]*core.Record, 0, len(billsByID))
	for _, bill := range billsByID {
		bills = append(bills, bill)
	}

	sort.SliceStable(bills, func(i, j int) bool {
		return bills[i].GetString("updated") > bills[j].GetString("updated")
	})

	billIDs := extractRecordIDs(bills)
	allParticipantRecords, err := findRecordsByRelationValues(app, "bill_participants", "bill", billIDs, "-updated")
	if err != nil {
		return nil, err
	}
	participantsByBillID := groupRecordsByField(allParticipantRecords, "bill")
	userParticipantsByBillID := groupRecordsByField(userParticipantRecords, "bill")

	billItems, err := findRecordsByRelationValues(app, "bill_items", "bill", billIDs, "-created")
	if err != nil {
		return nil, err
	}
	itemsByBillID := groupRecordsByField(billItems, "bill")

	result := make([]map[string]any, 0, len(bills))
	for _, bill := range bills {
		userParticipant := (*core.Record)(nil)
		if candidates := userParticipantsByBillID[bill.Id]; len(candidates) > 0 {
			userParticipant = candidates[0]
		}

		entry := map[string]any{
			"id":               bill.Id,
			"billName":         bill.GetString("bill_name"),
			"totalAmount":      bill.GetFloat("total_amount"),
			"tax":              bill.GetFloat("tax"),
			"tip":              bill.GetFloat("tip"),
			"fees":             bill.GetFloat("fees"),
			"splitMode":        bill.GetString("split_mode"),
			"extrasSplitMode":  bill.GetString("extras_split_mode"),
			"status":           bill.GetString("status"),
			"participantCount": len(participantsByBillID[bill.Id]),
			"itemCount":        len(itemsByBillID[bill.Id]),
			"isCreator":        bill.GetString("creator_user") == userID,
			"created":          bill.GetString("created"),
			"updated":          bill.GetString("updated"),
		}

		if userParticipant != nil {
			entry["amountOwed"] = userParticipant.GetFloat("amount_owed")
			entry["paidStatus"] = userParticipant.GetString("paid_status")
			entry["paymentMethod"] = userParticipant.GetString("payment_method")
		}

		result = append(result, entry)
	}

	return result, nil
}

func serializeModerationFeedItems(
	items []*core.Record,
	photosByFoodItemID map[string][]*core.Record,
) []map[string]any {
	result := make([]map[string]any, 0, len(items))
	for _, item := range items {
		result = append(result, map[string]any{
			"id":               item.Id,
			"moderationStatus": strings.TrimSpace(item.GetString("moderationStatus")),
			"name":             item.GetString("name"),
			"rating":           item.GetFloat("rating"),
			"description":      item.GetString("description"),
			"notes":            item.GetString("notes"),
			"created":          item.GetString("created"),
			"photos":           serializeModerationPhotos(photosByFoodItemID[item.Id]),
		})
	}

	return result
}

func serializeModerationPhotos(records []*core.Record) []map[string]any {
	result := make([]map[string]any, 0, len(records))
	for _, record := range records {
		result = append(result, map[string]any{
			"id":               record.Id,
			"moderationStatus": strings.TrimSpace(record.GetString("moderationStatus")),
			"photo":            record.GetString("photo"),
			"caption":          record.GetString("caption"),
			"created":          record.GetString("created"),
			"collectionName":   "visit_photos",
		})
	}

	return result
}

func serializeModerationListItems(
	items []*core.Record,
	restaurantsByID map[string]*core.Record,
	foodItemsByID map[string]*core.Record,
) []map[string]any {
	result := make([]map[string]any, 0, len(items))
	for _, item := range items {
		foodItem := foodItemsByID[item.GetString("foodItem")]
		userFoodItem := foodItemsByID[item.GetString("userFoodItem")]
		restaurant := restaurantsByID[item.GetString("restaurant")]

		result = append(result, map[string]any{
			"id":                 item.Id,
			"moderationStatus":   strings.TrimSpace(item.GetString("moderationStatus")),
			"position":           item.GetFloat("position"),
			"note":               item.GetString("note"),
			"created":            item.GetString("created"),
			"restaurantId":       item.GetString("restaurant"),
			"restaurantName":     resolveRestaurantName(restaurant),
			"restaurantLocation": resolveRestaurantLocation(restaurant),
			"foodItemId":         item.GetString("foodItem"),
			"foodItemName":       resolveRecordName(foodItem),
			"foodItemRating":     resolveRecordRating(foodItem),
			"userFoodItemId":     item.GetString("userFoodItem"),
			"userFoodItemName":   resolveRecordName(userFoodItem),
			"userFoodItemRating": resolveRecordRating(userFoodItem),
		})
	}

	return result
}

func optionalStringValue(value *string) string {
	if value == nil {
		return ""
	}

	return strings.TrimSpace(*value)
}

func normalizeUserModerationState(value string) (string, error) {
	switch strings.TrimSpace(value) {
	case "", lib.UserModerationStateActive:
		return lib.UserModerationStateActive, nil
	case lib.UserModerationStateWarned:
		return lib.UserModerationStateWarned, nil
	case lib.UserModerationStateRestricted:
		return lib.UserModerationStateRestricted, nil
	case lib.UserModerationStateBanned:
		return lib.UserModerationStateBanned, nil
	default:
		return "", fmt.Errorf("invalid moderationState")
	}
}

func normalizeContentModerationMode(value string) (string, error) {
	switch strings.TrimSpace(value) {
	case "", lib.ContentModerationModeNormal:
		return lib.ContentModerationModeNormal, nil
	case lib.ContentModerationModePreReview:
		return lib.ContentModerationModePreReview, nil
	default:
		return "", fmt.Errorf("invalid contentModerationMode")
	}
}

func resolveUserModerationStateFromAction(action string) (string, bool) {
	switch strings.TrimSpace(action) {
	case lib.ModerationActionWarn:
		return lib.UserModerationStateWarned, true
	case lib.ModerationActionRestrict:
		return lib.UserModerationStateRestricted, true
	case lib.ModerationActionBan:
		return lib.UserModerationStateBanned, true
	case lib.ModerationActionRestore:
		return lib.UserModerationStateActive, true
	default:
		return "", false
	}
}

func applyOptionalModerationDateField(record *core.Record, fieldName string, rawValue *string) error {
	if rawValue == nil {
		return nil
	}

	trimmed := strings.TrimSpace(*rawValue)
	if trimmed == "" {
		record.Set(fieldName, "")
		return nil
	}

	parsed, err := parseModerationTime(trimmed)
	if err != nil {
		return fmt.Errorf("%s must be a valid datetime", fieldName)
	}

	record.Set(fieldName, parsed.UTC())
	return nil
}

func parseModerationTime(value string) (time.Time, error) {
	for _, layout := range []string{
		time.RFC3339,
		"2006-01-02T15:04",
		"2006-01-02 15:04:05",
		"2006-01-02",
	} {
		if parsed, err := time.Parse(layout, value); err == nil {
			return parsed, nil
		}
	}

	return time.Time{}, fmt.Errorf("invalid time")
}

func loadUserModerationCases(app core.App, userID string) ([]map[string]any, error) {
	records, err := app.FindRecordsByFilter(
		"moderation_cases",
		"targetUser = {:targetUser}",
		"-updated,-created",
		50,
		0,
		map[string]any{"targetUser": userID},
	)
	if err != nil {
		return nil, err
	}

	return serializeModerationCases(app, records)
}

func applyUserModerationUpdate(user *core.Record, moderatorID string, input adminUserModerationInput) error {
	if user == nil {
		return fmt.Errorf("user is required")
	}

	nextState, err := normalizeUserModerationState(user.GetString("moderationState"))
	if err != nil {
		nextState = lib.UserModerationStateActive
	}

	if actionState, ok := resolveUserModerationStateFromAction(input.Action); ok {
		nextState = actionState
	}

	if input.ModerationState != nil {
		explicitState, err := normalizeUserModerationState(*input.ModerationState)
		if err != nil {
			return err
		}
		nextState = explicitState
	}

	user.Set("moderationState", nextState)

	if input.ContentModerationMode != nil {
		mode, err := normalizeContentModerationMode(*input.ContentModerationMode)
		if err != nil {
			return err
		}
		user.Set("contentModerationMode", mode)
	}

	if input.WarningCount != nil {
		if *input.WarningCount < 0 {
			return fmt.Errorf("warningCount cannot be negative")
		}
		user.Set("warningCount", *input.WarningCount)
	} else if strings.TrimSpace(input.Action) == lib.ModerationActionWarn {
		user.Set("warningCount", user.GetInt("warningCount")+1)
	}

	if input.ModerationNotice != nil {
		user.Set("moderationNotice", strings.TrimSpace(*input.ModerationNotice))
	}
	if input.ModerationNotes != nil {
		user.Set("moderationNotes", strings.TrimSpace(*input.ModerationNotes))
	}

	if err := applyOptionalModerationDateField(user, "postingSuspendedUntil", input.PostingSuspendedUntil); err != nil {
		return err
	}
	if err := applyOptionalModerationDateField(user, "photoSuspendedUntil", input.PhotoSuspendedUntil); err != nil {
		return err
	}

	if strings.TrimSpace(input.Action) == lib.ModerationActionRestore {
		if input.PostingSuspendedUntil == nil {
			user.Set("postingSuspendedUntil", "")
		}
		if input.PhotoSuspendedUntil == nil {
			user.Set("photoSuspendedUntil", "")
		}
	}

	user.Set("moderatedAt", time.Now().UTC())
	user.Set("moderatedBy", strings.TrimSpace(moderatorID))
	return nil
}

func resolveUserModerationAction(action string, moderationState string) string {
	if trimmedAction := strings.TrimSpace(action); trimmedAction != "" {
		return trimmedAction
	}

	switch strings.TrimSpace(moderationState) {
	case lib.UserModerationStateWarned:
		return lib.ModerationActionWarn
	case lib.UserModerationStateRestricted:
		return lib.ModerationActionRestrict
	case lib.UserModerationStateBanned:
		return lib.ModerationActionBan
	case lib.UserModerationStateActive:
		return lib.ModerationActionRestore
	default:
		return lib.ModerationActionMarkReviewed
	}
}

func resolveUserModerationCaseStatus(action string, moderationState string) string {
	switch strings.TrimSpace(action) {
	case lib.ModerationActionRestore:
		return lib.ModerationCaseStatusRestored
	case lib.ModerationActionWarn:
		return lib.ModerationCaseStatusWarned
	case lib.ModerationActionRestrict:
		return lib.ModerationCaseStatusRestricted
	case lib.ModerationActionBan:
		return lib.ModerationCaseStatusBanned
	}

	switch strings.TrimSpace(moderationState) {
	case lib.UserModerationStateWarned:
		return lib.ModerationCaseStatusWarned
	case lib.UserModerationStateRestricted:
		return lib.ModerationCaseStatusRestricted
	case lib.UserModerationStateBanned:
		return lib.ModerationCaseStatusBanned
	case lib.UserModerationStateActive:
		return lib.ModerationCaseStatusRestored
	default:
		return lib.ModerationCaseStatusReviewed
	}
}

func applyContentModerationAction(record *core.Record, action string, moderatorID string) error {
	if record == nil {
		return fmt.Errorf("content record is required")
	}

	switch strings.TrimSpace(action) {
	case "", lib.ModerationActionMarkReviewed:
		lib.ApplyContentModerationState(record, lib.ContentModerationStatusReviewed, moderatorID)
	case lib.ModerationActionQuarantine:
		lib.ApplyContentModerationState(record, lib.ContentModerationStatusUnderReview, moderatorID)
	case lib.ModerationActionHide:
		lib.ApplyContentModerationState(record, lib.ContentModerationStatusHidden, moderatorID)
	case lib.ModerationActionRemove:
		lib.ApplyContentModerationState(record, lib.ContentModerationStatusRemoved, moderatorID)
	case lib.ModerationActionRestore:
		lib.ApplyContentModerationState(record, lib.ContentModerationStatusActive, moderatorID)
	case lib.ModerationActionEscalate:
		lib.ApplyContentModerationState(record, lib.ContentModerationStatusEscalated, moderatorID)
	case lib.ModerationActionRestrictVisibility:
		if record.Collection().Fields.GetByName("visibility") == nil {
			return fmt.Errorf("this content does not support visibility restriction")
		}
		record.Set("visibility", "private")
		lib.ApplyContentModerationState(record, lib.ContentModerationStatusReviewed, moderatorID)
	default:
		return fmt.Errorf("unsupported moderation action")
	}

	return nil
}

func resolveContentModerationCaseStatus(action string) string {
	switch strings.TrimSpace(action) {
	case "", lib.ModerationActionMarkReviewed:
		return lib.ModerationCaseStatusReviewed
	case lib.ModerationActionQuarantine:
		return lib.ModerationCaseStatusUnderReview
	case lib.ModerationActionHide:
		return lib.ModerationCaseStatusHidden
	case lib.ModerationActionRemove:
		return lib.ModerationCaseStatusRemoved
	case lib.ModerationActionRestore:
		return lib.ModerationCaseStatusRestored
	case lib.ModerationActionEscalate:
		return lib.ModerationCaseStatusEscalated
	case lib.ModerationActionRestrictVisibility:
		return lib.ModerationCaseStatusRestrictedVisibility
	default:
		return lib.ModerationCaseStatusOpen
	}
}

func normalizeModerationTargetType(contentType string) string {
	switch strings.TrimSpace(contentType) {
	case "visit":
		return "visit"
	case "food-item":
		return "food-item"
	case "quick-track":
		return "quick-track"
	case "list":
		return "list"
	case "list-item":
		return "list-item"
	case "note":
		return "note"
	case "photo":
		return "photo"
	case "user":
		return "user"
	default:
		return strings.TrimSpace(contentType)
	}
}

func resolveModerationTargetRecord(
	app core.App,
	userID string,
	contentType string,
	recordID string,
) (*core.Record, error) {
	switch contentType {
	case "visit":
		record, err := app.FindRecordById("visits", recordID)
		if err != nil {
			return nil, apis.NewNotFoundError("visit not found", err)
		}
		if record.GetString("user") != userID {
			return nil, apis.NewNotFoundError("visit not found for that user", nil)
		}
		return record, nil
	case "quick-track":
		record, err := app.FindRecordById("food_items", recordID)
		if err != nil {
			return nil, apis.NewNotFoundError("quick track not found", err)
		}
		if record.GetString("user") != userID || !record.GetBool("isQuickTrack") {
			return nil, apis.NewNotFoundError("quick track not found for that user", nil)
		}
		return record, nil
	case "food-item":
		record, err := app.FindRecordById("food_items", recordID)
		if err != nil {
			return nil, apis.NewNotFoundError("food item not found", err)
		}
		if record.GetString("user") != userID || record.GetBool("isQuickTrack") {
			return nil, apis.NewNotFoundError("food item not found for that user", nil)
		}
		return record, nil
	case "list":
		record, err := app.FindRecordById("restaurant_lists", recordID)
		if err != nil {
			return nil, apis.NewNotFoundError("list not found", err)
		}
		if record.GetString("user") != userID {
			return nil, apis.NewNotFoundError("list not found for that user", nil)
		}
		return record, nil
	case "list-item":
		record, err := app.FindRecordById("list_items", recordID)
		if err != nil {
			return nil, apis.NewNotFoundError("list item not found", err)
		}

		parentList, err := app.FindRecordById("restaurant_lists", record.GetString("list"))
		if err != nil {
			return nil, apis.NewNotFoundError("parent list not found", err)
		}
		if parentList.GetString("user") != userID {
			return nil, apis.NewNotFoundError("list item not found for that user", nil)
		}

		return record, nil
	case "note":
		record, err := app.FindRecordById("notes", recordID)
		if err != nil {
			return nil, apis.NewNotFoundError("note not found", err)
		}
		if record.GetString("user") != userID {
			return nil, apis.NewNotFoundError("note not found for that user", nil)
		}
		return record, nil
	case "photo":
		record, err := app.FindRecordById("visit_photos", recordID)
		if err != nil {
			return nil, apis.NewNotFoundError("photo not found", err)
		}
		if record.GetString("user") != userID {
			return nil, apis.NewNotFoundError("photo not found for that user", nil)
		}
		return record, nil
	default:
		return nil, apis.NewBadRequestError("unsupported moderation content type", nil)
	}
}

func extractRecordIDs(records []*core.Record) []string {
	ids := make([]string, 0, len(records))
	for _, record := range records {
		if strings.TrimSpace(record.Id) == "" {
			continue
		}

		ids = append(ids, record.Id)
	}

	return ids
}

func extractRelationFieldValues(records []*core.Record, fieldName string) []string {
	values := make([]string, 0, len(records))
	for _, record := range records {
		value := strings.TrimSpace(record.GetString(fieldName))
		if value == "" {
			continue
		}

		values = append(values, value)
	}

	return values
}

func findRecordsByIDs(app core.App, collectionName string, ids []string) ([]*core.Record, error) {
	if len(ids) == 0 {
		return nil, nil
	}

	params := dbx.Params{}
	clauses := make([]string, 0, len(ids))
	seen := map[string]struct{}{}
	index := 0
	for _, id := range ids {
		trimmedID := strings.TrimSpace(id)
		if trimmedID == "" {
			continue
		}
		if _, ok := seen[trimmedID]; ok {
			continue
		}
		seen[trimmedID] = struct{}{}

		paramKey := fmt.Sprintf("id%d", index)
		clauses = append(clauses, fmt.Sprintf("id = {:%s}", paramKey))
		params[paramKey] = trimmedID
		index++
	}

	if len(clauses) == 0 {
		return nil, nil
	}

	filter := strings.Join(clauses, " || ")
	if len(clauses) > 1 {
		filter = "(" + filter + ")"
	}

	return app.FindRecordsByFilter(collectionName, filter, "", len(clauses), 0, params)
}

func findRecordsByRelationValues(
	app core.App,
	collectionName string,
	fieldName string,
	values []string,
	sortExpr string,
) ([]*core.Record, error) {
	if len(values) == 0 {
		return nil, nil
	}

	params := dbx.Params{}
	clauses := make([]string, 0, len(values))
	seen := map[string]struct{}{}
	index := 0
	for _, value := range values {
		trimmedValue := strings.TrimSpace(value)
		if trimmedValue == "" {
			continue
		}
		if _, ok := seen[trimmedValue]; ok {
			continue
		}
		seen[trimmedValue] = struct{}{}

		paramKey := fmt.Sprintf("value%d", index)
		clauses = append(clauses, fmt.Sprintf("%s = {:%s}", fieldName, paramKey))
		params[paramKey] = trimmedValue
		index++
	}

	if len(clauses) == 0 {
		return nil, nil
	}

	filter := strings.Join(clauses, " || ")
	if len(clauses) > 1 {
		filter = "(" + filter + ")"
	}

	return app.FindRecordsByFilter(collectionName, filter, sortExpr, 2000, 0, params)
}

func groupRecordsByField(records []*core.Record, fieldName string) map[string][]*core.Record {
	result := make(map[string][]*core.Record)
	for _, record := range records {
		fieldValue := strings.TrimSpace(record.GetString(fieldName))
		if fieldValue == "" {
			continue
		}

		result[fieldValue] = append(result[fieldValue], record)
	}

	return result
}

func mapRecordsByID(records []*core.Record) map[string]*core.Record {
	result := make(map[string]*core.Record, len(records))
	for _, record := range records {
		result[record.Id] = record
	}

	return result
}

func resolveRestaurantName(record *core.Record) string {
	if record == nil {
		return ""
	}

	return strings.TrimSpace(record.GetString("name"))
}

func resolveRestaurantLocation(record *core.Record) string {
	if record == nil {
		return ""
	}

	return strings.TrimSpace(record.GetString("location"))
}

func resolveRestaurantCuisine(record *core.Record) string {
	if record == nil {
		return ""
	}

	return strings.TrimSpace(record.GetString("cuisineType"))
}

func resolveRecordName(record *core.Record) string {
	if record == nil {
		return ""
	}

	return strings.TrimSpace(record.GetString("name"))
}

func resolveRecordRating(record *core.Record) float64 {
	if record == nil {
		return 0
	}

	return record.GetFloat("rating")
}

func serializeVisits(records []*core.Record, restaurantNames map[string]string) []map[string]any {
	result := make([]map[string]any, 0, len(records))
	for _, record := range records {
		entry := map[string]any{
			"id":         record.Id,
			"user":       record.GetString("user"),
			"restaurant": record.GetString("restaurant"),
			"visitDate":  record.GetString("visitDate"),
			"created":    record.GetString("created"),
		}

		if restaurantName := restaurantNames[record.GetString("restaurant")]; restaurantName != "" {
			entry["expand"] = map[string]any{
				"restaurant": map[string]any{
					"id":   record.GetString("restaurant"),
					"name": restaurantName,
				},
			}
		}

		result = append(result, entry)
	}

	return result
}

func serializeFoodItems(records []*core.Record) []map[string]any {
	result := make([]map[string]any, 0, len(records))
	for _, record := range records {
		result = append(result, map[string]any{
			"id":      record.Id,
			"name":    record.GetString("name"),
			"rating":  record.GetFloat("rating"),
			"created": record.GetString("created"),
		})
	}

	return result
}

func serializeNotes(records []*core.Record) []map[string]any {
	result := make([]map[string]any, 0, len(records))
	for _, record := range records {
		result = append(result, map[string]any{
			"id":      record.Id,
			"content": record.GetString("content"),
			"created": record.GetString("created"),
		})
	}

	return result
}

func serializeFeedback(records []*core.Record) []map[string]any {
	result := make([]map[string]any, 0, len(records))
	for _, record := range records {
		result = append(result, map[string]any{
			"id":                 record.Id,
			"user":               record.GetString("user"),
			"title":              record.GetString("title"),
			"description":        record.GetString("description"),
			"status":             record.GetString("status"),
			"admin_unread_count": record.GetInt("admin_unread_count"),
			"user_unread_count":  record.GetInt("user_unread_count"),
			"last_message_at":    record.GetString("last_message_at"),
			"created":            record.GetString("created"),
			"updated":            record.GetString("updated"),
		})
	}

	return result
}

func serializePhotos(records []*core.Record) []map[string]any {
	result := make([]map[string]any, 0, len(records))
	for _, record := range records {
		result = append(result, map[string]any{
			"id":             record.Id,
			"collectionName": record.Collection().Name,
			"user":           record.GetString("user"),
			"visit":          record.GetString("visit"),
			"foodItem":       record.GetString("food_item"),
			"photo":          record.GetString("photo"),
			"created":        record.GetString("created"),
		})
	}

	return result
}

func serializeRestaurants(records []*core.Record) []map[string]any {
	result := make([]map[string]any, 0, len(records))
	for _, record := range records {
		result = append(result, map[string]any{
			"id":         record.Id,
			"name":       record.GetString("name"),
			"location":   record.GetString("location"),
			"visibility": record.GetString("visibility"),
			"created":    record.GetString("created"),
			"updated":    record.GetString("updated"),
		})
	}

	return result
}

func serializeMenuItems(records []*core.Record, restaurantNames map[string]string) []map[string]any {
	result := make([]map[string]any, 0, len(records))
	for _, record := range records {
		restaurantID := record.GetString("restaurant")

		result = append(result, map[string]any{
			"id":             record.Id,
			"restaurant":     restaurantID,
			"restaurantName": restaurantNames[restaurantID],
			"name":           record.GetString("name"),
			"visibility":     record.GetString("visibility"),
			"created":        record.GetString("created"),
			"updated":        record.GetString("updated"),
		})
	}

	return result
}
