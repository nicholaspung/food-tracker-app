package handlers_test

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"

	"myapp/handlers"
	"myapp/lib"
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
	ApprovalReviewedAt string                  `json:"approvalReviewedAt"`
	ApprovalReviewedBy string                  `json:"approvalReviewedBy"`
	ApprovalStatus     string                  `json:"approvalStatus"`
	CreatedBy          string                  `json:"createdBy"`
	Creator            *adminMenuInventoryUser `json:"creator"`
	GroupSuitable      bool                    `json:"groupSuitable"`
	ID                 string                  `json:"id"`
	IsFromOCR          bool                    `json:"isFromOcr"`
	Name               string                  `json:"name"`
	PromotedFrom       string                  `json:"promotedFrom"`
	PromotedFromItem   *adminLinkedMenuItem    `json:"promotedFromItem"`
	PromotedTo         string                  `json:"promotedTo"`
	PromotedToItem     *adminLinkedMenuItem    `json:"promotedToItem"`
	Restaurant         string                  `json:"restaurant"`
	RestaurantName     string                  `json:"restaurantName"`
	RestaurantLocation string                  `json:"restaurantLocation"`
	SourceImage        string                  `json:"sourceImage"`
	SourceImageFile    string                  `json:"sourceImageFile"`
	Visibility         string                  `json:"visibility"`
}

type adminLinkedMenuItem struct {
	ApprovalStatus string `json:"approvalStatus"`
	CreatedBy      string `json:"createdBy"`
	CreatorEmail   string `json:"creatorEmail"`
	ID             string `json:"id"`
	Name           string `json:"name"`
	Visibility     string `json:"visibility"`
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

type adminMenuItemPromotionResponse struct {
	Contribution   adminMenuInventoryMenuItem `json:"contribution"`
	MenuItem       adminMenuInventoryMenuItem `json:"menuItem"`
	ReusedExisting bool                       `json:"reusedExisting"`
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

func findAdminMenuInventoryMenuItem(
	rows []adminMenuInventoryMenuItem,
	recordID string,
) (adminMenuInventoryMenuItem, bool) {
	for _, row := range rows {
		if row.ID == recordID {
			return row, true
		}
	}

	return adminMenuInventoryMenuItem{}, false
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

func TestAdminMenuItemApprovalTransitions(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterAdminMenuInventoryHandlers(se, app)
		handlers.RegisterAdminMenuCatalogTrustHandlers(se, app)
	})

	admin, adminToken := createAuthUser(t, server.app, true, false)
	creator, _ := createAuthUser(t, server.app, false, false)
	restaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Approval Cafe",
		"location":   "San Francisco, CA",
		"createdBy":  creator.Id,
		"visibility": "public",
	})
	menuItem := createCollectionRecord(t, server.app, "menu_items", map[string]any{
		"name":           "Approval Toast",
		"restaurant":     restaurant.Id,
		"createdBy":      creator.Id,
		"visibility":     "friends",
		"approvalStatus": "unreviewed",
	})

	for _, step := range []struct {
		body           string
		expectedStatus string
	}{
		{body: `{"status":"approved"}`, expectedStatus: "approved"},
		{body: `{"status":"rejected"}`, expectedStatus: "rejected"},
		{body: `{"status":"unreviewed"}`, expectedStatus: "unreviewed"},
	} {
		response := performJSONRequest(
			t,
			server.mux,
			http.MethodPatch,
			"/api/admin/menu-items/"+menuItem.Id+"/approval",
			adminToken,
			step.body,
		)
		if response.Code != http.StatusOK {
			t.Fatalf("expected 200 for %s, got %d: %s", step.expectedStatus, response.Code, response.Body.String())
		}

		payload := adminMenuInventoryMenuItem{}
		if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
			t.Fatalf("failed to decode approval payload: %v", err)
		}
		if payload.ApprovalStatus != step.expectedStatus {
			t.Fatalf("expected status %q, got %#v", step.expectedStatus, payload)
		}

		reloaded, err := server.app.FindRecordById("menu_items", menuItem.Id)
		if err != nil {
			t.Fatalf("failed to reload menu item: %v", err)
		}
		if got := reloaded.GetString("approvalStatus"); got != step.expectedStatus {
			t.Fatalf("expected stored status %q, got %q", step.expectedStatus, got)
		}
		if step.expectedStatus == "unreviewed" {
			if got := reloaded.GetString("approvalReviewedBy"); got != "" {
				t.Fatalf("expected review admin to be cleared, got %q", got)
			}
			continue
		}
		if got := reloaded.GetString("approvalReviewedBy"); got != admin.Id {
			t.Fatalf("expected reviewedBy=%s, got %s", admin.Id, got)
		}
		if got := reloaded.GetString("approvalReviewedAt"); got == "" {
			t.Fatalf("expected reviewedAt to be set")
		}
	}

	auditLogs, err := server.app.FindRecordsByFilter(
		lib.AuditLogsCollectionName,
		"action = {:action} && targetCollection = {:collection} && targetRecordId = {:targetRecordId}",
		"-created",
		10,
		0,
		map[string]any{
			"action":         core.ModelEventTypeUpdate,
			"collection":     "menu_items",
			"targetRecordId": menuItem.Id,
		},
	)
	if err != nil {
		t.Fatalf("failed to load menu item approval audit logs: %v", err)
	}
	if len(auditLogs) != 3 {
		t.Fatalf("expected 3 approval audit logs, got %d", len(auditLogs))
	}
	auditedStatuses := map[string]bool{}
	for _, auditLog := range auditLogs {
		metadataMap := parseAuditMetadata(t, auditLog.Get("metadataJson"))
		if metadataMap["source"] != "admin_menu_item_approval" {
			t.Fatalf("unexpected approval audit metadata: %#v", metadataMap)
		}
		if status, ok := metadataMap["approvalStatus"].(string); ok {
			auditedStatuses[status] = true
		}
	}
	for _, expectedStatus := range []string{"approved", "rejected", "unreviewed"} {
		if !auditedStatuses[expectedStatus] {
			t.Fatalf("expected audit status %q in %#v", expectedStatus, auditedStatuses)
		}
	}
}

func TestAdminMenuItemGroupSuitableTransitions(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterAdminMenuInventoryHandlers(se, app)
		handlers.RegisterAdminMenuCatalogTrustHandlers(se, app)
	})

	admin, adminToken := createAuthUser(t, server.app, true, false)
	creator, _ := createAuthUser(t, server.app, false, false)
	restaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Group Suitable Cafe",
		"location":   "Berkeley, CA",
		"createdBy":  creator.Id,
		"visibility": "public",
	})
	menuItem := createCollectionRecord(t, server.app, "menu_items", map[string]any{
		"name":           "Shared Pancakes",
		"restaurant":     restaurant.Id,
		"createdBy":      admin.Id,
		"visibility":     "public",
		"approvalStatus": "approved",
		"groupSuitable":  false,
	})

	enableResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPatch,
		"/api/admin/menu-items/"+menuItem.Id+"/group-suitable",
		adminToken,
		`{"groupSuitable":true}`,
	)
	if enableResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 enabling group suitable, got %d: %s", enableResponse.Code, enableResponse.Body.String())
	}
	enablePayload := adminMenuInventoryMenuItem{}
	if err := json.Unmarshal(enableResponse.Body.Bytes(), &enablePayload); err != nil {
		t.Fatalf("failed to decode group suitable payload: %v", err)
	}
	if !enablePayload.GroupSuitable {
		t.Fatalf("expected enabled groupSuitable response, got %#v", enablePayload)
	}
	reloaded, err := server.app.FindRecordById("menu_items", menuItem.Id)
	if err != nil {
		t.Fatalf("failed to reload menu item: %v", err)
	}
	if !reloaded.GetBool("groupSuitable") {
		t.Fatalf("expected stored groupSuitable=true")
	}

	rejectResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPatch,
		"/api/admin/menu-items/"+menuItem.Id+"/approval",
		adminToken,
		`{"status":"rejected"}`,
	)
	if rejectResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 rejecting item, got %d: %s", rejectResponse.Code, rejectResponse.Body.String())
	}
	reloaded, err = server.app.FindRecordById("menu_items", menuItem.Id)
	if err != nil {
		t.Fatalf("failed to reload rejected menu item: %v", err)
	}
	if reloaded.GetBool("groupSuitable") {
		t.Fatalf("expected groupSuitable to clear when item is rejected")
	}

	invalidRejectedResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPatch,
		"/api/admin/menu-items/"+menuItem.Id+"/group-suitable",
		adminToken,
		`{"groupSuitable":true}`,
	)
	if invalidRejectedResponse.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 enabling rejected item, got %d: %s", invalidRejectedResponse.Code, invalidRejectedResponse.Body.String())
	}

	unreviewedItem := createCollectionRecord(t, server.app, "menu_items", map[string]any{
		"name":           "Unreviewed Shared Pancakes",
		"restaurant":     restaurant.Id,
		"createdBy":      creator.Id,
		"visibility":     "public",
		"approvalStatus": "unreviewed",
	})
	invalidUnreviewedResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPatch,
		"/api/admin/menu-items/"+unreviewedItem.Id+"/group-suitable",
		adminToken,
		`{"groupSuitable":true}`,
	)
	if invalidUnreviewedResponse.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 enabling unreviewed item, got %d: %s", invalidUnreviewedResponse.Code, invalidUnreviewedResponse.Body.String())
	}

	approveResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPatch,
		"/api/admin/menu-items/"+menuItem.Id+"/approval",
		adminToken,
		`{"status":"approved"}`,
	)
	if approveResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 re-approving item, got %d: %s", approveResponse.Code, approveResponse.Body.String())
	}
	enableResponse = performJSONRequest(
		t,
		server.mux,
		http.MethodPatch,
		"/api/admin/menu-items/"+menuItem.Id+"/group-suitable",
		adminToken,
		`{"groupSuitable":true}`,
	)
	if enableResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 re-enabling group suitable, got %d: %s", enableResponse.Code, enableResponse.Body.String())
	}

	updateResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPatch,
		"/api/admin/menu-items/"+menuItem.Id,
		adminToken,
		`{"name":"Shared Pancakes","visibility":"friends"}`,
	)
	if updateResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 changing visibility, got %d: %s", updateResponse.Code, updateResponse.Body.String())
	}
	reloaded, err = server.app.FindRecordById("menu_items", menuItem.Id)
	if err != nil {
		t.Fatalf("failed to reload private menu item: %v", err)
	}
	if reloaded.GetString("visibility") != "friends" {
		t.Fatalf("expected visibility=friends, got %q", reloaded.GetString("visibility"))
	}
	if reloaded.GetBool("groupSuitable") {
		t.Fatalf("expected groupSuitable to clear when item stops being public")
	}

	invalidPrivateResponse := performJSONRequest(
		t,
		server.mux,
		http.MethodPatch,
		"/api/admin/menu-items/"+menuItem.Id+"/group-suitable",
		adminToken,
		`{"groupSuitable":true}`,
	)
	if invalidPrivateResponse.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 enabling non-public item, got %d: %s", invalidPrivateResponse.Code, invalidPrivateResponse.Body.String())
	}

	auditLogs, err := server.app.FindRecordsByFilter(
		lib.AuditLogsCollectionName,
		"action = {:action} && targetCollection = {:collection} && targetRecordId = {:targetRecordId}",
		"-created",
		10,
		0,
		map[string]any{
			"action":         core.ModelEventTypeUpdate,
			"collection":     "menu_items",
			"targetRecordId": menuItem.Id,
		},
	)
	if err != nil {
		t.Fatalf("failed to load group suitable audit logs: %v", err)
	}
	foundGroupSuitableAudit := false
	for _, auditLog := range auditLogs {
		metadataMap := parseAuditMetadata(t, auditLog.Get("metadataJson"))
		if metadataMap["source"] == "admin_menu_item_group_suitable" {
			foundGroupSuitableAudit = true
			break
		}
	}
	if !foundGroupSuitableAudit {
		t.Fatalf("expected group suitable audit log in %#v", auditLogs)
	}
}

func TestAdminMenuItemPromotionCreatesApprovedPublicItemAndPreservesVisitText(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterAdminMenuInventoryHandlers(se, app)
		handlers.RegisterAdminMenuCatalogTrustHandlers(se, app)
	})

	admin, adminToken := createAuthUser(t, server.app, true, false)
	contributor, _ := createAuthUser(t, server.app, false, false)
	restaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Promotion Ramen",
		"location":   "Oakland, CA",
		"createdBy":  contributor.Id,
		"visibility": "public",
	})
	contribution := createCollectionRecord(t, server.app, "menu_items", map[string]any{
		"name":           "Spicy Miso Ramen",
		"restaurant":     restaurant.Id,
		"createdBy":      contributor.Id,
		"visibility":     "friends",
		"approvalStatus": "unreviewed",
		"isFromOCR":      true,
	})
	visit := seedVisitRecord(t, server.app, restaurant.Id, contributor.Id, "friends")
	visitItem := seedFoodItemRecord(t, server.app, visit.Id, contributor.Id, "User typed ramen text", 4)

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/admin/menu-items/"+contribution.Id+"/promote",
		adminToken,
		"",
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	payload := adminMenuItemPromotionResponse{}
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to decode promotion response: %v", err)
	}
	if payload.ReusedExisting {
		t.Fatalf("expected new approved item, got reused response %#v", payload)
	}
	if payload.MenuItem.ID == "" || payload.MenuItem.ID == contribution.Id {
		t.Fatalf("expected separate promoted menu item, got %#v", payload.MenuItem)
	}

	promoted, err := server.app.FindRecordById("menu_items", payload.MenuItem.ID)
	if err != nil {
		t.Fatalf("failed to load promoted menu item: %v", err)
	}
	if promoted.GetString("createdBy") != admin.Id {
		t.Fatalf("expected promoted item createdBy admin %s, got %s", admin.Id, promoted.GetString("createdBy"))
	}
	if promoted.GetString("visibility") != "public" {
		t.Fatalf("expected promoted item to be public, got %q", promoted.GetString("visibility"))
	}
	if promoted.GetString("approvalStatus") != "approved" {
		t.Fatalf("expected promoted item approved, got %q", promoted.GetString("approvalStatus"))
	}
	if promoted.GetString("promotedFrom") != contribution.Id {
		t.Fatalf("expected promotedFrom=%s, got %s", contribution.Id, promoted.GetString("promotedFrom"))
	}

	reloadedContribution, err := server.app.FindRecordById("menu_items", contribution.Id)
	if err != nil {
		t.Fatalf("failed to reload contribution: %v", err)
	}
	if reloadedContribution.GetString("promotedTo") != promoted.Id {
		t.Fatalf("expected contribution promotedTo=%s, got %s", promoted.Id, reloadedContribution.GetString("promotedTo"))
	}
	if reloadedContribution.GetString("visibility") != "friends" {
		t.Fatalf("expected contribution visibility to be preserved, got %q", reloadedContribution.GetString("visibility"))
	}

	detailPayload := loadAdminRestaurantInventoryDetailResponse(t, server, adminToken, restaurant.Id)
	sourceRow, ok := findAdminMenuInventoryMenuItem(detailPayload.MenuItems, contribution.Id)
	if !ok {
		t.Fatalf("expected contribution row in restaurant inventory detail")
	}
	if sourceRow.PromotedToItem == nil {
		t.Fatalf("expected contribution row to include promotedToItem summary")
	}
	if sourceRow.PromotedToItem.ID != promoted.Id ||
		sourceRow.PromotedToItem.Name != "Spicy Miso Ramen" ||
		sourceRow.PromotedToItem.Visibility != "public" ||
		sourceRow.PromotedToItem.ApprovalStatus != "approved" ||
		sourceRow.PromotedToItem.CreatedBy != admin.Id {
		t.Fatalf("unexpected promotedToItem summary: %#v", sourceRow.PromotedToItem)
	}

	promotedRow, ok := findAdminMenuInventoryMenuItem(detailPayload.MenuItems, promoted.Id)
	if !ok {
		t.Fatalf("expected promoted row in restaurant inventory detail")
	}
	if promotedRow.PromotedFromItem == nil {
		t.Fatalf("expected promoted row to include promotedFromItem summary")
	}
	if promotedRow.PromotedFromItem.ID != contribution.Id ||
		promotedRow.PromotedFromItem.Name != "Spicy Miso Ramen" ||
		promotedRow.PromotedFromItem.Visibility != "friends" ||
		promotedRow.PromotedFromItem.CreatedBy != contributor.Id {
		t.Fatalf("unexpected promotedFromItem summary: %#v", promotedRow.PromotedFromItem)
	}

	reloadedVisitItem, err := server.app.FindRecordById("food_items", visitItem.Id)
	if err != nil {
		t.Fatalf("failed to reload visit item: %v", err)
	}
	if got := reloadedVisitItem.GetString("name"); got != "User typed ramen text" {
		t.Fatalf("expected historical visit item text to be preserved, got %q", got)
	}

	promotedAuditLogs, err := server.app.FindRecordsByFilter(
		lib.AuditLogsCollectionName,
		"action = {:action} && targetCollection = {:collection} && targetRecordId = {:targetRecordId}",
		"-created",
		10,
		0,
		map[string]any{
			"action":         core.ModelEventTypeCreate,
			"collection":     "menu_items",
			"targetRecordId": promoted.Id,
		},
	)
	if err != nil {
		t.Fatalf("failed to load promoted item audit logs: %v", err)
	}
	if len(promotedAuditLogs) != 1 {
		t.Fatalf("expected promoted item create audit log, got %d", len(promotedAuditLogs))
	}
	metadataMap := parseAuditMetadata(t, promotedAuditLogs[0].Get("metadataJson"))
	if metadataMap["source"] != "admin_menu_item_promotion" || metadataMap["contributionId"] != contribution.Id {
		t.Fatalf("unexpected promoted item audit metadata: %#v", metadataMap)
	}

	contributionAuditLogs, err := server.app.FindRecordsByFilter(
		lib.AuditLogsCollectionName,
		"action = {:action} && targetCollection = {:collection} && targetRecordId = {:targetRecordId}",
		"-created",
		10,
		0,
		map[string]any{
			"action":         core.ModelEventTypeUpdate,
			"collection":     "menu_items",
			"targetRecordId": contribution.Id,
		},
	)
	if err != nil {
		t.Fatalf("failed to load contribution audit logs: %v", err)
	}
	if len(contributionAuditLogs) != 1 {
		t.Fatalf("expected contribution update audit log, got %d", len(contributionAuditLogs))
	}
	metadataMap = parseAuditMetadata(t, contributionAuditLogs[0].Get("metadataJson"))
	if metadataMap["source"] != "admin_menu_item_promotion" || metadataMap["promotedTo"] != promoted.Id {
		t.Fatalf("unexpected contribution audit metadata: %#v", metadataMap)
	}
}

func TestAdminMenuItemPromotionReusesApprovedExactLocationItemByNormalizedName(t *testing.T) {
	server := newPreparedServer(t, func(se *core.ServeEvent, app core.App) {
		handlers.RegisterAdminMenuInventoryHandlers(se, app)
		handlers.RegisterAdminMenuCatalogTrustHandlers(se, app)
	})

	admin, adminToken := createAuthUser(t, server.app, true, false)
	contributor, _ := createAuthUser(t, server.app, false, false)
	restaurant := createCollectionRecord(t, server.app, "restaurants", map[string]any{
		"name":       "Reuse Pho",
		"location":   "San Jose, CA",
		"createdBy":  contributor.Id,
		"visibility": "public",
	})
	existingApproved := createCollectionRecord(t, server.app, "menu_items", map[string]any{
		"name":           "Pho Dac Biet",
		"restaurant":     restaurant.Id,
		"createdBy":      admin.Id,
		"visibility":     "public",
		"approvalStatus": "approved",
	})
	contribution := createCollectionRecord(t, server.app, "menu_items", map[string]any{
		"name":           "  pho dac biet  ",
		"restaurant":     restaurant.Id,
		"createdBy":      contributor.Id,
		"visibility":     "friends",
		"approvalStatus": "unreviewed",
	})

	response := performJSONRequest(
		t,
		server.mux,
		http.MethodPost,
		"/api/admin/menu-items/"+contribution.Id+"/promote",
		adminToken,
		"",
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	payload := adminMenuItemPromotionResponse{}
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to decode promotion response: %v", err)
	}
	if !payload.ReusedExisting {
		t.Fatalf("expected promotion to reuse existing approved item, got %#v", payload)
	}
	if payload.MenuItem.ID != existingApproved.Id {
		t.Fatalf("expected reused item %s, got %#v", existingApproved.Id, payload.MenuItem)
	}

	if count := countRecordsByFilter(
		t,
		server.app,
		"menu_items",
		"restaurant = {:restaurantId} && approvalStatus = 'approved'",
		map[string]any{"restaurantId": restaurant.Id},
	); count != 1 {
		t.Fatalf("expected one approved exact-location item after reuse, got %d", count)
	}

	reloadedContribution, err := server.app.FindRecordById("menu_items", contribution.Id)
	if err != nil {
		t.Fatalf("failed to reload contribution: %v", err)
	}
	if reloadedContribution.GetString("promotedTo") != existingApproved.Id {
		t.Fatalf("expected contribution to link to existing approved item, got %s", reloadedContribution.GetString("promotedTo"))
	}
	if reloadedContribution.GetString("approvalStatus") != "unreviewed" {
		t.Fatalf("expected contribution approval state to remain unreviewed, got %q", reloadedContribution.GetString("approvalStatus"))
	}
}
