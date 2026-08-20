package handlers_test

import (
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"

	"myapp/handlers"
	"myapp/hooks"
	"myapp/lib"
)

func TestRawContentUpdatesEnforcePreReviewModeration(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterUserHandlers(se, app)
		hooks.RegisterRecordOwnershipHooks(app)
		hooks.RegisterModerationHooks(app)
	})

	admin, adminToken := createAuthUser(t, server.app, true, false)
	owner, ownerToken := createAuthUser(t, server.app, false, false)
	friend, friendToken := createAuthUser(t, server.app, false, false)
	createFriendshipRecord(t, server.app, owner.Id, friend.Id, "accepted")

	owner.Set("contentModerationMode", lib.ContentModerationModePreReview)
	if err := server.app.Save(owner); err != nil {
		t.Fatalf("failed to enable pre-review mode: %v", err)
	}

	restaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Moderation Security Bistro",
		"location":   "Los Angeles",
		"createdBy":  owner.Id,
		"visibility": "public",
	})
	visit := createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant":       restaurant.Id,
		"user":             owner.Id,
		"visitDate":        "2026-08-01 18:00:00.000Z",
		"visibility":       "friends",
		"notes":            "Original visit",
		"moderationStatus": lib.ContentModerationStatusActive,
		"moderatedAt":      "2026-07-31 12:00:00.000Z",
		"moderatedBy":      admin.Id,
	})
	visitItem := createCollectionRecord(t, server.app, "food_items", map[string]any{
		"visit":            visit.Id,
		"user":             owner.Id,
		"name":             "Original Visit Item",
		"rating":           4,
		"itemType":         "visit-item",
		"moderationStatus": lib.ContentModerationStatusActive,
		"moderatedAt":      "2026-07-31 12:00:00.000Z",
		"moderatedBy":      admin.Id,
	})
	visitPhotoID := insertVisitPhotoRowRaw(t, server.app, owner.Id, visit.Id, visitItem.Id)
	visitPhoto, err := server.app.FindRecordById("visit_photos", visitPhotoID)
	if err != nil {
		t.Fatalf("failed to load visit photo: %v", err)
	}
	visitPhoto.Set("caption", "Original photo")
	visitPhoto.Set("moderationStatus", lib.ContentModerationStatusActive)
	visitPhoto.Set("moderatedAt", "2026-07-31 12:00:00.000Z")
	visitPhoto.Set("moderatedBy", admin.Id)
	if err := server.app.Save(visitPhoto); err != nil {
		t.Fatalf("failed to seed visit photo moderation state: %v", err)
	}

	targets := []struct {
		adminRawUpdateStatus int
		collection           string
		contentType          string
		editBody             string
		id                   string
		label                string
		targetType           string
	}{
		{
			adminRawUpdateStatus: http.StatusForbidden,
			collection:           "visits",
			contentType:          "visit",
			editBody:             `{"notes":"Edited visit"}`,
			id:                   visit.Id,
			label:                "Visit",
			targetType:           "visit",
		},
		{
			adminRawUpdateStatus: http.StatusForbidden,
			collection:           "food_items",
			contentType:          "food-item",
			editBody:             `{"name":"Edited Visit Item"}`,
			id:                   visitItem.Id,
			label:                "Visit Item",
			targetType:           "food-item",
		},
		{
			adminRawUpdateStatus: http.StatusNotFound,
			collection:           "visit_photos",
			contentType:          "photo",
			editBody:             `{"caption":"Edited photo"}`,
			id:                   visitPhotoID,
			label:                "Visit Photo",
			targetType:           "photo",
		},
	}

	for _, target := range targets {
		t.Run(target.label+" rejects owner-controlled moderation fields", func(t *testing.T) {
			response := performJSONRequest(
				t,
				server.mux,
				http.MethodPatch,
				"/api/collections/"+target.collection+"/records/"+target.id,
				ownerToken,
				fmt.Sprintf(
					`{"moderationStatus":"reviewed","moderatedAt":"2026-08-01 12:00:00.000Z","moderatedBy":%q}`,
					owner.Id,
				),
			)
			if response.Code != http.StatusForbidden {
				t.Fatalf("expected forged moderation update 403, got %d: %s", response.Code, response.Body.String())
			}

			reloaded, err := server.app.FindRecordById(target.collection, target.id)
			if err != nil {
				t.Fatalf("failed to reload rejected %s update: %v", target.label, err)
			}
			if reloaded.GetString("moderationStatus") != lib.ContentModerationStatusActive ||
				reloaded.GetString("moderatedBy") != admin.Id ||
				reloaded.GetDateTime("moderatedAt").IsZero() {
				t.Fatalf("rejected update changed %s moderation state: %#v", target.label, reloaded)
			}
		})

		t.Run(target.label+" rejects raw admin moderation changes", func(t *testing.T) {
			response := performJSONRequest(
				t,
				server.mux,
				http.MethodPatch,
				"/api/collections/"+target.collection+"/records/"+target.id,
				adminToken,
				`{"moderationStatus":"reviewed","moderatedAt":"2026-08-01 12:00:00.000Z"}`,
			)
			if response.Code != target.adminRawUpdateStatus {
				t.Fatalf("expected raw admin moderation update %d, got %d: %s", target.adminRawUpdateStatus, response.Code, response.Body.String())
			}

			reloaded, err := server.app.FindRecordById(target.collection, target.id)
			if err != nil {
				t.Fatalf("failed to reload rejected raw admin %s update: %v", target.label, err)
			}
			if reloaded.GetString("moderationStatus") != lib.ContentModerationStatusActive ||
				reloaded.GetString("moderatedBy") != admin.Id ||
				reloaded.GetDateTime("moderatedAt").IsZero() {
				t.Fatalf("rejected raw admin update changed %s moderation state: %#v", target.label, reloaded)
			}
		})

		t.Run(target.label+" edit returns to review", func(t *testing.T) {
			response := performJSONRequest(
				t,
				server.mux,
				http.MethodPatch,
				"/api/collections/"+target.collection+"/records/"+target.id,
				ownerToken,
				target.editBody,
			)
			if response.Code != http.StatusOK {
				t.Fatalf("expected ordinary pre-review edit 200, got %d: %s", response.Code, response.Body.String())
			}

			reloaded, err := server.app.FindRecordById(target.collection, target.id)
			if err != nil {
				t.Fatalf("failed to reload edited %s: %v", target.label, err)
			}
			if reloaded.GetString("moderationStatus") != lib.ContentModerationStatusUnderReview ||
				strings.TrimSpace(reloaded.GetString("moderatedBy")) != "" ||
				!reloaded.GetDateTime("moderatedAt").IsZero() {
				t.Fatalf("expected server-controlled under-review %s, got %#v", target.label, reloaded)
			}

			moderationCase, err := server.app.FindFirstRecordByFilter(
				"moderation_cases",
				"targetType = {:targetType} && targetRecordId = {:targetRecordId}",
				map[string]any{
					"targetType":     target.targetType,
					"targetRecordId": target.id,
				},
			)
			if err != nil {
				t.Fatalf("failed to load %s moderation case: %v", target.label, err)
			}
			if moderationCase.GetString("status") != lib.ModerationCaseStatusUnderReview ||
				moderationCase.GetString("action") != lib.ModerationActionQuarantine ||
				moderationCase.GetString("reasonCode") != "pre_review" {
				t.Fatalf("unexpected %s moderation case: %#v", target.label, moderationCase)
			}

			friendResponse := performJSONRequest(
				t,
				server.mux,
				http.MethodGet,
				"/api/collections/"+target.collection+"/records/"+target.id,
				friendToken,
				"",
			)
			if friendResponse.Code != http.StatusNotFound {
				t.Fatalf("expected %s to remain hidden from accepted friend, got %d: %s", target.label, friendResponse.Code, friendResponse.Body.String())
			}

			ownerResponse := performJSONRequest(
				t,
				server.mux,
				http.MethodGet,
				"/api/collections/"+target.collection+"/records/"+target.id,
				ownerToken,
				"",
			)
			if ownerResponse.Code != http.StatusOK {
				t.Fatalf("expected owner to retain %s access, got %d: %s", target.label, ownerResponse.Code, ownerResponse.Body.String())
			}
		})
	}

	for _, target := range targets {
		response := performJSONRequest(
			t,
			server.mux,
			http.MethodPatch,
			"/api/admin/users/"+owner.Id+"/content/"+target.contentType+"/"+target.id+"/moderation",
			adminToken,
			`{"action":"mark_reviewed"}`,
		)
		if response.Code != http.StatusOK {
			t.Fatalf("expected admin approval for %s to succeed, got %d: %s", target.label, response.Code, response.Body.String())
		}
	}

	for _, target := range targets {
		friendResponse := performJSONRequest(
			t,
			server.mux,
			http.MethodGet,
			"/api/collections/"+target.collection+"/records/"+target.id,
			friendToken,
			"",
		)
		if friendResponse.Code != http.StatusOK {
			t.Fatalf("expected accepted friend to access approved %s, got %d: %s", target.label, friendResponse.Code, friendResponse.Body.String())
		}
	}
}

func TestRawContentUpdatesKeepAdministrativeStatesProtected(t *testing.T) {
	server := newPreparedServer(t, func(_ *core.ServeEvent, app core.App) {
		hooks.RegisterModerationHooks(app)
	})
	owner, ownerToken := createAuthUser(t, server.app, false, false)
	owner.Set("contentModerationMode", lib.ContentModerationModePreReview)
	if err := server.app.Save(owner); err != nil {
		t.Fatalf("failed to enable pre-review mode: %v", err)
	}
	restaurant := seedRestaurantRecord(t, server.app, owner.Id, "Protected State Bistro")

	for _, status := range []string{
		lib.ContentModerationStatusHidden,
		lib.ContentModerationStatusRemoved,
		lib.ContentModerationStatusEscalated,
	} {
		t.Run(status, func(t *testing.T) {
			visit := seedVisitRecord(t, server.app, restaurant.Id, owner.Id, "friends")
			visit.Set("notes", "Administrative state")
			visit.Set("moderationStatus", status)
			if err := server.app.Save(visit); err != nil {
				t.Fatalf("failed to seed %s visit: %v", status, err)
			}

			response := performJSONRequest(
				t,
				server.mux,
				http.MethodPatch,
				"/api/collections/visits/records/"+visit.Id,
				ownerToken,
				`{"notes":"Owner edit"}`,
			)
			if response.Code != http.StatusNotFound {
				t.Fatalf("expected %s Visit owner update to be denied, got %d: %s", status, response.Code, response.Body.String())
			}

			reloaded, err := server.app.FindRecordById("visits", visit.Id)
			if err != nil {
				t.Fatalf("failed to reload protected visit: %v", err)
			}
			if reloaded.GetString("moderationStatus") != status || reloaded.GetString("notes") != "Administrative state" {
				t.Fatalf("protected Visit changed after rejected update: %#v", reloaded)
			}
		})
	}
}

func TestPreReviewUpdateRollsBackWhenModerationCaseCannotBeSaved(t *testing.T) {
	server := newPreparedServer(t, func(_ *core.ServeEvent, app core.App) {
		hooks.RegisterModerationHooks(app)
	})
	owner, ownerToken := createAuthUser(t, server.app, false, false)
	owner.Set("contentModerationMode", lib.ContentModerationModePreReview)
	if err := server.app.Save(owner); err != nil {
		t.Fatalf("failed to enable pre-review mode: %v", err)
	}
	restaurant := seedRestaurantRecord(t, server.app, owner.Id, "Atomic Review Bistro")
	visit := seedVisitRecord(t, server.app, restaurant.Id, owner.Id, "friends")
	visit.Set("notes", "Original atomic note")
	visit.Set("moderationStatus", lib.ContentModerationStatusActive)
	if err := server.app.Save(visit); err != nil {
		t.Fatalf("failed to seed active visit: %v", err)
	}

	moderationCases, err := server.app.FindCollectionByNameOrId("moderation_cases")
	if err != nil {
		t.Fatalf("failed to resolve moderation_cases: %v", err)
	}
	moderationCases.Fields.Add(&core.TextField{
		Name:     "requiredRollbackTestField",
		Required: true,
	})
	if err := server.app.Save(moderationCases); err != nil {
		t.Fatalf("failed to make moderation case inserts fail: %v", err)
	}

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPatch,
		"/api/collections/visits/records/"+visit.Id,
		ownerToken,
		`{"notes":"Should roll back"}`,
	)
	if response.Code != http.StatusInternalServerError {
		t.Fatalf("expected failed case write 500, got %d: %s", response.Code, response.Body.String())
	}

	reloaded, err := server.app.FindRecordById("visits", visit.Id)
	if err != nil {
		t.Fatalf("failed to reload rolled-back visit: %v", err)
	}
	if reloaded.GetString("notes") != "Original atomic note" ||
		reloaded.GetString("moderationStatus") != lib.ContentModerationStatusActive {
		t.Fatalf("content update persisted without its moderation case: %#v", reloaded)
	}
}
