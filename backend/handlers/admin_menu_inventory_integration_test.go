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
	Visibility          string                  `json:"visibility"`
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
	MenuImages []adminMenuInventoryMenuImage `json:"menuImages"`
	MenuItems  []adminMenuInventoryMenuItem  `json:"menuItems"`
	Restaurant adminMenuInventoryRestaurant  `json:"restaurant"`
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
