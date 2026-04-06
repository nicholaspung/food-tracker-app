package hooks

import (
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/router"

	"myapp/lib"
	_ "myapp/migrations"
	"myapp/testutil"
)

func newHookTestApp(t *testing.T) core.App {
	t.Helper()

	app := testutil.NewTestApp(t)

	RegisterUsageLimitHooks(app)
	return app
}

func createHookUser(t *testing.T, app core.App, isAdmin bool, isSubscriber bool) *core.Record {
	t.Helper()

	usersCollection, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		t.Fatalf("failed to resolve users collection: %v", err)
	}

	user := core.NewRecord(usersCollection)
	user.Set("email", fmt.Sprintf("hook_user_%d@example.com", time.Now().UnixNano()))
	user.Set("name", "Hook Test User")
	user.Set("isAdmin", isAdmin)
	user.Set("isSubscriber", isSubscriber)
	user.Set("defaultRestaurantVisibility", "friends")
	user.Set("defaultVisitVisibility", "friends")
	user.SetVerified(true)
	user.SetPassword("password123")

	if err := app.Save(user); err != nil {
		t.Fatalf("failed to save test user: %v", err)
	}

	return user
}

func insertVisitPhotoRowRaw(t *testing.T, app core.App, userID string, foodItemID string) string {
	t.Helper()

	recordID := fmt.Sprintf("vp_%d", time.Now().UnixNano())
	now := time.Now().UTC().Format(time.RFC3339Nano)

	if _, err := app.DB().NewQuery(`
		INSERT INTO visit_photos (id, photo, caption, visit, food_item, user, created, updated)
		VALUES ({:id}, {:photo}, '', '', {:foodItem}, {:user}, {:created}, {:updated})
	`).
		Bind(dbx.Params{
			"id":       recordID,
			"photo":    "test-photo.jpg",
			"foodItem": foodItemID,
			"user":     userID,
			"created":  now,
			"updated":  now,
		}).
		Execute(); err != nil {
		t.Fatalf("failed to insert visit_photo row: %v", err)
	}

	return recordID
}

func triggerVisitPhotoCreateHook(
	t *testing.T,
	app core.App,
	user *core.Record,
	foodItemID string,
	persistRecord bool,
	nextErr error,
) error {
	t.Helper()

	visitPhotosCollection, err := app.FindCollectionByNameOrId("visit_photos")
	if err != nil {
		t.Fatalf("failed to resolve visit_photos collection: %v", err)
	}

	record := core.NewRecord(visitPhotosCollection)
	record.Set("user", user.Id)
	record.Set("food_item", foodItemID)
	record.Set("photo", "test-photo.jpg")

	request := httptest.NewRequest(http.MethodPost, "/api/collections/visit_photos/records", nil)
	response := httptest.NewRecorder()
	requestEvent := &core.RequestEvent{
		App:  app,
		Auth: user,
	}
	requestEvent.Request = request
	requestEvent.Response = response

	event := &core.RecordRequestEvent{
		RequestEvent: requestEvent,
		Record:       record,
	}
	event.Collection = visitPhotosCollection

	return app.OnRecordCreateRequest().Trigger(event, func(e *core.RecordRequestEvent) error {
		if nextErr != nil {
			return nextErr
		}

		if persistRecord {
			insertVisitPhotoRowRaw(t, e.App, user.Id, foodItemID)
		}

		return nil
	})
}

func expectTooManyRequests(t *testing.T, err error) map[string]any {
	t.Helper()

	if err == nil {
		t.Fatalf("expected rate-limit error, got nil")
	}

	apiErr := router.ToApiError(err)
	if apiErr.Status != http.StatusTooManyRequests {
		t.Fatalf("expected status 429, got %d (%v)", apiErr.Status, err)
	}

	rawData, ok := apiErr.RawData().(map[string]any)
	if !ok {
		t.Fatalf("expected raw map payload, got %T", apiErr.RawData())
	}

	return rawData
}

func TestHookFreeUserSecondPhotoSameItemBlocked(t *testing.T) {
	app := newHookTestApp(t)
	user := createHookUser(t, app, false, false)
	foodItemID := "food_item_same"

	if err := triggerVisitPhotoCreateHook(t, app, user, foodItemID, true, nil); err != nil {
		t.Fatalf("first create should succeed: %v", err)
	}

	err := triggerVisitPhotoCreateHook(t, app, user, foodItemID, false, nil)
	payload := expectTooManyRequests(t, err)
	if payload["metric"] != string(lib.UsageMetricPhotoUploads) {
		t.Fatalf("expected photo_uploads metric, got %v", payload["metric"])
	}

	snapshot, snapshotErr := lib.GetMonthlyUsageSnapshot(app, user)
	if snapshotErr != nil {
		t.Fatalf("failed to load usage snapshot: %v", snapshotErr)
	}
	if snapshot.Usage.PhotoUploads != 1 {
		t.Fatalf("expected monthly photo usage=1, got %d", snapshot.Usage.PhotoUploads)
	}
}

func TestHookFreeUserSixthMonthlyPhotoBlocked(t *testing.T) {
	app := newHookTestApp(t)
	user := createHookUser(t, app, false, false)

	for i := 0; i < 5; i++ {
		foodItemID := fmt.Sprintf("free_food_%d", i)
		if err := triggerVisitPhotoCreateHook(t, app, user, foodItemID, true, nil); err != nil {
			t.Fatalf("create %d should succeed: %v", i+1, err)
		}
	}

	err := triggerVisitPhotoCreateHook(t, app, user, "free_food_6", false, nil)
	payload := expectTooManyRequests(t, err)
	if payload["limit"] != 5 {
		t.Fatalf("expected limit=5, got %v", payload["limit"])
	}

	snapshot, snapshotErr := lib.GetMonthlyUsageSnapshot(app, user)
	if snapshotErr != nil {
		t.Fatalf("failed to load usage snapshot: %v", snapshotErr)
	}
	if snapshot.Usage.PhotoUploads != 5 {
		t.Fatalf("expected usage=5 after sixth block, got %d", snapshot.Usage.PhotoUploads)
	}
}

func TestHookSubscriberTwentyFirstPhotoSameItemBlocked(t *testing.T) {
	app := newHookTestApp(t)
	user := createHookUser(t, app, false, true)
	foodItemID := "subscriber_food_same"

	for i := 0; i < 20; i++ {
		if err := triggerVisitPhotoCreateHook(t, app, user, foodItemID, true, nil); err != nil {
			t.Fatalf("create %d should succeed: %v", i+1, err)
		}
	}

	err := triggerVisitPhotoCreateHook(t, app, user, foodItemID, false, nil)
	payload := expectTooManyRequests(t, err)
	if payload["limit"] != 20 {
		t.Fatalf("expected per-record limit=20, got %v", payload["limit"])
	}
}

func TestHookAdminCanExceedSubscriberCaps(t *testing.T) {
	app := newHookTestApp(t)
	user := createHookUser(t, app, true, true)
	foodItemID := "admin_food_same"

	for i := 0; i < 25; i++ {
		if err := triggerVisitPhotoCreateHook(t, app, user, foodItemID, true, nil); err != nil {
			t.Fatalf("admin create %d should succeed: %v", i+1, err)
		}
	}

	snapshot, snapshotErr := lib.GetMonthlyUsageSnapshot(app, user)
	if snapshotErr != nil {
		t.Fatalf("failed to load usage snapshot: %v", snapshotErr)
	}
	if snapshot.Usage.PhotoUploads != 25 {
		t.Fatalf("expected admin monthly usage=25, got %d", snapshot.Usage.PhotoUploads)
	}
}

func TestHookDeleteDoesNotRefundMonthlyUsage(t *testing.T) {
	app := newHookTestApp(t)
	user := createHookUser(t, app, false, false)
	foodItemID := "delete_refund_food"

	if err := triggerVisitPhotoCreateHook(t, app, user, foodItemID, true, nil); err != nil {
		t.Fatalf("initial create should succeed: %v", err)
	}

	beforeDelete, beforeErr := lib.GetMonthlyUsageSnapshot(app, user)
	if beforeErr != nil {
		t.Fatalf("failed to load usage before delete: %v", beforeErr)
	}
	if beforeDelete.Usage.PhotoUploads != 1 {
		t.Fatalf("expected usage=1 before delete, got %d", beforeDelete.Usage.PhotoUploads)
	}

	record, err := app.FindFirstRecordByFilter(
		"visit_photos",
		"user = {:userId} && food_item = {:foodItemId}",
		dbx.Params{
			"userId":     user.Id,
			"foodItemId": foodItemID,
		},
	)
	if err != nil {
		t.Fatalf("failed to fetch inserted visit_photo record: %v", err)
	}

	// Use raw SQL delete to avoid file-storage side effects and verify that quota remains unchanged.
	if _, deleteErr := app.DB().NewQuery(`DELETE FROM visit_photos WHERE id = {:id}`).
		Bind(dbx.Params{"id": record.Id}).
		Execute(); deleteErr != nil {
		t.Fatalf("failed to delete visit_photo record: %v", deleteErr)
	}

	afterDelete, afterErr := lib.GetMonthlyUsageSnapshot(app, user)
	if afterErr != nil {
		t.Fatalf("failed to load usage after delete: %v", afterErr)
	}
	if afterDelete.Usage.PhotoUploads != 1 {
		t.Fatalf("expected usage to remain 1 after delete, got %d", afterDelete.Usage.PhotoUploads)
	}
}

func TestHookReleasesReservedUsageWhenCreatePipelineFails(t *testing.T) {
	app := newHookTestApp(t)
	user := createHookUser(t, app, false, false)

	simulatedErr := errors.New("pipeline failed")
	err := triggerVisitPhotoCreateHook(t, app, user, "release_on_failure", false, simulatedErr)
	if !errors.Is(err, simulatedErr) {
		t.Fatalf("expected original pipeline error, got %v", err)
	}

	snapshot, snapshotErr := lib.GetMonthlyUsageSnapshot(app, user)
	if snapshotErr != nil {
		t.Fatalf("failed to load usage snapshot: %v", snapshotErr)
	}
	if snapshot.Usage.PhotoUploads != 0 {
		t.Fatalf("expected usage to be released back to 0, got %d", snapshot.Usage.PhotoUploads)
	}
}
