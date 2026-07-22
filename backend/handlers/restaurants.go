package handlers

import (
	"database/sql"
	"errors"
	"strings"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/router"
)

type restaurantUpsertRequest struct {
	RestaurantID   string   `json:"restaurantId"`
	RestaurantName string   `json:"restaurantName"`
	Location       string   `json:"location"`
	CuisineType    string   `json:"cuisineType"`
	Visibility     string   `json:"visibility"`
	PlaceID        string   `json:"placeId"`
	Latitude       *float64 `json:"latitude"`
	Longitude      *float64 `json:"longitude"`
	IsGooglePlace  bool     `json:"isGooglePlace"`
}

type restaurantResponse struct {
	ID            string   `json:"id"`
	Name          string   `json:"name"`
	Location      string   `json:"location,omitempty"`
	CuisineType   string   `json:"cuisineType,omitempty"`
	Visibility    string   `json:"visibility,omitempty"`
	Latitude      *float64 `json:"latitude,omitempty"`
	Longitude     *float64 `json:"longitude,omitempty"`
	PlaceID       string   `json:"placeId,omitempty"`
	IsGooglePlace bool     `json:"isGooglePlace,omitempty"`
	Created       string   `json:"created,omitempty"`
	Updated       string   `json:"updated,omitempty"`
}

type restaurantResolveInput struct {
	RestaurantID   string
	RestaurantName string
	Location       string
	CuisineType    string
	Visibility     string
	PlaceID        string
	Latitude       *float64
	Longitude      *float64
}

func registerRestaurantWriteHandlers(se *core.ServeEvent, app core.App) {
	se.Router.POST("/api/restaurants/upsert", func(e *core.RequestEvent) error {
		if e.Auth == nil {
			return apis.NewUnauthorizedError("authentication required", nil)
		}

		requestBody := restaurantUpsertRequest{}
		if err := e.BindBody(&requestBody); err != nil {
			return apis.NewBadRequestError("invalid request body", err)
		}
		if requestBody.IsGooglePlace {
			return apis.NewForbiddenError("Google Place restaurants must be created through Places search", nil)
		}

		var responsePayload restaurantResponse
		if err := app.RunInTransaction(func(txApp core.App) error {
			record, err := resolveRestaurantForWrite(txApp, e.Auth, restaurantResolveInput{
				RestaurantID:   requestBody.RestaurantID,
				RestaurantName: requestBody.RestaurantName,
				Location:       requestBody.Location,
				CuisineType:    requestBody.CuisineType,
				Visibility:     requestBody.Visibility,
				PlaceID:        requestBody.PlaceID,
				Latitude:       requestBody.Latitude,
				Longitude:      requestBody.Longitude,
			})
			if err != nil {
				return err
			}

			responsePayload = buildRestaurantResponse(record)
			return nil
		}); err != nil {
			return err
		}

		return e.JSON(200, responsePayload)
	}).Bind(apis.RequireAuth())
}

func resolveRestaurantForWrite(
	app core.App,
	authRecord *core.Record,
	input restaurantResolveInput,
) (*core.Record, error) {
	viewerUserID := strings.TrimSpace(authRecord.Id)
	isAdmin := authRecord.GetBool("isAdmin")
	acceptedFriendIDs := map[string]struct{}{}
	if !isAdmin && viewerUserID != "" {
		friendIDs, err := listAcceptedFriendIDs(app, viewerUserID)
		if err != nil {
			return nil, apis.NewApiError(500, "failed to resolve restaurant visibility", err)
		}
		acceptedFriendIDs = friendIDs
	}

	trimmedRestaurantID := strings.TrimSpace(input.RestaurantID)
	if trimmedRestaurantID != "" {
		record, err := findAccessibleRestaurantByID(app, trimmedRestaurantID, viewerUserID, isAdmin, acceptedFriendIDs)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return nil, apis.NewNotFoundError("restaurant not found", nil)
			}
			return nil, apis.NewApiError(500, "failed to resolve restaurant", err)
		}
		return record, nil
	}

	trimmedName := strings.TrimSpace(input.RestaurantName)
	if trimmedName == "" {
		return nil, apis.NewBadRequestError("restaurant name is required", nil)
	}

	trimmedPlaceID := strings.TrimSpace(input.PlaceID)
	existingRecord, err := findAccessibleRestaurantByNormalizedKeys(
		app,
		viewerUserID,
		isAdmin,
		acceptedFriendIDs,
		trimmedName,
		trimmedPlaceID,
	)
	if err != nil {
		return nil, apis.NewApiError(500, "failed to resolve restaurant", err)
	}
	if existingRecord != nil {
		return existingRecord, nil
	}

	restaurantsCollection, err := app.FindCollectionByNameOrId("restaurants")
	if err != nil {
		return nil, err
	}

	record := core.NewRecord(restaurantsCollection)
	record.Set("name", trimmedName)
	record.Set("location", resolveRestaurantWriteLocation(trimmedName, input.Location))
	record.Set("cuisineType", strings.TrimSpace(input.CuisineType))
	record.Set("placeId", trimmedPlaceID)
	record.Set("isGooglePlace", false)

	if input.Latitude != nil {
		record.Set("latitude", *input.Latitude)
	}

	if input.Longitude != nil {
		record.Set("longitude", *input.Longitude)
	}

	visibility := strings.TrimSpace(input.Visibility)
	if visibility == "" {
		visibility = authRecord.GetString("defaultRestaurantVisibility")
	}
	if trimmedPlaceID != "" && visibility == "public" {
		return nil, apis.NewForbiddenError("public Place ID restaurants must be created through Places search", nil)
	}
	visibility = normalizeRestaurantVisibility(visibility)
	record.Set("createdBy", authRecord.Id)
	record.Set("visibility", visibility)

	if err := app.Save(record); err != nil {
		if !isUniqueConstraintError(err) {
			return nil, err
		}

		existingRecord, lookupErr := findAccessibleRestaurantByNormalizedKeys(
			app,
			viewerUserID,
			isAdmin,
			acceptedFriendIDs,
			trimmedName,
			trimmedPlaceID,
		)
		if lookupErr != nil {
			return nil, apis.NewApiError(500, "failed to resolve restaurant", lookupErr)
		}
		if existingRecord != nil {
			return existingRecord, nil
		}

		return nil, apis.NewApiError(409, "restaurant already exists", nil)
	}

	return record, nil
}

func resolveRestaurantWriteLocation(restaurantName string, location string) string {
	trimmedLocation := strings.TrimSpace(location)
	if trimmedLocation != "" {
		return trimmedLocation
	}

	return strings.TrimSpace(restaurantName)
}

func buildRestaurantResponse(record *core.Record) restaurantResponse {
	return restaurantResponse{
		ID:            record.Id,
		Name:          strings.TrimSpace(record.GetString("name")),
		Location:      strings.TrimSpace(record.GetString("location")),
		CuisineType:   strings.TrimSpace(record.GetString("cuisineType")),
		Visibility:    strings.TrimSpace(record.GetString("visibility")),
		Latitude:      optionalRecordFloat(record, "latitude"),
		Longitude:     optionalRecordFloat(record, "longitude"),
		PlaceID:       strings.TrimSpace(record.GetString("placeId")),
		IsGooglePlace: record.GetBool("isGooglePlace"),
		Created:       record.GetString("created"),
		Updated:       record.GetString("updated"),
	}
}

func wrapRestaurantResolveError(err error) error {
	if err == nil {
		return nil
	}

	var apiErr *router.ApiError
	if errors.As(err, &apiErr) {
		return apiErr
	}

	return apis.NewApiError(500, "failed to resolve restaurant", err)
}
