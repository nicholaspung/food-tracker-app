package lib_test

import (
	"testing"

	"github.com/pocketbase/pocketbase/core"

	"myapp/lib"
	_ "myapp/migrations"
	"myapp/testutil"
)

func TestCreateAIErrorLog(t *testing.T) {
	app := testutil.NewTestApp(t)
	user := createAIErrorLogTestUser(t, app)

	if err := lib.CreateAIErrorLog(app, lib.AIErrorLogInput{
		RequestID:      "mobile-menu-scan-test",
		UserID:         user.Id,
		Route:          "parse_menu",
		UseCase:        "menu_parsing",
		Provider:       "gemini",
		Model:          "gemini-2.5-flash-lite",
		Status:         "failed",
		HTTPStatusCode: 500,
		ErrorType:      "*googleapi.Error",
		ErrorMessage:   "failed to parse menu with Gemini",
		DurationMs:     1200,
		PromptTokens:   10,
		OutputTokens:   5,
		TotalTokens:    15,
		ImageMimeType:  "image/jpeg",
		ImageSizeBytes: 2048,
		RestaurantID:   "restaurant-1",
		RestaurantName: "Ichiran",
		Metadata:       map[string]any{"test": true},
	}); err != nil {
		t.Fatalf("expected AI error log to save, got %v", err)
	}

	record, err := app.FindFirstRecordByFilter(
		lib.AIErrorLogsCollectionName,
		"requestId = {:requestId}",
		map[string]any{"requestId": "mobile-menu-scan-test"},
	)
	if err != nil {
		t.Fatalf("failed to load AI error log: %v", err)
	}

	if record.GetString("user") != user.Id {
		t.Fatalf("expected user relation %s, got %s", user.Id, record.GetString("user"))
	}
	if record.GetString("status") != "failed" || record.GetInt("httpStatusCode") != 500 {
		t.Fatalf("unexpected saved error log status=%s httpStatusCode=%d", record.GetString("status"), record.GetInt("httpStatusCode"))
	}
	if record.GetString("restaurantName") != "Ichiran" {
		t.Fatalf("expected restaurant name to be saved, got %q", record.GetString("restaurantName"))
	}
}

func createAIErrorLogTestUser(t *testing.T, app core.App) *core.Record {
	t.Helper()

	usersCollection, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		t.Fatalf("failed to resolve users collection: %v", err)
	}

	user := core.NewRecord(usersCollection)
	user.Set("email", "ai-error-log@example.com")
	user.Set("name", "AI Error Log User")
	user.Set("defaultRestaurantVisibility", "friends")
	user.Set("defaultVisitVisibility", "friends")
	user.SetVerified(true)
	user.SetPassword("password123")

	if err := app.Save(user); err != nil {
		t.Fatalf("failed to save user: %v", err)
	}

	return user
}
