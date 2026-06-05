package handlers_test

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"

	"myapp/handlers"
)

type adminMenuInventoryResponse[T any] struct {
	Items      []T    `json:"items"`
	Page       int    `json:"page"`
	PerPage    int    `json:"perPage"`
	TotalItems int    `json:"totalItems"`
	TotalPages int    `json:"totalPages"`
	Type       string `json:"type"`
}

type adminMenuInventoryUser struct {
	Email string `json:"email"`
	ID    string `json:"id"`
	Name  string `json:"name"`
}

type adminMenuInventoryRestaurant struct {
	CreatedBy           string                  `json:"createdBy"`
	Creator             *adminMenuInventoryUser `json:"creator"`
	ID                  string                  `json:"id"`
	IsGooglePlace       bool                    `json:"isGooglePlace"`
	MenuImageCount      int                     `json:"menuImageCount"`
	MenuItemCount       int                     `json:"menuItemCount"`
	Name                string                  `json:"name"`
	PlaceID             string                  `json:"placeId"`
	GooglePlaceCachedAt string                  `json:"googlePlaceCachedAt"`
	RestaurantGroupID   string                  `json:"restaurantGroupId"`
	RestaurantGroup     *adminRestaurantGroup   `json:"restaurantGroup"`
	Visibility          string                  `json:"visibility"`
}

type adminRestaurantGroup struct {
	CreatedBy string `json:"createdBy"`
	ID        string `json:"id"`
	Name      string `json:"name"`
	Notes     string `json:"notes"`
}

type adminMenuInventoryMenuItem struct {
	CreatedBy          string                  `json:"createdBy"`
	Creator            *adminMenuInventoryUser `json:"creator"`
	ID                 string                  `json:"id"`
	IsFromOCR          bool                    `json:"isFromOcr"`
	Name               string                  `json:"name"`
	Restaurant         string                  `json:"restaurant"`
	RestaurantName     string                  `json:"restaurantName"`
	RestaurantLocation string                  `json:"restaurantLocation"`
	SourceImage        string                  `json:"sourceImage"`
	SourceImageFile    string                  `json:"sourceImageFile"`
	Visibility         string                  `json:"visibility"`
}

type adminMenuInventoryMenuImage struct {
	ID                 string                  `json:"id"`
	Image              string                  `json:"image"`
	Restaurant         string                  `json:"restaurant"`
	RestaurantName     string                  `json:"restaurantName"`
	RestaurantLocation string                  `json:"restaurantLocation"`
	UploadedBy         string                  `json:"uploadedBy"`
	Uploader           *adminMenuInventoryUser `json:"uploader"`
}

type adminRestaurantInventoryDetailResponse struct {
	MenuImages         []adminMenuInventoryMenuImage  `json:"menuImages"`
	MenuItems          []adminMenuInventoryMenuItem   `json:"menuItems"`
	Restaurant         adminMenuInventoryRestaurant   `json:"restaurant"`
	RestaurantGroup    *adminRestaurantGroup          `json:"restaurantGroup"`
	SameNameCandidates []adminMenuInventoryRestaurant `json:"sameNameCandidates"`
}

type adminRestaurantGroupCreateResponse struct {
	RestaurantDetail *adminRestaurantInventoryDetailResponse `json:"restaurantDetail"`
	RestaurantGroup  adminRestaurantGroup                    `json:"restaurantGroup"`
}

type adminMenuImageInventoryDetailResponse struct {
	AttachedMenuItems             []adminMenuInventoryMenuItem  `json:"attachedMenuItems"`
	MenuImage                     adminMenuInventoryMenuImage   `json:"menuImage"`
	Restaurant                    *adminMenuInventoryRestaurant `json:"restaurant"`
	UnattachedRestaurantMenuItems []adminMenuInventoryMenuItem  `json:"unattachedRestaurantMenuItems"`
}

func loadAdminMenuInventoryResponse[T any](
	t *testing.T,
	server *preparedServer,
	adminToken string,
	path string,
) adminMenuInventoryResponse[T] {
	t.Helper()

	response := performJSONRequest(t, server.mux, http.MethodGet, path, adminToken, "")
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	payload := adminMenuInventoryResponse[T]{}
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to decode menu inventory response: %v", err)
	}

	return payload
}

func findAdminMenuInventoryRestaurant(
	rows []adminMenuInventoryRestaurant,
	recordID string,
) (adminMenuInventoryRestaurant, bool) {
	for _, row := range rows {
		if row.ID == recordID {
			return row, true
		}
	}

	return adminMenuInventoryRestaurant{}, false
}

func adminMenuInventoryItemIDs(rows []adminMenuInventoryMenuItem) map[string]bool {
	ids := make(map[string]bool, len(rows))
	for _, row := range rows {
		ids[row.ID] = true
	}
	return ids
}

func loadAdminRestaurantInventoryDetailResponse(
	t *testing.T,
	server *preparedServer,
	adminToken string,
	restaurantID string,
) adminRestaurantInventoryDetailResponse {
	t.Helper()

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/admin/menu-inventory/restaurants/"+restaurantID,
		adminToken,
		"",
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	payload := adminRestaurantInventoryDetailResponse{}
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to decode restaurant detail response: %v", err)
	}

	return payload
}

func TestAdminMenuInventoryRejectsNonAdmin(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterAdminMenuInventoryHandlers(se, app)
	})

	_, userToken := createAuthUser(t, server.app, false, false)

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/admin/menu-inventory?type=restaurants",
		userToken,
		"",
	)

	if response.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", response.Code, response.Body.String())
	}
}

func TestAdminMenuInventoryListsRestaurantsWithCountsAndCreator(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterAdminMenuInventoryHandlers(se, app)
	})

	_, adminToken := createAuthUser(t, server.app, true, false)
	creator, _ := createAuthUser(t, server.app, false, false)
	creator.Set("email", "creator.inventory@example.com")
	creator.Set("name", "Inventory Creator")
	if err := server.app.Save(creator); err != nil {
		t.Fatalf("failed to update creator: %v", err)
	}

	createdRestaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":                "Creator Cafe",
		"location":            "Oakland, CA",
		"cuisineType":         "Cafe",
		"createdBy":           creator.Id,
		"visibility":          "public",
		"isGooglePlace":       true,
		"placeId":             "google-creator-cafe",
		"googlePlaceCachedAt": "2026-04-01 12:00:00.000Z",
	})
	uncownedRestaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Unowned Cache",
		"location":   "San Jose, CA",
		"visibility": "public",
	})

	createCollectionRecord(t, server.app, "menu_items", map[string]any{
		"name":       "Inventory Latte",
		"restaurant": createdRestaurant.Id,
		"createdBy":  creator.Id,
		"visibility": "public",
	})
	createCollectionRecord(t, server.app, "menu_items", map[string]any{
		"name":       "Inventory Toast",
		"restaurant": createdRestaurant.Id,
		"createdBy":  creator.Id,
		"visibility": "public",
	})
	insertMenuImageRowRaw(t, server.app, createdRestaurant.Id, creator.Id)

	payload := loadAdminMenuInventoryResponse[adminMenuInventoryRestaurant](
		t,
		server,
		adminToken,
		"/api/admin/menu-inventory?type=restaurants&perPage=100",
	)

	if payload.Type != "restaurants" {
		t.Fatalf("expected restaurants type, got %q", payload.Type)
	}

	createdRow, ok := findAdminMenuInventoryRestaurant(payload.Items, createdRestaurant.Id)
	if !ok {
		t.Fatalf("expected created restaurant %s in response", createdRestaurant.Id)
	}
	if createdRow.Creator == nil || createdRow.Creator.Email != "creator.inventory@example.com" {
		t.Fatalf("expected creator summary, got %#v", createdRow.Creator)
	}
	if createdRow.MenuItemCount != 2 {
		t.Fatalf("expected 2 menu items, got %d", createdRow.MenuItemCount)
	}
	if createdRow.MenuImageCount != 1 {
		t.Fatalf("expected 1 menu image, got %d", createdRow.MenuImageCount)
	}
	if !createdRow.IsGooglePlace || createdRow.PlaceID != "google-creator-cafe" {
		t.Fatalf("expected Google cache metadata, got %#v", createdRow)
	}

	unownedRow, ok := findAdminMenuInventoryRestaurant(payload.Items, uncownedRestaurant.Id)
	if !ok {
		t.Fatalf("expected unowned restaurant %s in response", uncownedRestaurant.Id)
	}
	if unownedRow.Creator != nil {
		t.Fatalf("expected nil creator for unowned restaurant, got %#v", unownedRow.Creator)
	}
}

func TestAdminMenuInventoryListsMenuItemsWithCreatorAndRestaurant(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterAdminMenuInventoryHandlers(se, app)
	})

	_, adminToken := createAuthUser(t, server.app, true, false)
	creator, _ := createAuthUser(t, server.app, false, false)
	creator.Set("email", "menu.creator@example.com")
	if err := server.app.Save(creator); err != nil {
		t.Fatalf("failed to update creator: %v", err)
	}

	restaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Menu Item Diner",
		"location":   "Berkeley, CA",
		"createdBy":  creator.Id,
		"visibility": "public",
	})
	imageID := insertMenuImageRowRaw(t, server.app, restaurant.Id, creator.Id)
	menuItem := createCollectionRecord(t, server.app, "menu_items", map[string]any{
		"name":        "OCR Pancakes",
		"restaurant":  restaurant.Id,
		"sourceImage": imageID,
		"createdBy":   creator.Id,
		"visibility":  "friends",
		"isFromOCR":   true,
	})

	payload := loadAdminMenuInventoryResponse[adminMenuInventoryMenuItem](
		t,
		server,
		adminToken,
		"/api/admin/menu-inventory?type=menu-items&search=ocr%20pancakes",
	)

	if payload.TotalItems != 1 {
		t.Fatalf("expected one matching menu item, got %d", payload.TotalItems)
	}

	row := payload.Items[0]
	if row.ID != menuItem.Id || row.Name != "OCR Pancakes" {
		t.Fatalf("unexpected menu item row: %#v", row)
	}
	if row.Creator == nil || row.Creator.Email != "menu.creator@example.com" {
		t.Fatalf("expected creator summary, got %#v", row.Creator)
	}
	if row.Restaurant != restaurant.Id || row.RestaurantName != "Menu Item Diner" || row.RestaurantLocation != "Berkeley, CA" {
		t.Fatalf("expected restaurant context, got %#v", row)
	}
	if row.SourceImage != imageID || row.SourceImageFile != "menu-image.jpg" {
		t.Fatalf("expected source image context, got %#v", row)
	}
	if !row.IsFromOCR {
		t.Fatalf("expected OCR flag")
	}
}

func TestAdminMenuInventoryListsMenuImagesWithUploaderAndRestaurant(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterAdminMenuInventoryHandlers(se, app)
	})

	_, adminToken := createAuthUser(t, server.app, true, false)
	uploader, _ := createAuthUser(t, server.app, false, false)
	uploader.Set("email", "photo.uploader@example.com")
	if err := server.app.Save(uploader); err != nil {
		t.Fatalf("failed to update uploader: %v", err)
	}

	restaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Photo Ramen",
		"location":   "San Francisco, CA",
		"createdBy":  uploader.Id,
		"visibility": "public",
	})
	imageID := insertMenuImageRowRaw(t, server.app, restaurant.Id, uploader.Id)

	payload := loadAdminMenuInventoryResponse[adminMenuInventoryMenuImage](
		t,
		server,
		adminToken,
		"/api/admin/menu-inventory?type=menu-images&search=photo%20ramen",
	)

	if payload.TotalItems != 1 {
		t.Fatalf("expected one matching menu image, got %d", payload.TotalItems)
	}

	row := payload.Items[0]
	if row.ID != imageID || row.Image != "menu-image.jpg" {
		t.Fatalf("unexpected menu image row: %#v", row)
	}
	if row.Uploader == nil || row.Uploader.Email != "photo.uploader@example.com" {
		t.Fatalf("expected uploader summary, got %#v", row.Uploader)
	}
	if row.Restaurant != restaurant.Id || row.RestaurantName != "Photo Ramen" {
		t.Fatalf("expected restaurant context, got %#v", row)
	}
}

func TestAdminMenuInventoryPaginatesResults(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterAdminMenuInventoryHandlers(se, app)
	})

	_, adminToken := createAuthUser(t, server.app, true, false)
	creator, _ := createAuthUser(t, server.app, false, false)

	for _, name := range []string{"Page Test A", "Page Test B", "Page Test C"} {
		createCollectionRecord(t, server.app, "restaurants", map[string]any{
			"name":       name,
			"location":   "Pagination City",
			"createdBy":  creator.Id,
			"visibility": "public",
		})
	}

	payload := loadAdminMenuInventoryResponse[adminMenuInventoryRestaurant](
		t,
		server,
		adminToken,
		"/api/admin/menu-inventory?type=restaurants&search=page%20test&perPage=2&page=2",
	)

	if payload.Page != 2 || payload.PerPage != 2 || payload.TotalItems != 3 || payload.TotalPages != 2 {
		t.Fatalf("unexpected pagination metadata: %#v", payload)
	}
	if len(payload.Items) != 1 {
		t.Fatalf("expected second page to contain 1 item, got %d", len(payload.Items))
	}
}

func TestAdminMenuInventoryRejectsInvalidType(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterAdminMenuInventoryHandlers(se, app)
	})

	_, adminToken := createAuthUser(t, server.app, true, false)

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/admin/menu-inventory?type="+strings.ReplaceAll("not supported", " ", "%20"),
		adminToken,
		"",
	)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", response.Code, response.Body.String())
	}
}

func TestAdminMenuInventoryRestaurantDetailRejectsNonAdmin(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterAdminMenuInventoryHandlers(se, app)
	})

	owner, userToken := createAuthUser(t, server.app, false, false)
	restaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Private Detail",
		"location":   "San Francisco, CA",
		"createdBy":  owner.Id,
		"visibility": "public",
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/admin/menu-inventory/restaurants/"+restaurant.Id,
		userToken,
		"",
	)

	if response.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", response.Code, response.Body.String())
	}
}

func TestAdminMenuInventoryCreatesRestaurantGroupAndAssignsRestaurant(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterAdminMenuInventoryHandlers(se, app)
	})

	admin, adminToken := createAuthUser(t, server.app, true, false)
	creator, _ := createAuthUser(t, server.app, false, false)
	restaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Group Detail Cafe",
		"location":   "San Francisco, CA",
		"createdBy":  creator.Id,
		"visibility": "public",
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/admin/menu-inventory/restaurant-groups",
		adminToken,
		`{"name":"Group Detail Cafe Bay Area","notes":"Confirmed by admin.","restaurantId":"`+restaurant.Id+`"}`,
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	payload := adminRestaurantGroupCreateResponse{}
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to decode group create response: %v", err)
	}

	if payload.RestaurantGroup.ID == "" || payload.RestaurantGroup.Name != "Group Detail Cafe Bay Area" {
		t.Fatalf("expected created restaurant group, got %#v", payload.RestaurantGroup)
	}
	if payload.RestaurantGroup.CreatedBy != admin.Id {
		t.Fatalf("expected createdBy admin %q, got %#v", admin.Id, payload.RestaurantGroup)
	}
	if payload.RestaurantDetail == nil || payload.RestaurantDetail.Restaurant.RestaurantGroupID != payload.RestaurantGroup.ID {
		t.Fatalf("expected restaurant detail assignment, got %#v", payload.RestaurantDetail)
	}

	detail := loadAdminRestaurantInventoryDetailResponse(t, server, adminToken, restaurant.Id)
	if detail.RestaurantGroup == nil || detail.RestaurantGroup.ID != payload.RestaurantGroup.ID {
		t.Fatalf("expected current group on detail, got %#v", detail.RestaurantGroup)
	}
	if detail.Restaurant.RestaurantGroup == nil || detail.Restaurant.RestaurantGroup.Name != "Group Detail Cafe Bay Area" {
		t.Fatalf("expected serialized group on restaurant row, got %#v", detail.Restaurant)
	}
}

func TestAdminMenuInventoryAssignsUnassignsAndKeepsOneRestaurantGroup(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterAdminMenuInventoryHandlers(se, app)
	})

	admin, adminToken := createAuthUser(t, server.app, true, false)
	creator, _ := createAuthUser(t, server.app, false, false)
	restaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Membership Diner",
		"location":   "Oakland, CA",
		"createdBy":  creator.Id,
		"visibility": "public",
	})
	firstGroup := createCollectionRecord(t, server.app, "restaurant_groups", map[string]any{
		"name":      "Membership Diner North",
		"createdBy": admin.Id,
	})
	secondGroup := createCollectionRecord(t, server.app, "restaurant_groups", map[string]any{
		"name":      "Membership Diner West",
		"createdBy": admin.Id,
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/admin/menu-inventory/restaurants/"+restaurant.Id+"/restaurant-group",
		adminToken,
		`{"groupId":"`+firstGroup.Id+`"}`,
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected first assignment 200, got %d: %s", response.Code, response.Body.String())
	}

	firstDetail := adminRestaurantInventoryDetailResponse{}
	if err := json.Unmarshal(response.Body.Bytes(), &firstDetail); err != nil {
		t.Fatalf("failed to decode first membership response: %v", err)
	}
	if firstDetail.RestaurantGroup == nil || firstDetail.RestaurantGroup.ID != firstGroup.Id {
		t.Fatalf("expected first group assignment, got %#v", firstDetail.RestaurantGroup)
	}

	response = performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/admin/menu-inventory/restaurants/"+restaurant.Id+"/restaurant-group",
		adminToken,
		`{"groupId":"`+secondGroup.Id+`"}`,
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected replacement assignment 200, got %d: %s", response.Code, response.Body.String())
	}

	secondDetail := adminRestaurantInventoryDetailResponse{}
	if err := json.Unmarshal(response.Body.Bytes(), &secondDetail); err != nil {
		t.Fatalf("failed to decode second membership response: %v", err)
	}
	if secondDetail.RestaurantGroup == nil || secondDetail.RestaurantGroup.ID != secondGroup.Id {
		t.Fatalf("expected second group assignment, got %#v", secondDetail.RestaurantGroup)
	}
	if secondDetail.Restaurant.RestaurantGroupID == firstGroup.Id {
		t.Fatalf("expected zero-or-one membership replacement, got %#v", secondDetail.Restaurant)
	}

	response = performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/admin/menu-inventory/restaurants/"+restaurant.Id+"/restaurant-group",
		adminToken,
		`{"groupId":""}`,
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected unassignment 200, got %d: %s", response.Code, response.Body.String())
	}

	unassignedDetail := adminRestaurantInventoryDetailResponse{}
	if err := json.Unmarshal(response.Body.Bytes(), &unassignedDetail); err != nil {
		t.Fatalf("failed to decode unassignment response: %v", err)
	}
	if unassignedDetail.RestaurantGroup != nil || unassignedDetail.Restaurant.RestaurantGroupID != "" {
		t.Fatalf("expected restaurant to be unassigned, got %#v", unassignedDetail.Restaurant)
	}
}

func TestAdminMenuInventoryUpdatesRestaurantGroupMetadata(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterAdminMenuInventoryHandlers(se, app)
	})

	admin, adminToken := createAuthUser(t, server.app, true, false)
	creator, _ := createAuthUser(t, server.app, false, false)
	group := createCollectionRecord(t, server.app, "restaurant_groups", map[string]any{
		"name":      "Original Group Name",
		"notes":     "Original notes",
		"createdBy": admin.Id,
	})
	restaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":            "Metadata Cafe",
		"location":        "Oakland, CA",
		"createdBy":       creator.Id,
		"visibility":      "public",
		"restaurantGroup": group.Id,
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPatch,
		"/api/admin/menu-inventory/restaurant-groups/"+group.Id,
		adminToken,
		`{"name":"Updated Group Name","notes":"Updated notes"}`,
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected metadata update 200, got %d: %s", response.Code, response.Body.String())
	}

	updatedGroup := adminRestaurantGroup{}
	if err := json.Unmarshal(response.Body.Bytes(), &updatedGroup); err != nil {
		t.Fatalf("failed to decode group metadata response: %v", err)
	}
	if updatedGroup.ID != group.Id || updatedGroup.Name != "Updated Group Name" || updatedGroup.Notes != "Updated notes" {
		t.Fatalf("expected updated group metadata, got %#v", updatedGroup)
	}

	detail := loadAdminRestaurantInventoryDetailResponse(t, server, adminToken, restaurant.Id)
	if detail.RestaurantGroup == nil || detail.RestaurantGroup.Name != "Updated Group Name" || detail.RestaurantGroup.Notes != "Updated notes" {
		t.Fatalf("expected updated metadata on restaurant detail, got %#v", detail.RestaurantGroup)
	}

	blankResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPatch,
		"/api/admin/menu-inventory/restaurant-groups/"+group.Id,
		adminToken,
		`{"name":"   ","notes":"Ignored"}`,
	)
	if blankResponse.Code != http.StatusBadRequest {
		t.Fatalf("expected blank name 400, got %d: %s", blankResponse.Code, blankResponse.Body.String())
	}
}

func TestAdminMenuInventoryRestaurantDetailIncludesSameNameCandidates(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterAdminMenuInventoryHandlers(se, app)
	})

	admin, adminToken := createAuthUser(t, server.app, true, false)
	creator, _ := createAuthUser(t, server.app, false, false)
	group := createCollectionRecord(t, server.app, "restaurant_groups", map[string]any{
		"name":      "Candidate Cafe Group",
		"createdBy": admin.Id,
	})
	restaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":            "Candidate Cafe",
		"location":        "San Francisco, CA",
		"createdBy":       creator.Id,
		"visibility":      "public",
		"restaurantGroup": group.Id,
	})
	sameName := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       " candidate cafe ",
		"location":   "Oakland, CA",
		"createdBy":  creator.Id,
		"visibility": "public",
	})
	otherName := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Candidate Cafe Express",
		"location":   "Oakland, CA",
		"createdBy":  creator.Id,
		"visibility": "public",
	})

	detail := loadAdminRestaurantInventoryDetailResponse(t, server, adminToken, restaurant.Id)
	if len(detail.SameNameCandidates) != 1 {
		t.Fatalf("expected one same-name candidate, got %#v", detail.SameNameCandidates)
	}
	if detail.SameNameCandidates[0].ID != sameName.Id {
		t.Fatalf("expected same-name candidate %s, got %#v", sameName.Id, detail.SameNameCandidates)
	}
	if detail.SameNameCandidates[0].ID == restaurant.Id || detail.SameNameCandidates[0].ID == otherName.Id {
		t.Fatalf("candidate list included selected or non-exact name restaurant: %#v", detail.SameNameCandidates)
	}
}

func TestAdminMenuInventoryRestaurantGroupWritesRejectNonAdmin(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterAdminMenuInventoryHandlers(se, app)
	})

	admin, _ := createAuthUser(t, server.app, true, false)
	user, userToken := createAuthUser(t, server.app, false, false)
	restaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Non Admin Grouping",
		"location":   "San Jose, CA",
		"createdBy":  user.Id,
		"visibility": "public",
	})
	group := createCollectionRecord(t, server.app, "restaurant_groups", map[string]any{
		"name":      "Existing Admin Group",
		"createdBy": admin.Id,
	})

	createResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/admin/menu-inventory/restaurant-groups",
		userToken,
		`{"name":"Forbidden Group","restaurantId":"`+restaurant.Id+`"}`,
	)
	if createResponse.Code != http.StatusForbidden {
		t.Fatalf("expected group create 403, got %d: %s", createResponse.Code, createResponse.Body.String())
	}

	updateResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPatch,
		"/api/admin/menu-inventory/restaurant-groups/"+group.Id,
		userToken,
		`{"name":"Forbidden Update","notes":"Nope"}`,
	)
	if updateResponse.Code != http.StatusForbidden {
		t.Fatalf("expected group update 403, got %d: %s", updateResponse.Code, updateResponse.Body.String())
	}

	assignResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/admin/menu-inventory/restaurants/"+restaurant.Id+"/restaurant-group",
		userToken,
		`{"groupId":"`+group.Id+`"}`,
	)
	if assignResponse.Code != http.StatusForbidden {
		t.Fatalf("expected group assignment 403, got %d: %s", assignResponse.Code, assignResponse.Body.String())
	}
}

func TestAdminMenuInventoryMenuImageDetailRejectsNonAdmin(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterAdminMenuInventoryHandlers(se, app)
	})

	owner, userToken := createAuthUser(t, server.app, false, false)
	restaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Photo Detail Private",
		"location":   "San Francisco, CA",
		"createdBy":  owner.Id,
		"visibility": "public",
	})
	imageID := insertMenuImageRowRaw(t, server.app, restaurant.Id, owner.Id)

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/admin/menu-inventory/menu-images/"+imageID,
		userToken,
		"",
	)

	if response.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", response.Code, response.Body.String())
	}
}

func TestAdminMenuInventoryMenuImageDetailIncludesAttachedAndUnattachedItems(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterAdminMenuInventoryHandlers(se, app)
	})

	_, adminToken := createAuthUser(t, server.app, true, false)
	creator, _ := createAuthUser(t, server.app, false, false)
	creator.Set("email", "image.detail@example.com")
	creator.Set("name", "Image Detail Creator")
	if err := server.app.Save(creator); err != nil {
		t.Fatalf("failed to update creator: %v", err)
	}

	otherCreator, _ := createAuthUser(t, server.app, false, false)
	otherCreator.Set("email", "image.other@example.com")
	if err := server.app.Save(otherCreator); err != nil {
		t.Fatalf("failed to update other creator: %v", err)
	}

	restaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":        "Photo Detail Noodles",
		"location":    "Oakland, CA",
		"createdBy":   creator.Id,
		"visibility":  "public",
		"cuisineType": "Noodles",
	})
	otherRestaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Other Photo Detail",
		"location":   "Seattle, WA",
		"createdBy":  otherCreator.Id,
		"visibility": "public",
	})

	imageID := insertMenuImageRowRaw(t, server.app, restaurant.Id, creator.Id)
	otherSameRestaurantImageID := insertMenuImageRowRaw(t, server.app, restaurant.Id, creator.Id)
	otherRestaurantImageID := insertMenuImageRowRaw(t, server.app, otherRestaurant.Id, otherCreator.Id)

	attachedItem := createCollectionRecord(t, server.app, "menu_items", map[string]any{
		"name":        "Attached Ramen",
		"restaurant":  restaurant.Id,
		"sourceImage": imageID,
		"createdBy":   creator.Id,
		"visibility":  "friends",
		"isFromOCR":   true,
	})
	unattachedItem := createCollectionRecord(t, server.app, "menu_items", map[string]any{
		"name":       "Manual Bao",
		"restaurant": restaurant.Id,
		"createdBy":  creator.Id,
		"visibility": "public",
	})
	differentImageItem := createCollectionRecord(t, server.app, "menu_items", map[string]any{
		"name":        "Other Photo Soup",
		"restaurant":  restaurant.Id,
		"sourceImage": otherSameRestaurantImageID,
		"createdBy":   creator.Id,
		"visibility":  "friends",
		"isFromOCR":   true,
	})
	otherRestaurantItem := createCollectionRecord(t, server.app, "menu_items", map[string]any{
		"name":        "Other Restaurant Item",
		"restaurant":  otherRestaurant.Id,
		"sourceImage": otherRestaurantImageID,
		"createdBy":   otherCreator.Id,
		"visibility":  "public",
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/admin/menu-inventory/menu-images/"+imageID,
		adminToken,
		"",
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	payload := adminMenuImageInventoryDetailResponse{}
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to decode menu image detail response: %v", err)
	}

	if payload.MenuImage.ID != imageID || payload.MenuImage.Image != "menu-image.jpg" {
		t.Fatalf("unexpected menu image detail: %#v", payload.MenuImage)
	}
	if payload.MenuImage.Uploader == nil || payload.MenuImage.Uploader.Email != "image.detail@example.com" {
		t.Fatalf("expected uploader summary, got %#v", payload.MenuImage.Uploader)
	}
	if payload.Restaurant == nil || payload.Restaurant.ID != restaurant.Id || payload.Restaurant.Name != "Photo Detail Noodles" {
		t.Fatalf("expected restaurant summary, got %#v", payload.Restaurant)
	}

	attachedIDs := adminMenuInventoryItemIDs(payload.AttachedMenuItems)
	if len(attachedIDs) != 1 || !attachedIDs[attachedItem.Id] {
		t.Fatalf("expected only attached item %s, got %#v", attachedItem.Id, attachedIDs)
	}
	if attachedIDs[unattachedItem.Id] || attachedIDs[differentImageItem.Id] || attachedIDs[otherRestaurantItem.Id] {
		t.Fatalf("attached item response leaked unrelated ids: %#v", attachedIDs)
	}

	unattachedIDs := adminMenuInventoryItemIDs(payload.UnattachedRestaurantMenuItems)
	if len(unattachedIDs) != 2 || !unattachedIDs[unattachedItem.Id] || !unattachedIDs[differentImageItem.Id] {
		t.Fatalf("expected same-restaurant unattached items, got %#v", unattachedIDs)
	}
	if unattachedIDs[attachedItem.Id] || unattachedIDs[otherRestaurantItem.Id] {
		t.Fatalf("unattached item response leaked attached or other restaurant ids: %#v", unattachedIDs)
	}
}

func TestAdminMenuInventoryMenuImageDetailReturnsNotFound(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterAdminMenuInventoryHandlers(se, app)
	})

	_, adminToken := createAuthUser(t, server.app, true, false)

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/admin/menu-inventory/menu-images/missingimage",
		adminToken,
		"",
	)

	if response.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", response.Code, response.Body.String())
	}
}

func TestAdminMenuInventoryRestaurantDetailIncludesOnlySelectedRestaurantData(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterAdminMenuInventoryHandlers(se, app)
	})

	_, adminToken := createAuthUser(t, server.app, true, false)
	creator, _ := createAuthUser(t, server.app, false, false)
	creator.Set("email", "detail.creator@example.com")
	creator.Set("name", "Detail Creator")
	if err := server.app.Save(creator); err != nil {
		t.Fatalf("failed to update creator: %v", err)
	}

	otherCreator, _ := createAuthUser(t, server.app, false, false)
	otherCreator.Set("email", "other.detail@example.com")
	if err := server.app.Save(otherCreator); err != nil {
		t.Fatalf("failed to update other creator: %v", err)
	}

	restaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":                "Detail Noodles",
		"location":            "Los Angeles, CA",
		"cuisineType":         "Noodles",
		"createdBy":           creator.Id,
		"visibility":          "friends",
		"isGooglePlace":       true,
		"placeId":             "detail-place-id",
		"googlePlaceCachedAt": "2026-04-02 09:30:00.000Z",
	})
	otherRestaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Other Detail",
		"location":   "Seattle, WA",
		"createdBy":  otherCreator.Id,
		"visibility": "public",
	})

	sourceImageID := insertMenuImageRowRaw(t, server.app, restaurant.Id, creator.Id)
	otherImageID := insertMenuImageRowRaw(t, server.app, otherRestaurant.Id, otherCreator.Id)

	firstItem := createCollectionRecord(t, server.app, "menu_items", map[string]any{
		"name":        "Detail Broth",
		"restaurant":  restaurant.Id,
		"sourceImage": sourceImageID,
		"createdBy":   creator.Id,
		"visibility":  "friends",
		"isFromOCR":   true,
	})
	secondItem := createCollectionRecord(t, server.app, "menu_items", map[string]any{
		"name":       "Detail Bao",
		"restaurant": restaurant.Id,
		"createdBy":  creator.Id,
		"visibility": "public",
	})
	createCollectionRecord(t, server.app, "menu_items", map[string]any{
		"name":        "Other Item",
		"restaurant":  otherRestaurant.Id,
		"sourceImage": otherImageID,
		"createdBy":   otherCreator.Id,
		"visibility":  "public",
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/admin/menu-inventory/restaurants/"+restaurant.Id,
		adminToken,
		"",
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	payload := adminRestaurantInventoryDetailResponse{}
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to decode restaurant detail response: %v", err)
	}

	if payload.Restaurant.ID != restaurant.Id || payload.Restaurant.Name != "Detail Noodles" {
		t.Fatalf("unexpected restaurant detail: %#v", payload.Restaurant)
	}
	if payload.Restaurant.Creator == nil || payload.Restaurant.Creator.Email != "detail.creator@example.com" {
		t.Fatalf("expected restaurant creator summary, got %#v", payload.Restaurant.Creator)
	}
	if payload.Restaurant.MenuItemCount != 2 || payload.Restaurant.MenuImageCount != 1 {
		t.Fatalf("expected selected restaurant counts, got %#v", payload.Restaurant)
	}
	if !payload.Restaurant.IsGooglePlace || payload.Restaurant.PlaceID != "detail-place-id" {
		t.Fatalf("expected cache metadata, got %#v", payload.Restaurant)
	}

	if len(payload.MenuItems) != 2 {
		t.Fatalf("expected 2 selected restaurant menu items, got %d: %#v", len(payload.MenuItems), payload.MenuItems)
	}
	itemIDs := map[string]bool{}
	for _, item := range payload.MenuItems {
		itemIDs[item.ID] = true
		if item.Restaurant != restaurant.Id || item.RestaurantName != "Detail Noodles" {
			t.Fatalf("expected menu item restaurant context, got %#v", item)
		}
		if item.Creator == nil || item.Creator.Email != "detail.creator@example.com" {
			t.Fatalf("expected menu item creator context, got %#v", item)
		}
	}
	if !itemIDs[firstItem.Id] || !itemIDs[secondItem.Id] {
		t.Fatalf("expected selected restaurant item ids, got %#v", itemIDs)
	}

	if len(payload.MenuImages) != 1 {
		t.Fatalf("expected 1 selected restaurant menu image, got %d: %#v", len(payload.MenuImages), payload.MenuImages)
	}
	image := payload.MenuImages[0]
	if image.ID != sourceImageID || image.ID == otherImageID {
		t.Fatalf("expected selected restaurant image, got %#v", image)
	}
	if image.Uploader == nil || image.Uploader.Email != "detail.creator@example.com" {
		t.Fatalf("expected image uploader context, got %#v", image.Uploader)
	}
	if image.Restaurant != restaurant.Id || image.RestaurantName != "Detail Noodles" {
		t.Fatalf("expected image restaurant context, got %#v", image)
	}
}

func TestAdminMenuInventoryRestaurantDetailReturnsNotFound(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterAdminMenuInventoryHandlers(se, app)
	})

	_, adminToken := createAuthUser(t, server.app, true, false)

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodGet,
		"/api/admin/menu-inventory/restaurants/missingrestaurant",
		adminToken,
		"",
	)

	if response.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", response.Code, response.Body.String())
	}
}
