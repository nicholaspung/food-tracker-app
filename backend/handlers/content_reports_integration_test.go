package handlers_test

import (
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"myapp/handlers"
	"myapp/hooks"
	"myapp/lib"
)

func TestUserContentReportCreatesReviewCaseWithoutQuarantiningVisit(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterContentReportHandlers(se, app)
		handlers.RegisterFeatureWriteHandlers(se, app)
		handlers.RegisterFeatureSummaryHandlers(se, app)
		hooks.RegisterContentReportVisibilityHooks(app)
	})

	owner, ownerToken := createAuthUser(t, server.app, false, false)
	reporter, reporterToken := createAuthUser(t, server.app, false, false)
	otherFriend, otherFriendToken := createAuthUser(t, server.app, false, false)

	createCollectionRecord(t, server.app, "friendships", map[string]any{
		"user":   owner.Id,
		"friend": reporter.Id,
		"status": "accepted",
	})
	createCollectionRecord(t, server.app, "friendships", map[string]any{
		"user":   owner.Id,
		"friend": otherFriend.Id,
		"status": "accepted",
	})

	restaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":        "Reported Spot",
		"location":    "San Francisco, CA",
		"cuisineType": "Japanese",
		"visibility":  "public",
	})
	visit := createCollectionRecord(t, server.app, "visits", map[string]any{
		"restaurant": restaurant.Id,
		"user":       owner.Id,
		"visitDate":  "2026-04-01 18:30:00.000Z",
		"visibility": "friends",
		"notes":      "Visible before report",
	})
	visitItem := createCollectionRecord(t, server.app, "food_items", map[string]any{
		"name":     "Spicy Tuna Roll",
		"rating":   2,
		"user":     owner.Id,
		"visit":    visit.Id,
		"itemType": "visit-item",
	})
	linkedQuickTrack := createCollectionRecord(t, server.app, "food_items", map[string]any{
		"name":          "Bottled Yuzu Soda",
		"rating":        4.2,
		"user":          owner.Id,
		"visit":         visit.Id,
		"visibility":    "friends",
		"location_text": restaurant.GetString("name"),
		"itemType":      "food-product",
	})
	visitPhotoID := insertVisitPhotoRowRaw(t, server.app, owner.Id, visit.Id, visitItem.Id)

	preReportFeed := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/collections/visits/records?perPage=50",
		reporterToken,
		"",
	)
	if preReportFeed.Code != http.StatusOK {
		t.Fatalf("expected pre-report visit list to succeed, got %d: %s", preReportFeed.Code, preReportFeed.Body.String())
	}
	if !strings.Contains(preReportFeed.Body.String(), visit.Id) {
		t.Fatalf("expected reporter to see visit before reporting, got %s", preReportFeed.Body.String())
	}

	reportResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/content-reports",
		reporterToken,
		`{
			"contentType":"visit",
			"recordId":"`+visit.Id+`",
			"reasonCode":"spam",
			"notes":"This should be reviewed."
		}`,
	)
	if reportResponse.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", reportResponse.Code, reportResponse.Body.String())
	}
	if !strings.Contains(reportResponse.Body.String(), `"status":"open"`) {
		t.Fatalf("expected report response to include open status, got %s", reportResponse.Body.String())
	}

	refreshedVisit, err := server.app.FindRecordById("visits", visit.Id)
	if err != nil {
		t.Fatalf("failed to reload visit: %v", err)
	}
	if !lib.IsVisibleContentModerationStatus(refreshedVisit.GetString("moderationStatus")) {
		t.Fatalf("expected visit moderationStatus to remain visible, got %s", refreshedVisit.GetString("moderationStatus"))
	}

	caseRecord, err := server.app.FindFirstRecordByFilter(
		"moderation_cases",
		"targetType = {:targetType} && targetRecordId = {:targetRecordId}",
		map[string]any{
			"targetType":     "visit",
			"targetRecordId": visit.Id,
		},
	)
	if err != nil {
		t.Fatalf("failed to load moderation case: %v", err)
	}
	if caseRecord.GetString("status") != lib.ModerationCaseStatusOpen {
		t.Fatalf("expected moderation case open, got %s", caseRecord.GetString("status"))
	}
	if strings.TrimSpace(caseRecord.GetString("action")) != "" {
		t.Fatalf("expected user report case to have no automatic action, got %s", caseRecord.GetString("action"))
	}

	reportRecord, err := server.app.FindFirstRecordByFilter(
		"content_reports",
		"reporter = {:reporter} && targetType = {:targetType} && targetRecordId = {:targetRecordId}",
		map[string]any{
			"reporter":       reporter.Id,
			"targetType":     "visit",
			"targetRecordId": visit.Id,
		},
	)
	if err != nil {
		t.Fatalf("failed to load content report: %v", err)
	}
	if reportRecord.GetString("reasonCode") != "spam" {
		t.Fatalf("expected reasonCode spam, got %s", reportRecord.GetString("reasonCode"))
	}
	if reportRecord.GetString("notes") != "This should be reviewed." {
		t.Fatalf("expected saved report notes, got %s", reportRecord.GetString("notes"))
	}
	if reportRecord.GetString("moderationCase") != caseRecord.Id {
		t.Fatalf("expected content report to link to case %s, got %s", caseRecord.Id, reportRecord.GetString("moderationCase"))
	}

	reporterPostReportFeed := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/collections/visits/records?perPage=50",
		reporterToken,
		"",
	)
	if reporterPostReportFeed.Code != http.StatusOK {
		t.Fatalf("expected reporter visit list after report to succeed, got %d: %s", reporterPostReportFeed.Code, reporterPostReportFeed.Body.String())
	}
	if strings.Contains(reporterPostReportFeed.Body.String(), visit.Id) {
		t.Fatalf("expected reported visit to disappear only for reporter, got %s", reporterPostReportFeed.Body.String())
	}

	reporterVisitDetail := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/collections/visits/records/"+visit.Id,
		reporterToken,
		"",
	)
	if reporterVisitDetail.Code != http.StatusNotFound {
		t.Fatalf("expected reported visit detail to be hidden from reporter, got %d: %s", reporterVisitDetail.Code, reporterVisitDetail.Body.String())
	}

	reporterHomeFeed := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/home-feed?scope=friends&pageSize=50",
		reporterToken,
		"",
	)
	if reporterHomeFeed.Code != http.StatusOK {
		t.Fatalf("expected reporter home feed to succeed, got %d: %s", reporterHomeFeed.Code, reporterHomeFeed.Body.String())
	}
	if strings.Contains(reporterHomeFeed.Body.String(), visit.Id) {
		t.Fatalf("expected reported visit to disappear from reporter home feed, got %s", reporterHomeFeed.Body.String())
	}
	if strings.Contains(reporterHomeFeed.Body.String(), linkedQuickTrack.Id) {
		t.Fatalf("expected food product linked to reported visit to disappear from reporter home feed, got %s", reporterHomeFeed.Body.String())
	}

	reporterTypedVisitDetail := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/visits/"+visit.Id,
		reporterToken,
		"",
	)
	if reporterTypedVisitDetail.Code != http.StatusNotFound {
		t.Fatalf("expected typed visit detail to be hidden from reporter, got %d: %s", reporterTypedVisitDetail.Code, reporterTypedVisitDetail.Body.String())
	}

	otherFriendFeed := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/collections/visits/records?perPage=50",
		otherFriendToken,
		"",
	)
	if otherFriendFeed.Code != http.StatusOK {
		t.Fatalf("expected other friend visit list to succeed, got %d: %s", otherFriendFeed.Code, otherFriendFeed.Body.String())
	}
	if !strings.Contains(otherFriendFeed.Body.String(), visit.Id) {
		t.Fatalf("expected single report to leave visit visible for other friends, got %s", otherFriendFeed.Body.String())
	}

	otherFriendHomeFeed := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/home-feed?scope=friends&pageSize=50",
		otherFriendToken,
		"",
	)
	if otherFriendHomeFeed.Code != http.StatusOK {
		t.Fatalf("expected other friend home feed to succeed, got %d: %s", otherFriendHomeFeed.Code, otherFriendHomeFeed.Body.String())
	}
	if !strings.Contains(otherFriendHomeFeed.Body.String(), visit.Id) {
		t.Fatalf("expected reported visit to remain visible in other friend home feed, got %s", otherFriendHomeFeed.Body.String())
	}
	if !strings.Contains(otherFriendHomeFeed.Body.String(), linkedQuickTrack.Id) {
		t.Fatalf("expected food product linked to reported visit to remain visible in other friend home feed, got %s", otherFriendHomeFeed.Body.String())
	}

	ownerFeed := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/collections/visits/records?perPage=50",
		ownerToken,
		"",
	)
	if ownerFeed.Code != http.StatusOK {
		t.Fatalf("expected owner visit list to succeed, got %d: %s", ownerFeed.Code, ownerFeed.Body.String())
	}
	if !strings.Contains(ownerFeed.Body.String(), visit.Id) {
		t.Fatalf("expected owner to keep seeing reported visit, got %s", ownerFeed.Body.String())
	}

	ownerItems := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/collections/food_items/records?perPage=50",
		ownerToken,
		"",
	)
	if ownerItems.Code != http.StatusOK {
		t.Fatalf("expected owner food item list to succeed, got %d: %s", ownerItems.Code, ownerItems.Body.String())
	}
	if !strings.Contains(ownerItems.Body.String(), visitItem.Id) {
		t.Fatalf("expected owner to keep seeing visit item, got %s", ownerItems.Body.String())
	}

	reporterItems := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/collections/food_items/records?perPage=50",
		reporterToken,
		"",
	)
	if reporterItems.Code != http.StatusOK {
		t.Fatalf("expected reporter food item list to succeed, got %d: %s", reporterItems.Code, reporterItems.Body.String())
	}
	if strings.Contains(reporterItems.Body.String(), visitItem.Id) {
		t.Fatalf("expected visit item for reported visit to disappear for reporter, got %s", reporterItems.Body.String())
	}
	if strings.Contains(reporterItems.Body.String(), linkedQuickTrack.Id) {
		t.Fatalf("expected food product linked to reported visit to disappear for reporter, got %s", reporterItems.Body.String())
	}

	ownerPhotos := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/collections/visit_photos/records?perPage=50",
		ownerToken,
		"",
	)
	if ownerPhotos.Code != http.StatusOK {
		t.Fatalf("expected owner photo list to succeed, got %d: %s", ownerPhotos.Code, ownerPhotos.Body.String())
	}
	if !strings.Contains(ownerPhotos.Body.String(), visitPhotoID) {
		t.Fatalf("expected owner to keep seeing visit photo, got %s", ownerPhotos.Body.String())
	}

	reporterPhotos := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/collections/visit_photos/records?perPage=50",
		reporterToken,
		"",
	)
	if reporterPhotos.Code != http.StatusOK {
		t.Fatalf("expected reporter photo list to succeed, got %d: %s", reporterPhotos.Code, reporterPhotos.Body.String())
	}
	if strings.Contains(reporterPhotos.Body.String(), visitPhotoID) {
		t.Fatalf("expected photo for reported visit to disappear for reporter, got %s", reporterPhotos.Body.String())
	}

	updateVisitResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPatch,
		"/api/collections/visits/records/"+visit.Id,
		ownerToken,
		`{"notes":"Edited after report"}`,
	)
	if updateVisitResponse.Code != http.StatusOK {
		t.Fatalf("expected owner to edit reported visit, got %d: %s", updateVisitResponse.Code, updateVisitResponse.Body.String())
	}

	reloadedVisit, err := server.app.FindRecordById("visits", visit.Id)
	if err != nil {
		t.Fatalf("failed to reload visit after owner edit: %v", err)
	}
	if reloadedVisit.GetString("notes") != "Edited after report" {
		t.Fatalf("expected owner edit to persist, got %s", reloadedVisit.GetString("notes"))
	}
}

func TestUserContentReportReusesExistingReporterRowForQuickTrack(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterContentReportHandlers(se, app)
		handlers.RegisterFeatureSummaryHandlers(se, app)
		hooks.RegisterContentReportVisibilityHooks(app)
	})

	owner, ownerToken := createAuthUser(t, server.app, false, false)
	reporter, reporterToken := createAuthUser(t, server.app, false, false)
	otherFriend, otherFriendToken := createAuthUser(t, server.app, false, false)

	createCollectionRecord(t, server.app, "friendships", map[string]any{
		"user":   owner.Id,
		"friend": reporter.Id,
		"status": "accepted",
	})
	createCollectionRecord(t, server.app, "friendships", map[string]any{
		"user":   owner.Id,
		"friend": otherFriend.Id,
		"status": "accepted",
	})

	quickTrack := createCollectionRecord(t, server.app, "food_items", map[string]any{
		"name":          "Mystery Snack",
		"rating":        1,
		"user":          owner.Id,
		"itemType":      "food-product",
		"visibility":    "friends",
		"location_text": "Corner Store",
	})

	firstResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/content-reports",
		reporterToken,
		`{
			"contentType":"food-product",
			"recordId":"`+quickTrack.Id+`",
			"reasonCode":"other",
			"notes":"First report"
		}`,
	)
	if firstResponse.Code != http.StatusOK {
		t.Fatalf("expected first report to succeed, got %d: %s", firstResponse.Code, firstResponse.Body.String())
	}

	secondResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/content-reports",
		reporterToken,
		`{
			"contentType":"food-product",
			"recordId":"`+quickTrack.Id+`",
			"reasonCode":"privacy",
			"notes":"Updated report details"
		}`,
	)
	if secondResponse.Code != http.StatusOK {
		t.Fatalf("expected second report to succeed, got %d: %s", secondResponse.Code, secondResponse.Body.String())
	}

	reportRows, err := server.app.FindRecordsByFilter(
		"content_reports",
		"targetType = {:targetType} && targetRecordId = {:targetRecordId}",
		"-updated",
		10,
		0,
		map[string]any{
			"targetType":     "food-product",
			"targetRecordId": quickTrack.Id,
		},
	)
	if err != nil {
		t.Fatalf("failed to load content reports: %v", err)
	}
	if len(reportRows) != 1 {
		t.Fatalf("expected exactly 1 content report row, got %d", len(reportRows))
	}
	if reportRows[0].GetString("reasonCode") != "privacy" {
		t.Fatalf("expected updated reasonCode privacy, got %s", reportRows[0].GetString("reasonCode"))
	}
	if reportRows[0].GetString("notes") != "Updated report details" {
		t.Fatalf("expected updated notes, got %s", reportRows[0].GetString("notes"))
	}

	caseRows, err := server.app.FindRecordsByFilter(
		"moderation_cases",
		"targetType = {:targetType} && targetRecordId = {:targetRecordId}",
		"-updated",
		10,
		0,
		map[string]any{
			"targetType":     "food-product",
			"targetRecordId": quickTrack.Id,
		},
	)
	if err != nil {
		t.Fatalf("failed to load moderation cases: %v", err)
	}
	if len(caseRows) != 1 {
		t.Fatalf("expected exactly 1 moderation case row, got %d", len(caseRows))
	}
	if caseRows[0].GetString("status") != lib.ModerationCaseStatusOpen {
		t.Fatalf("expected moderation case open, got %s", caseRows[0].GetString("status"))
	}
	if strings.TrimSpace(caseRows[0].GetString("action")) != "" {
		t.Fatalf("expected user report case to have no automatic action, got %s", caseRows[0].GetString("action"))
	}

	refreshedQuickTrack, err := server.app.FindRecordById("food_items", quickTrack.Id)
	if err != nil {
		t.Fatalf("failed to reload food product: %v", err)
	}
	if !lib.IsVisibleContentModerationStatus(refreshedQuickTrack.GetString("moderationStatus")) {
		t.Fatalf("expected food product moderationStatus to remain visible, got %s", refreshedQuickTrack.GetString("moderationStatus"))
	}

	reporterQuickTracks := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/collections/food_items/records?perPage=50",
		reporterToken,
		"",
	)
	if reporterQuickTracks.Code != http.StatusOK {
		t.Fatalf("expected reporter food product list to succeed, got %d: %s", reporterQuickTracks.Code, reporterQuickTracks.Body.String())
	}
	if strings.Contains(reporterQuickTracks.Body.String(), quickTrack.Id) {
		t.Fatalf("expected reported food product to disappear only for reporter, got %s", reporterQuickTracks.Body.String())
	}

	reporterQuickTrackDetail := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/collections/food_items/records/"+quickTrack.Id,
		reporterToken,
		"",
	)
	if reporterQuickTrackDetail.Code != http.StatusNotFound {
		t.Fatalf("expected reported food product detail to be hidden from reporter, got %d: %s", reporterQuickTrackDetail.Code, reporterQuickTrackDetail.Body.String())
	}

	reporterHomeFeed := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/home-feed?scope=friends&pageSize=50",
		reporterToken,
		"",
	)
	if reporterHomeFeed.Code != http.StatusOK {
		t.Fatalf("expected reporter home feed to succeed, got %d: %s", reporterHomeFeed.Code, reporterHomeFeed.Body.String())
	}
	if strings.Contains(reporterHomeFeed.Body.String(), quickTrack.Id) {
		t.Fatalf("expected reported food product to disappear from reporter home feed, got %s", reporterHomeFeed.Body.String())
	}

	otherFriendQuickTracks := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/collections/food_items/records?perPage=50",
		otherFriendToken,
		"",
	)
	if otherFriendQuickTracks.Code != http.StatusOK {
		t.Fatalf("expected other friend food product list to succeed, got %d: %s", otherFriendQuickTracks.Code, otherFriendQuickTracks.Body.String())
	}
	if !strings.Contains(otherFriendQuickTracks.Body.String(), quickTrack.Id) {
		t.Fatalf("expected single report to leave food product visible for other friends, got %s", otherFriendQuickTracks.Body.String())
	}

	otherFriendHomeFeed := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/home-feed?scope=friends&pageSize=50",
		otherFriendToken,
		"",
	)
	if otherFriendHomeFeed.Code != http.StatusOK {
		t.Fatalf("expected other friend home feed to succeed, got %d: %s", otherFriendHomeFeed.Code, otherFriendHomeFeed.Body.String())
	}
	if !strings.Contains(otherFriendHomeFeed.Body.String(), quickTrack.Id) {
		t.Fatalf("expected reported food product to remain visible in other friend home feed, got %s", otherFriendHomeFeed.Body.String())
	}

	ownerQuickTracks := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/collections/food_items/records?perPage=50",
		ownerToken,
		"",
	)
	if ownerQuickTracks.Code != http.StatusOK {
		t.Fatalf("expected owner food product list to succeed, got %d: %s", ownerQuickTracks.Code, ownerQuickTracks.Body.String())
	}
	if !strings.Contains(ownerQuickTracks.Body.String(), quickTrack.Id) {
		t.Fatalf("expected owner to keep seeing reported food product, got %s", ownerQuickTracks.Body.String())
	}

	deleteQuickTrackResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodDelete,
		"/api/collections/food_items/records/"+quickTrack.Id,
		ownerToken,
		"",
	)
	if deleteQuickTrackResponse.Code != http.StatusOK && deleteQuickTrackResponse.Code != http.StatusNoContent {
		t.Fatalf("expected owner to delete reported food product, got %d: %s", deleteQuickTrackResponse.Code, deleteQuickTrackResponse.Body.String())
	}

	if _, err := server.app.FindRecordById("food_items", quickTrack.Id); err == nil {
		t.Fatalf("expected food product to be deleted by owner")
	}
}

func TestAdminModerationCasesIncludeUserReportHistory(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterContentReportHandlers(se, app)
		handlers.RegisterModerationHandlers(se, app)
	})

	owner, _ := createAuthUser(t, server.app, false, false)
	reporter, reporterToken := createAuthUser(t, server.app, false, false)
	_, adminToken := createAuthUser(t, server.app, true, false)

	createCollectionRecord(t, server.app, "friendships", map[string]any{
		"user":   owner.Id,
		"friend": reporter.Id,
		"status": "accepted",
	})

	quickTrack := createCollectionRecord(t, server.app, "food_items", map[string]any{
		"name":       "Flagged Noodles",
		"rating":     1,
		"user":       owner.Id,
		"itemType":   "food-product",
		"visibility": "friends",
	})

	reportResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/content-reports",
		reporterToken,
		`{
			"contentType":"food-product",
			"recordId":"`+quickTrack.Id+`",
			"reasonCode":"harassment",
			"notes":"Reported from integration test"
		}`,
	)
	if reportResponse.Code != http.StatusOK {
		t.Fatalf("expected content report to succeed, got %d: %s", reportResponse.Code, reportResponse.Body.String())
	}

	listResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/admin/moderation/cases?status=active",
		adminToken,
		"",
	)
	if listResponse.Code != http.StatusOK {
		t.Fatalf("expected moderation case list to succeed, got %d: %s", listResponse.Code, listResponse.Body.String())
	}

	reportBody := parseJSONMap(t, reportResponse.Body.Bytes())
	body := parseJSONMap(t, listResponse.Body.Bytes())
	items, ok := body["items"].([]any)
	if !ok || len(items) == 0 {
		t.Fatalf("expected moderation case list items, got %#v", body["items"])
	}

	var casePayload map[string]any
	for _, item := range items {
		candidate, ok := item.(map[string]any)
		if !ok {
			continue
		}
		if candidate["id"] == reportBody["caseId"] || candidate["targetRecordId"] == quickTrack.Id {
			casePayload = candidate
			break
		}
	}
	if casePayload == nil {
		t.Fatalf("expected moderation case for food product %s, got %#v", quickTrack.Id, items)
	}
	if casePayload["status"] != lib.ModerationCaseStatusOpen {
		t.Fatalf("expected reported content case to be open, got %#v", casePayload["status"])
	}
	if casePayload["action"] != "" {
		t.Fatalf("expected reported content case to have no automatic action, got %#v", casePayload["action"])
	}
	if casePayload["reportCount"] != float64(1) {
		t.Fatalf("expected reportCount=1, got %#v", casePayload["reportCount"])
	}
	if strings.TrimSpace(casePayload["latestReportedAt"].(string)) == "" {
		t.Fatalf("expected latestReportedAt to be populated, got %#v", casePayload["latestReportedAt"])
	}

	reports, ok := casePayload["reports"].([]any)
	if !ok || len(reports) == 0 {
		t.Fatalf("expected report entries, got %#v", casePayload["reports"])
	}

	var reportPayload map[string]any
	for _, candidate := range reports {
		candidatePayload, ok := candidate.(map[string]any)
		if !ok {
			continue
		}
		if candidatePayload["reasonCode"] == "harassment" && candidatePayload["notes"] == "Reported from integration test" {
			reportPayload = candidatePayload
			break
		}
	}
	if reportPayload == nil {
		t.Fatalf("expected harassment report payload, got %#v", reports)
	}
	if reportPayload["reasonCode"] != "harassment" {
		t.Fatalf("expected report reason harassment, got %#v", reportPayload["reasonCode"])
	}
	if reportPayload["notes"] != "Reported from integration test" {
		t.Fatalf("expected report notes to be preserved, got %#v", reportPayload["notes"])
	}

	reportExpand, ok := reportPayload["expand"].(map[string]any)
	if !ok {
		t.Fatalf("expected report expand payload, got %#v", reportPayload["expand"])
	}
	reporterPayload, ok := reportExpand["reporter"].(map[string]any)
	if !ok {
		t.Fatalf("expected reporter payload, got %#v", reportExpand["reporter"])
	}
	if reporterPayload["id"] != reporter.Id {
		t.Fatalf("expected reporter id %s, got %#v", reporter.Id, reporterPayload["id"])
	}
}

func insertVisitPhotoRowRaw(t *testing.T, app core.App, userID string, visitID string, foodItemID string) string {
	t.Helper()

	recordID := fmt.Sprintf("vp_%d", time.Now().UnixNano())
	now := time.Now().UTC().Format(time.RFC3339Nano)

	if _, err := app.DB().NewQuery(`
		INSERT INTO visit_photos (id, photo, caption, visit, food_item, user, created, updated)
		VALUES ({:id}, {:photo}, '', {:visit}, {:foodItem}, {:user}, {:created}, {:updated})
	`).
		Bind(dbx.Params{
			"id":       recordID,
			"photo":    "test-photo.jpg",
			"visit":    visitID,
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
