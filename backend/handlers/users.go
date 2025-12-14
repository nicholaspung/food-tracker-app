package handlers

import (
	"log"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

// RegisterUserHandlers registers all user management endpoints
func RegisterUserHandlers(se *core.ServeEvent, app core.App) {
	// Custom API endpoint: Elevate user to subscriber (admin only)
	se.Router.POST("/api/users/elevate-subscriber", func(e *core.RequestEvent) error {
		authRecord := e.Auth
		if authRecord == nil {
			return apis.NewUnauthorizedError("authentication required", nil)
		}

		// Check if this user is an admin
		isAdmin := authRecord.GetBool("isAdmin")
		if !isAdmin {
			return apis.NewForbiddenError("only admins can elevate users to subscriber status", nil)
		}

		// Parse request body for email
		data := struct {
			Email string `json:"email"`
		}{}
		if err := e.BindBody(&data); err != nil {
			return apis.NewBadRequestError("invalid request body", err)
		}

		if data.Email == "" {
			return apis.NewBadRequestError("email is required", nil)
		}

		// Find user by email
		user, err := app.FindFirstRecordByFilter(
			"users",
			"email = {:email}",
			dbx.Params{"email": data.Email},
		)
		if err != nil {
			log.Printf("User lookup error for email %s: %v", data.Email, err)
			return apis.NewNotFoundError("user not found with that email address", err)
		}

		// Update user to be a subscriber
		user.Set("isSubscriber", true)
		if err := app.Save(user); err != nil {
			log.Printf("Failed to update user %s to subscriber: %v", user.Id, err)
			return apis.NewApiError(500, "failed to elevate user to subscriber", err)
		}

		log.Printf("Admin %s elevated user %s (%s) to subscriber", authRecord.Id, user.Id, data.Email)

		return e.JSON(200, map[string]any{
			"success": true,
			"message": "User successfully elevated to subscriber",
			"userId":  user.Id,
			"email":   data.Email,
		})
	})
}
