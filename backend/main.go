package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/base32"
	"encoding/json"
	"fmt"
	"image/jpeg"
	"io"
	"log"
	"mime"
	"os"
	"path/filepath"
	"strings"
	"time"

	"cloud.google.com/go/maps/places/apiv1"
	"cloud.google.com/go/maps/places/apiv1/placespb"
	vision "cloud.google.com/go/vision/apiv1"
	"cloud.google.com/go/vision/v2/apiv1/visionpb"
	"github.com/google/generative-ai-go/genai"
	"github.com/jdeng/goheif"
	"github.com/joho/godotenv"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/plugins/migratecmd"
	"google.golang.org/api/option"
	"google.golang.org/genproto/googleapis/type/latlng"
	"google.golang.org/grpc/metadata"
	"googlemaps.github.io/maps"

	_ "myapp/migrations"
)

func main() {
	// Load environment variables from .env file
	if err := godotenv.Load(); err != nil {
		log.Printf("Warning: Error loading .env file: %v", err)
	}

	app := pocketbase.New()

	// Register migrations with automigrate enabled when running with `go run`
	isGoRun := strings.HasPrefix(os.Args[0], os.TempDir())
	migratecmd.MustRegister(app, app.RootCmd, migratecmd.Config{
		Automigrate: isGoRun,
	})

	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		// Custom API endpoint: Get inviter info from invite code (public endpoint for signup)
		se.Router.GET("/api/invite-codes/inviter/{code}", func(e *core.RequestEvent) error {
			inviteCode := e.Request.PathValue("code")
			if inviteCode == "" {
				return apis.NewBadRequestError("invite code is required", nil)
			}

			// Find the invite code
			inviteCodeRecord, err := app.FindFirstRecordByFilter(
				"invite_codes",
				"code = {:code}",
				map[string]any{"code": inviteCode},
			)

			if err != nil || inviteCodeRecord == nil {
				return apis.NewNotFoundError("invite code not found", nil)
			}

			// Get the creator user ID
			createdBy := inviteCodeRecord.GetString("createdBy")
			if createdBy == "" {
				// No creator (initial invite code)
				return e.JSON(200, map[string]any{
					"hasInviter": false,
				})
			}

			// Fetch the creator user record
			inviterRecord, err := app.FindRecordById("users", createdBy)
			if err != nil {
				return apis.NewNotFoundError("inviter user not found", nil)
			}

			// Return inviter info (email and name are safe to expose here since it's for friend suggestion)
			return e.JSON(200, map[string]any{
				"hasInviter": true,
				"inviter": map[string]any{
					"id":    inviterRecord.Id,
					"email": inviterRecord.Email(),
					"name":  inviterRecord.GetString("name"),
				},
			})
		})

		// Custom API endpoint: Find user by friend code
		se.Router.GET("/api/users/by-friend-code/{code}", func(e *core.RequestEvent) error {
			authRecord := e.Auth
			if authRecord == nil {
				return apis.NewUnauthorizedError("authentication required", nil)
			}

			friendCode := e.Request.PathValue("code")
			if friendCode == "" {
				return apis.NewBadRequestError("friend code is required", nil)
			}

			// Friend code is the first 8 chars of user ID (uppercase, alphanumeric only)
			// We need to search all users to find matching ID
			users, err := app.FindRecordsByFilter(
				"users",
				"", // no filter - we'll check IDs in Go
				"",
				0,
				0,
				nil,
			)

			if err != nil {
				return apis.NewApiError(500, "failed to search users", err)
			}

			// Find user whose ID matches the friend code
			for _, user := range users {
				// Generate friend code from user ID
				cleanId := ""
				for _, char := range user.Id {
					if (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || (char >= '0' && char <= '9') {
						cleanId += string(char)
					}
				}
				cleanId = strings.ToUpper(cleanId)
				if len(cleanId) > 8 {
					cleanId = cleanId[:8]
				}

				if cleanId == strings.ToUpper(friendCode) {
					// Found matching user
					return e.JSON(200, map[string]any{
						"found": true,
						"user": map[string]any{
							"id":    user.Id,
							"email": user.Email(),
							"name":  user.GetString("name"),
						},
					})
				}
			}

			// No matching user found
			return e.JSON(200, map[string]any{
				"found": false,
			})
		})

		// Custom API endpoint: Get unused invite codes for authenticated user
		se.Router.GET("/api/invite-codes", func(e *core.RequestEvent) error {
			authRecord := e.Auth
			log.Printf("GET /api/invite-codes - Auth record: %v", authRecord)
			if authRecord == nil {
				log.Printf("GET /api/invite-codes - No auth record found")
				return apis.NewUnauthorizedError("authentication required", nil)
			}
			log.Printf("GET /api/invite-codes - User ID: %s", authRecord.Id)

			// Find unused codes created by this user that are not locked (or lock has expired)
			records, err := app.FindRecordsByFilter(
				"invite_codes",
				"createdBy = {:userId} && used = false && (locked_until = '' || locked_until <= @now)",
				"", // no sorting needed
				0,  // no limit
				0,  // no offset
				map[string]any{"userId": authRecord.Id},
			)

			if err != nil {
				log.Printf("GET /api/invite-codes - Error fetching records: %v", err)
				return apis.NewApiError(500, "failed to fetch invite codes: "+err.Error(), err)
			}

			log.Printf("GET /api/invite-codes - Found %d records", len(records))

			// Map records to simple response format
			codes := make([]map[string]any, len(records))
			for i, record := range records {
				codes[i] = map[string]any{
					"id":   record.Id,
					"code": record.GetString("code"),
				}
			}

			return e.JSON(200, map[string]any{
				"codes": codes,
			})
		})

		// Custom API endpoint: Lock an invite code for 7 days
		se.Router.POST("/api/invite-codes/lock", func(e *core.RequestEvent) error {
			authRecord := e.Auth
			if authRecord == nil {
				return apis.NewUnauthorizedError("authentication required", nil)
			}

			// Parse request body
			data := struct {
				CodeId string `json:"codeId"`
			}{}
			if err := e.BindBody(&data); err != nil {
				return apis.NewBadRequestError("invalid request body", err)
			}

			if data.CodeId == "" {
				return apis.NewBadRequestError("codeId is required", nil)
			}

			// Find the invite code
			record, err := app.FindRecordById("invite_codes", data.CodeId)
			if err != nil {
				return apis.NewNotFoundError("invite code not found", err)
			}

			// Verify the user owns this code
			if record.GetString("createdBy") != authRecord.Id {
				return apis.NewForbiddenError("you don't own this invite code", nil)
			}

			// Verify the code is not already used
			if record.GetBool("used") {
				return apis.NewBadRequestError("this invite code has already been used", nil)
			}

			// Verify the code is not already locked
			lockedUntilStr := record.GetString("locked_until")
			if lockedUntilStr != "" {
				lockedUntil := record.GetDateTime("locked_until")
				if !lockedUntil.IsZero() && lockedUntil.Time().After(time.Now()) {
					return apis.NewBadRequestError("this invite code is already locked", nil)
				}
			}

			// Set locked_until to 7 days from now
			sevenDaysFromNow := time.Now().AddDate(0, 0, 7)
			record.Set("locked_until", sevenDaysFromNow)

			// Save the record
			if err := app.Save(record); err != nil {
				return apis.NewApiError(500, "failed to lock invite code", err)
			}

			return e.JSON(200, map[string]any{
				"success":     true,
				"lockedUntil": sevenDaysFromNow,
				"message":     "Invite code locked for 7 days",
			})
		})

		// Custom API endpoint: Generate invite codes (initial user only)
		se.Router.POST("/api/invite-codes/generate", func(e *core.RequestEvent) error {
			authRecord := e.Auth
			if authRecord == nil {
				return apis.NewUnauthorizedError("authentication required", nil)
			}

			// Check if this user is the initial user
			isInitialUser := authRecord.GetBool("isInitialUser")
			if !isInitialUser {
				return apis.NewForbiddenError("only the initial user can generate unlimited invite codes", nil)
			}

			// Generate 5 new invite codes for this user
			if err := generateInviteCodesForUser(app, authRecord.Id, ""); err != nil {
				return apis.NewApiError(500, "failed to generate invite codes", err)
			}

			return e.JSON(200, map[string]any{
				"success":   true,
				"generated": 5,
				"message":   "Successfully generated 5 new invite codes",
			})
		})

		// Custom API endpoint: Convert HEIC to JPEG
		se.Router.POST("/api/convert-heic", func(e *core.RequestEvent) error {
			// Authentication required
			authRecord := e.Auth
			if authRecord == nil {
				return apis.NewUnauthorizedError("authentication required", nil)
			}

			// Parse multipart form
			if err := e.Request.ParseMultipartForm(10 << 20); err != nil { // 10MB max
				return apis.NewBadRequestError("failed to parse multipart form", err)
			}

			// Get the uploaded file
			file, header, err := e.Request.FormFile("image")
			if err != nil {
				return apis.NewBadRequestError("image file is required", err)
			}
			defer file.Close()

			log.Printf("Converting HEIC file: %s, size: %d bytes", header.Filename, header.Size)

			// Read the file into memory
			heicData, err := io.ReadAll(file)
			if err != nil {
				return apis.NewApiError(500, "failed to read file", err)
			}

			// Decode HEIC image
			img, err := goheif.Decode(bytes.NewReader(heicData))
			if err != nil {
				log.Printf("HEIC decode error: %v", err)
				return apis.NewApiError(500, "failed to decode HEIC image", err)
			}

			// Convert to JPEG
			var jpegBuffer bytes.Buffer
			if err := jpeg.Encode(&jpegBuffer, img, &jpeg.Options{Quality: 90}); err != nil {
				log.Printf("JPEG encode error: %v", err)
				return apis.NewApiError(500, "failed to encode JPEG", err)
			}

			log.Printf("Successfully converted HEIC to JPEG, output size: %d bytes", jpegBuffer.Len())

			// Return JPEG image
			e.Response.Header().Set("Content-Type", "image/jpeg")
			e.Response.Header().Set("Content-Length", fmt.Sprintf("%d", jpegBuffer.Len()))
			e.Response.WriteHeader(200)
			_, err = e.Response.Write(jpegBuffer.Bytes())
			return err
		})


		// Custom API endpoint: Parse menu using Google Gemini
		se.Router.POST("/api/parse-menu", func(e *core.RequestEvent) error {
			// Authentication required
			authRecord := e.Auth
			if authRecord == nil {
				return apis.NewUnauthorizedError("authentication required", nil)
			}

			// Get Gemini API key from environment
			geminiAPIKey := os.Getenv("GEMINI_API_KEY")
			if geminiAPIKey == "" {
				log.Printf("ERROR: GEMINI_API_KEY environment variable not set")
				return apis.NewApiError(500, "Gemini API key not configured", nil)
			}

			// Parse multipart form
			if err := e.Request.ParseMultipartForm(10 << 20); err != nil { // 10MB max
				return apis.NewBadRequestError("failed to parse multipart form", err)
			}

			// Get the uploaded file
			file, header, err := e.Request.FormFile("image")
			if err != nil {
				return apis.NewBadRequestError("image file is required", err)
			}
			defer file.Close()

			log.Printf("Parsing menu image with Gemini: %s, size: %d bytes", header.Filename, header.Size)

			// Read file into memory
			imageData, err := io.ReadAll(file)
			if err != nil {
				return apis.NewApiError(500, "failed to read image file", err)
			}

			// Initialize Gemini client
			ctx := context.Background()
			client, err := genai.NewClient(ctx, option.WithAPIKey(geminiAPIKey))
			if err != nil {
				log.Printf("Failed to create Gemini client: %v", err)
				return apis.NewApiError(500, "failed to initialize Gemini API", err)
			}
			defer client.Close()

			// Use Gemini Flash model
			model := client.GenerativeModel("gemini-flash-latest")

			// Configure model
			model.SetTemperature(0)

			// Detect MIME type from filename extension
			mimeType := mime.TypeByExtension(filepath.Ext(header.Filename))
			if mimeType == "" {
				// Default to jpeg if detection fails
				mimeType = "image/jpeg"
			}

			// Extract format from MIME type (e.g., "image/jpeg" -> "jpeg")
			// genai.ImageData expects just the format, not the full MIME type
			format := strings.TrimPrefix(mimeType, "image/")
			log.Printf("Detected MIME type: %s, format: %s for file: %s", mimeType, format, header.Filename)

			// Prepare the image part (pass format only, not full MIME type)
			imagePart := genai.ImageData(format, imageData)

			// Prepare the prompt
			prompt := `Please check if this picture is a picture of a menu. If it is a picture of a menu, please continue on. Otherwise, if it's not a picture of a menu, return a response that says it's not a menu image with the structure in a JSON object format:
{statusCode: 400, error: "Image is not a menu"}
If the picture is a menu, can you help me generate a CSV table of menu item and pricing according to this menu? It should follow the general output:
menu_item,price
Example menu name,18.99
Only output the CSV table or the JSON format, no need to explain what's happening`

			// Generate content
			resp, err := model.GenerateContent(ctx, genai.Text(prompt), imagePart)
			if err != nil {
				log.Printf("Gemini API error: %v", err)
				return apis.NewApiError(500, "failed to parse menu with Gemini", err)
			}

			// Extract text from response
			if len(resp.Candidates) == 0 || len(resp.Candidates[0].Content.Parts) == 0 {
				return apis.NewApiError(500, "no response from Gemini", nil)
			}

			var responseText string
			for _, part := range resp.Candidates[0].Content.Parts {
				if textPart, ok := part.(genai.Text); ok {
					responseText += string(textPart)
				}
			}

			log.Printf("Gemini response: %s", responseText)

			// Check if response indicates it's not a menu image
			// Try to parse as JSON error first
			trimmedResponse := strings.TrimSpace(responseText)
			if strings.Contains(trimmedResponse, "statusCode") && strings.Contains(trimmedResponse, "error") {
				// This looks like an error response
				log.Printf("Image is not a menu - Gemini returned error response")
				return apis.NewApiError(400, "Image is not a menu", nil)
			}

			// Return CSV text
			return e.JSON(200, map[string]any{
				"csv": responseText,
			})
		})

		// Custom API endpoint: OCR text from image using Google Cloud Vision API
		se.Router.POST("/api/ocr", func(e *core.RequestEvent) error {
			// Authentication required
			authRecord := e.Auth
			if authRecord == nil {
				return apis.NewUnauthorizedError("authentication required", nil)
			}

			// Get Google Cloud API key from environment (same key used for Places API)
			apiKey := os.Getenv("GOOGLE_PLACES_API_KEY")
			if apiKey == "" {
				log.Printf("ERROR: GOOGLE_PLACES_API_KEY environment variable not set")
				return apis.NewApiError(500, "Google Cloud API key not configured", nil)
			}

			// Parse multipart form
			if err := e.Request.ParseMultipartForm(10 << 20); err != nil { // 10MB max
				return apis.NewBadRequestError("failed to parse multipart form", err)
			}

			// Get the uploaded file
			file, header, err := e.Request.FormFile("image")
			if err != nil {
				return apis.NewBadRequestError("image file is required", err)
			}
			defer file.Close()

			log.Printf("Running OCR on image: %s, size: %d bytes", header.Filename, header.Size)

			// Read file into memory
			imageData, err := io.ReadAll(file)
			if err != nil {
				return apis.NewApiError(500, "failed to read image file", err)
			}

			// Initialize Vision API client
			ctx := context.Background()
			visionClient, err := vision.NewImageAnnotatorClient(ctx, option.WithAPIKey(apiKey))
			if err != nil {
				log.Printf("Failed to create Vision API client: %v", err)
				return apis.NewApiError(500, "failed to initialize Google Vision API", err)
			}
			defer visionClient.Close()

			// Create image object
			img := &visionpb.Image{
				Content: imageData,
			}

			// Create image context with language hints for better multi-language detection
			// Include common languages: Korean, Japanese, Chinese, English, Spanish, etc.
			imageContext := &visionpb.ImageContext{
				LanguageHints: []string{
					"ko", // Korean
					"ja", // Japanese
					"zh", // Chinese (simplified)
					"zh-TW", // Chinese (traditional)
					"en", // English
					"es", // Spanish
					"fr", // French
					"de", // German
					"vi", // Vietnamese
					"th", // Thai
				},
			}

			// Perform text detection with language hints
			annotations, err := visionClient.DetectTexts(ctx, img, imageContext, 0)
			if err != nil {
				log.Printf("Vision API text detection error: %v", err)
				return apis.NewApiError(500, "failed to detect text", err)
			}

			if len(annotations) == 0 {
				log.Printf("No text detected in image")
				return e.JSON(200, map[string]any{
					"textBlocks": []map[string]any{},
				})
			}

			// First annotation contains the full text, rest are individual text blocks
			textBlocks := make([]map[string]any, 0)

			// Skip first annotation (full text) and process individual text blocks
			for i := 1; i < len(annotations); i++ {
				textBlock := annotations[i]
				textBlocks = append(textBlocks, map[string]any{
					"text":        textBlock.Description,
					"confidence":  textBlock.Score,
				})
			}

			log.Printf("Detected %d text blocks", len(textBlocks))

			return e.JSON(200, map[string]any{
				"textBlocks": textBlocks,
				"fullText":   annotations[0].Description,
			})
		})

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
				Latitude  float64  `json:"latitude"`
				Longitude float64  `json:"longitude"`
				Radius    int      `json:"radius"` // in meters
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
			places := make([]map[string]any, len(resp.Places))
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

				places[i] = map[string]any{
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
				"places": places,
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
				Query    string  `json:"query"`
				Location string  `json:"location"`
				Radius   int     `json:"radius"` // in meters
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
			places := make([]map[string]any, len(resp.Places))
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

				places[i] = map[string]any{
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
				"places": places,
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

	// Rate limiting for invite code attempts
	type rateLimitInfo struct {
		attempts  int
		lockedUntil int64 // Unix timestamp
	}
	var inviteCodeAttempts = make(map[string]*rateLimitInfo) // IP -> rateLimitInfo
	const (
		maxAttempts     = 5      // Maximum attempts before lockout
		lockoutDuration = 15 * 60 // 15 minutes in seconds
	)

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

		// Check rate limiting
		now := time.Now().Unix()
		if rateLimitData, exists := inviteCodeAttempts[clientIP]; exists {
			// Check if still locked out
			if rateLimitData.lockedUntil > now {
				remainingSeconds := rateLimitData.lockedUntil - now
				remainingMinutes := remainingSeconds / 60
				log.Printf("Rate limit: IP %s is locked out for %d more seconds", clientIP, remainingSeconds)
				return apis.NewBadRequestError(fmt.Sprintf("too many failed attempts, please try again in %d minutes", remainingMinutes), nil)
			}

			// Lockout expired, reset attempts
			if rateLimitData.lockedUntil > 0 && rateLimitData.lockedUntil <= now {
				rateLimitData.attempts = 0
				rateLimitData.lockedUntil = 0
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
			if inviteCodeAttempts[clientIP] == nil {
				inviteCodeAttempts[clientIP] = &rateLimitInfo{attempts: 0, lockedUntil: 0}
			}
			inviteCodeAttempts[clientIP].attempts++

			log.Printf("Rate limit: IP %s failed attempt %d/%d", clientIP, inviteCodeAttempts[clientIP].attempts, maxAttempts)

			// Check if should be locked out
			if inviteCodeAttempts[clientIP].attempts >= maxAttempts {
				inviteCodeAttempts[clientIP].lockedUntil = now + lockoutDuration
				log.Printf("Rate limit: IP %s locked out for %d minutes", clientIP, lockoutDuration/60)
				return apis.NewBadRequestError("too many failed attempts, please try again in 15 minutes", nil)
			}

			return apis.NewBadRequestError("invalid or already used invite code", nil)
		}

		// Valid invite code - clear any previous failed attempts
		if inviteCodeAttempts[clientIP] != nil {
			inviteCodeAttempts[clientIP].attempts = 0
			inviteCodeAttempts[clientIP].lockedUntil = 0
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
		if err := generateInviteCodesForUser(app, e.Record.Id, parentInviteCode); err != nil {
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
// If prefix is provided, it will be prepended to the generated code
func generateRandomCode(prefix string) (string, error) {
	// Generate 10 random bytes (will encode to ~16 characters)
	bytes := make([]byte, 10)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}

	// Encode to base32 (removes ambiguous characters)
	code := base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(bytes)

	// Convert to lowercase and take first 12 characters
	code = strings.ToLower(code)[:12]

	// Prepend prefix if provided
	if prefix != "" {
		code = prefix + code
	}

	return code, nil
}

// generateInviteCodesForUser creates 5 invite codes for a user
// If the parent invite code starts with "TEST", the generated codes will also have the TEST prefix
func generateInviteCodesForUser(app core.App, userId string, parentInviteCode string) error {
	// Get the invite_codes collection
	collection, err := app.FindCollectionByNameOrId("invite_codes")
	if err != nil {
		return err
	}

	// Check if parent invite code is a test code
	var prefix string
	if strings.HasPrefix(strings.ToUpper(parentInviteCode), "TEST") {
		prefix = "TEST"
		log.Printf("Parent invite code is a test code, generated codes will have TEST prefix")
	}

	// Generate 5 codes
	for i := 0; i < 5; i++ {
		// Generate random code with prefix if applicable
		code, err := generateRandomCode(prefix)
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
