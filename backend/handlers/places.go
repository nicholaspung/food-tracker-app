package handlers

import (
	"context"
	"log"
	"os"
	"strings"

	"cloud.google.com/go/maps/places/apiv1"
	"cloud.google.com/go/maps/places/apiv1/placespb"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"google.golang.org/api/option"
	"google.golang.org/genproto/googleapis/type/latlng"
	"google.golang.org/grpc/metadata"
	"googlemaps.github.io/maps"
)

// RegisterPlacesHandlers registers all Google Places API endpoints
func RegisterPlacesHandlers(se *core.ServeEvent, app core.App) {
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

		// Default radius if not provided
		if requestData.Radius == 0 {
			requestData.Radius = 1500
		}

		log.Printf("Searching nearby places: lat=%f, lng=%f, radius=%d",
			requestData.Latitude, requestData.Longitude, requestData.Radius)

		// Initialize new Places API client
		ctx := context.Background()
		placesClient, err := places.NewClient(ctx, option.WithAPIKey(placesAPIKey))
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

		// Perform nearby search
		resp, err := placesClient.SearchNearby(ctx, searchReq)
		if err != nil {
			log.Printf("Google Places API error: %v", err)
			return apis.NewApiError(500, "failed to search nearby places", err)
		}

		log.Printf("Found %d nearby places", len(resp.Places))

		// Transform results to match frontend PlaceResult interface
		placesResult := make([]map[string]any, len(resp.Places))
		for i, place := range resp.Places {
			// Extract place ID (remove "places/" prefix if present)
			placeID := place.Id
			if strings.HasPrefix(placeID, "places/") {
				placeID = strings.TrimPrefix(placeID, "places/")
			}

			// Extract location
			var lat, lng float64
			if place.Location != nil {
				lat = place.Location.Latitude
				lng = place.Location.Longitude
			}

			// Extract display name
			displayName := ""
			if place.DisplayName != nil {
				displayName = place.DisplayName.Text
			}

			// Extract formatted address (use shortFormattedAddress as vicinity)
			vicinity := place.ShortFormattedAddress

			placesResult[i] = map[string]any{
				"place_id": placeID,
				"name":     displayName,
				"vicinity": vicinity,
				"types":    place.Types,
				"geometry": map[string]any{
					"location": map[string]any{
						"lat": lat,
						"lng": lng,
					},
				},
			}
		}

		return e.JSON(200, map[string]any{
			"places": placesResult,
		})
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

		// Default radius if not provided
		if requestData.Radius == 0 {
			requestData.Radius = 5000
		}

		log.Printf("Text search: query=%s, location=%s, radius=%d",
			requestData.Query, requestData.Location, requestData.Radius)

		// Initialize new Places API client
		ctx := context.Background()
		placesClient, err := places.NewClient(ctx, option.WithAPIKey(placesAPIKey))
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
			mapsClient, err := maps.NewClient(maps.WithAPIKey(placesAPIKey))
			if err == nil {
				geocodeReq := &maps.GeocodingRequest{
					Address: requestData.Location,
				}
				geocodeResp, err := mapsClient.Geocode(ctx, geocodeReq)
				if err == nil && len(geocodeResp) > 0 {
					location := geocodeResp[0].Geometry.Location
					log.Printf("Geocoded location: lat=%f, lng=%f", location.Lat, location.Lng)

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

		// Perform text search
		resp, err := placesClient.SearchText(ctx, searchReq)
		if err != nil {
			log.Printf("Google Places text search error: %v", err)
			return apis.NewApiError(500, "failed to search places", err)
		}

		log.Printf("Text search found %d places", len(resp.Places))

		// Transform results to match frontend PlaceResult interface
		placesResult := make([]map[string]any, len(resp.Places))
		for i, place := range resp.Places {
			// Extract place ID (remove "places/" prefix if present)
			placeID := place.Id
			if strings.HasPrefix(placeID, "places/") {
				placeID = strings.TrimPrefix(placeID, "places/")
			}

			// Extract location
			var lat, lng float64
			if place.Location != nil {
				lat = place.Location.Latitude
				lng = place.Location.Longitude
			}

			// Extract display name
			displayName := ""
			if place.DisplayName != nil {
				displayName = place.DisplayName.Text
			}

			// Extract formatted address
			formattedAddress := place.FormattedAddress

			placesResult[i] = map[string]any{
				"place_id": placeID,
				"name":     displayName,
				"vicinity": formattedAddress,
				"types":    place.Types,
				"geometry": map[string]any{
					"location": map[string]any{
						"lat": lat,
						"lng": lng,
					},
				},
			}
		}

		return e.JSON(200, map[string]any{
			"places": placesResult,
		})
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

		if requestData.Location == "" {
			return apis.NewBadRequestError("location is required", nil)
		}

		log.Printf("Geocoding location: %s", requestData.Location)

		// Initialize Google Maps client
		ctx := context.Background()
		mapsClient, err := maps.NewClient(maps.WithAPIKey(placesAPIKey))
		if err != nil {
			log.Printf("Failed to create Google Maps client: %v", err)
			return apis.NewApiError(500, "failed to initialize Google Maps API", err)
		}

		// Perform geocoding
		request := &maps.GeocodingRequest{
			Address: requestData.Location,
		}

		resp, err := mapsClient.Geocode(ctx, request)
		if err != nil {
			log.Printf("Geocoding error: %v", err)
			return apis.NewApiError(500, "failed to geocode location", err)
		}

		if len(resp) == 0 {
			return e.JSON(200, map[string]any{
				"found": false,
			})
		}

		location := resp[0].Geometry.Location
		log.Printf("Geocoded to: lat=%f, lng:%f", location.Lat, location.Lng)

		return e.JSON(200, map[string]any{
			"found": true,
			"lat":   location.Lat,
			"lng":   location.Lng,
		})
	})
}
