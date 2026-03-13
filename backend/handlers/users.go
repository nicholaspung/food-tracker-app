package handlers

import (
	"log"
	"sort"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

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

		profile, err := loadUserModerationProfile(app, userID)
		if err != nil {
			log.Printf("Admin user profile load failed for %q: %v", userID, err)
			return apis.NewApiError(500, "failed to load user profile", err)
		}

		return e.JSON(200, profile)
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

		user.Set("isSubscriber", data.IsSubscriber)
		user.Set("isBetaUser", data.IsBetaUser)
		if err := app.Save(user); err != nil {
			log.Printf("Admin access update failed for user %s: %v", userID, err)
			return apis.NewApiError(500, "failed to update user access", err)
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
	return map[string]any{
		"id":           user.Id,
		"email":        user.Email(),
		"name":         strings.TrimSpace(user.GetString("name")),
		"isAdmin":      user.GetBool("isAdmin"),
		"isSubscriber": user.GetBool("isSubscriber"),
		"isBetaUser":   user.GetBool("isBetaUser"),
		"created":      user.GetString("created"),
		"updated":      user.GetString("updated"),
	}
}

func loadUserModerationProfile(app core.App, userID string) (map[string]any, error) {
	user, err := app.FindRecordById("users", userID)
	if err != nil {
		return nil, err
	}

	params := dbx.Params{"userId": userID}
	visits, err := app.FindRecordsByFilter("visits", "user = {:userId}", "-visitDate,-created", 10, 0, params)
	if err != nil {
		return nil, err
	}

	foodItems, err := app.FindRecordsByFilter("food_items", "user = {:userId}", "-created", 10, 0, params)
	if err != nil {
		return nil, err
	}

	notes, err := app.FindRecordsByFilter("notes", "user = {:userId}", "-created", 10, 0, params)
	if err != nil {
		return nil, err
	}

	feedback, err := app.FindRecordsByFilter("feedback", "user = {:userId}", "-updated", 10, 0, params)
	if err != nil {
		return nil, err
	}

	photos, err := app.FindRecordsByFilter("visit_photos", "user = {:userId}", "-created", 10, 0, params)
	if err != nil {
		return nil, err
	}

	sort.SliceStable(feedback, func(i, j int) bool {
		return feedback[i].GetString("updated") > feedback[j].GetString("updated")
	})

	return map[string]any{
		"user":            serializeAdminUser(user),
		"recentVisits":    serializeVisits(visits),
		"recentFoodItems": serializeFoodItems(foodItems),
		"recentNotes":     serializeNotes(notes),
		"recentFeedback":  serializeFeedback(feedback),
		"recentPhotos":    serializePhotos(photos),
	}, nil
}

func serializeVisits(records []*core.Record) []map[string]any {
	result := make([]map[string]any, 0, len(records))
	for _, record := range records {
		result = append(result, map[string]any{
			"id":        record.Id,
			"user":      record.GetString("user"),
			"restaurant": record.GetString("restaurant"),
			"visitDate": record.GetString("visitDate"),
			"created":   record.GetString("created"),
		})
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
			"id":       record.Id,
			"user":     record.GetString("user"),
			"visit":    record.GetString("visit"),
			"foodItem": record.GetString("foodItem"),
			"photo":    record.GetString("photo"),
			"created":  record.GetString("created"),
		})
	}

	return result
}
