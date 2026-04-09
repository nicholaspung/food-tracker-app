package handlers

import (
	"fmt"
	"strings"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

const (
	maxProfileBioLength             = 500
	maxProfileDisplayNameLength     = 120
	maxProfileFavoriteCuisineLength = 120
	maxProfileLocationLength        = 200
)

type selfProfileResponse struct {
	DisplayName            string `json:"displayName"`
	Bio                    string `json:"bio"`
	Location               string `json:"location"`
	FavoriteCuisine        string `json:"favoriteCuisine"`
	ReceiveMarketingEmails bool   `json:"receiveMarketingEmails"`
}

type selfProfileUpdateRequest struct {
	DisplayName            *string `json:"displayName"`
	Bio                    *string `json:"bio"`
	Location               *string `json:"location"`
	FavoriteCuisine        *string `json:"favoriteCuisine"`
	ReceiveMarketingEmails *bool   `json:"receiveMarketingEmails"`
}

func registerSelfProfileHandlers(se *core.ServeEvent, app core.App) {
	se.Router.GET("/api/profile", func(e *core.RequestEvent) error {
		if e.Auth == nil {
			return apis.NewUnauthorizedError("authentication required", nil)
		}

		return e.JSON(200, serializeSelfProfile(e.Auth))
	}).Bind(apis.RequireAuth())

	se.Router.PATCH("/api/profile", func(e *core.RequestEvent) error {
		if e.Auth == nil {
			return apis.NewUnauthorizedError("authentication required", nil)
		}

		requestBody := selfProfileUpdateRequest{}
		if err := e.BindBody(&requestBody); err != nil {
			return apis.NewBadRequestError("invalid request body", err)
		}

		var responsePayload selfProfileResponse
		if err := app.RunInTransaction(func(txApp core.App) error {
			userRecord, err := txApp.FindRecordById("users", e.Auth.Id)
			if err != nil {
				return apis.NewNotFoundError("user not found", err)
			}

			if requestBody.DisplayName != nil {
				displayName, normalizeErr := normalizeRequiredProfileString(
					*requestBody.DisplayName,
					"displayName",
					maxProfileDisplayNameLength,
				)
				if normalizeErr != nil {
					return apis.NewBadRequestError(normalizeErr.Error(), nil)
				}
				userRecord.Set("name", displayName)
			}

			if requestBody.Bio != nil {
				bio, normalizeErr := normalizeOptionalProfileString(*requestBody.Bio, "bio", maxProfileBioLength)
				if normalizeErr != nil {
					return apis.NewBadRequestError(normalizeErr.Error(), nil)
				}
				userRecord.Set("bio", bio)
			}

			if requestBody.Location != nil {
				location, normalizeErr := normalizeOptionalProfileString(
					*requestBody.Location,
					"location",
					maxProfileLocationLength,
				)
				if normalizeErr != nil {
					return apis.NewBadRequestError(normalizeErr.Error(), nil)
				}
				userRecord.Set("location", location)
			}

			if requestBody.FavoriteCuisine != nil {
				favoriteCuisine, normalizeErr := normalizeOptionalProfileString(
					*requestBody.FavoriteCuisine,
					"favoriteCuisine",
					maxProfileFavoriteCuisineLength,
				)
				if normalizeErr != nil {
					return apis.NewBadRequestError(normalizeErr.Error(), nil)
				}
				userRecord.Set("favoriteCuisine", favoriteCuisine)
			}

			if requestBody.ReceiveMarketingEmails != nil {
				userRecord.Set("receiveMarketingEmails", *requestBody.ReceiveMarketingEmails)
			}

			if err := txApp.Save(userRecord); err != nil {
				return apis.NewApiError(500, "failed to update profile", err)
			}

			responsePayload = serializeSelfProfile(userRecord)
			return nil
		}); err != nil {
			return err
		}

		return e.JSON(200, responsePayload)
	}).Bind(apis.RequireAuth())
}

func serializeSelfProfile(userRecord *core.Record) selfProfileResponse {
	if userRecord == nil {
		return selfProfileResponse{}
	}

	return selfProfileResponse{
		DisplayName:            strings.TrimSpace(userRecord.GetString("name")),
		Bio:                    strings.TrimSpace(userRecord.GetString("bio")),
		Location:               strings.TrimSpace(userRecord.GetString("location")),
		FavoriteCuisine:        strings.TrimSpace(userRecord.GetString("favoriteCuisine")),
		ReceiveMarketingEmails: userRecord.GetBool("receiveMarketingEmails"),
	}
}

func normalizeRequiredProfileString(raw string, fieldName string, maxLength int) (string, error) {
	return normalizeBoundedString(raw, fieldName, maxLength)
}

func normalizeOptionalProfileString(raw string, fieldName string, maxLength int) (string, error) {
	value := strings.TrimSpace(raw)
	if value == "" {
		return "", nil
	}

	if len(value) > maxLength {
		return "", fmt.Errorf("%s must be %d characters or fewer", fieldName, maxLength)
	}

	return value, nil
}
