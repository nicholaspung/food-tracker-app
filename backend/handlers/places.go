package handlers

import (
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"cloud.google.com/go/maps/places/apiv1"
	"cloud.google.com/go/maps/places/apiv1/placespb"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"google.golang.org/api/option"
	"google.golang.org/genproto/googleapis/type/latlng"
	"google.golang.org/grpc/metadata"
	"googlemaps.github.io/maps"

	"myapp/lib"
)

const googlePlacesCacheExpiration = 30 * 24 * time.Hour

type placeResult struct {
	PlaceID  string        `json:"place_id"`
	Name     string        `json:"name"`
	Vicinity string        `json:"vicinity"`
	Types    []string      `json:"types,omitempty"`
	Geometry placeGeometry `json:"geometry"`
}

type placeGeometry struct {
	Location placeLocation `json:"location"`
}

type placeLocation struct {
	Lat float64 `json:"lat"`
	Lng float64 `json:"lng"`
}

type restaurantSearchResult struct {
	ID            string   `json:"id"`
	Name          string   `json:"name"`
	City          string   `json:"city,omitempty"`
	Location      string   `json:"location,omitempty"`
	CuisineType   string   `json:"cuisineType,omitempty"`
	Visibility    string   `json:"visibility,omitempty"`
	Latitude      *float64 `json:"latitude,omitempty"`
	Longitude     *float64 `json:"longitude,omitempty"`
	PlaceID       string   `json:"placeId,omitempty"`
	IsGooglePlace bool     `json:"isGooglePlace"`
}

type placesSearchResponse struct {
	Places      []placeResult            `json:"places"`
	Restaurants []restaurantSearchResult `json:"restaurants"`
}

func buildPlacesSearchResponse(
	app core.App,
	authRecord *core.Record,
	googlePlaces []*placespb.Place,
	useShortFormattedAddress bool,
) (placesSearchResponse, error) {
	placesResult := make([]placeResult, 0, len(googlePlaces))
	for _, place := range googlePlaces {
		if place == nil {
			continue
		}
		placesResult = append(placesResult, mapGooglePlaceResult(place, useShortFormattedAddress))
	}

	restaurants, err := syncGooglePlaceRestaurants(app, authRecord, placesResult)
	if err != nil {
		return placesSearchResponse{}, err
	}

	return placesSearchResponse{
		Places:      placesResult,
		Restaurants: restaurants,
	}, nil
}

func mapGooglePlaceResult(place *placespb.Place, useShortFormattedAddress bool) placeResult {
	placeID := place.Id
	if strings.HasPrefix(placeID, "places/") {
		placeID = strings.TrimPrefix(placeID, "places/")
	}

	var lat, lng float64
	if place.Location != nil {
		lat = place.Location.Latitude
		lng = place.Location.Longitude
	}

	displayName := ""
	if place.DisplayName != nil {
		displayName = strings.TrimSpace(place.DisplayName.Text)
	}

	vicinity := strings.TrimSpace(place.FormattedAddress)
	if useShortFormattedAddress {
		vicinity = strings.TrimSpace(place.ShortFormattedAddress)
	}

	return placeResult{
		PlaceID:  placeID,
		Name:     displayName,
		Vicinity: vicinity,
		Types:    place.Types,
		Geometry: placeGeometry{
			Location: placeLocation{
				Lat: lat,
				Lng: lng,
			},
		},
	}
}

func syncGooglePlaceRestaurants(
	app core.App,
	authRecord *core.Record,
	places []placeResult,
) ([]restaurantSearchResult, error) {
	if authRecord == nil || strings.TrimSpace(authRecord.Id) == "" {
		return nil, apis.NewUnauthorizedError("authentication required", nil)
	}

	dedupedPlaces := dedupePlacesByID(places)
	if len(dedupedPlaces) == 0 {
		return []restaurantSearchResult{}, nil
	}

	restaurantsCollection, err := app.FindCollectionByNameOrId("restaurants")
	if err != nil {
		return nil, fmt.Errorf("resolve restaurants collection: %w", err)
	}

	existingByPlaceID, err := findRestaurantsByPlaceID(app, dedupedPlaces)
	if err != nil {
		return nil, err
	}

	now := time.Now().UTC()
	results := make([]restaurantSearchResult, 0, len(dedupedPlaces))

		for _, place := range dedupedPlaces {
			existing := existingByPlaceID[place.PlaceID]
			if existing != nil {
				if shouldRefreshGooglePlaceRestaurant(existing) {
					applyGooglePlaceToRestaurantRecord(existing, place, now)
					if err := app.Save(existing); err != nil {
						log.Printf("Failed to update cached restaurant for place %s (%s): %v", place.Name, place.PlaceID, err)
					}
				}

			results = append(results, mapRestaurantSearchResult(existing))
			continue
		}

		if strings.TrimSpace(place.Name) == "" {
			continue
			}

			record := core.NewRecord(restaurantsCollection)
			applyGooglePlaceToRestaurantRecord(record, place, now)
			if err := app.Save(record); err != nil {
				if isUniqueConstraintError(err) {
					refetchedByPlaceID, refetchErr := findRestaurantsByPlaceID(app, []placeResult{place})
					if refetchErr == nil && refetchedByPlaceID[place.PlaceID] != nil {
						results = append(results, mapRestaurantSearchResult(refetchedByPlaceID[place.PlaceID]))
						continue
					}
				}

				log.Printf("Failed to create cached restaurant for place %s (%s): %v", place.Name, place.PlaceID, err)
				continue
			}

		existingByPlaceID[place.PlaceID] = record
		results = append(results, mapRestaurantSearchResult(record))
	}

	return results, nil
}

func dedupePlacesByID(places []placeResult) []placeResult {
	deduped := make([]placeResult, 0, len(places))
	seen := make(map[string]struct{}, len(places))

	for _, place := range places {
		placeID := strings.TrimSpace(place.PlaceID)
		if placeID == "" {
			continue
		}
		if _, exists := seen[placeID]; exists {
			continue
		}

		seen[placeID] = struct{}{}
		place.PlaceID = placeID
		place.Name = strings.TrimSpace(place.Name)
		place.Vicinity = strings.TrimSpace(place.Vicinity)
		deduped = append(deduped, place)
	}

	return deduped
}

func findRestaurantsByPlaceID(
	app core.App,
	places []placeResult,
) (map[string]*core.Record, error) {
	if len(places) == 0 {
		return map[string]*core.Record{}, nil
	}

	params := dbx.Params{}
	clauses := make([]string, 0, len(places))
	for index, place := range places {
		paramKey := fmt.Sprintf("placeId%d", index)
		clauses = append(clauses, fmt.Sprintf("placeId = {:%s}", paramKey))
		params[paramKey] = place.PlaceID
	}

	filter := fmt.Sprintf("isGooglePlace = true && (%s)", strings.Join(clauses, " || "))
	records, err := app.FindRecordsByFilter("restaurants", filter, "-updated,-created", len(places)*2, 0, params)
	if err != nil {
		return nil, fmt.Errorf("find cached restaurants: %w", err)
	}

	result := make(map[string]*core.Record, len(records))
	for _, record := range records {
		placeID := strings.TrimSpace(record.GetString("placeId"))
		if placeID == "" {
			continue
		}
		if _, exists := result[placeID]; exists {
			continue
		}
		result[placeID] = record
	}

	return result, nil
}

func applyGooglePlaceToRestaurantRecord(record *core.Record, place placeResult, cachedAt time.Time) {
	record.Set("name", place.Name)
	record.Set("location", place.Vicinity)
	record.Set("cuisineType", getCuisineFromTypes(place.Types))
	record.Set("latitude", place.Geometry.Location.Lat)
	record.Set("longitude", place.Geometry.Location.Lng)
	record.Set("placeId", place.PlaceID)
	record.Set("isGooglePlace", true)
	record.Set("googlePlaceCachedAt", cachedAt)
	record.Set("createdBy", "")
	record.Set("visibility", "public")
}

func shouldRefreshGooglePlaceRestaurant(record *core.Record) bool {
	if record == nil {
		return false
	}

	if !record.GetBool("isGooglePlace") {
		return true
	}

	if strings.TrimSpace(record.GetString("createdBy")) != "" {
		return true
	}

	if strings.TrimSpace(record.GetString("visibility")) != "public" {
		return true
	}

	return isGooglePlaceCacheStale(record.GetDateTime("googlePlaceCachedAt").Time())
}

func mapRestaurantSearchResult(record *core.Record) restaurantSearchResult {
	location := strings.TrimSpace(record.GetString("location"))

	return restaurantSearchResult{
		ID:            record.Id,
		Name:          strings.TrimSpace(record.GetString("name")),
		City:          location,
		Location:      location,
		CuisineType:   strings.TrimSpace(record.GetString("cuisineType")),
		Visibility:    strings.TrimSpace(record.GetString("visibility")),
		Latitude:      optionalRecordFloat(record, "latitude"),
		Longitude:     optionalRecordFloat(record, "longitude"),
		PlaceID:       strings.TrimSpace(record.GetString("placeId")),
		IsGooglePlace: record.GetBool("isGooglePlace"),
	}
}

func optionalRecordFloat(record *core.Record, fieldName string) *float64 {
	if record == nil || record.Get(fieldName) == nil {
		return nil
	}

	value := record.GetFloat(fieldName)
	return &value
}

func isGooglePlaceCacheStale(cachedAt time.Time) bool {
	if cachedAt.IsZero() {
		return true
	}

	return time.Since(cachedAt.UTC()) > googlePlacesCacheExpiration
}

func getCuisineFromTypes(types []string) string {
	cuisineMap := map[string]string{
		"american_restaurant":      "American",
		"bakery":                   "Bakery",
		"cafe":                     "Cafe",
		"chinese_restaurant":       "Chinese",
		"coffee_shop":              "Coffee Shop",
		"dessert_shop":             "Dessert",
		"french_restaurant":        "French",
		"indian_restaurant":        "Indian",
		"italian_restaurant":       "Italian",
		"japanese_restaurant":      "Japanese",
		"korean_restaurant":        "Korean",
		"mediterranean_restaurant": "Mediterranean",
		"mexican_restaurant":       "Mexican",
		"pizza_restaurant":         "Pizza",
		"seafood_restaurant":       "Seafood",
		"steak_house":              "Steakhouse",
		"thai_restaurant":          "Thai",
		"vietnamese_restaurant":    "Vietnamese",
	}

	for _, placeType := range types {
		if cuisine, ok := cuisineMap[placeType]; ok {
			return cuisine
		}
	}

	return ""
}

// RegisterPlacesHandlers registers all Google Places API endpoints
func RegisterPlacesHandlers(se *core.ServeEvent, _ core.App) {
	// Custom API endpoint: Search nearby restaurants using Google Places (New API)
	se.Router.POST("/api/places/nearby", func(e *core.RequestEvent) error {
		// Authentication required
		authRecord := e.Auth
		if authRecord == nil {
			return apis.NewUnauthorizedError("authentication required", nil)
		}

		// Get Google Places API key from environment
		placesAPIKey := os.Getenv("GOOGLE_PLACES_API_KEY")
		if placesAPIKey == "" {
			log.Printf("ERROR: GOOGLE_PLACES_API_KEY environment variable not set")
			return apis.NewApiError(500, "Google Places API key not configured", nil)
		}

		// Parse request body
		var requestData struct {
			Latitude  float64 `json:"latitude"`
			Longitude float64 `json:"longitude"`
			Radius    int     `json:"radius"` // in meters
		}

		if err := e.BindBody(&requestData); err != nil {
			return apis.NewBadRequestError("invalid request body", err)
		}

		radius, err := normalizePlacesRadius(requestData.Radius, 1500)
		if err != nil {
			return apis.NewBadRequestError(err.Error(), nil)
		}
		requestData.Radius = radius

		if _, err := lib.ConsumeUsage(e.App, authRecord, lib.UsageMetricPlacesQueries, 1); err != nil {
			if limitErr, ok := lib.AsLimitExceededError(err); ok {
				return e.JSON(429, limitErr.Payload())
			}
			log.Printf("Failed to consume places query usage (nearby): %v", err)
			return apis.NewApiError(500, "failed to process usage limit", err)
		}

		log.Printf("Searching nearby places with radius=%d", requestData.Radius)

		// Initialize new Places API client
		ctx, cancel := requestContextWithTimeout(e, googlePlacesRequestTimeout)
		defer cancel()
		placesClient, err := places.NewClient(ctx, option.WithAPIKey(placesAPIKey), option.WithHTTPClient(placesHTTPClient))
		if err != nil {
			log.Printf("Failed to create Places API client: %v", err)
			return apis.NewApiError(500, "failed to initialize Google Places API", err)
		}
		defer placesClient.Close()

		// Build nearby search request
		searchReq := &placespb.SearchNearbyRequest{
			LocationRestriction: &placespb.SearchNearbyRequest_LocationRestriction{
				Type: &placespb.SearchNearbyRequest_LocationRestriction_Circle{
					Circle: &placespb.Circle{
						Center: &latlng.LatLng{
							Latitude:  requestData.Latitude,
							Longitude: requestData.Longitude,
						},
						Radius: float64(requestData.Radius),
					},
				},
			},
			IncludedTypes: []string{"restaurant", "cafe", "bakery", "bar", "meal_takeaway"},
		}

		// Set field mask in context to specify which fields to return
		ctx = metadata.AppendToOutgoingContext(ctx,
			"x-goog-fieldmask", "places.id,places.displayName,places.shortFormattedAddress,places.types,places.location")

		// Start tracking for analytics
		startTime := time.Now()

		// Perform nearby search
		resp, err := placesClient.SearchNearby(ctx, searchReq)

		// Calculate duration
		durationMs := time.Since(startTime).Milliseconds()

		// Handle error case
		if err != nil {
			log.Printf("Google Places API error: %v", err)

			// Track failed API call
			lib.TrackPlacesAPICall(authRecord.Id, lib.PlacesAPIProperties{
				APIType:     "nearby",
				DurationMs:  durationMs,
				Success:     false,
				ErrorType:   fmt.Sprintf("%T", err),
				ResultCount: 0,
			})

			return apis.NewApiError(500, "failed to search nearby places", err)
		}

		log.Printf("Found %d nearby places", len(resp.Places))

		// Track successful API call
		lib.TrackPlacesAPICall(authRecord.Id, lib.PlacesAPIProperties{
			APIType:     "nearby",
			DurationMs:  durationMs,
			Success:     true,
			ResultCount: len(resp.Places),
		})

		responsePayload, err := buildPlacesSearchResponse(e.App, authRecord, resp.Places, true)
		if err != nil {
			log.Printf("Failed to normalize nearby places: %v", err)
			return apis.NewApiError(500, "failed to normalize nearby places", err)
		}

		return e.JSON(200, responsePayload)
	})

	// Custom API endpoint: Search restaurants by text using Google Places (New API)
	se.Router.POST("/api/places/search", func(e *core.RequestEvent) error {
		// Authentication required
		authRecord := e.Auth
		if authRecord == nil {
			return apis.NewUnauthorizedError("authentication required", nil)
		}

		// Get Google Places API key from environment
		placesAPIKey := os.Getenv("GOOGLE_PLACES_API_KEY")
		if placesAPIKey == "" {
			log.Printf("ERROR: GOOGLE_PLACES_API_KEY environment variable not set")
			return apis.NewApiError(500, "Google Places API key not configured", nil)
		}

		// Parse request body
		var requestData struct {
			Query    string `json:"query"`
			Location string `json:"location"`
			Radius   int    `json:"radius"` // in meters
		}

		if err := e.BindBody(&requestData); err != nil {
			return apis.NewBadRequestError("invalid request body", err)
		}

		query, err := normalizeBoundedString(requestData.Query, "query", maxPlacesQueryLength)
		if err != nil {
			return apis.NewBadRequestError(err.Error(), nil)
		}
		requestData.Query = query

		if strings.TrimSpace(requestData.Location) != "" {
			location, err := normalizeBoundedString(requestData.Location, "location", maxPlacesLocationLength)
			if err != nil {
				return apis.NewBadRequestError(err.Error(), nil)
			}
			requestData.Location = location
		}

		radius, err := normalizePlacesRadius(requestData.Radius, 5000)
		if err != nil {
			return apis.NewBadRequestError(err.Error(), nil)
		}
		requestData.Radius = radius

		if _, err := lib.ConsumeUsage(e.App, authRecord, lib.UsageMetricPlacesQueries, 1); err != nil {
			if limitErr, ok := lib.AsLimitExceededError(err); ok {
				return e.JSON(429, limitErr.Payload())
			}
			log.Printf("Failed to consume places query usage (search): %v", err)
			return apis.NewApiError(500, "failed to process usage limit", err)
		}

		log.Printf(
			"Searching places by text with has_query=%t has_location_bias=%t radius=%d",
			requestData.Query != "",
			requestData.Location != "",
			requestData.Radius,
		)

		// Initialize new Places API client
		ctx, cancel := requestContextWithTimeout(e, googlePlacesRequestTimeout)
		defer cancel()
		placesClient, err := places.NewClient(ctx, option.WithAPIKey(placesAPIKey), option.WithHTTPClient(placesHTTPClient))
		if err != nil {
			log.Printf("Failed to create Places API client: %v", err)
			return apis.NewApiError(500, "failed to initialize Google Places API", err)
		}
		defer placesClient.Close()

		// Build text search request
		searchReq := &placespb.SearchTextRequest{
			TextQuery: requestData.Query,
			// No type filtering - let the text query determine what's relevant
			// This allows finding cafes, bakeries, coffee shops, etc.
		}

		// If location is provided, add location bias
		if requestData.Location != "" {
			// Use old Maps client for geocoding (Geocoding API is separate)
			mapsClient, err := maps.NewClient(maps.WithAPIKey(placesAPIKey), maps.WithHTTPClient(geocodeHTTPClient))
			if err == nil {
				geocodeReq := &maps.GeocodingRequest{
					Address: requestData.Location,
				}
				geocodeResp, err := mapsClient.Geocode(ctx, geocodeReq)
				if err == nil && len(geocodeResp) > 0 {
					location := geocodeResp[0].Geometry.Location
					log.Printf("Resolved location bias for text search")

					// Add location bias with circle
					searchReq.LocationBias = &placespb.SearchTextRequest_LocationBias{
						Type: &placespb.SearchTextRequest_LocationBias_Circle{
							Circle: &placespb.Circle{
								Center: &latlng.LatLng{
									Latitude:  location.Lat,
									Longitude: location.Lng,
								},
								Radius: float64(requestData.Radius),
							},
						},
					}
				}
			}
		}

		// Set field mask in context to specify which fields to return
		ctx = metadata.AppendToOutgoingContext(ctx,
			"x-goog-fieldmask", "places.id,places.displayName,places.formattedAddress,places.types,places.location")

		// Start tracking for analytics
		startTime := time.Now()

		// Perform text search
		resp, err := placesClient.SearchText(ctx, searchReq)

		// Calculate duration
		durationMs := time.Since(startTime).Milliseconds()

		// Handle error case
		if err != nil {
			log.Printf("Google Places text search error: %v", err)

			// Track failed API call
			lib.TrackPlacesAPICall(authRecord.Id, lib.PlacesAPIProperties{
				APIType:     "search",
				DurationMs:  durationMs,
				Success:     false,
				ErrorType:   fmt.Sprintf("%T", err),
				ResultCount: 0,
				HasLocation: requestData.Location != "",
			})

			return apis.NewApiError(500, "failed to search places", err)
		}

		log.Printf("Text search found %d places", len(resp.Places))

		// Track successful API call
		lib.TrackPlacesAPICall(authRecord.Id, lib.PlacesAPIProperties{
			APIType:     "search",
			DurationMs:  durationMs,
			Success:     true,
			ResultCount: len(resp.Places),
			HasLocation: requestData.Location != "",
		})

		responsePayload, err := buildPlacesSearchResponse(e.App, authRecord, resp.Places, false)
		if err != nil {
			log.Printf("Failed to normalize text search places: %v", err)
			return apis.NewApiError(500, "failed to normalize places", err)
		}

		return e.JSON(200, responsePayload)
	})

	// Custom API endpoint: Geocode location using Google Maps
	se.Router.POST("/api/places/geocode", func(e *core.RequestEvent) error {
		// Authentication required
		authRecord := e.Auth
		if authRecord == nil {
			return apis.NewUnauthorizedError("authentication required", nil)
		}

		// Get Google Places API key from environment
		placesAPIKey := os.Getenv("GOOGLE_PLACES_API_KEY")
		if placesAPIKey == "" {
			log.Printf("ERROR: GOOGLE_PLACES_API_KEY environment variable not set")
			return apis.NewApiError(500, "Google Places API key not configured", nil)
		}

		// Parse request body
		var requestData struct {
			Location string `json:"location"`
		}

		if err := e.BindBody(&requestData); err != nil {
			return apis.NewBadRequestError("invalid request body", err)
		}

		location, err := normalizeBoundedString(requestData.Location, "location", maxPlacesLocationLength)
		if err != nil {
			return apis.NewBadRequestError(err.Error(), nil)
		}
		requestData.Location = location

		if _, err := lib.ConsumeUsage(e.App, authRecord, lib.UsageMetricPlacesQueries, 1); err != nil {
			if limitErr, ok := lib.AsLimitExceededError(err); ok {
				return e.JSON(429, limitErr.Payload())
			}
			log.Printf("Failed to consume places query usage (geocode): %v", err)
			return apis.NewApiError(500, "failed to process usage limit", err)
		}

		log.Printf("Geocoding location for restaurant search")

		// Initialize Google Maps client
		ctx, cancel := requestContextWithTimeout(e, googleGeocodeRequestTimeout)
		defer cancel()
		mapsClient, err := maps.NewClient(maps.WithAPIKey(placesAPIKey), maps.WithHTTPClient(geocodeHTTPClient))
		if err != nil {
			log.Printf("Failed to create Google Maps client: %v", err)
			return apis.NewApiError(500, "failed to initialize Google Maps API", err)
		}

		// Perform geocoding
		request := &maps.GeocodingRequest{
			Address: requestData.Location,
		}

		// Start tracking for analytics
		startTime := time.Now()

		resp, err := mapsClient.Geocode(ctx, request)

		// Calculate duration
		durationMs := time.Since(startTime).Milliseconds()

		// Handle error case
		if err != nil {
			log.Printf("Geocoding error: %v", err)

			// Track failed API call
			lib.TrackPlacesAPICall(authRecord.Id, lib.PlacesAPIProperties{
				APIType:     "geocode",
				DurationMs:  durationMs,
				Success:     false,
				ErrorType:   fmt.Sprintf("%T", err),
				ResultCount: 0,
			})

			return apis.NewApiError(500, "failed to geocode location", err)
		}

		resultCount := len(resp)
		if resultCount == 0 {
			// Track successful but empty result
			lib.TrackPlacesAPICall(authRecord.Id, lib.PlacesAPIProperties{
				APIType:     "geocode",
				DurationMs:  durationMs,
				Success:     true,
				ResultCount: 0,
			})

			return e.JSON(200, map[string]any{
				"found": false,
			})
		}

		geocodedLocation := resp[0].Geometry.Location
		log.Printf("Geocoding succeeded for restaurant search")

		// Track successful API call
		lib.TrackPlacesAPICall(authRecord.Id, lib.PlacesAPIProperties{
			APIType:     "geocode",
			DurationMs:  durationMs,
			Success:     true,
			ResultCount: resultCount,
		})

		return e.JSON(200, map[string]any{
			"found": true,
			"lat":   geocodedLocation.Lat,
			"lng":   geocodedLocation.Lng,
		})
	})
}
