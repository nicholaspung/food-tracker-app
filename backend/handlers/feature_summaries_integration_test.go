package handlers_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"myapp/handlers"
)

func setCollectionRecordCreatedAt(
	t *testing.T,
	app core.App,
	collectionName string,
	recordID string,
	createdAt string,
) {
	t.Helper()

	query := fmt.Sprintf(`UPDATE %s SET "created" = {:value} WHERE id = {:recordId}`, collectionName)
	if _, err := app.DB().NewQuery(query).Bind(dbx.Params{
		"value":    createdAt,
		"recordId": recordID,
	}).Execute(); err != nil {
		t.Fatalf("failed to update %s created time: %v", collectionName, err)
	}
}

func setCollectionRecordFieldValue(
	t *testing.T,
	app core.App,
	collectionName string,
	recordID string,
	fieldName string,
	value string,
) {
	t.Helper()

	query := fmt.Sprintf(`UPDATE %s SET "%s" = {:value} WHERE id = {:recordId}`, collectionName, fieldName)
	if _, err := app.DB().NewQuery(query).Bind(dbx.Params{
		"value":    value,
		"recordId": recordID,
	}).Execute(); err != nil {
		t.Fatalf("failed to update %s.%s: %v", collectionName, fieldName, err)
	}
}

func setCollectionRecordUpdatedAt(
	t *testing.T,
	app core.App,
	collectionName string,
	recordID string,
	updatedAt string,
) {
	t.Helper()

	setCollectionRecordFieldValue(t, app, collectionName, recordID, "updated", updatedAt)
}

func setNoteUsedAt(
	t *testing.T,
	app core.App,
	noteID string,
	usedAt string,
) {
	t.Helper()

	setCollectionRecordFieldValue(t, app, "notes", noteID, "usedAt", usedAt)
}

func TestNotesSummaryEndpoint(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureSummaryHandlers)
	user, token := createAuthUser(t, server.app, false, false)
	otherUser, _ := createAuthUser(t, server.app, false, false)

	createNoteRecord(t, server.app, user.Id, "draft")
	createNoteRecord(t, server.app, user.Id, "draft")
	createNoteRecord(t, server.app, user.Id, "used")
	createNoteRecord(t, server.app, otherUser.Id, "used")

	response := performJSONRequest(t, server.mux, http.MethodGet, "/api/notes/summary", token, "")
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", response.Code, response.Body.String())
	}

	body := parseJSONMap(t, response.Body.Bytes())
	assertFloatEquals(t, body["allCount"], 3)
	assertFloatEquals(t, body["draftCount"], 2)
	assertFloatEquals(t, body["usedCount"], 1)
}

func TestNotesOverviewEndpointReturnsSummaryAndPhotoPreviewMetadata(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureSummaryHandlers)
	user, token := createAuthUser(t, server.app, false, false)
	otherUser, _ := createAuthUser(t, server.app, false, false)

	restaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Preview Cafe",
		"location":   "San Francisco, CA",
		"visibility": "public",
	})

	draftNote := createNoteRecord(t, server.app, user.Id, "draft")
	draftNote.Set("content", "Draft note overview")
	draftNote.Set("location_text", "Window booth")
	draftNote.Set("restaurant", restaurant.Id)
	if err := server.app.Save(draftNote); err != nil {
		t.Fatalf("failed to update draft note: %v", err)
	}

	usedNote := createNoteRecord(t, server.app, user.Id, "used")
	usedNote.Set("content", "Used note overview")
	if err := server.app.Save(usedNote); err != nil {
		t.Fatalf("failed to update used note: %v", err)
	}

	otherUserNote := createNoteRecord(t, server.app, otherUser.Id, "draft")
	insertNotePhotoRowRaw(t, server.app, otherUser.Id, otherUserNote.Id, "other-user-photo.jpg", "2026-01-01T07:00:00Z")

	firstPreviewID := insertNotePhotoRowRaw(
		t,
		server.app,
		user.Id,
		draftNote.Id,
		"draft-photo-a.jpg",
		"2026-01-01T08:00:00Z",
	)
	insertNotePhotoRowRaw(t, server.app, user.Id, draftNote.Id, "draft-photo-b.jpg", "2026-01-01T09:00:00Z")
	insertNotePhotoRowRaw(t, server.app, user.Id, usedNote.Id, "used-photo.jpg", "2026-01-01T10:00:00Z")

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/notes/overview?status=draft&page=1&pageSize=10",
		token,
		"",
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", response.Code, response.Body.String())
	}

	var payload struct {
		Items []struct {
			ID             string `json:"id"`
			Content        string `json:"content"`
			LocationText   string `json:"locationText"`
			Status         string `json:"status"`
			RestaurantID   string `json:"restaurantId"`
			RestaurantName string `json:"restaurantName"`
			PhotoPreview   *struct {
				ID    string `json:"id"`
				Photo string `json:"photo"`
				Count int    `json:"count"`
			} `json:"photoPreview"`
		} `json:"items"`
		Summary struct {
			AllCount   int `json:"allCount"`
			DraftCount int `json:"draftCount"`
			UsedCount  int `json:"usedCount"`
		} `json:"summary"`
		Page        int  `json:"page"`
		PageSize    int  `json:"pageSize"`
		TotalItems  int  `json:"totalItems"`
		TotalPages  int  `json:"totalPages"`
		HasNextPage bool `json:"hasNextPage"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to decode notes overview payload: %v", err)
	}

	if payload.Page != 1 || payload.PageSize != 10 {
		t.Fatalf("expected page=1 pageSize=10, got page=%d pageSize=%d", payload.Page, payload.PageSize)
	}
	if payload.TotalItems != 1 || payload.TotalPages != 1 || payload.HasNextPage {
		t.Fatalf(
			"expected single draft page, got totalItems=%d totalPages=%d hasNextPage=%v",
			payload.TotalItems,
			payload.TotalPages,
			payload.HasNextPage,
		)
	}
	if payload.Summary.AllCount != 2 || payload.Summary.DraftCount != 1 || payload.Summary.UsedCount != 1 {
		t.Fatalf("unexpected summary payload: %#v", payload.Summary)
	}
	if len(payload.Items) != 1 {
		t.Fatalf("expected 1 draft note, got %#v", payload.Items)
	}

	item := payload.Items[0]
	if item.ID != draftNote.Id || item.Status != "draft" || item.Content != "Draft note overview" {
		t.Fatalf("unexpected draft note payload: %#v", item)
	}
	if item.LocationText != "Window booth" || item.RestaurantID != restaurant.Id || item.RestaurantName != "Preview Cafe" {
		t.Fatalf("expected mapped restaurant/location metadata, got %#v", item)
	}
	if item.PhotoPreview == nil {
		t.Fatalf("expected photo preview metadata for draft note, got %#v", item)
	}
	if item.PhotoPreview.ID != firstPreviewID || item.PhotoPreview.Photo != "draft-photo-a.jpg" || item.PhotoPreview.Count != 2 {
		t.Fatalf("unexpected draft photo preview payload: %#v", item.PhotoPreview)
	}
}

func TestNotesOverviewEndpointOrdersByCreatedAtDescending(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureSummaryHandlers)
	user, token := createAuthUser(t, server.app, false, false)

	olderNote := createNoteRecord(t, server.app, user.Id, "draft")
	olderNote.Set("content", "Older note")
	if err := server.app.Save(olderNote); err != nil {
		t.Fatalf("failed to update older note: %v", err)
	}
	setCollectionRecordCreatedAt(t, server.app, "notes", olderNote.Id, "2026-01-01T09:00:00Z")
	setCollectionRecordUpdatedAt(t, server.app, "notes", olderNote.Id, "2026-04-01T09:00:00Z")

	newerNote := createNoteRecord(t, server.app, user.Id, "draft")
	newerNote.Set("content", "Newer note")
	if err := server.app.Save(newerNote); err != nil {
		t.Fatalf("failed to update newer note: %v", err)
	}
	setCollectionRecordCreatedAt(t, server.app, "notes", newerNote.Id, "2026-03-01T09:00:00Z")
	setCollectionRecordUpdatedAt(t, server.app, "notes", newerNote.Id, "2026-03-02T09:00:00Z")

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/notes/overview?status=draft&page=1&pageSize=10",
		token,
		"",
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", response.Code, response.Body.String())
	}

	var payload struct {
		Items []struct {
			ID string `json:"id"`
		} `json:"items"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to decode notes overview payload: %v", err)
	}

	if len(payload.Items) != 2 {
		t.Fatalf("expected 2 notes, got %#v", payload.Items)
	}
	if payload.Items[0].ID != newerNote.Id || payload.Items[1].ID != olderNote.Id {
		t.Fatalf("expected newest-created note first, got %#v", payload.Items)
	}
}

func TestNotesOverviewEndpointSearchFiltersByContentAndLocationAcrossStatuses(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureSummaryHandlers)
	user, token := createAuthUser(t, server.app, false, false)
	otherUser, _ := createAuthUser(t, server.app, false, false)

	restaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Noodle Palace",
		"location":   "San Francisco, CA",
		"visibility": "public",
	})

	matchingDraft := createNoteRecord(t, server.app, user.Id, "draft")
	matchingDraft.Set("content", "Try the noodles with chili oil")
	if err := server.app.Save(matchingDraft); err != nil {
		t.Fatalf("failed to update matching draft note: %v", err)
	}
	setCollectionRecordCreatedAt(t, server.app, "notes", matchingDraft.Id, "2026-02-01T09:00:00Z")
	setCollectionRecordUpdatedAt(t, server.app, "notes", matchingDraft.Id, "2026-02-01T09:00:00Z")

	matchingUsed := createNoteRecord(t, server.app, user.Id, "used")
	matchingUsed.Set("content", "NOODLES are best with extra broth")
	if err := server.app.Save(matchingUsed); err != nil {
		t.Fatalf("failed to update matching used note: %v", err)
	}
	setCollectionRecordCreatedAt(t, server.app, "notes", matchingUsed.Id, "2026-03-01T09:00:00Z")
	setCollectionRecordUpdatedAt(t, server.app, "notes", matchingUsed.Id, "2026-03-01T09:00:00Z")

	contentNonMatch := createNoteRecord(t, server.app, user.Id, "draft")
	contentNonMatch.Set("content", "Burger only")
	contentNonMatch.Set("restaurant", restaurant.Id)
	contentNonMatch.Set("location_text", "Window booth")
	if err := server.app.Save(contentNonMatch); err != nil {
		t.Fatalf("failed to update non-matching note: %v", err)
	}
	setCollectionRecordCreatedAt(t, server.app, "notes", contentNonMatch.Id, "2026-04-01T09:00:00Z")
	setCollectionRecordUpdatedAt(t, server.app, "notes", contentNonMatch.Id, "2026-04-01T09:00:00Z")

	otherUserMatch := createNoteRecord(t, server.app, otherUser.Id, "draft")
	otherUserMatch.Set("content", "noodles from another account")
	if err := server.app.Save(otherUserMatch); err != nil {
		t.Fatalf("failed to update other-user note: %v", err)
	}

	draftResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/notes/overview?status=draft&page=1&pageSize=10&search=NOODLES",
		token,
		"",
	)
	if draftResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", draftResponse.Code, draftResponse.Body.String())
	}

	var draftPayload struct {
		Items []struct {
			ID      string `json:"id"`
			Content string `json:"content"`
			Status  string `json:"status"`
		} `json:"items"`
		Summary struct {
			AllCount   int `json:"allCount"`
			DraftCount int `json:"draftCount"`
			UsedCount  int `json:"usedCount"`
		} `json:"summary"`
		Page        int  `json:"page"`
		PageSize    int  `json:"pageSize"`
		TotalItems  int  `json:"totalItems"`
		TotalPages  int  `json:"totalPages"`
		HasNextPage bool `json:"hasNextPage"`
	}
	if err := json.Unmarshal(draftResponse.Body.Bytes(), &draftPayload); err != nil {
		t.Fatalf("failed to decode searched draft notes payload: %v", err)
	}

	if draftPayload.Page != 1 || draftPayload.PageSize != 10 {
		t.Fatalf("unexpected searched draft pagination payload: %#v", draftPayload)
	}
	if draftPayload.TotalItems != 1 || draftPayload.TotalPages != 1 || draftPayload.HasNextPage {
		t.Fatalf("expected one matching draft note, got %#v", draftPayload)
	}
	if draftPayload.Summary.AllCount != 2 || draftPayload.Summary.DraftCount != 1 || draftPayload.Summary.UsedCount != 1 {
		t.Fatalf("expected search-aware summary counts, got %#v", draftPayload.Summary)
	}
	if len(draftPayload.Items) != 1 {
		t.Fatalf("expected 1 searched draft note, got %#v", draftPayload.Items)
	}
	if draftPayload.Items[0].ID != matchingDraft.Id || draftPayload.Items[0].Status != "draft" {
		t.Fatalf("unexpected searched draft item payload: %#v", draftPayload.Items[0])
	}

	allResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/notes/overview?status=all&page=1&pageSize=1&search=noodles",
		token,
		"",
	)
	if allResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", allResponse.Code, allResponse.Body.String())
	}

	var allPayload struct {
		Items []struct {
			ID      string `json:"id"`
			Content string `json:"content"`
			Status  string `json:"status"`
		} `json:"items"`
		Summary struct {
			AllCount   int `json:"allCount"`
			DraftCount int `json:"draftCount"`
			UsedCount  int `json:"usedCount"`
		} `json:"summary"`
		Page        int  `json:"page"`
		PageSize    int  `json:"pageSize"`
		TotalItems  int  `json:"totalItems"`
		TotalPages  int  `json:"totalPages"`
		HasNextPage bool `json:"hasNextPage"`
	}
	if err := json.Unmarshal(allResponse.Body.Bytes(), &allPayload); err != nil {
		t.Fatalf("failed to decode searched all-notes payload: %v", err)
	}

	if allPayload.TotalItems != 2 || allPayload.TotalPages != 2 || !allPayload.HasNextPage {
		t.Fatalf("expected searched all-notes pagination metadata, got %#v", allPayload)
	}
	if allPayload.Summary.AllCount != 2 || allPayload.Summary.DraftCount != 1 || allPayload.Summary.UsedCount != 1 {
		t.Fatalf("expected searched all-notes summary counts, got %#v", allPayload.Summary)
	}
	if len(allPayload.Items) != 1 || allPayload.Items[0].ID != matchingUsed.Id || allPayload.Items[0].Status != "used" {
		t.Fatalf("expected newest matching note on first page, got %#v", allPayload.Items)
	}

	locationResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/notes/overview?status=all&page=1&pageSize=10&search=window",
		token,
		"",
	)
	if locationResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", locationResponse.Code, locationResponse.Body.String())
	}

	var locationPayload struct {
		Items []struct {
			ID string `json:"id"`
		} `json:"items"`
		Summary struct {
			AllCount   int `json:"allCount"`
			DraftCount int `json:"draftCount"`
			UsedCount  int `json:"usedCount"`
		} `json:"summary"`
		TotalItems int `json:"totalItems"`
	}
	if err := json.Unmarshal(locationResponse.Body.Bytes(), &locationPayload); err != nil {
		t.Fatalf("failed to decode location-searched notes payload: %v", err)
	}

	if locationPayload.TotalItems != 1 {
		t.Fatalf("expected 1 location-matching note, got %#v", locationPayload)
	}
	if locationPayload.Summary.AllCount != 1 || locationPayload.Summary.DraftCount != 1 || locationPayload.Summary.UsedCount != 0 {
		t.Fatalf("expected location search-aware summary counts, got %#v", locationPayload.Summary)
	}
	if len(locationPayload.Items) != 1 || locationPayload.Items[0].ID != contentNonMatch.Id {
		t.Fatalf("expected location search to return the location-matching note, got %#v", locationPayload.Items)
	}

	restaurantNameResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/notes/overview?status=all&page=1&pageSize=10&search=palace",
		token,
		"",
	)
	if restaurantNameResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", restaurantNameResponse.Code, restaurantNameResponse.Body.String())
	}

	var restaurantNamePayload struct {
		Items []struct {
			ID string `json:"id"`
		} `json:"items"`
		Summary struct {
			AllCount   int `json:"allCount"`
			DraftCount int `json:"draftCount"`
			UsedCount  int `json:"usedCount"`
		} `json:"summary"`
		TotalItems int `json:"totalItems"`
	}
	if err := json.Unmarshal(restaurantNameResponse.Body.Bytes(), &restaurantNamePayload); err != nil {
		t.Fatalf("failed to decode restaurant-name searched notes payload: %v", err)
	}

	if restaurantNamePayload.TotalItems != 0 {
		t.Fatalf("expected restaurant name search to return no notes, got %#v", restaurantNamePayload)
	}
	if restaurantNamePayload.Summary.AllCount != 0 || restaurantNamePayload.Summary.DraftCount != 0 || restaurantNamePayload.Summary.UsedCount != 0 {
		t.Fatalf("expected restaurant-name search summary to remain empty, got %#v", restaurantNamePayload.Summary)
	}
}

func TestNotesReadsCleanupExpiredUsedNotes(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureSummaryHandlers)
	user, token := createAuthUser(t, server.app, false, false)

	expiredUsed := createNoteRecord(t, server.app, user.Id, "used")
	expiredUsed.Set("content", "Expired used note")
	if err := server.app.Save(expiredUsed); err != nil {
		t.Fatalf("failed to update expired used note: %v", err)
	}
	setNoteUsedAt(t, server.app, expiredUsed.Id, "2025-01-01T00:00:00Z")

	freshUsed := createNoteRecord(t, server.app, user.Id, "used")
	freshUsed.Set("content", "Fresh used note")
	if err := server.app.Save(freshUsed); err != nil {
		t.Fatalf("failed to update fresh used note: %v", err)
	}
	setNoteUsedAt(t, server.app, freshUsed.Id, time.Now().UTC().AddDate(0, 0, -7).Format(time.RFC3339Nano))

	draftNote := createNoteRecord(t, server.app, user.Id, "draft")
	draftNote.Set("content", "Draft note")
	if err := server.app.Save(draftNote); err != nil {
		t.Fatalf("failed to update draft note: %v", err)
	}

	summaryResponse := performJSONRequest(t, server.mux, http.MethodGet, "/api/notes/summary", token, "")
	if summaryResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", summaryResponse.Code, summaryResponse.Body.String())
	}

	summaryBody := parseJSONMap(t, summaryResponse.Body.Bytes())
	assertFloatEquals(t, summaryBody["allCount"], 2)
	assertFloatEquals(t, summaryBody["draftCount"], 1)
	assertFloatEquals(t, summaryBody["usedCount"], 1)

	overviewResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/notes/overview?status=all&page=1&pageSize=10",
		token,
		"",
	)
	if overviewResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", overviewResponse.Code, overviewResponse.Body.String())
	}

	var overviewPayload struct {
		Items []struct {
			ID string `json:"id"`
		} `json:"items"`
	}
	if err := json.Unmarshal(overviewResponse.Body.Bytes(), &overviewPayload); err != nil {
		t.Fatalf("failed to decode notes overview payload: %v", err)
	}

	if len(overviewPayload.Items) != 2 {
		t.Fatalf("expected expired note to be removed from overview, got %#v", overviewPayload.Items)
	}

	remainingIDs := map[string]struct{}{}
	for _, item := range overviewPayload.Items {
		remainingIDs[item.ID] = struct{}{}
	}
	if _, exists := remainingIDs[expiredUsed.Id]; exists {
		t.Fatalf("expected expired used note to be removed from overview, got %#v", overviewPayload.Items)
	}
	if _, exists := remainingIDs[freshUsed.Id]; !exists {
		t.Fatalf("expected fresh used note to remain, got %#v", overviewPayload.Items)
	}
	if _, exists := remainingIDs[draftNote.Id]; !exists {
		t.Fatalf("expected draft note to remain, got %#v", overviewPayload.Items)
	}

	if _, err := server.app.FindRecordById("notes", expiredUsed.Id); err == nil {
		t.Fatalf("expected expired used note to be deleted")
	}
}

func TestNotesOverviewEndpointOmitsSummaryMetadataBeyondFirstPage(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureSummaryHandlers)
	user, token := createAuthUser(t, server.app, false, false)

	firstNote := createNoteRecord(t, server.app, user.Id, "draft")
	secondNote := createNoteRecord(t, server.app, user.Id, "draft")
	thirdNote := createNoteRecord(t, server.app, user.Id, "draft")

	firstNote.Set("content", "First note")
	secondNote.Set("content", "Second note")
	thirdNote.Set("content", "Third note")
	if err := server.app.Save(firstNote); err != nil {
		t.Fatalf("failed to update first note: %v", err)
	}
	if err := server.app.Save(secondNote); err != nil {
		t.Fatalf("failed to update second note: %v", err)
	}
	if err := server.app.Save(thirdNote); err != nil {
		t.Fatalf("failed to update third note: %v", err)
	}

	secondPageResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/notes/overview?status=draft&page=2&pageSize=1",
		token,
		"",
	)
	if secondPageResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", secondPageResponse.Code, secondPageResponse.Body.String())
	}

	var payload struct {
		Items []struct {
			ID string `json:"id"`
		} `json:"items"`
		Page        int              `json:"page"`
		PageSize    int              `json:"pageSize"`
		HasNextPage bool             `json:"hasNextPage"`
		Summary     *json.RawMessage `json:"summary"`
		TotalItems  *int             `json:"totalItems"`
		TotalPages  *int             `json:"totalPages"`
	}
	if err := json.Unmarshal(secondPageResponse.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to decode second notes overview payload: %v", err)
	}

	if payload.Page != 2 || payload.PageSize != 1 || !payload.HasNextPage {
		t.Fatalf("unexpected second-page pagination payload: %#v", payload)
	}
	if payload.Summary != nil || payload.TotalItems != nil || payload.TotalPages != nil {
		t.Fatalf("expected later notes page to omit summary totals, got %#v", payload)
	}
	if len(payload.Items) != 1 || payload.Items[0].ID == "" {
		t.Fatalf("expected one note item on second page, got %#v", payload.Items)
	}
}

func TestNoteDetailEndpointReturnsNoteAndPhotos(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureSummaryHandlers)
	user, token := createAuthUser(t, server.app, false, false)

	restaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Detail Cafe",
		"location":   "Oakland, CA",
		"visibility": "public",
	})

	note := createNoteRecord(t, server.app, user.Id, "draft")
	note.Set("content", "Detail note body")
	note.Set("location_text", "Outdoor patio")
	note.Set("restaurant", restaurant.Id)
	if err := server.app.Save(note); err != nil {
		t.Fatalf("failed to update note: %v", err)
	}

	firstPhotoID := insertNotePhotoRowRaw(
		t,
		server.app,
		user.Id,
		note.Id,
		"detail-photo-a.jpg",
		"2026-01-01T08:00:00Z",
	)
	secondPhotoID := insertNotePhotoRowRaw(
		t,
		server.app,
		user.Id,
		note.Id,
		"detail-photo-b.jpg",
		"2026-01-01T09:00:00Z",
	)

	response := performJSONRequest(t, server.mux, http.MethodGet, "/api/notes/"+note.Id, token, "")
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", response.Code, response.Body.String())
	}

	var payload struct {
		Note *struct {
			ID             string `json:"id"`
			Content        string `json:"content"`
			LocationText   string `json:"locationText"`
			Status         string `json:"status"`
			RestaurantID   string `json:"restaurantId"`
			RestaurantName string `json:"restaurantName"`
			CreatedAt      string `json:"createdAt"`
			UpdatedAt      string `json:"updatedAt"`
		} `json:"note"`
		Photos []struct {
			ID      string `json:"id"`
			Note    string `json:"note"`
			Photo   string `json:"photo"`
			Created string `json:"created"`
		} `json:"photos"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to decode note detail payload: %v", err)
	}

	if payload.Note == nil {
		t.Fatalf("expected note detail payload, got %#v", payload)
	}
	if payload.Note.ID != note.Id || payload.Note.Content != "Detail note body" || payload.Note.Status != "draft" {
		t.Fatalf("unexpected note payload: %#v", payload.Note)
	}
	if payload.Note.LocationText != "Outdoor patio" ||
		payload.Note.RestaurantID != restaurant.Id ||
		payload.Note.RestaurantName != "Detail Cafe" {
		t.Fatalf("expected mapped note metadata, got %#v", payload.Note)
	}
	if payload.Note.CreatedAt == "" || payload.Note.UpdatedAt == "" {
		t.Fatalf("expected timestamps in note payload, got %#v", payload.Note)
	}
	if len(payload.Photos) != 2 {
		t.Fatalf("expected 2 note photos, got %#v", payload.Photos)
	}
	if payload.Photos[0].ID != firstPhotoID ||
		payload.Photos[0].Note != note.Id ||
		payload.Photos[0].Photo != "detail-photo-a.jpg" {
		t.Fatalf("unexpected first note photo payload: %#v", payload.Photos[0])
	}
	if payload.Photos[1].ID != secondPhotoID ||
		payload.Photos[1].Note != note.Id ||
		payload.Photos[1].Photo != "detail-photo-b.jpg" {
		t.Fatalf("unexpected second note photo payload: %#v", payload.Photos[1])
	}
}

func TestNoteDetailEndpointHidesOtherUsersNotes(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureSummaryHandlers)
	_, token := createAuthUser(t, server.app, false, false)
	otherUser, _ := createAuthUser(t, server.app, false, false)

	otherUserNote := createNoteRecord(t, server.app, otherUser.Id, "draft")

	response := performJSONRequest(t, server.mux, http.MethodGet, "/api/notes/"+otherUserNote.Id, token, "")
	if response.Code != http.StatusNotFound {
		t.Fatalf("expected 404 Not Found, got %d: %s", response.Code, response.Body.String())
	}
}

func TestNoteDetailEndpointDeletesExpiredUsedNotesBeforeReturning(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureSummaryHandlers)
	user, token := createAuthUser(t, server.app, false, false)

	expiredNote := createNoteRecord(t, server.app, user.Id, "used")
	expiredNote.Set("content", "Expired detail note")
	if err := server.app.Save(expiredNote); err != nil {
		t.Fatalf("failed to update expired note: %v", err)
	}
	setNoteUsedAt(t, server.app, expiredNote.Id, "2025-01-01T00:00:00Z")

	response := performJSONRequest(t, server.mux, http.MethodGet, "/api/notes/"+expiredNote.Id, token, "")
	if response.Code != http.StatusNotFound {
		t.Fatalf("expected 404 Not Found, got %d: %s", response.Code, response.Body.String())
	}

	if _, err := server.app.FindRecordById("notes", expiredNote.Id); err == nil {
		t.Fatalf("expected expired note to be deleted before detail response")
	}
}

func TestFriendsSummaryEndpoint(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureSummaryHandlers)
	user, token := createAuthUser(t, server.app, false, false)
	friendA, _ := createAuthUser(t, server.app, false, false)
	friendB, _ := createAuthUser(t, server.app, false, false)
	friendC, _ := createAuthUser(t, server.app, false, false)
	friendD, _ := createAuthUser(t, server.app, false, false)
	otherUser, _ := createAuthUser(t, server.app, false, false)
	otherFriend, _ := createAuthUser(t, server.app, false, false)

	createFriendshipRecord(t, server.app, user.Id, friendA.Id, "accepted")
	createFriendshipRecord(t, server.app, friendB.Id, user.Id, "pending")
	createFriendshipRecord(t, server.app, user.Id, friendC.Id, "pending")
	createFriendshipRecord(t, server.app, user.Id, friendD.Id, "blocked")
	createFriendshipRecord(t, server.app, otherUser.Id, otherFriend.Id, "accepted")

	response := performJSONRequest(t, server.mux, http.MethodGet, "/api/friends/summary", token, "")
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", response.Code, response.Body.String())
	}

	body := parseJSONMap(t, response.Body.Bytes())
	assertFloatEquals(t, body["friendsCount"], 1)
	assertFloatEquals(t, body["requestsCount"], 1)
	assertFloatEquals(t, body["sentCount"], 1)
}

func TestFeedbackSummaryEndpoint(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureSummaryHandlers)
	user, token := createAuthUser(t, server.app, false, false)
	otherUser, _ := createAuthUser(t, server.app, false, false)

	createFeedbackRecord(t, server.app, user.Id, "open")
	createFeedbackRecord(t, server.app, user.Id, "in_progress")
	createFeedbackRecord(t, server.app, user.Id, "resolved")
	createFeedbackRecord(t, server.app, user.Id, "closed")
	createFeedbackRecord(t, server.app, otherUser.Id, "open")

	response := performJSONRequest(t, server.mux, http.MethodGet, "/api/feedback/summary", token, "")
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", response.Code, response.Body.String())
	}

	body := parseJSONMap(t, response.Body.Bytes())
	assertFloatEquals(t, body["allCount"], 4)
	assertFloatEquals(t, body["activeCount"], 2)
}

func TestBillsSummaryEndpoint(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureSummaryHandlers)
	user, token := createAuthUser(t, server.app, false, false)
	creatorParticipant, _ := createAuthUser(t, server.app, false, false)
	settledParticipant, _ := createAuthUser(t, server.app, false, false)
	otherCreator, _ := createAuthUser(t, server.app, false, false)
	unrelatedUser, _ := createAuthUser(t, server.app, false, false)

	createdBill := createCollectionRecord(t, server.app, "bills", map[string]any{
		"creator_user":      user.Id,
		"bill_name":         "Team Dinner",
		"total_amount":      50.0,
		"tax":               4.0,
		"tip":               8.0,
		"fees":              0.0,
		"split_mode":        "even",
		"extras_split_mode": "proportional",
		"status":            "active",
	})
	createCollectionRecord(t, server.app, "bill_participants", map[string]any{
		"bill":             createdBill.Id,
		"user":             user.Id,
		"participant_name": "You",
		"amount_owed":      12.0,
		"paid_status":      "pending",
	})
	createCollectionRecord(t, server.app, "bill_participants", map[string]any{
		"bill":             createdBill.Id,
		"user":             creatorParticipant.Id,
		"participant_name": "Alex",
		"amount_owed":      18.0,
		"paid_status":      "pending",
	})
	createCollectionRecord(t, server.app, "bill_participants", map[string]any{
		"bill":             createdBill.Id,
		"user":             settledParticipant.Id,
		"participant_name": "Taylor",
		"amount_owed":      20.0,
		"paid_status":      "paid",
	})

	participantBill := createCollectionRecord(t, server.app, "bills", map[string]any{
		"creator_user":      otherCreator.Id,
		"bill_name":         "Cab Ride",
		"total_amount":      25.0,
		"tax":               0.0,
		"tip":               0.0,
		"fees":              0.0,
		"split_mode":        "even",
		"extras_split_mode": "equal",
		"status":            "active",
	})
	createCollectionRecord(t, server.app, "bill_participants", map[string]any{
		"bill":             participantBill.Id,
		"user":             otherCreator.Id,
		"participant_name": "Morgan",
		"amount_owed":      16.0,
		"paid_status":      "paid",
	})
	createCollectionRecord(t, server.app, "bill_participants", map[string]any{
		"bill":             participantBill.Id,
		"user":             user.Id,
		"participant_name": "You",
		"amount_owed":      9.0,
		"paid_status":      "pending",
	})

	settledBill := createCollectionRecord(t, server.app, "bills", map[string]any{
		"creator_user":      user.Id,
		"bill_name":         "Lunch",
		"total_amount":      28.0,
		"tax":               2.0,
		"tip":               4.0,
		"fees":              0.0,
		"split_mode":        "even",
		"extras_split_mode": "equal",
		"status":            "settled",
	})
	createCollectionRecord(t, server.app, "bill_participants", map[string]any{
		"bill":             settledBill.Id,
		"user":             user.Id,
		"participant_name": "You",
		"amount_owed":      14.0,
		"paid_status":      "paid",
	})
	createCollectionRecord(t, server.app, "bill_participants", map[string]any{
		"bill":             settledBill.Id,
		"user":             creatorParticipant.Id,
		"participant_name": "Alex",
		"amount_owed":      14.0,
		"paid_status":      "paid",
	})

	unrelatedBill := createCollectionRecord(t, server.app, "bills", map[string]any{
		"creator_user":      unrelatedUser.Id,
		"bill_name":         "Private Bill",
		"total_amount":      10.0,
		"tax":               0.0,
		"tip":               0.0,
		"fees":              0.0,
		"split_mode":        "even",
		"extras_split_mode": "equal",
		"status":            "active",
	})
	createCollectionRecord(t, server.app, "bill_participants", map[string]any{
		"bill":             unrelatedBill.Id,
		"user":             unrelatedUser.Id,
		"participant_name": "Unaffiliated",
		"amount_owed":      10.0,
		"paid_status":      "pending",
	})

	response := performJSONRequest(t, server.mux, http.MethodGet, "/api/bills/summary", token, "")
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", response.Code, response.Body.String())
	}

	var payload []struct {
		ID                           string  `json:"id"`
		Title                        string  `json:"title"`
		Status                       string  `json:"status"`
		ParticipantCount             int     `json:"participantCount"`
		PendingOtherParticipantCount int     `json:"pendingOtherParticipantCount"`
		YouOwe                       float64 `json:"youOwe"`
		YouAreOwed                   float64 `json:"youAreOwed"`
		IsCreator                    bool    `json:"isCreator"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to parse response JSON: %v; body=%s", err, response.Body.String())
	}

	if len(payload) != 3 {
		t.Fatalf("expected 3 bill summaries, got %d: %#v", len(payload), payload)
	}

	summaryByID := make(map[string]struct {
		title                        string
		status                       string
		participantCount             int
		pendingOtherParticipantCount int
		youOwe                       float64
		youAreOwed                   float64
		isCreator                    bool
	}, len(payload))
	for _, item := range payload {
		summaryByID[item.ID] = struct {
			title                        string
			status                       string
			participantCount             int
			pendingOtherParticipantCount int
			youOwe                       float64
			youAreOwed                   float64
			isCreator                    bool
		}{
			title:                        item.Title,
			status:                       item.Status,
			participantCount:             item.ParticipantCount,
			pendingOtherParticipantCount: item.PendingOtherParticipantCount,
			youOwe:                       item.YouOwe,
			youAreOwed:                   item.YouAreOwed,
			isCreator:                    item.IsCreator,
		}
	}

	if _, exists := summaryByID[unrelatedBill.Id]; exists {
		t.Fatalf("unexpected unrelated bill in summary: %#v", summaryByID[unrelatedBill.Id])
	}

	if summary := summaryByID[createdBill.Id]; summary.title != "Team Dinner" ||
		summary.status != "open" ||
		summary.participantCount != 3 ||
		summary.pendingOtherParticipantCount != 1 ||
		summary.youOwe != 12.0 ||
		summary.youAreOwed != 18.0 ||
		!summary.isCreator {
		t.Fatalf("unexpected created bill summary: %#v", summary)
	}

	if summary := summaryByID[participantBill.Id]; summary.title != "Cab Ride" ||
		summary.status != "open" ||
		summary.participantCount != 2 ||
		summary.pendingOtherParticipantCount != 0 ||
		summary.youOwe != 9.0 ||
		summary.youAreOwed != 0.0 ||
		summary.isCreator {
		t.Fatalf("unexpected participant bill summary: %#v", summary)
	}

	if summary := summaryByID[settledBill.Id]; summary.title != "Lunch" ||
		summary.status != "settled" ||
		summary.participantCount != 2 ||
		summary.pendingOtherParticipantCount != 0 ||
		summary.youOwe != 0.0 ||
		summary.youAreOwed != 0.0 ||
		!summary.isCreator {
		t.Fatalf("unexpected settled bill summary: %#v", summary)
	}
}

func TestBillDetailEndpointReturnsNestedDataAndParticipantDisplayMetadata(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureSummaryHandlers)
	owner, ownerToken := createAuthUser(t, server.app, false, false)
	participant, participantToken := createAuthUser(t, server.app, false, false)
	_, outsiderToken := createAuthUser(t, server.app, false, false)

	participant.Set("name", "Casey Friend")
	if err := server.app.Save(participant); err != nil {
		t.Fatalf("failed to update participant name: %v", err)
	}

	friendship := createCollectionRecord(t, server.app, "friendships", map[string]any{
		"user":   owner.Id,
		"friend": participant.Id,
		"status": "accepted",
	})

	bill := createCollectionRecord(t, server.app, "bills", map[string]any{
		"bill_name":         "Team Dinner",
		"creator_user":      owner.Id,
		"total_amount":      54,
		"tax":               4,
		"tip":               8,
		"fees":              2,
		"split_mode":        "itemized",
		"extras_split_mode": "proportional",
		"status":            "active",
	})

	ownerParticipant := createCollectionRecord(t, server.app, "bill_participants", map[string]any{
		"bill":             bill.Id,
		"user":             owner.Id,
		"participant_name": owner.GetString("name"),
		"amount_owed":      22,
		"paid_status":      "pending",
	})
	friendParticipant := createCollectionRecord(t, server.app, "bill_participants", map[string]any{
		"bill":             bill.Id,
		"user":             participant.Id,
		"participant_name": participant.GetString("name"),
		"amount_owed":      32,
		"paid_status":      "paid",
	})

	createCollectionRecord(t, server.app, "bill_items", map[string]any{
		"bill":        bill.Id,
		"item_name":   "Shared Plates",
		"price":       54,
		"assigned_to": []string{ownerParticipant.Id, friendParticipant.Id},
		"split_mode":  "simple",
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/bills/"+bill.Id,
		ownerToken,
		"",
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", response.Code, response.Body.String())
	}

	var payload struct {
		ID           string `json:"id"`
		Title        string `json:"title"`
		Status       string `json:"status"`
		Participants []struct {
			ID           string  `json:"id"`
			UserID       string  `json:"userId"`
			FriendshipID string  `json:"friendshipId"`
			Name         string  `json:"name"`
			AmountOwed   float64 `json:"amountOwed"`
			PaidStatus   string  `json:"paidStatus"`
		} `json:"participants"`
		Items []struct {
			ID                       string   `json:"id"`
			ItemName                 string   `json:"itemName"`
			AssignedToParticipantIDs []string `json:"assignedToParticipantIds"`
		} `json:"items"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to parse bill detail payload: %v; body=%s", err, response.Body.String())
	}

	if payload.ID != bill.Id || payload.Title != "Team Dinner" || payload.Status != "open" {
		t.Fatalf("unexpected bill detail payload: %#v", payload)
	}
	if len(payload.Participants) != 2 {
		t.Fatalf("expected 2 participants, got %#v", payload.Participants)
	}
	if len(payload.Items) != 1 {
		t.Fatalf("expected 1 item, got %#v", payload.Items)
	}

	participantByID := make(map[string]struct {
		UserID       string
		FriendshipID string
		Name         string
		AmountOwed   float64
		PaidStatus   string
	}, len(payload.Participants))
	for _, participantPayload := range payload.Participants {
		participantByID[participantPayload.ID] = struct {
			UserID       string
			FriendshipID string
			Name         string
			AmountOwed   float64
			PaidStatus   string
		}{
			UserID:       participantPayload.UserID,
			FriendshipID: participantPayload.FriendshipID,
			Name:         participantPayload.Name,
			AmountOwed:   participantPayload.AmountOwed,
			PaidStatus:   participantPayload.PaidStatus,
		}
	}

	if ownerPayload := participantByID[ownerParticipant.Id]; ownerPayload.UserID != owner.Id || ownerPayload.FriendshipID != "" {
		t.Fatalf("expected owner participant without friendship metadata, got %#v", ownerPayload)
	}
	if friendPayload := participantByID[friendParticipant.Id]; friendPayload.UserID != participant.Id ||
		friendPayload.FriendshipID != friendship.Id ||
		friendPayload.Name != "Casey Friend" ||
		friendPayload.AmountOwed != 32 ||
		friendPayload.PaidStatus != "paid" {
		t.Fatalf("unexpected friend participant payload: %#v", friendPayload)
	}

	if payload.Items[0].ItemName != "Shared Plates" ||
		len(payload.Items[0].AssignedToParticipantIDs) != 2 ||
		payload.Items[0].AssignedToParticipantIDs[0] != ownerParticipant.Id ||
		payload.Items[0].AssignedToParticipantIDs[1] != friendParticipant.Id {
		t.Fatalf("unexpected item payload: %#v", payload.Items[0])
	}

	participantResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/bills/"+bill.Id,
		participantToken,
		"",
	)
	if participantResponse.Code != http.StatusOK {
		t.Fatalf("expected participant access to succeed, got %d: %s", participantResponse.Code, participantResponse.Body.String())
	}

	outsiderResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/bills/"+bill.Id,
		outsiderToken,
		"",
	)
	if outsiderResponse.Code != http.StatusNotFound {
		t.Fatalf("expected outsider access to be denied with 404, got %d: %s", outsiderResponse.Code, outsiderResponse.Body.String())
	}
}

func TestVisitsPageEndpointSearchesAcrossRestaurantsAndItemsWithPagination(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureSummaryHandlers)
	user, token := createAuthUser(t, server.app, false, false)
	friend, _ := createAuthUser(t, server.app, false, false)

	createFriendshipRecord(t, server.app, user.Id, friend.Id, "accepted")

	searchByRestaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Broth Bar",
		"location":   "Los Angeles, CA",
		"visibility": "public",
	})
	searchByItem := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Noodle House",
		"location":   "San Diego, CA",
		"visibility": "public",
	})
	nonMatchRestaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Pizza Town",
		"location":   "San Jose, CA",
		"visibility": "public",
	})

	restaurantMatchVisit := createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": searchByRestaurant.Id,
		"user":       friend.Id,
		"visitDate":  "2026-04-05 18:30:00.000Z",
		"visibility": "friends",
	})
	createCollectionRecord(t, server.app, "food_items", map[string]any{
		"visit":  restaurantMatchVisit.Id,
		"user":   friend.Id,
		"name":   "Garlic Toast",
		"rating": 4,
		"notes":  "crispy and buttery",
	})

	itemMatchVisit := createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": searchByItem.Id,
		"user":       friend.Id,
		"visitDate":  "2026-04-04 18:30:00.000Z",
		"visibility": "friends",
	})
	itemMatchFoodItem := createCollectionRecord(t, server.app, "food_items", map[string]any{
		"visit":  itemMatchVisit.Id,
		"user":   friend.Id,
		"name":   "Chicken Soup",
		"rating": 5,
		"notes":  "rich broth with herbs",
	})

	createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": nonMatchRestaurant.Id,
		"user":       friend.Id,
		"visitDate":  "2026-04-03 18:30:00.000Z",
		"visibility": "friends",
	})
	createCollectionRecord(t, server.app, "food_items", map[string]any{
		"visit":  itemMatchVisit.Id,
		"user":   friend.Id,
		"name":   "Steamed Dumplings",
		"rating": 4,
		"notes":  "great texture",
	})

	firstResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/visits?page=1&pageSize=1&scope=friends&search=broth",
		token,
		"",
	)
	if firstResponse.Code != http.StatusOK {
		t.Fatalf("expected first response 200 OK, got %d: %s", firstResponse.Code, firstResponse.Body.String())
	}

	var firstPayload struct {
		Items []struct {
			ID             string `json:"id"`
			RestaurantName string `json:"restaurantName"`
			Items          []struct {
				ID    string `json:"id"`
				Name  string `json:"name"`
				Notes string `json:"notes"`
			} `json:"items"`
		} `json:"items"`
		Page        int  `json:"page"`
		PageSize    int  `json:"pageSize"`
		TotalItems  int  `json:"totalItems"`
		TotalPages  int  `json:"totalPages"`
		HasNextPage bool `json:"hasNextPage"`
	}
	if err := json.Unmarshal(firstResponse.Body.Bytes(), &firstPayload); err != nil {
		t.Fatalf("failed to parse first visits payload: %v; body=%s", err, firstResponse.Body.String())
	}

	if firstPayload.Page != 1 || firstPayload.PageSize != 1 || firstPayload.TotalItems != 2 || firstPayload.TotalPages != 2 || !firstPayload.HasNextPage {
		t.Fatalf("unexpected first visits pagination payload: %#v", firstPayload)
	}
	if len(firstPayload.Items) != 1 || firstPayload.Items[0].ID != restaurantMatchVisit.Id {
		t.Fatalf("expected newest restaurant-name match first, got %#v", firstPayload.Items)
	}
	if firstPayload.Items[0].RestaurantName != "Broth Bar" {
		t.Fatalf("expected restaurant search match to retain restaurant metadata, got %#v", firstPayload.Items[0])
	}

	secondResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/visits?page=2&pageSize=1&scope=friends&search=broth",
		token,
		"",
	)
	if secondResponse.Code != http.StatusOK {
		t.Fatalf("expected second response 200 OK, got %d: %s", secondResponse.Code, secondResponse.Body.String())
	}

	var secondPayload struct {
		Items []struct {
			ID             string `json:"id"`
			RestaurantName string `json:"restaurantName"`
			Items          []struct {
				ID    string `json:"id"`
				Name  string `json:"name"`
				Notes string `json:"notes"`
			} `json:"items"`
		} `json:"items"`
		Page        int  `json:"page"`
		PageSize    int  `json:"pageSize"`
		TotalItems  int  `json:"totalItems"`
		TotalPages  int  `json:"totalPages"`
		HasNextPage bool `json:"hasNextPage"`
	}
	if err := json.Unmarshal(secondResponse.Body.Bytes(), &secondPayload); err != nil {
		t.Fatalf("failed to parse second visits payload: %v; body=%s", err, secondResponse.Body.String())
	}

	if secondPayload.Page != 2 || secondPayload.PageSize != 1 || secondPayload.TotalItems != 2 || secondPayload.TotalPages != 2 || secondPayload.HasNextPage {
		t.Fatalf("unexpected second visits pagination payload: %#v", secondPayload)
	}
	if len(secondPayload.Items) != 1 || secondPayload.Items[0].ID != itemMatchVisit.Id {
		t.Fatalf("expected item-note search match second, got %#v", secondPayload.Items)
	}
	if len(secondPayload.Items[0].Items) != 2 {
		t.Fatalf("expected hydrated visit items in second page payload, got %#v", secondPayload.Items[0].Items)
	}

	foundItemMatch := false
	for _, item := range secondPayload.Items[0].Items {
		if item.ID == itemMatchFoodItem.Id && item.Name == "Chicken Soup" && item.Notes == "rich broth with herbs" {
			foundItemMatch = true
		}
	}
	if !foundItemMatch {
		t.Fatalf("expected paged search result to include hydrated matching food item, got %#v", secondPayload.Items[0].Items)
	}
}

func TestVisitsPageEndpointAppliesScopeVisibilityAndModeration(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureSummaryHandlers)
	user, token := createAuthUser(t, server.app, false, false)
	friend, _ := createAuthUser(t, server.app, false, false)
	pendingFriend, _ := createAuthUser(t, server.app, false, false)

	friend.Set("name", "Visible Friend")
	if err := server.app.Save(friend); err != nil {
		t.Fatalf("failed to update friend name: %v", err)
	}

	createFriendshipRecord(t, server.app, user.Id, friend.Id, "accepted")
	createFriendshipRecord(t, server.app, user.Id, pendingFriend.Id, "pending")

	restaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Scope Cafe",
		"location":   "Portland, OR",
		"visibility": "public",
	})

	ownUnderReviewVisit := createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant":       restaurant.Id,
		"user":             user.Id,
		"visitDate":        "2026-04-05 18:30:00.000Z",
		"visibility":       "private",
		"moderationStatus": "under_review",
	})
	createCollectionRecord(t, server.app, "food_items", map[string]any{
		"visit":  ownUnderReviewVisit.Id,
		"user":   user.Id,
		"name":   "Owner Pasta",
		"rating": 5,
	})

	visibleFriendVisit := createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": restaurant.Id,
		"user":       friend.Id,
		"visitDate":  "2026-04-04 18:30:00.000Z",
		"visibility": "friends",
	})
	createCollectionRecord(t, server.app, "food_items", map[string]any{
		"visit":  visibleFriendVisit.Id,
		"user":   friend.Id,
		"name":   "Friend Soup",
		"rating": 4,
	})

	createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": restaurant.Id,
		"user":       friend.Id,
		"visitDate":  "2026-04-03 18:30:00.000Z",
		"visibility": "private",
	})
	createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant":       restaurant.Id,
		"user":             friend.Id,
		"visitDate":        "2026-04-02 18:30:00.000Z",
		"visibility":       "friends",
		"moderationStatus": "hidden",
	})
	createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": restaurant.Id,
		"user":       pendingFriend.Id,
		"visitDate":  "2026-04-01 18:30:00.000Z",
		"visibility": "friends",
	})

	allResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/visits?page=1&pageSize=10&scope=all",
		token,
		"",
	)
	if allResponse.Code != http.StatusOK {
		t.Fatalf("expected all response 200 OK, got %d: %s", allResponse.Code, allResponse.Body.String())
	}

	var allPayload struct {
		Items []struct {
			ID               string `json:"id"`
			UserName         string `json:"userName"`
			ModerationStatus string `json:"moderationStatus"`
		} `json:"items"`
		TotalItems int `json:"totalItems"`
	}
	if err := json.Unmarshal(allResponse.Body.Bytes(), &allPayload); err != nil {
		t.Fatalf("failed to parse all visits payload: %v; body=%s", err, allResponse.Body.String())
	}

	if allPayload.TotalItems != 2 || len(allPayload.Items) != 2 {
		t.Fatalf("expected only owner and accepted-friend visits in all scope, got %#v", allPayload)
	}
	if allPayload.Items[0].ID != ownUnderReviewVisit.Id || allPayload.Items[0].ModerationStatus != "under_review" {
		t.Fatalf("expected owner under-review visit first, got %#v", allPayload.Items)
	}
	if allPayload.Items[1].ID != visibleFriendVisit.Id || allPayload.Items[1].UserName != "Visible Friend" {
		t.Fatalf("expected visible friend visit second with friend name, got %#v", allPayload.Items)
	}

	mineResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/visits?page=1&pageSize=10&scope=mine",
		token,
		"",
	)
	if mineResponse.Code != http.StatusOK {
		t.Fatalf("expected mine response 200 OK, got %d: %s", mineResponse.Code, mineResponse.Body.String())
	}

	var minePayload struct {
		Items []struct {
			ID string `json:"id"`
		} `json:"items"`
		TotalItems int `json:"totalItems"`
	}
	if err := json.Unmarshal(mineResponse.Body.Bytes(), &minePayload); err != nil {
		t.Fatalf("failed to parse mine visits payload: %v; body=%s", err, mineResponse.Body.String())
	}

	if minePayload.TotalItems != 1 || len(minePayload.Items) != 1 || minePayload.Items[0].ID != ownUnderReviewVisit.Id {
		t.Fatalf("expected only owner visit in mine scope, got %#v", minePayload)
	}

	friendsResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/visits?page=1&pageSize=10&scope=friends",
		token,
		"",
	)
	if friendsResponse.Code != http.StatusOK {
		t.Fatalf("expected friends response 200 OK, got %d: %s", friendsResponse.Code, friendsResponse.Body.String())
	}

	var friendsPayload struct {
		Items []struct {
			ID string `json:"id"`
		} `json:"items"`
		TotalItems int `json:"totalItems"`
	}
	if err := json.Unmarshal(friendsResponse.Body.Bytes(), &friendsPayload); err != nil {
		t.Fatalf("failed to parse friends visits payload: %v; body=%s", err, friendsResponse.Body.String())
	}

	if friendsPayload.TotalItems != 1 || len(friendsPayload.Items) != 1 || friendsPayload.Items[0].ID != visibleFriendVisit.Id {
		t.Fatalf("expected only accepted friend visit in friends scope, got %#v", friendsPayload)
	}
}

func TestRecentRestaurantsEndpoint(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureSummaryHandlers)
	user, token := createAuthUser(t, server.app, false, false)
	friend, _ := createAuthUser(t, server.app, false, false)
	otherOwner, _ := createAuthUser(t, server.app, false, false)

	createFriendshipRecord(t, server.app, user.Id, friend.Id, "accepted")

	restaurantOlder := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":        "Older Restaurant",
		"location":    "Los Angeles, CA",
		"visibility":  "public",
		"createdBy":   user.Id,
		"cuisineType": "American",
	})
	restaurantDeduped := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":          "Deduped Restaurant",
		"location":      "San Diego, CA",
		"visibility":    "public",
		"createdBy":     user.Id,
		"placeId":       "place-deduped",
		"isGooglePlace": true,
	})
	restaurantFriendOnly := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Friend Restaurant",
		"location":   "San Francisco, CA",
		"visibility": "friends",
		"createdBy":  friend.Id,
	})
	restaurantHiddenByVisibility := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Private Restaurant",
		"location":   "Portland, OR",
		"visibility": "private",
		"createdBy":  otherOwner.Id,
	})

	createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": restaurantOlder.Id,
		"user":       user.Id,
		"visitDate":  "2026-04-01 18:30:00.000Z",
		"visibility": "friends",
	})
	createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant":       restaurantDeduped.Id,
		"user":             user.Id,
		"visitDate":        "2026-04-06 18:30:00.000Z",
		"visibility":       "friends",
		"moderationStatus": "hidden",
	})
	createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": restaurantHiddenByVisibility.Id,
		"user":       user.Id,
		"visitDate":  "2026-04-05 18:30:00.000Z",
		"visibility": "friends",
	})
	createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant":       restaurantFriendOnly.Id,
		"user":             user.Id,
		"visitDate":        "2026-04-04 18:30:00.000Z",
		"visibility":       "friends",
		"moderationStatus": "under_review",
	})
	createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": restaurantDeduped.Id,
		"user":       user.Id,
		"visitDate":  "2026-04-03 18:30:00.000Z",
		"visibility": "friends",
	})
	createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": restaurantDeduped.Id,
		"user":       user.Id,
		"visitDate":  "2026-04-02 18:30:00.000Z",
		"visibility": "friends",
	})
	createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": restaurantDeduped.Id,
		"user":       friend.Id,
		"visitDate":  "2026-04-01 18:30:00.000Z",
		"visibility": "friends",
	})
	createCollectionRecord(t, server.app, "menu_review_requests", map[string]any{
		"restaurant":  restaurantDeduped.Id,
		"requestedBy": user.Id,
		"reason":      "Needs a menu review",
		"status":      "pending",
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/restaurants/recent?limit=2",
		token,
		"",
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", response.Code, response.Body.String())
	}

	var payload []struct {
		ID                   string `json:"id"`
		Name                 string `json:"name"`
		Location             string `json:"location"`
		Visibility           string `json:"visibility"`
		CuisineType          string `json:"cuisineType"`
		PlaceID              string `json:"placeId"`
		IsGooglePlace        bool   `json:"isGooglePlace"`
		UserVisitCount       int    `json:"userVisitCount"`
		FriendCount          int    `json:"friendCount"`
		HasPendingMenuReview bool   `json:"hasPendingMenuReview"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to parse response JSON: %v; body=%s", err, response.Body.String())
	}

	if len(payload) != 2 {
		t.Fatalf("expected 2 recent restaurants, got %d: %#v", len(payload), payload)
	}

	if payload[0].ID != restaurantFriendOnly.Id {
		t.Fatalf("expected friend-accessible restaurant first, got %#v", payload)
	}
	if payload[1].ID != restaurantDeduped.Id {
		t.Fatalf("expected deduped restaurant second, got %#v", payload)
	}

	if payload[1].Name != "Deduped Restaurant" ||
		payload[1].Location != "San Diego, CA" ||
		payload[1].Visibility != "public" ||
		payload[1].PlaceID != "place-deduped" ||
		!payload[1].IsGooglePlace {
		t.Fatalf("unexpected restaurant payload: %#v", payload[1])
	}
	if payload[0].UserVisitCount != 1 || payload[0].FriendCount != 0 || payload[0].HasPendingMenuReview {
		t.Fatalf("unexpected metadata for friend restaurant: %#v", payload[0])
	}
	if payload[1].UserVisitCount != 2 || payload[1].FriendCount != 1 || !payload[1].HasPendingMenuReview {
		t.Fatalf("unexpected metadata for deduped restaurant: %#v", payload[1])
	}
}

func TestRestaurantSearchEndpointReturnsInlineSelectionMetadata(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureSummaryHandlers)
	user, token := createAuthUser(t, server.app, false, false)
	friend, _ := createAuthUser(t, server.app, false, false)
	otherOwner, _ := createAuthUser(t, server.app, false, false)

	createFriendshipRecord(t, server.app, user.Id, friend.Id, "accepted")

	restaurantAlpha := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Alpha Tacos",
		"location":   "Los Angeles, CA",
		"visibility": "public",
		"createdBy":  user.Id,
	})
	restaurantBravo := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Bravo Tacos",
		"location":   "San Diego, CA",
		"visibility": "friends",
		"createdBy":  friend.Id,
	})
	createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Hidden Tacos",
		"location":   "Portland, OR",
		"visibility": "private",
		"createdBy":  otherOwner.Id,
	})

	createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": restaurantAlpha.Id,
		"user":       user.Id,
		"visitDate":  "2026-04-06 18:30:00.000Z",
		"visibility": "friends",
	})
	createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": restaurantBravo.Id,
		"user":       user.Id,
		"visitDate":  "2026-04-05 18:30:00.000Z",
		"visibility": "friends",
	})
	createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": restaurantBravo.Id,
		"user":       friend.Id,
		"visitDate":  "2026-04-04 18:30:00.000Z",
		"visibility": "friends",
	})
	createCollectionRecord(t, server.app, "menu_review_requests", map[string]any{
		"restaurant":  restaurantBravo.Id,
		"requestedBy": user.Id,
		"reason":      "Please review",
		"status":      "pending",
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/restaurants/search?search=tacos&page=1&pageSize=5",
		token,
		"",
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", response.Code, response.Body.String())
	}

	var payload struct {
		Items []struct {
			ID                   string `json:"id"`
			Name                 string `json:"name"`
			UserVisitCount       int    `json:"userVisitCount"`
			FriendCount          int    `json:"friendCount"`
			HasPendingMenuReview bool   `json:"hasPendingMenuReview"`
		} `json:"items"`
		Page        int  `json:"page"`
		PageSize    int  `json:"pageSize"`
		TotalItems  int  `json:"totalItems"`
		TotalPages  int  `json:"totalPages"`
		HasNextPage bool `json:"hasNextPage"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to parse search response JSON: %v; body=%s", err, response.Body.String())
	}

	if payload.Page != 1 || payload.PageSize != 5 || payload.TotalItems != 2 || payload.TotalPages != 1 || payload.HasNextPage {
		t.Fatalf("unexpected pagination payload: %#v", payload)
	}
	if len(payload.Items) != 2 {
		t.Fatalf("expected 2 visible search results, got %#v", payload.Items)
	}
	if payload.Items[0].ID != restaurantAlpha.Id || payload.Items[0].Name != "Alpha Tacos" {
		t.Fatalf("expected alpha restaurant first, got %#v", payload.Items)
	}
	if payload.Items[0].UserVisitCount != 1 || payload.Items[0].FriendCount != 0 || payload.Items[0].HasPendingMenuReview {
		t.Fatalf("unexpected alpha metadata: %#v", payload.Items[0])
	}
	if payload.Items[1].ID != restaurantBravo.Id || payload.Items[1].Name != "Bravo Tacos" {
		t.Fatalf("expected bravo restaurant second, got %#v", payload.Items)
	}
	if payload.Items[1].UserVisitCount != 1 || payload.Items[1].FriendCount != 1 || !payload.Items[1].HasPendingMenuReview {
		t.Fatalf("unexpected bravo metadata: %#v", payload.Items[1])
	}
}

func TestRestaurantVisitStatsEndpoint(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureSummaryHandlers)
	user, token := createAuthUser(t, server.app, false, false)
	friendA, _ := createAuthUser(t, server.app, false, false)
	friendB, _ := createAuthUser(t, server.app, false, false)
	pendingFriend, _ := createAuthUser(t, server.app, false, false)

	createFriendshipRecord(t, server.app, user.Id, friendA.Id, "accepted")
	createFriendshipRecord(t, server.app, friendB.Id, user.Id, "accepted")
	createFriendshipRecord(t, server.app, user.Id, pendingFriend.Id, "pending")

	restaurantA := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Stats Restaurant A",
		"location":   "Los Angeles, CA",
		"visibility": "public",
	})
	restaurantB := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Stats Restaurant B",
		"location":   "Los Angeles, CA",
		"visibility": "public",
	})
	restaurantC := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Stats Restaurant C",
		"location":   "Los Angeles, CA",
		"visibility": "public",
	})

	createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": restaurantA.Id,
		"user":       user.Id,
		"visitDate":  "2026-04-01 18:30:00.000Z",
		"visibility": "private",
	})
	createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant":       restaurantA.Id,
		"user":             user.Id,
		"visitDate":        "2026-04-02 18:30:00.000Z",
		"visibility":       "friends",
		"moderationStatus": "under_review",
	})
	createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant":       restaurantA.Id,
		"user":             user.Id,
		"visitDate":        "2026-04-03 18:30:00.000Z",
		"visibility":       "friends",
		"moderationStatus": "hidden",
	})
	createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": restaurantA.Id,
		"user":       friendA.Id,
		"visitDate":  "2026-04-04 18:30:00.000Z",
		"visibility": "friends",
	})
	createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": restaurantA.Id,
		"user":       friendA.Id,
		"visitDate":  "2026-04-05 18:30:00.000Z",
		"visibility": "friends",
	})
	createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": restaurantA.Id,
		"user":       friendB.Id,
		"visitDate":  "2026-04-06 18:30:00.000Z",
		"visibility": "friends",
	})
	createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": restaurantA.Id,
		"user":       pendingFriend.Id,
		"visitDate":  "2026-04-07 18:30:00.000Z",
		"visibility": "friends",
	})
	createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": restaurantB.Id,
		"user":       friendA.Id,
		"visitDate":  "2026-04-08 18:30:00.000Z",
		"visibility": "private",
	})
	createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant":       restaurantB.Id,
		"user":             friendB.Id,
		"visitDate":        "2026-04-09 18:30:00.000Z",
		"visibility":       "friends",
		"moderationStatus": "under_review",
	})
	createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": restaurantB.Id,
		"user":       friendA.Id,
		"visitDate":  "2026-04-10 18:30:00.000Z",
		"visibility": "friends",
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/restaurants/visit-stats",
		token,
		`{"restaurantIds":["","`+restaurantB.Id+`","`+restaurantA.Id+`","`+restaurantA.Id+`","`+restaurantC.Id+`"]}`,
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", response.Code, response.Body.String())
	}

	var payload struct {
		Stats []struct {
			RestaurantID   string `json:"restaurantId"`
			UserVisitCount int    `json:"userVisitCount"`
			FriendCount    int    `json:"friendCount"`
		} `json:"stats"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to parse response JSON: %v; body=%s", err, response.Body.String())
	}

	if len(payload.Stats) != 3 {
		t.Fatalf("expected 3 stats rows, got %d: %#v", len(payload.Stats), payload.Stats)
	}

	statsByRestaurantID := make(map[string]struct {
		userVisitCount int
		friendCount    int
	}, len(payload.Stats))
	for _, stat := range payload.Stats {
		statsByRestaurantID[stat.RestaurantID] = struct {
			userVisitCount int
			friendCount    int
		}{
			userVisitCount: stat.UserVisitCount,
			friendCount:    stat.FriendCount,
		}
	}

	if stat := statsByRestaurantID[restaurantA.Id]; stat.userVisitCount != 2 || stat.friendCount != 2 {
		t.Fatalf("unexpected stats for restaurant A: %#v", stat)
	}
	if stat := statsByRestaurantID[restaurantB.Id]; stat.userVisitCount != 0 || stat.friendCount != 1 {
		t.Fatalf("unexpected stats for restaurant B: %#v", stat)
	}
	if stat := statsByRestaurantID[restaurantC.Id]; stat.userVisitCount != 0 || stat.friendCount != 0 {
		t.Fatalf("unexpected stats for restaurant C: %#v", stat)
	}
}

func TestHomeFeedEndpointReturnsMixedEntriesAndPhotoPreviews(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureSummaryHandlers)
	user, token := createAuthUser(t, server.app, false, false)
	friend, _ := createAuthUser(t, server.app, false, false)
	stranger, _ := createAuthUser(t, server.app, false, false)

	user.Set("name", "Owner User")
	friend.Set("name", "Friend User")
	stranger.Set("name", "Stranger User")
	if err := server.app.Save(user); err != nil {
		t.Fatalf("failed to update user name: %v", err)
	}
	if err := server.app.Save(friend); err != nil {
		t.Fatalf("failed to update friend name: %v", err)
	}
	if err := server.app.Save(stranger); err != nil {
		t.Fatalf("failed to update stranger name: %v", err)
	}

	createFriendshipRecord(t, server.app, user.Id, friend.Id, "accepted")

	visitRestaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Ramen House",
		"location":   "San Francisco, CA",
		"visibility": "public",
	})
	quickTrackRestaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Night Market",
		"location":   "Oakland, CA",
		"visibility": "public",
	})

	friendVisit := createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": restaurantIDOrFail(visitRestaurant),
		"user":       friend.Id,
		"visitDate":  "2026-04-03 18:30:00.000Z",
		"visibility": "friends",
	})
	setCollectionRecordCreatedAt(t, server.app, "visits", friendVisit.Id, "2026-04-03 20:00:00.000Z")
	friendVisitItem := createCollectionRecord(t, server.app, "food_items", map[string]any{
		"visit":  friendVisit.Id,
		"user":   friend.Id,
		"name":   "Spicy Ramen",
		"rating": 5,
		"notes":  "Great broth",
	})
	insertVisitPhotoRowRaw(t, server.app, friend.Id, friendVisit.Id, friendVisitItem.Id)

	friendQuickTrack := createCollectionRecord(t, server.app, "food_items", map[string]any{
		"user":          friend.Id,
		"name":          "Sesame Donut",
		"rating":        4,
		"notes":         "Late snack",
		"location_text": quickTrackRestaurant.GetString("name"),
		"itemType":      "food-product",
		"visibility":    "friends",
		"itemDate":      "2026-04-02 19:15:00.000Z",
	})
	setCollectionRecordCreatedAt(t, server.app, "food_items", friendQuickTrack.Id, "2026-04-02 20:00:00.000Z")
	insertVisitPhotoRowRaw(t, server.app, friend.Id, "", friendQuickTrack.Id)

	ownerVisit := createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant":       restaurantIDOrFail(visitRestaurant),
		"user":             user.Id,
		"visitDate":        "2026-04-01 09:00:00.000Z",
		"visibility":       "private",
		"moderationStatus": "under_review",
	})
	setCollectionRecordCreatedAt(t, server.app, "visits", ownerVisit.Id, "2026-04-01 20:00:00.000Z")
	createCollectionRecord(t, server.app, "food_items", map[string]any{
		"visit":  ownerVisit.Id,
		"user":   user.Id,
		"name":   "Breakfast Noodles",
		"rating": 4,
		"notes":  "Owner only entry",
	})

	createCollectionRecord(t, server.app, "food_items", map[string]any{
		"user":             friend.Id,
		"name":             "Hidden Food Product",
		"rating":           1,
		"isQuickTrack":     true,
		"visibility":       "friends",
		"itemDate":         "2026-04-04 08:00:00.000Z",
		"moderationStatus": "hidden",
	})
	createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": restaurantIDOrFail(visitRestaurant),
		"user":       stranger.Id,
		"visitDate":  "2026-04-05 08:00:00.000Z",
		"visibility": "friends",
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/home-feed?page=1&pageSize=3&scope=all",
		token,
		"",
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", response.Code, response.Body.String())
	}

	var payload struct {
		Items []struct {
			Source  string `json:"source"`
			EventAt string `json:"eventAt"`
			Visit   *struct {
				ID               string `json:"id"`
				RestaurantName   string `json:"restaurantName"`
				UserName         string `json:"userName"`
				ModerationStatus string `json:"moderationStatus"`
				Items            []struct {
					ID    string `json:"id"`
					Name  string `json:"name"`
					Notes string `json:"notes"`
				} `json:"items"`
			} `json:"visit"`
			FoodProduct *struct {
				ID             string `json:"id"`
				RestaurantName string `json:"restaurantName"`
				ItemName       string `json:"itemName"`
				UserName       string `json:"userName"`
			} `json:"foodProduct"`
		} `json:"items"`
		PhotoPreviews []struct {
			ID         string `json:"id"`
			FoodItemID string `json:"food_item"`
			Photo      string `json:"photo"`
		} `json:"photoPreviews"`
		HasNextPage       bool `json:"hasNextPage"`
		TotalVisits       int  `json:"totalVisits"`
		TotalFoodProducts int  `json:"totalFoodProducts"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to parse response JSON: %v; body=%s", err, response.Body.String())
	}

	if payload.HasNextPage {
		t.Fatalf("expected no next page, got %#v", payload)
	}
	if payload.TotalVisits != 2 || payload.TotalFoodProducts != 1 {
		t.Fatalf("unexpected totals: %#v", payload)
	}
	if len(payload.Items) != 3 {
		t.Fatalf("expected 3 feed entries, got %d: %#v", len(payload.Items), payload.Items)
	}

	if payload.Items[0].Source != "visit" || payload.Items[0].Visit == nil || payload.Items[0].Visit.ID != friendVisit.Id {
		t.Fatalf("expected first entry to be the friend visit, got %#v", payload.Items[0])
	}
	if payload.Items[1].Source != "food-product" || payload.Items[1].FoodProduct == nil || payload.Items[1].FoodProduct.ID != friendQuickTrack.Id {
		t.Fatalf("expected second entry to be the friend food product, got %#v", payload.Items[1])
	}
	if payload.Items[2].Source != "visit" || payload.Items[2].Visit == nil || payload.Items[2].Visit.ID != ownerVisit.Id {
		t.Fatalf("expected third entry to be the owner visit, got %#v", payload.Items[2])
	}

	if payload.Items[0].Visit.UserName != "Friend User" {
		t.Fatalf("expected friend visit user name, got %#v", payload.Items[0].Visit)
	}
	if payload.Items[0].Visit.Items[0].ID != friendVisitItem.Id || payload.Items[0].Visit.Items[0].Notes != "Great broth" {
		t.Fatalf("expected visit item details, got %#v", payload.Items[0].Visit.Items)
	}
	if payload.Items[1].FoodProduct.RestaurantName != "Night Market" || payload.Items[1].FoodProduct.UserName != "Friend User" {
		t.Fatalf("expected food product restaurant and user, got %#v", payload.Items[1].FoodProduct)
	}
	if payload.Items[2].Visit.ModerationStatus != "under_review" {
		t.Fatalf("expected owner under_review visit to remain visible, got %#v", payload.Items[2].Visit)
	}

	if len(payload.PhotoPreviews) != 2 {
		t.Fatalf("expected 2 photo previews, got %d: %#v", len(payload.PhotoPreviews), payload.PhotoPreviews)
	}

	photoByFoodItemID := map[string]string{}
	for _, preview := range payload.PhotoPreviews {
		photoByFoodItemID[preview.FoodItemID] = preview.Photo
	}
	if photoByFoodItemID[friendVisitItem.Id] != "test-photo.jpg" {
		t.Fatalf("expected visit photo preview, got %#v", photoByFoodItemID)
	}
	if photoByFoodItemID[friendQuickTrack.Id] != "test-photo.jpg" {
		t.Fatalf("expected food product photo preview, got %#v", photoByFoodItemID)
	}

	searchResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/home-feed?page=1&pageSize=20&scope=all&search=broth",
		token,
		"",
	)
	if searchResponse.Code != http.StatusOK {
		t.Fatalf("expected search response 200 OK, got %d: %s", searchResponse.Code, searchResponse.Body.String())
	}

	var searchPayload struct {
		Items []struct {
			Source string `json:"source"`
			Visit  *struct {
				ID string `json:"id"`
			} `json:"visit"`
		} `json:"items"`
		TotalVisits       int `json:"totalVisits"`
		TotalFoodProducts int `json:"totalFoodProducts"`
	}
	if err := json.Unmarshal(searchResponse.Body.Bytes(), &searchPayload); err != nil {
		t.Fatalf("failed to parse search response JSON: %v; body=%s", err, searchResponse.Body.String())
	}

	if len(searchPayload.Items) != 1 || searchPayload.Items[0].Source != "visit" || searchPayload.Items[0].Visit == nil || searchPayload.Items[0].Visit.ID != friendVisit.Id {
		t.Fatalf("expected search to match only the friend visit item notes, got %#v", searchPayload.Items)
	}
	if searchPayload.TotalVisits != 1 || searchPayload.TotalFoodProducts != 0 {
		t.Fatalf("unexpected search totals: %#v", searchPayload)
	}
}

func TestHomeFeedEndpointOmitsTotalsBeyondFirstPage(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureSummaryHandlers)
	user, token := createAuthUser(t, server.app, false, false)

	restaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Paged Feed Cafe",
		"location":   "Seattle, WA",
		"visibility": "public",
	})

	firstVisit := createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": restaurant.Id,
		"user":       user.Id,
		"visitDate":  "2026-04-03 10:00:00.000Z",
		"visibility": "private",
	})
	setCollectionRecordCreatedAt(t, server.app, "visits", firstVisit.Id, "2026-04-01 08:00:00.000Z")
	createCollectionRecord(t, server.app, "food_items", map[string]any{
		"visit":  firstVisit.Id,
		"user":   user.Id,
		"name":   "First Dish",
		"rating": 4,
	})

	secondVisit := createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": restaurant.Id,
		"user":       user.Id,
		"visitDate":  "2026-04-02 10:00:00.000Z",
		"visibility": "private",
	})
	setCollectionRecordCreatedAt(t, server.app, "visits", secondVisit.Id, "2026-04-02 08:00:00.000Z")
	createCollectionRecord(t, server.app, "food_items", map[string]any{
		"visit":  secondVisit.Id,
		"user":   user.Id,
		"name":   "Second Dish",
		"rating": 5,
	})

	quickTrack := createCollectionRecord(t, server.app, "food_items", map[string]any{
		"user":          user.Id,
		"name":          "Late Snack",
		"rating":        3,
		"itemType":      "food-product",
		"location_text": "Paged Feed Cafe",
		"visibility":    "private",
		"itemDate":      "2026-04-01 10:00:00.000Z",
	})
	setCollectionRecordCreatedAt(t, server.app, "food_items", quickTrack.Id, "2026-04-03 08:00:00.000Z")

	secondPageResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/home-feed?page=2&pageSize=1&scope=mine",
		token,
		"",
	)
	if secondPageResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", secondPageResponse.Code, secondPageResponse.Body.String())
	}

	var payload struct {
		Items []struct {
			Source string `json:"source"`
			Visit  *struct {
				ID string `json:"id"`
			} `json:"visit"`
			FoodProduct *struct {
				ID string `json:"id"`
			} `json:"foodProduct"`
		} `json:"items"`
		Cursor *struct {
			Page int `json:"page"`
		} `json:"cursor"`
		HasNextPage       bool `json:"hasNextPage"`
		TotalVisits       *int `json:"totalVisits"`
		TotalFoodProducts *int `json:"totalFoodProducts"`
	}
	if err := json.Unmarshal(secondPageResponse.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to decode second home feed payload: %v", err)
	}

	if !payload.HasNextPage || payload.Cursor == nil || payload.Cursor.Page != 3 {
		t.Fatalf("expected second page to continue paginating, got %#v", payload)
	}
	if payload.TotalVisits != nil || payload.TotalFoodProducts != nil {
		t.Fatalf("expected later home feed page to omit totals, got %#v", payload)
	}
	if len(payload.Items) != 1 {
		t.Fatalf("expected one entry on second page, got %#v", payload.Items)
	}

	entry := payload.Items[0]
	if (entry.Visit == nil || entry.Visit.ID != secondVisit.Id) && (entry.FoodProduct == nil || entry.FoodProduct.ID != quickTrack.Id) {
		t.Fatalf("expected a real feed entry on second page, got %#v", entry)
	}
}

func TestHomeFeedDefaultsToCreatedOrderingForMineAndFriends(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureSummaryHandlers)
	user, token := createAuthUser(t, server.app, false, false)
	friend, _ := createAuthUser(t, server.app, false, false)

	createFriendshipRecord(t, server.app, user.Id, friend.Id, "accepted")

	restaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Ordering Cafe",
		"location":   "Los Angeles, CA",
		"visibility": "public",
	})

	ownerQuickTrack := createCollectionRecord(t, server.app, "food_items", map[string]any{
		"user":         user.Id,
		"name":         "Older Created Food Product",
		"rating":       4,
		"isQuickTrack": true,
		"visibility":   "private",
		"itemDate":     "2026-05-20 08:00:00.000Z",
	})
	setCollectionRecordCreatedAt(t, server.app, "food_items", ownerQuickTrack.Id, "2026-04-01 08:00:00.000Z")

	ownerVisit := createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": restaurantIDOrFail(restaurant),
		"user":       user.Id,
		"visitDate":  "2026-03-01 09:00:00.000Z",
		"visibility": "private",
	})
	setCollectionRecordCreatedAt(t, server.app, "visits", ownerVisit.Id, "2026-04-02 08:00:00.000Z")
	createCollectionRecord(t, server.app, "food_items", map[string]any{
		"visit":  ownerVisit.Id,
		"user":   user.Id,
		"name":   "Newer Created Visit",
		"rating": 5,
	})

	friendQuickTrack := createCollectionRecord(t, server.app, "food_items", map[string]any{
		"user":         friend.Id,
		"name":         "Older Created Friend Food Product",
		"rating":       3,
		"isQuickTrack": true,
		"visibility":   "friends",
		"itemDate":     "2026-05-20 10:00:00.000Z",
	})
	setCollectionRecordCreatedAt(t, server.app, "food_items", friendQuickTrack.Id, "2026-04-03 08:00:00.000Z")

	friendVisit := createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": restaurantIDOrFail(restaurant),
		"user":       friend.Id,
		"visitDate":  "2026-03-05 09:00:00.000Z",
		"visibility": "friends",
	})
	setCollectionRecordCreatedAt(t, server.app, "visits", friendVisit.Id, "2026-04-04 08:00:00.000Z")
	createCollectionRecord(t, server.app, "food_items", map[string]any{
		"visit":  friendVisit.Id,
		"user":   friend.Id,
		"name":   "Newer Created Friend Visit",
		"rating": 4,
	})

	mineResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/home-feed?page=1&pageSize=10&scope=mine",
		token,
		"",
	)
	if mineResponse.Code != http.StatusOK {
		t.Fatalf("expected mine response 200 OK, got %d: %s", mineResponse.Code, mineResponse.Body.String())
	}

	var minePayload struct {
		Items []struct {
			Source  string `json:"source"`
			EventAt string `json:"eventAt"`
			Visit   *struct {
				ID        string `json:"id"`
				VisitedAt string `json:"visitedAt"`
				CreatedAt string `json:"createdAt"`
			} `json:"visit"`
			FoodProduct *struct {
				ID        string `json:"id"`
				ItemDate  string `json:"itemDate"`
				CreatedAt string `json:"createdAt"`
			} `json:"foodProduct"`
		} `json:"items"`
	}
	if err := json.Unmarshal(mineResponse.Body.Bytes(), &minePayload); err != nil {
		t.Fatalf("failed to parse mine response JSON: %v; body=%s", err, mineResponse.Body.String())
	}

	if len(minePayload.Items) != 2 {
		t.Fatalf("expected 2 mine feed entries, got %d: %#v", len(minePayload.Items), minePayload.Items)
	}
	if minePayload.Items[0].Source != "visit" || minePayload.Items[0].Visit == nil || minePayload.Items[0].Visit.ID != ownerVisit.Id {
		t.Fatalf("expected newer-created owner visit first in mine feed, got %#v", minePayload.Items[0])
	}
	if minePayload.Items[0].EventAt != "2026-04-02 08:00:00.000Z" {
		t.Fatalf("expected mine visit eventAt to match createdAt by default, got %#v", minePayload.Items[0])
	}
	if minePayload.Items[0].Visit.VisitedAt != "2026-03-01 09:00:00.000Z" {
		t.Fatalf("expected mine visit tracked date to remain unchanged, got %#v", minePayload.Items[0].Visit)
	}
	if minePayload.Items[0].Visit.CreatedAt != "2026-04-02 08:00:00.000Z" {
		t.Fatalf("expected mine visit createdAt in response, got %#v", minePayload.Items[0].Visit)
	}
	if minePayload.Items[1].Source != "food-product" || minePayload.Items[1].FoodProduct == nil || minePayload.Items[1].FoodProduct.ID != ownerQuickTrack.Id {
		t.Fatalf("expected older-created owner food product second in mine feed, got %#v", minePayload.Items[1])
	}
	if minePayload.Items[1].EventAt != "2026-04-01 08:00:00.000Z" {
		t.Fatalf("expected mine food product eventAt to match createdAt by default, got %#v", minePayload.Items[1])
	}
	if minePayload.Items[1].FoodProduct.ItemDate != "2026-05-20 08:00:00.000Z" {
		t.Fatalf("expected mine food product tracked date to remain unchanged, got %#v", minePayload.Items[1].FoodProduct)
	}
	if minePayload.Items[1].FoodProduct.CreatedAt != "2026-04-01 08:00:00.000Z" {
		t.Fatalf("expected mine food product createdAt in response, got %#v", minePayload.Items[1].FoodProduct)
	}

	friendsResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/home-feed?page=1&pageSize=10&scope=friends",
		token,
		"",
	)
	if friendsResponse.Code != http.StatusOK {
		t.Fatalf("expected friends response 200 OK, got %d: %s", friendsResponse.Code, friendsResponse.Body.String())
	}

	var friendsPayload struct {
		Items []struct {
			Source  string `json:"source"`
			EventAt string `json:"eventAt"`
			Visit   *struct {
				VisitedAt string `json:"visitedAt"`
				ID        string `json:"id"`
				CreatedAt string `json:"createdAt"`
			} `json:"visit"`
			FoodProduct *struct {
				ItemDate  string `json:"itemDate"`
				ID        string `json:"id"`
				CreatedAt string `json:"createdAt"`
			} `json:"foodProduct"`
		} `json:"items"`
	}
	if err := json.Unmarshal(friendsResponse.Body.Bytes(), &friendsPayload); err != nil {
		t.Fatalf("failed to parse friends response JSON: %v; body=%s", err, friendsResponse.Body.String())
	}

	if len(friendsPayload.Items) != 2 {
		t.Fatalf("expected 2 friends feed entries, got %d: %#v", len(friendsPayload.Items), friendsPayload.Items)
	}
	if friendsPayload.Items[0].Source != "visit" || friendsPayload.Items[0].Visit == nil || friendsPayload.Items[0].Visit.ID != friendVisit.Id {
		t.Fatalf("expected newer-created friend visit first in friends feed, got %#v", friendsPayload.Items[0])
	}
	if friendsPayload.Items[0].EventAt != "2026-04" {
		t.Fatalf("expected friends default eventAt to be the created month, got %#v", friendsPayload.Items[0])
	}
	if friendsPayload.Items[0].Visit.VisitedAt != "2026-03" {
		t.Fatalf("expected friends visit tracked date to remain redacted separately, got %#v", friendsPayload.Items[0].Visit)
	}
	if friendsPayload.Items[0].Visit.CreatedAt != "2026-04" {
		t.Fatalf("expected friends visit createdAt to be redacted to month precision, got %#v", friendsPayload.Items[0].Visit)
	}
	if friendsPayload.Items[1].Source != "food-product" || friendsPayload.Items[1].FoodProduct == nil || friendsPayload.Items[1].FoodProduct.ID != friendQuickTrack.Id {
		t.Fatalf("expected older-created friend food product second in friends feed, got %#v", friendsPayload.Items[1])
	}
	if friendsPayload.Items[1].EventAt != "2026-04" {
		t.Fatalf("expected friends default food product eventAt to be the created month, got %#v", friendsPayload.Items[1])
	}
	if friendsPayload.Items[1].FoodProduct.ItemDate != "2026-05" {
		t.Fatalf("expected friends food product tracked date to remain redacted separately, got %#v", friendsPayload.Items[1].FoodProduct)
	}
	if friendsPayload.Items[1].FoodProduct.CreatedAt != "2026-04" {
		t.Fatalf("expected friends food product createdAt to be redacted to month precision, got %#v", friendsPayload.Items[1].FoodProduct)
	}
}

func TestHomeFeedExplicitSortOverridesScopeDefaults(t *testing.T) {
	server := newPreparedServer(t, handlers.RegisterFeatureSummaryHandlers)
	user, token := createAuthUser(t, server.app, false, false)
	friend, _ := createAuthUser(t, server.app, false, false)

	createFriendshipRecord(t, server.app, user.Id, friend.Id, "accepted")

	restaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Explicit Sort Cafe",
		"location":   "Los Angeles, CA",
		"visibility": "public",
	})

	ownerQuickTrack := createCollectionRecord(t, server.app, "food_items", map[string]any{
		"user":         user.Id,
		"name":         "Owner Food Product",
		"rating":       4,
		"isQuickTrack": true,
		"visibility":   "private",
		"itemDate":     "2026-05-20 08:00:00.000Z",
	})
	setCollectionRecordCreatedAt(t, server.app, "food_items", ownerQuickTrack.Id, "2026-04-01 08:00:00.000Z")

	ownerVisit := createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": restaurantIDOrFail(restaurant),
		"user":       user.Id,
		"visitDate":  "2026-03-01 09:00:00.000Z",
		"visibility": "private",
	})
	setCollectionRecordCreatedAt(t, server.app, "visits", ownerVisit.Id, "2026-04-02 08:00:00.000Z")
	createCollectionRecord(t, server.app, "food_items", map[string]any{
		"visit":  ownerVisit.Id,
		"user":   user.Id,
		"name":   "Owner Visit Item",
		"rating": 5,
	})
	ownerFallbackQuickTrack := createCollectionRecord(t, server.app, "food_items", map[string]any{
		"user":         user.Id,
		"name":         "Owner Fallback Food Product",
		"rating":       2,
		"isQuickTrack": true,
		"visibility":   "private",
	})
	setCollectionRecordCreatedAt(t, server.app, "food_items", ownerFallbackQuickTrack.Id, "2026-06-01 07:00:00.000Z")

	friendQuickTrack := createCollectionRecord(t, server.app, "food_items", map[string]any{
		"user":         friend.Id,
		"name":         "Friend Food Product",
		"rating":       3,
		"isQuickTrack": true,
		"visibility":   "friends",
		"itemDate":     "2026-05-20 10:00:00.000Z",
	})
	setCollectionRecordCreatedAt(t, server.app, "food_items", friendQuickTrack.Id, "2026-04-03 08:00:00.000Z")

	friendVisit := createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": restaurantIDOrFail(restaurant),
		"user":       friend.Id,
		"visitDate":  "2026-03-05 09:00:00.000Z",
		"visibility": "friends",
	})
	setCollectionRecordCreatedAt(t, server.app, "visits", friendVisit.Id, "2026-04-04 08:00:00.000Z")
	createCollectionRecord(t, server.app, "food_items", map[string]any{
		"visit":  friendVisit.Id,
		"user":   friend.Id,
		"name":   "Friend Visit Item",
		"rating": 4,
	})
	friendFallbackQuickTrack := createCollectionRecord(t, server.app, "food_items", map[string]any{
		"user":         friend.Id,
		"name":         "Friend Fallback Food Product",
		"rating":       2,
		"isQuickTrack": true,
		"visibility":   "friends",
	})
	setCollectionRecordCreatedAt(t, server.app, "food_items", friendFallbackQuickTrack.Id, "2026-06-02 09:00:00.000Z")

	mineTrackedResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/home-feed?page=1&pageSize=10&scope=mine&sort=tracked",
		token,
		"",
	)
	if mineTrackedResponse.Code != http.StatusOK {
		t.Fatalf("expected mine tracked response 200 OK, got %d: %s", mineTrackedResponse.Code, mineTrackedResponse.Body.String())
	}

	var mineTrackedPayload struct {
		Items []struct {
			Source  string `json:"source"`
			EventAt string `json:"eventAt"`
			Visit   *struct {
				ID        string `json:"id"`
				VisitedAt string `json:"visitedAt"`
			} `json:"visit"`
			FoodProduct *struct {
				ID        string `json:"id"`
				ItemDate  string `json:"itemDate"`
				CreatedAt string `json:"createdAt"`
			} `json:"foodProduct"`
		} `json:"items"`
	}
	if err := json.Unmarshal(mineTrackedResponse.Body.Bytes(), &mineTrackedPayload); err != nil {
		t.Fatalf("failed to parse mine tracked response JSON: %v; body=%s", err, mineTrackedResponse.Body.String())
	}

	if len(mineTrackedPayload.Items) != 3 {
		t.Fatalf("expected 3 mine tracked feed entries, got %d: %#v", len(mineTrackedPayload.Items), mineTrackedPayload.Items)
	}
	if mineTrackedPayload.Items[0].Source != "food-product" || mineTrackedPayload.Items[0].FoodProduct == nil || mineTrackedPayload.Items[0].FoodProduct.ID != ownerFallbackQuickTrack.Id {
		t.Fatalf("expected tracked sort to fall back to createdAt for owner fallback food product, got %#v", mineTrackedPayload.Items[0])
	}
	if mineTrackedPayload.Items[0].EventAt != "2026-06-01 07:00:00.000Z" || mineTrackedPayload.Items[0].FoodProduct.ItemDate != "" || mineTrackedPayload.Items[0].FoodProduct.CreatedAt != "2026-06-01 07:00:00.000Z" {
		t.Fatalf("expected owner fallback food product eventAt to use createdAt, got %#v", mineTrackedPayload.Items[0])
	}
	if mineTrackedPayload.Items[1].Source != "food-product" || mineTrackedPayload.Items[1].FoodProduct == nil || mineTrackedPayload.Items[1].FoodProduct.ID != ownerQuickTrack.Id {
		t.Fatalf("expected tracked sort to put owner food product second, got %#v", mineTrackedPayload.Items[1])
	}
	if mineTrackedPayload.Items[1].EventAt != "2026-05-20 08:00:00.000Z" || mineTrackedPayload.Items[1].FoodProduct.ItemDate != "2026-05-20 08:00:00.000Z" {
		t.Fatalf("expected owner food product eventAt to use itemDate when tracked sorting, got %#v", mineTrackedPayload.Items[1])
	}
	if mineTrackedPayload.Items[2].Source != "visit" || mineTrackedPayload.Items[2].Visit == nil || mineTrackedPayload.Items[2].Visit.ID != ownerVisit.Id {
		t.Fatalf("expected tracked sort to put owner visit third, got %#v", mineTrackedPayload.Items[2])
	}
	if mineTrackedPayload.Items[2].EventAt != "2026-03-01 09:00:00.000Z" || mineTrackedPayload.Items[2].Visit.VisitedAt != "2026-03-01 09:00:00.000Z" {
		t.Fatalf("expected owner visit eventAt to use visitDate when tracked sorting, got %#v", mineTrackedPayload.Items[2])
	}

	friendsCreatedResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/home-feed?page=1&pageSize=10&scope=friends&sort=tracked",
		token,
		"",
	)
	if friendsCreatedResponse.Code != http.StatusOK {
		t.Fatalf("expected friends tracked response 200 OK, got %d: %s", friendsCreatedResponse.Code, friendsCreatedResponse.Body.String())
	}

	var friendsCreatedPayload struct {
		Items []struct {
			Source  string `json:"source"`
			EventAt string `json:"eventAt"`
			Visit   *struct {
				ID        string `json:"id"`
				VisitedAt string `json:"visitedAt"`
				CreatedAt string `json:"createdAt"`
			} `json:"visit"`
			FoodProduct *struct {
				ID       string `json:"id"`
				ItemDate string `json:"itemDate"`
			} `json:"foodProduct"`
		} `json:"items"`
	}
	if err := json.Unmarshal(friendsCreatedResponse.Body.Bytes(), &friendsCreatedPayload); err != nil {
		t.Fatalf("failed to parse friends tracked response JSON: %v; body=%s", err, friendsCreatedResponse.Body.String())
	}

	if len(friendsCreatedPayload.Items) != 3 {
		t.Fatalf("expected 3 friends tracked feed entries, got %d: %#v", len(friendsCreatedPayload.Items), friendsCreatedPayload.Items)
	}
	if friendsCreatedPayload.Items[0].Source != "food-product" || friendsCreatedPayload.Items[0].FoodProduct == nil || friendsCreatedPayload.Items[0].FoodProduct.ID != friendFallbackQuickTrack.Id {
		t.Fatalf("expected tracked sort to fall back to createdAt for friend fallback food product, got %#v", friendsCreatedPayload.Items[0])
	}
	if friendsCreatedPayload.Items[0].EventAt != "2026-06" || friendsCreatedPayload.Items[0].FoodProduct.ItemDate != "" {
		t.Fatalf("expected friend fallback food product eventAt to use created month, got %#v", friendsCreatedPayload.Items[0])
	}
	if friendsCreatedPayload.Items[1].Source != "food-product" || friendsCreatedPayload.Items[1].FoodProduct == nil || friendsCreatedPayload.Items[1].FoodProduct.ID != friendQuickTrack.Id {
		t.Fatalf("expected tracked sort to put friend food product second, got %#v", friendsCreatedPayload.Items[1])
	}
	if friendsCreatedPayload.Items[1].EventAt != "2026-05" || friendsCreatedPayload.Items[1].FoodProduct.ItemDate != "2026-05" {
		t.Fatalf("expected friend food product eventAt to use tracked month, got %#v", friendsCreatedPayload.Items[1])
	}
	if friendsCreatedPayload.Items[2].Source != "visit" || friendsCreatedPayload.Items[2].Visit == nil || friendsCreatedPayload.Items[2].Visit.ID != friendVisit.Id {
		t.Fatalf("expected tracked sort to put friend visit third, got %#v", friendsCreatedPayload.Items[2])
	}
	if friendsCreatedPayload.Items[2].EventAt != "2026-03" || friendsCreatedPayload.Items[2].Visit.VisitedAt != "2026-03" || friendsCreatedPayload.Items[2].Visit.CreatedAt != "2026-04" {
		t.Fatalf("expected friend visit eventAt to use tracked month while preserving created redaction, got %#v", friendsCreatedPayload.Items[2])
	}
}

func createNoteRecord(t *testing.T, app core.App, userID string, status string) *core.Record {
	t.Helper()

	collection, err := app.FindCollectionByNameOrId("notes")
	if err != nil {
		t.Fatalf("failed to resolve notes collection: %v", err)
	}

	record := core.NewRecord(collection)
	record.Set("content", "Integration test note")
	record.Set("status", status)
	record.Set("user", userID)

	if err := app.Save(record); err != nil {
		t.Fatalf("failed to create note: %v", err)
	}

	return record
}

func insertNotePhotoRowRaw(
	t *testing.T,
	app core.App,
	userID string,
	noteID string,
	photoName string,
	createdAt string,
) string {
	t.Helper()

	recordID := fmt.Sprintf("np_%d", time.Now().UnixNano())
	resolvedCreatedAt := strings.TrimSpace(createdAt)
	if resolvedCreatedAt == "" {
		resolvedCreatedAt = time.Now().UTC().Format(time.RFC3339Nano)
	}

	if _, err := app.DB().NewQuery(`
		INSERT INTO note_photos (id, photo, caption, note, user, created, updated)
		VALUES ({:id}, {:photo}, '', {:note}, {:user}, {:created}, {:updated})
	`).
		Bind(dbx.Params{
			"id":      recordID,
			"photo":   photoName,
			"note":    noteID,
			"user":    userID,
			"created": resolvedCreatedAt,
			"updated": resolvedCreatedAt,
		}).
		Execute(); err != nil {
		t.Fatalf("failed to insert note_photo row: %v", err)
	}

	return recordID
}

func createFriendshipRecord(t *testing.T, app core.App, userID string, friendID string, status string) {
	t.Helper()

	collection, err := app.FindCollectionByNameOrId("friendships")
	if err != nil {
		t.Fatalf("failed to resolve friendships collection: %v", err)
	}

	record := core.NewRecord(collection)
	record.Set("user", userID)
	record.Set("friend", friendID)
	record.Set("status", status)

	if err := app.Save(record); err != nil {
		t.Fatalf("failed to create friendship: %v", err)
	}
}

func createFeedbackRecord(t *testing.T, app core.App, userID string, status string) {
	t.Helper()

	collection, err := app.FindCollectionByNameOrId("feedback")
	if err != nil {
		t.Fatalf("failed to resolve feedback collection: %v", err)
	}

	record := core.NewRecord(collection)
	record.Set("user", userID)
	record.Set("title", "Integration test feedback")
	record.Set("description", "Integration test feedback description")
	record.Set("status", status)

	if err := app.Save(record); err != nil {
		t.Fatalf("failed to create feedback: %v", err)
	}
}

func assertFloatEquals(t *testing.T, value any, expected float64) {
	t.Helper()

	actual, ok := value.(float64)
	if !ok {
		t.Fatalf("expected numeric JSON value, got %T (%v)", value, value)
	}

	if actual != expected {
		t.Fatalf("expected %.0f, got %.0f", expected, actual)
	}
}

func restaurantIDOrFail(record *core.Record) string {
	if record == nil {
		return ""
	}

	return record.Id
}
