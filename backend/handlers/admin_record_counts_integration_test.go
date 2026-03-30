package handlers_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/pocketbase/pocketbase/core"

	"myapp/handlers"
)

type adminRecordCountsResponse struct {
	Description      string                         `json:"description"`
	Label            string                         `json:"label"`
	RecordType       string                         `json:"recordType"`
	Rows             []adminRecordCountsResponseRow `json:"rows"`
	TotalRecords     int                            `json:"totalRecords"`
	UsersWithRecords int                            `json:"usersWithRecords"`
}

type adminRecordCountsResponseRow struct {
	LatestRecordAt string                        `json:"latestRecordAt"`
	RecordCount    int                           `json:"recordCount"`
	User           adminRecordCountsResponseUser `json:"user"`
	UserID         string                        `json:"userId"`
}

type adminRecordCountsResponseUser struct {
	Email string `json:"email"`
	ID    string `json:"id"`
	Name  string `json:"name"`
}

func loadAdminRecordCountsResponse(
	t *testing.T,
	server *preparedServer,
	adminToken string,
	recordType string,
) adminRecordCountsResponse {
	t.Helper()

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/admin/record-counts?recordType="+recordType,
		adminToken,
		"",
	)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	payload := adminRecordCountsResponse{}
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to decode record counts response: %v", err)
	}

	return payload
}

func findAdminRecordCountsRow(
	rows []adminRecordCountsResponseRow,
	userID string,
) (adminRecordCountsResponseRow, bool) {
	for _, row := range rows {
		if row.UserID == userID {
			return row, true
		}
	}

	return adminRecordCountsResponseRow{}, false
}

func TestAdminRecordCountsSummarizesQuickTracksByUser(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterUserHandlers(se, app)
	})

	_, adminToken := createAuthUser(t, server.app, true, false)
	baselinePayload := loadAdminRecordCountsResponse(t, server, adminToken, "quick-track")

	firstUser, _ := createAuthUser(t, server.app, false, false)
	secondUser, _ := createAuthUser(t, server.app, false, false)

	firstUser.Set("email", "first.quicktrack@example.com")
	firstUser.Set("name", "First User")
	if err := server.app.Save(firstUser); err != nil {
		t.Fatalf("failed to update first user: %v", err)
	}

	secondUser.Set("email", "second.quicktrack@example.com")
	secondUser.Set("name", "Second User")
	if err := server.app.Save(secondUser); err != nil {
		t.Fatalf("failed to update second user: %v", err)
	}

	createCollectionRecord(t, server.app, "food_items", map[string]any{
		"name":         "Spicy Tuna Roll",
		"rating":       4,
		"user":         firstUser.Id,
		"isQuickTrack": true,
		"visibility":   "private",
		"itemDate":     "2026-03-01 10:00:00.000Z",
	})
	createCollectionRecord(t, server.app, "food_items", map[string]any{
		"name":         "Matcha Latte",
		"rating":       5,
		"user":         firstUser.Id,
		"isQuickTrack": true,
		"visibility":   "private",
		"itemDate":     "2026-03-03 12:30:00.000Z",
	})
	createCollectionRecord(t, server.app, "food_items", map[string]any{
		"name":         "Burger",
		"rating":       3,
		"user":         secondUser.Id,
		"isQuickTrack": true,
		"visibility":   "private",
		"itemDate":     "2026-03-02 08:15:00.000Z",
	})
	createCollectionRecord(t, server.app, "food_items", map[string]any{
		"name":         "Non quick-track item",
		"rating":       2,
		"user":         secondUser.Id,
		"isQuickTrack": false,
	})

	payload := loadAdminRecordCountsResponse(t, server, adminToken, "quick-track")

	if payload.RecordType != "quick-track" {
		t.Fatalf("expected recordType quick-track, got %q", payload.RecordType)
	}
	if payload.TotalRecords != baselinePayload.TotalRecords+3 {
		t.Fatalf(
			"expected total quick-track records to increase by 3, got baseline=%d current=%d",
			baselinePayload.TotalRecords,
			payload.TotalRecords,
		)
	}
	if payload.UsersWithRecords != baselinePayload.UsersWithRecords+2 {
		t.Fatalf(
			"expected usersWithRecords to increase by 2, got baseline=%d current=%d",
			baselinePayload.UsersWithRecords,
			payload.UsersWithRecords,
		)
	}

	firstRow, ok := findAdminRecordCountsRow(payload.Rows, firstUser.Id)
	if !ok {
		t.Fatalf("expected a grouped row for first user %s", firstUser.Id)
	}
	if firstRow.RecordCount != 2 {
		t.Fatalf("expected first user to have 2 quick tracks, got %d", firstRow.RecordCount)
	}
	if firstRow.User.Email != "first.quicktrack@example.com" {
		t.Fatalf("unexpected first row email: %q", firstRow.User.Email)
	}

	secondRow, ok := findAdminRecordCountsRow(payload.Rows, secondUser.Id)
	if !ok {
		t.Fatalf("expected a grouped row for second user %s", secondUser.Id)
	}
	if secondRow.RecordCount != 1 {
		t.Fatalf("expected second user to have 1 quick track, got %d", secondRow.RecordCount)
	}
	if secondRow.User.Email != "second.quicktrack@example.com" {
		t.Fatalf("unexpected second row email: %q", secondRow.User.Email)
	}
}

func TestAdminRecordCountsRejectsUnsupportedRecordType(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterUserHandlers(se, app)
	})

	_, adminToken := createAuthUser(t, server.app, true, false)

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/admin/record-counts?recordType=unknown-type",
		adminToken,
		"",
	)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", response.Code, response.Body.String())
	}
}
