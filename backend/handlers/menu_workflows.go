package handlers

import (
	"database/sql"
	"errors"
	"fmt"
	"path/filepath"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

const (
	defaultMenuReviewReason   = "User reported incorrect menu items"
	menuReviewReasonMaxLength = 500
	menuItemNameMaxLength     = 200
	menuScanFallbackCount     = 3
	maxMenuItemsFromScan      = 100
)

type createMenuReviewRequest struct {
	RestaurantID string `json:"restaurantId"`
	Reason       string `json:"reason"`
}

type menuReviewRequestResponse struct {
	ID           string `json:"id"`
	RestaurantID string `json:"restaurantId"`
	Status       string `json:"status"`
	Reason       string `json:"reason,omitempty"`
	Deduped      bool   `json:"deduped"`
	Created      string `json:"created,omitempty"`
	Updated      string `json:"updated,omitempty"`
}

type createMenuItemsFromScanRequest struct {
	RestaurantID  string   `json:"restaurantId"`
	ItemNames     []string `json:"itemNames"`
	FallbackLabel string   `json:"fallbackLabel"`
}

type menuItemsFromScanResponse struct {
	CreatedItems  []menuItemWorkflowResponse `json:"createdItems"`
	ExistingItems []menuItemWorkflowResponse `json:"existingItems"`
}

type menuItemWorkflowResponse struct {
	ID         string `json:"id"`
	Restaurant string `json:"restaurant"`
	Name       string `json:"name"`
	CreatedBy  string `json:"createdBy,omitempty"`
	Visibility string `json:"visibility,omitempty"`
	IsFromOCR  bool   `json:"isFromOCR,omitempty"`
	Created    string `json:"created,omitempty"`
	Updated    string `json:"updated,omitempty"`
}

// RegisterMenuWorkflowHandlers registers authenticated menu-specific write endpoints.
func RegisterMenuWorkflowHandlers(se *core.ServeEvent, app core.App) {
	se.Router.POST("/api/menu-review-requests", func(e *core.RequestEvent) error {
		if e.Auth == nil {
			return apis.NewUnauthorizedError("authentication required", nil)
		}

		requestBody := createMenuReviewRequest{}
		if err := e.BindBody(&requestBody); err != nil {
			return apis.NewBadRequestError("invalid request body", err)
		}

		responsePayload, err := createOrReuseMenuReviewRequest(app, e.Auth, requestBody)
		if err != nil {
			return err
		}

		return e.JSON(200, responsePayload)
	}).Bind(apis.RequireAuth())

	se.Router.POST("/api/menu-items/from-scan", func(e *core.RequestEvent) error {
		if e.Auth == nil {
			return apis.NewUnauthorizedError("authentication required", nil)
		}

		requestBody := createMenuItemsFromScanRequest{}
		if err := e.BindBody(&requestBody); err != nil {
			return apis.NewBadRequestError("invalid request body", err)
		}

		var responsePayload menuItemsFromScanResponse
		if err := app.RunInTransaction(func(txApp core.App) error {
			var err error
			responsePayload, err = createMenuItemsFromScan(txApp, e.Auth, requestBody)
			return err
		}); err != nil {
			return err
		}

		return e.JSON(200, responsePayload)
	}).Bind(apis.RequireAuth())
}

func createOrReuseMenuReviewRequest(
	app core.App,
	authRecord *core.Record,
	requestBody createMenuReviewRequest,
) (menuReviewRequestResponse, error) {
	restaurantID := strings.TrimSpace(requestBody.RestaurantID)
	if restaurantID == "" {
		return menuReviewRequestResponse{}, apis.NewBadRequestError("restaurantId is required", nil)
	}

	if _, err := app.FindRecordById("restaurants", restaurantID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return menuReviewRequestResponse{}, apis.NewNotFoundError("restaurant not found", nil)
		}

		return menuReviewRequestResponse{}, apis.NewNotFoundError("restaurant not found", err)
	}

	reason := strings.TrimSpace(requestBody.Reason)
	if reason == "" {
		reason = defaultMenuReviewReason
	}
	if len(reason) > menuReviewReasonMaxLength {
		return menuReviewRequestResponse{}, apis.NewBadRequestError(
			fmt.Sprintf("reason must be %d characters or fewer", menuReviewReasonMaxLength),
			nil,
		)
	}

	existing, err := app.FindFirstRecordByFilter(
		"menu_review_requests",
		"restaurant = {:restaurantId} && status = 'pending'",
		map[string]any{"restaurantId": restaurantID},
	)
	if err == nil && existing != nil {
		return buildMenuReviewRequestResponse(existing, true), nil
	}
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return menuReviewRequestResponse{}, apis.NewApiError(500, "failed to check existing review requests", err)
	}

	collection, err := app.FindCollectionByNameOrId("menu_review_requests")
	if err != nil {
		return menuReviewRequestResponse{}, apis.NewApiError(500, "failed to resolve review request collection", err)
	}

	record := core.NewRecord(collection)
	record.Set("restaurant", restaurantID)
	record.Set("requestedBy", authRecord.Id)
	record.Set("reason", reason)
	record.Set("status", "pending")

	if err := app.Save(record); err != nil {
		existingAfterSave, lookupErr := app.FindFirstRecordByFilter(
			"menu_review_requests",
			"restaurant = {:restaurantId} && status = 'pending'",
			map[string]any{"restaurantId": restaurantID},
		)
		if lookupErr == nil && existingAfterSave != nil {
			return buildMenuReviewRequestResponse(existingAfterSave, true), nil
		}

		return menuReviewRequestResponse{}, apis.NewApiError(500, "failed to create review request", err)
	}

	return buildMenuReviewRequestResponse(record, false), nil
}

func createMenuItemsFromScan(
	app core.App,
	authRecord *core.Record,
	requestBody createMenuItemsFromScanRequest,
) (menuItemsFromScanResponse, error) {
	restaurantID := strings.TrimSpace(requestBody.RestaurantID)
	if restaurantID == "" {
		return menuItemsFromScanResponse{}, apis.NewBadRequestError("restaurantId is required", nil)
	}

	if _, err := app.FindRecordById("restaurants", restaurantID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return menuItemsFromScanResponse{}, apis.NewNotFoundError("restaurant not found", nil)
		}

		return menuItemsFromScanResponse{}, apis.NewNotFoundError("restaurant not found", err)
	}

	resolvedNames, err := resolveMenuItemNamesFromScan(requestBody.ItemNames, requestBody.FallbackLabel)
	if err != nil {
		return menuItemsFromScanResponse{}, apis.NewBadRequestError(err.Error(), nil)
	}

	existingByNormalizedName, err := findExistingMenuItemsByNormalizedName(app, restaurantID, resolvedNames)
	if err != nil {
		return menuItemsFromScanResponse{}, apis.NewApiError(500, "failed to load existing menu items", err)
	}

	menuItemsCollection, err := app.FindCollectionByNameOrId("menu_items")
	if err != nil {
		return menuItemsFromScanResponse{}, apis.NewApiError(500, "failed to resolve menu items collection", err)
	}

	response := menuItemsFromScanResponse{
		CreatedItems:  make([]menuItemWorkflowResponse, 0, len(resolvedNames)),
		ExistingItems: make([]menuItemWorkflowResponse, 0, len(resolvedNames)),
	}

	for _, itemName := range resolvedNames {
		normalizedName := normalizeMenuItemName(itemName)
		if existing := existingByNormalizedName[normalizedName]; existing != nil {
			response.ExistingItems = append(response.ExistingItems, buildMenuItemWorkflowResponse(existing))
			continue
		}

		record := core.NewRecord(menuItemsCollection)
		record.Set("restaurant", restaurantID)
		record.Set("name", itemName)
		record.Set("createdBy", authRecord.Id)
		record.Set("visibility", "friends")
		record.Set("isFromOCR", true)

		if err := app.Save(record); err != nil {
			refetchedExisting, lookupErr := findExistingMenuItemsByNormalizedName(app, restaurantID, []string{itemName})
			if lookupErr == nil && refetchedExisting[normalizedName] != nil {
				existingByNormalizedName[normalizedName] = refetchedExisting[normalizedName]
				response.ExistingItems = append(response.ExistingItems, buildMenuItemWorkflowResponse(refetchedExisting[normalizedName]))
				continue
			}

			return menuItemsFromScanResponse{}, apis.NewApiError(500, "failed to create scanned menu items", err)
		}

		existingByNormalizedName[normalizedName] = record
		response.CreatedItems = append(response.CreatedItems, buildMenuItemWorkflowResponse(record))
	}

	return response, nil
}

func resolveMenuItemNamesFromScan(rawNames []string, fallbackLabel string) ([]string, error) {
	resolved := make([]string, 0, len(rawNames))
	seen := make(map[string]struct{}, len(rawNames))

	for _, rawName := range rawNames {
		name := strings.TrimSpace(rawName)
		if name == "" {
			continue
		}
		if len(name) > menuItemNameMaxLength {
			return nil, fmt.Errorf("menu item names must be %d characters or fewer", menuItemNameMaxLength)
		}

		normalizedName := normalizeMenuItemName(name)
		if normalizedName == "" {
			continue
		}
		if _, exists := seen[normalizedName]; exists {
			continue
		}

		seen[normalizedName] = struct{}{}
		resolved = append(resolved, name)
	}

	if len(resolved) == 0 {
		fallbackNames := buildFallbackScannedItemNames(fallbackLabel)
		for _, name := range fallbackNames {
			normalizedName := normalizeMenuItemName(name)
			if _, exists := seen[normalizedName]; exists {
				continue
			}
			seen[normalizedName] = struct{}{}
			resolved = append(resolved, name)
		}
	}

	if len(resolved) == 0 {
		return nil, fmt.Errorf("at least one menu item is required")
	}
	if len(resolved) > maxMenuItemsFromScan {
		return nil, fmt.Errorf("menu scans can create at most %d items at once", maxMenuItemsFromScan)
	}

	return resolved, nil
}

func buildFallbackScannedItemNames(fallbackLabel string) []string {
	trimmedLabel := strings.TrimSpace(fallbackLabel)
	base := strings.TrimSpace(strings.TrimSuffix(trimmedLabel, filepath.Ext(trimmedLabel)))
	if base == "" {
		base = "Scanned Item"
	}

	maxBaseLength := menuItemNameMaxLength - len(" #3")
	if maxBaseLength < 1 {
		maxBaseLength = 1
	}
	if len(base) > maxBaseLength {
		base = strings.TrimSpace(base[:maxBaseLength])
	}

	names := make([]string, 0, menuScanFallbackCount)
	for index := 1; index <= menuScanFallbackCount; index += 1 {
		names = append(names, fmt.Sprintf("%s #%d", base, index))
	}

	return names
}

func findExistingMenuItemsByNormalizedName(
	app core.App,
	restaurantID string,
	itemNames []string,
) (map[string]*core.Record, error) {
	normalizedNames := make([]string, 0, len(itemNames))
	seen := make(map[string]struct{}, len(itemNames))
	params := dbx.Params{
		"restaurantId": restaurantID,
	}
	clauses := make([]string, 0, len(itemNames))

	for index, itemName := range itemNames {
		normalizedName := normalizeMenuItemName(itemName)
		if normalizedName == "" {
			continue
		}
		if _, exists := seen[normalizedName]; exists {
			continue
		}

		seen[normalizedName] = struct{}{}
		paramKey := fmt.Sprintf("name%d", index)
		params[paramKey] = normalizedName
		clauses = append(clauses, fmt.Sprintf("LOWER(TRIM(name)) = {:%s}", paramKey))
		normalizedNames = append(normalizedNames, normalizedName)
	}

	if len(clauses) == 0 {
		return map[string]*core.Record{}, nil
	}

	rows := make([]struct {
		ID   string `db:"id"`
		Name string `db:"name"`
	}, 0, len(normalizedNames))
	query := fmt.Sprintf(`
		SELECT id, name
		FROM menu_items
		WHERE restaurant = {:restaurantId}
			AND (%s)
		ORDER BY updated DESC, created DESC
	`, strings.Join(clauses, " OR "))
	if err := app.DB().NewQuery(query).Bind(params).All(&rows); err != nil {
		return nil, err
	}

	results := make(map[string]*core.Record, len(rows))
	for _, row := range rows {
		normalizedName := normalizeMenuItemName(row.Name)
		if normalizedName == "" {
			continue
		}
		if results[normalizedName] != nil {
			continue
		}

		record, err := app.FindRecordById("menu_items", row.ID)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				continue
			}

			return nil, err
		}

		results[normalizedName] = record
	}

	return results, nil
}

func normalizeMenuItemName(name string) string {
	return strings.ToLower(strings.TrimSpace(name))
}

func buildMenuReviewRequestResponse(record *core.Record, deduped bool) menuReviewRequestResponse {
	return menuReviewRequestResponse{
		ID:           record.Id,
		RestaurantID: record.GetString("restaurant"),
		Status:       record.GetString("status"),
		Reason:       record.GetString("reason"),
		Deduped:      deduped,
		Created:      record.GetString("created"),
		Updated:      record.GetString("updated"),
	}
}

func buildMenuItemWorkflowResponse(record *core.Record) menuItemWorkflowResponse {
	return menuItemWorkflowResponse{
		ID:         record.Id,
		Restaurant: record.GetString("restaurant"),
		Name:       record.GetString("name"),
		CreatedBy:  record.GetString("createdBy"),
		Visibility: record.GetString("visibility"),
		IsFromOCR:  record.GetBool("isFromOCR"),
		Created:    record.GetString("created"),
		Updated:    record.GetString("updated"),
	}
}
