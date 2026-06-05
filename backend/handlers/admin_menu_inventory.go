package handlers

import (
	"database/sql"
	"errors"
	"fmt"
	"log"
	"math"
	"strconv"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

const (
	adminMenuInventoryDefaultType    = "restaurants"
	adminMenuInventoryDefaultPerPage = 50
	adminMenuInventoryMaxPerPage     = 100
)

const adminMenuInventoryLinkedMenuItemSelect = `
			COALESCE((SELECT linked.name FROM menu_items linked WHERE linked.id = menu_items.promotedFrom), '') AS [[promotedFromName]],
			COALESCE((SELECT linked.visibility FROM menu_items linked WHERE linked.id = menu_items.promotedFrom), '') AS [[promotedFromVisibility]],
			COALESCE((SELECT linked.approvalStatus FROM menu_items linked WHERE linked.id = menu_items.promotedFrom), 'unreviewed') AS [[promotedFromApprovalStatus]],
			COALESCE((SELECT linked.createdBy FROM menu_items linked WHERE linked.id = menu_items.promotedFrom), '') AS [[promotedFromCreatedBy]],
			COALESCE((SELECT linkedCreator.email FROM menu_items linked LEFT JOIN users linkedCreator ON linkedCreator.id = linked.createdBy WHERE linked.id = menu_items.promotedFrom), '') AS [[promotedFromCreatorEmail]],
			COALESCE((SELECT linked.name FROM menu_items linked WHERE linked.id = menu_items.promotedTo), '') AS [[promotedToName]],
			COALESCE((SELECT linked.visibility FROM menu_items linked WHERE linked.id = menu_items.promotedTo), '') AS [[promotedToVisibility]],
			COALESCE((SELECT linked.approvalStatus FROM menu_items linked WHERE linked.id = menu_items.promotedTo), 'unreviewed') AS [[promotedToApprovalStatus]],
			COALESCE((SELECT linked.createdBy FROM menu_items linked WHERE linked.id = menu_items.promotedTo), '') AS [[promotedToCreatedBy]],
			COALESCE((SELECT linkedCreator.email FROM menu_items linked LEFT JOIN users linkedCreator ON linkedCreator.id = linked.createdBy WHERE linked.id = menu_items.promotedTo), '') AS [[promotedToCreatorEmail]],
`

type adminMenuInventoryRestaurantRow struct {
	Created             string  `db:"created"`
	CreatedBy           string  `db:"createdBy"`
	CreatorCreated      string  `db:"creatorCreated"`
	CreatorEmail        string  `db:"creatorEmail"`
	CreatorID           string  `db:"creatorId"`
	CreatorIsAdmin      int     `db:"creatorIsAdmin"`
	CreatorIsBetaUser   int     `db:"creatorIsBetaUser"`
	CreatorIsSubscriber int     `db:"creatorIsSubscriber"`
	CreatorName         string  `db:"creatorName"`
	CreatorUpdated      string  `db:"creatorUpdated"`
	CuisineType         string  `db:"cuisineType"`
	GooglePlaceCachedAt string  `db:"googlePlaceCachedAt"`
	ID                  string  `db:"id"`
	IsGooglePlace       int     `db:"isGooglePlace"`
	Latitude            float64 `db:"latitude"`
	Location            string  `db:"location"`
	Longitude           float64 `db:"longitude"`
	MenuImageCount      int     `db:"menuImageCount"`
	MenuItemCount       int     `db:"menuItemCount"`
	Name                string  `db:"name"`
	PlaceID             string  `db:"placeId"`
	RestaurantGroup     string  `db:"restaurantGroup"`
	GroupCreated        string  `db:"groupCreated"`
	GroupCreatedBy      string  `db:"groupCreatedBy"`
	GroupID             string  `db:"groupId"`
	GroupName           string  `db:"groupName"`
	GroupNotes          string  `db:"groupNotes"`
	GroupUpdated        string  `db:"groupUpdated"`
	Updated             string  `db:"updated"`
	Visibility          string  `db:"visibility"`
}

type adminMenuInventoryMenuItemRow struct {
	ApprovalReviewedAt         string `db:"approvalReviewedAt"`
	ApprovalReviewedBy         string `db:"approvalReviewedBy"`
	ApprovalStatus             string `db:"approvalStatus"`
	Created                    string `db:"created"`
	CreatedBy                  string `db:"createdBy"`
	CreatorCreated             string `db:"creatorCreated"`
	CreatorEmail               string `db:"creatorEmail"`
	CreatorID                  string `db:"creatorId"`
	CreatorIsAdmin             int    `db:"creatorIsAdmin"`
	CreatorIsBetaUser          int    `db:"creatorIsBetaUser"`
	CreatorIsSubscriber        int    `db:"creatorIsSubscriber"`
	CreatorName                string `db:"creatorName"`
	CreatorUpdated             string `db:"creatorUpdated"`
	GroupSuitable              int    `db:"groupSuitable"`
	ID                         string `db:"id"`
	IsFromOCR                  int    `db:"isFromOcr"`
	Name                       string `db:"name"`
	PromotedFrom               string `db:"promotedFrom"`
	PromotedFromApprovalStatus string `db:"promotedFromApprovalStatus"`
	PromotedFromCreatedBy      string `db:"promotedFromCreatedBy"`
	PromotedFromCreatorEmail   string `db:"promotedFromCreatorEmail"`
	PromotedFromName           string `db:"promotedFromName"`
	PromotedFromVisibility     string `db:"promotedFromVisibility"`
	PromotedTo                 string `db:"promotedTo"`
	PromotedToApprovalStatus   string `db:"promotedToApprovalStatus"`
	PromotedToCreatedBy        string `db:"promotedToCreatedBy"`
	PromotedToCreatorEmail     string `db:"promotedToCreatorEmail"`
	PromotedToName             string `db:"promotedToName"`
	PromotedToVisibility       string `db:"promotedToVisibility"`
	Restaurant                 string `db:"restaurant"`
	RestaurantLocation         string `db:"restaurantLocation"`
	RestaurantName             string `db:"restaurantName"`
	SourceImage                string `db:"sourceImage"`
	SourceImageFile            string `db:"sourceImageFile"`
	Updated                    string `db:"updated"`
	Visibility                 string `db:"visibility"`
}

type adminMenuInventoryMenuImageRow struct {
	Created              string `db:"created"`
	ID                   string `db:"id"`
	Image                string `db:"image"`
	Restaurant           string `db:"restaurant"`
	RestaurantLocation   string `db:"restaurantLocation"`
	RestaurantName       string `db:"restaurantName"`
	Updated              string `db:"updated"`
	UploadedBy           string `db:"uploadedBy"`
	UploaderCreated      string `db:"uploaderCreated"`
	UploaderEmail        string `db:"uploaderEmail"`
	UploaderID           string `db:"uploaderId"`
	UploaderIsAdmin      int    `db:"uploaderIsAdmin"`
	UploaderIsBetaUser   int    `db:"uploaderIsBetaUser"`
	UploaderIsSubscriber int    `db:"uploaderIsSubscriber"`
	UploaderName         string `db:"uploaderName"`
	UploaderUpdated      string `db:"uploaderUpdated"`
}

type adminMenuInventoryCountRow struct {
	Total int `db:"total"`
}

type adminMenuInventoryQuery struct {
	InventoryType string
	Limit         int
	Offset        int
	Page          int
	PerPage       int
	Search        string
}

// RegisterAdminMenuInventoryHandlers registers admin inventory endpoints for menu moderation.
func RegisterAdminMenuInventoryHandlers(se *core.ServeEvent, app core.App) {
	se.Router.POST("/api/admin/menu-inventory/restaurant-groups", func(e *core.RequestEvent) error {
		if err := requireAdmin(e); err != nil {
			return err
		}

		var requestBody adminRestaurantGroupCreateRequest
		if err := e.BindBody(&requestBody); err != nil {
			return apis.NewBadRequestError("invalid request body", err)
		}

		result, err := createAdminRestaurantGroup(app, e.Auth.Id, requestBody)
		if err != nil {
			return err
		}

		return e.JSON(200, result)
	})

	se.Router.PATCH("/api/admin/menu-inventory/restaurant-groups/{groupId}", func(e *core.RequestEvent) error {
		if err := requireAdmin(e); err != nil {
			return err
		}

		groupID := strings.TrimSpace(e.Request.PathValue("groupId"))
		if groupID == "" {
			return apis.NewBadRequestError("groupId is required", nil)
		}

		var requestBody adminRestaurantGroupMetadataRequest
		if err := e.BindBody(&requestBody); err != nil {
			return apis.NewBadRequestError("invalid request body", err)
		}

		result, err := updateAdminRestaurantGroupMetadata(app, groupID, requestBody)
		if err != nil {
			return err
		}

		return e.JSON(200, result)
	})

	se.Router.GET("/api/admin/menu-inventory/restaurants/{restaurantId}", func(e *core.RequestEvent) error {
		if err := requireAdmin(e); err != nil {
			return err
		}

		restaurantID := strings.TrimSpace(e.Request.PathValue("restaurantId"))
		if restaurantID == "" {
			return apis.NewBadRequestError("restaurantId is required", nil)
		}

		result, err := loadAdminRestaurantInventoryDetail(app, restaurantID)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return apis.NewNotFoundError("restaurant was not found", err)
			}

			log.Printf("Admin restaurant inventory detail query failed for restaurant=%q: %v", restaurantID, err)
			return apis.NewApiError(500, "failed to load restaurant inventory detail", err)
		}

		return e.JSON(200, result)
	})

	se.Router.POST("/api/admin/menu-inventory/restaurants/{restaurantId}/restaurant-group", func(e *core.RequestEvent) error {
		if err := requireAdmin(e); err != nil {
			return err
		}

		restaurantID := strings.TrimSpace(e.Request.PathValue("restaurantId"))
		if restaurantID == "" {
			return apis.NewBadRequestError("restaurantId is required", nil)
		}

		var requestBody adminRestaurantGroupMembershipRequest
		if err := e.BindBody(&requestBody); err != nil {
			return apis.NewBadRequestError("invalid request body", err)
		}

		result, err := updateAdminRestaurantGroupMembership(app, restaurantID, requestBody)
		if err != nil {
			return err
		}

		return e.JSON(200, result)
	})

	se.Router.GET("/api/admin/menu-inventory/menu-images/{imageId}", func(e *core.RequestEvent) error {
		if err := requireAdmin(e); err != nil {
			return err
		}

		imageID := strings.TrimSpace(e.Request.PathValue("imageId"))
		if imageID == "" {
			return apis.NewBadRequestError("imageId is required", nil)
		}

		result, err := loadAdminMenuImageInventoryDetail(app, imageID)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return apis.NewNotFoundError("menu image was not found", err)
			}

			log.Printf("Admin menu image inventory detail query failed for image=%q: %v", imageID, err)
			return apis.NewApiError(500, "failed to load menu image inventory detail", err)
		}

		return e.JSON(200, result)
	})

	se.Router.GET("/api/admin/menu-inventory", func(e *core.RequestEvent) error {
		if err := requireAdmin(e); err != nil {
			return err
		}

		query, err := parseAdminMenuInventoryQuery(e)
		if err != nil {
			return apis.NewBadRequestError(err.Error(), nil)
		}

		result, err := loadAdminMenuInventory(app, query)
		if err != nil {
			log.Printf("Admin menu inventory query failed for type=%q search=%q: %v", query.InventoryType, query.Search, err)
			return apis.NewApiError(500, "failed to load menu inventory", err)
		}

		return e.JSON(200, result)
	})
}

func parseAdminMenuInventoryQuery(e *core.RequestEvent) (adminMenuInventoryQuery, error) {
	values := e.Request.URL.Query()

	inventoryType := strings.ToLower(strings.TrimSpace(values.Get("type")))
	if inventoryType == "" {
		inventoryType = adminMenuInventoryDefaultType
	}
	if inventoryType != "restaurants" && inventoryType != "menu-items" && inventoryType != "menu-images" {
		return adminMenuInventoryQuery{}, fmt.Errorf("unsupported type %q", inventoryType)
	}

	page := parseAdminMenuInventoryPositiveInt(values.Get("page"), 1)
	perPage := parseAdminMenuInventoryPositiveInt(values.Get("perPage"), adminMenuInventoryDefaultPerPage)
	if perPage > adminMenuInventoryMaxPerPage {
		perPage = adminMenuInventoryMaxPerPage
	}

	return adminMenuInventoryQuery{
		InventoryType: inventoryType,
		Limit:         perPage,
		Offset:        (page - 1) * perPage,
		Page:          page,
		PerPage:       perPage,
		Search:        strings.ToLower(strings.TrimSpace(values.Get("search"))),
	}, nil
}

func parseAdminMenuInventoryPositiveInt(raw string, fallback int) int {
	value, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil || value < 1 {
		return fallback
	}
	return value
}

func loadAdminMenuInventory(app core.App, query adminMenuInventoryQuery) (map[string]any, error) {
	switch query.InventoryType {
	case "restaurants":
		return loadAdminRestaurantInventory(app, query)
	case "menu-items":
		return loadAdminMenuItemInventory(app, query)
	case "menu-images":
		return loadAdminMenuImageInventory(app, query)
	default:
		return nil, fmt.Errorf("unsupported type %q", query.InventoryType)
	}
}

func loadAdminRestaurantInventory(app core.App, query adminMenuInventoryQuery) (map[string]any, error) {
	whereClause, params := buildAdminMenuInventorySearch(
		query.Search,
		[]string{
			"restaurants.id",
			"restaurants.name",
			"restaurants.location",
			"restaurants.cuisineType",
			"restaurants.placeId",
			"restaurant_groups.name",
			"creator.email",
			"creator.name",
		},
	)

	total, err := countAdminMenuInventoryRows(app, `
		restaurants
		LEFT JOIN users creator ON creator.id = restaurants.createdBy
		LEFT JOIN restaurant_groups ON restaurant_groups.id = restaurants.restaurantGroup
	`, whereClause, params)
	if err != nil {
		return nil, err
	}

	rows := []adminMenuInventoryRestaurantRow{}
	if err := app.DB().NewQuery(`
		SELECT
			restaurants.id AS [[id]],
			COALESCE(restaurants.name, '') AS [[name]],
			COALESCE(restaurants.location, '') AS [[location]],
			COALESCE(restaurants.cuisineType, '') AS [[cuisineType]],
			COALESCE(restaurants.placeId, '') AS [[placeId]],
			COALESCE(restaurants.isGooglePlace, 0) AS [[isGooglePlace]],
			COALESCE(restaurants.googlePlaceCachedAt, '') AS [[googlePlaceCachedAt]],
			COALESCE(restaurants.latitude, 0) AS [[latitude]],
			COALESCE(restaurants.longitude, 0) AS [[longitude]],
			COALESCE(restaurants.visibility, '') AS [[visibility]],
			COALESCE(restaurants.created, '') AS [[created]],
			COALESCE(restaurants.updated, '') AS [[updated]],
			COALESCE(restaurants.createdBy, '') AS [[createdBy]],
			COALESCE(restaurants.restaurantGroup, '') AS [[restaurantGroup]],
			COALESCE(restaurant_groups.id, '') AS [[groupId]],
			COALESCE(restaurant_groups.name, '') AS [[groupName]],
			COALESCE(restaurant_groups.notes, '') AS [[groupNotes]],
			COALESCE(restaurant_groups.createdBy, '') AS [[groupCreatedBy]],
			COALESCE(restaurant_groups.created, '') AS [[groupCreated]],
			COALESCE(restaurant_groups.updated, '') AS [[groupUpdated]],
			COALESCE(creator.id, '') AS [[creatorId]],
			COALESCE(creator.email, '') AS [[creatorEmail]],
			COALESCE(creator.name, '') AS [[creatorName]],
			COALESCE(creator.isAdmin, 0) AS [[creatorIsAdmin]],
			COALESCE(creator.isSubscriber, 0) AS [[creatorIsSubscriber]],
			COALESCE(creator.isBetaUser, 0) AS [[creatorIsBetaUser]],
			COALESCE(creator.created, '') AS [[creatorCreated]],
			COALESCE(creator.updated, '') AS [[creatorUpdated]],
			(
				SELECT COUNT(*)
				FROM menu_items
				WHERE menu_items.restaurant = restaurants.id
			) AS [[menuItemCount]],
			(
				SELECT COUNT(*)
				FROM menu_images
				WHERE menu_images.restaurant = restaurants.id
			) AS [[menuImageCount]]
		FROM restaurants
		LEFT JOIN users creator ON creator.id = restaurants.createdBy
		LEFT JOIN restaurant_groups ON restaurant_groups.id = restaurants.restaurantGroup
		` + whereClause + `
		ORDER BY restaurants.updated DESC, restaurants.created DESC, restaurants.name ASC
		LIMIT {:limit} OFFSET {:offset}
	`).Bind(withPaginationParams(params, query)).All(&rows); err != nil {
		return nil, err
	}

	items := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		items = append(items, serializeAdminRestaurantInventoryRow(row))
	}

	return serializeAdminMenuInventoryResponse(query, total, items), nil
}

func loadAdminRestaurantInventoryDetail(app core.App, restaurantID string) (map[string]any, error) {
	restaurant, err := loadAdminRestaurantInventoryRowByID(app, restaurantID)
	if err != nil {
		return nil, err
	}

	menuItems, err := loadAdminRestaurantMenuItemRows(app, restaurantID, "menu_items.name ASC, menu_items.created DESC", 0, 0)
	if err != nil {
		return nil, err
	}

	menuImages, err := loadAdminRestaurantMenuImageRows(app, restaurantID, "menu_images.created DESC, menu_images.updated DESC", 0, 0)
	if err != nil {
		return nil, err
	}

	sameNameCandidates, err := loadAdminRestaurantGroupSameNameCandidates(app, restaurant)
	if err != nil {
		return nil, err
	}

	return map[string]any{
		"restaurant":         serializeAdminRestaurantInventoryRow(restaurant),
		"restaurantGroup":    serializeAdminRestaurantGroupFromRestaurantRow(restaurant),
		"sameNameCandidates": serializeAdminRestaurantInventoryRows(sameNameCandidates),
		"menuItems":          serializeAdminMenuItemInventoryRows(menuItems),
		"menuImages":         serializeAdminMenuImageInventoryRows(menuImages),
	}, nil
}

func loadAdminMenuImageInventoryDetail(app core.App, imageID string) (map[string]any, error) {
	menuImage, err := loadAdminMenuImageInventoryRowByID(app, imageID)
	if err != nil {
		return nil, err
	}

	var restaurant any
	restaurantID := strings.TrimSpace(menuImage.Restaurant)
	if restaurantID != "" {
		restaurantRow, err := loadAdminRestaurantInventoryRowByID(app, restaurantID)
		if err != nil {
			if !errors.Is(err, sql.ErrNoRows) {
				return nil, err
			}
		} else {
			restaurant = serializeAdminRestaurantInventoryRow(restaurantRow)
		}
	}

	attachedMenuItems, err := loadAdminMenuImageAttachedMenuItemRows(app, imageID)
	if err != nil {
		return nil, err
	}

	unattachedRestaurantMenuItems := []adminMenuInventoryMenuItemRow{}
	if restaurantID != "" {
		unattachedRestaurantMenuItems, err = loadAdminMenuImageUnattachedRestaurantMenuItemRows(app, restaurantID, imageID)
		if err != nil {
			return nil, err
		}
	}

	return map[string]any{
		"menuImage":                     serializeAdminMenuImageInventoryRow(menuImage),
		"restaurant":                    restaurant,
		"attachedMenuItems":             serializeAdminMenuItemInventoryRows(attachedMenuItems),
		"unattachedRestaurantMenuItems": serializeAdminMenuItemInventoryRows(unattachedRestaurantMenuItems),
	}, nil
}

func loadAdminMenuImageInventoryRowByID(app core.App, imageID string) (adminMenuInventoryMenuImageRow, error) {
	row := adminMenuInventoryMenuImageRow{}
	if err := app.DB().NewQuery(`
		SELECT
			menu_images.id AS [[id]],
			COALESCE(menu_images.image, '') AS [[image]],
			COALESCE(menu_images.restaurant, '') AS [[restaurant]],
			COALESCE(restaurants.name, '') AS [[restaurantName]],
			COALESCE(restaurants.location, '') AS [[restaurantLocation]],
			COALESCE(menu_images.uploadedBy, '') AS [[uploadedBy]],
			COALESCE(menu_images.created, '') AS [[created]],
			COALESCE(menu_images.updated, '') AS [[updated]],
			COALESCE(uploader.id, '') AS [[uploaderId]],
			COALESCE(uploader.email, '') AS [[uploaderEmail]],
			COALESCE(uploader.name, '') AS [[uploaderName]],
			COALESCE(uploader.isAdmin, 0) AS [[uploaderIsAdmin]],
			COALESCE(uploader.isSubscriber, 0) AS [[uploaderIsSubscriber]],
			COALESCE(uploader.isBetaUser, 0) AS [[uploaderIsBetaUser]],
			COALESCE(uploader.created, '') AS [[uploaderCreated]],
			COALESCE(uploader.updated, '') AS [[uploaderUpdated]]
		FROM menu_images
		LEFT JOIN restaurants ON restaurants.id = menu_images.restaurant
		LEFT JOIN users uploader ON uploader.id = menu_images.uploadedBy
		WHERE menu_images.id = {:imageId}
	`).Bind(dbx.Params{
		"imageId": imageID,
	}).One(&row); err != nil {
		return adminMenuInventoryMenuImageRow{}, err
	}

	return row, nil
}

func loadAdminMenuImageAttachedMenuItemRows(app core.App, imageID string) ([]adminMenuInventoryMenuItemRow, error) {
	rows := []adminMenuInventoryMenuItemRow{}
	if err := app.DB().NewQuery(`
		SELECT
			menu_items.id AS [[id]],
			COALESCE(menu_items.name, '') AS [[name]],
			COALESCE(menu_items.restaurant, '') AS [[restaurant]],
			COALESCE(restaurants.name, '') AS [[restaurantName]],
			COALESCE(restaurants.location, '') AS [[restaurantLocation]],
			COALESCE(menu_items.sourceImage, '') AS [[sourceImage]],
			COALESCE(source.image, '') AS [[sourceImageFile]],
			COALESCE(menu_items.visibility, '') AS [[visibility]],
			COALESCE(menu_items.approvalStatus, 'unreviewed') AS [[approvalStatus]],
			COALESCE(menu_items.approvalReviewedBy, '') AS [[approvalReviewedBy]],
			COALESCE(menu_items.approvalReviewedAt, '') AS [[approvalReviewedAt]],
			COALESCE(menu_items.groupSuitable, 0) AS [[groupSuitable]],
			COALESCE(menu_items.promotedFrom, '') AS [[promotedFrom]],
			COALESCE(menu_items.promotedTo, '') AS [[promotedTo]],
` + adminMenuInventoryLinkedMenuItemSelect + `
			COALESCE(menu_items.isFromOcr, 0) AS [[isFromOcr]],
			COALESCE(menu_items.created, '') AS [[created]],
			COALESCE(menu_items.updated, '') AS [[updated]],
			COALESCE(menu_items.createdBy, '') AS [[createdBy]],
			COALESCE(creator.id, '') AS [[creatorId]],
			COALESCE(creator.email, '') AS [[creatorEmail]],
			COALESCE(creator.name, '') AS [[creatorName]],
			COALESCE(creator.isAdmin, 0) AS [[creatorIsAdmin]],
			COALESCE(creator.isSubscriber, 0) AS [[creatorIsSubscriber]],
			COALESCE(creator.isBetaUser, 0) AS [[creatorIsBetaUser]],
			COALESCE(creator.created, '') AS [[creatorCreated]],
			COALESCE(creator.updated, '') AS [[creatorUpdated]]
		FROM menu_items
		LEFT JOIN restaurants ON restaurants.id = menu_items.restaurant
		LEFT JOIN users creator ON creator.id = menu_items.createdBy
		LEFT JOIN menu_images source ON source.id = menu_items.sourceImage
		WHERE menu_items.sourceImage = {:imageId}
		ORDER BY menu_items.name ASC, menu_items.created DESC
	`).Bind(dbx.Params{
		"imageId": imageID,
	}).All(&rows); err != nil {
		return nil, err
	}

	return rows, nil
}

func loadAdminMenuImageUnattachedRestaurantMenuItemRows(app core.App, restaurantID string, imageID string) ([]adminMenuInventoryMenuItemRow, error) {
	rows := []adminMenuInventoryMenuItemRow{}
	if err := app.DB().NewQuery(`
		SELECT
			menu_items.id AS [[id]],
			COALESCE(menu_items.name, '') AS [[name]],
			COALESCE(menu_items.restaurant, '') AS [[restaurant]],
			COALESCE(restaurants.name, '') AS [[restaurantName]],
			COALESCE(restaurants.location, '') AS [[restaurantLocation]],
			COALESCE(menu_items.sourceImage, '') AS [[sourceImage]],
			COALESCE(source.image, '') AS [[sourceImageFile]],
			COALESCE(menu_items.visibility, '') AS [[visibility]],
			COALESCE(menu_items.approvalStatus, 'unreviewed') AS [[approvalStatus]],
			COALESCE(menu_items.approvalReviewedBy, '') AS [[approvalReviewedBy]],
			COALESCE(menu_items.approvalReviewedAt, '') AS [[approvalReviewedAt]],
			COALESCE(menu_items.groupSuitable, 0) AS [[groupSuitable]],
			COALESCE(menu_items.promotedFrom, '') AS [[promotedFrom]],
			COALESCE(menu_items.promotedTo, '') AS [[promotedTo]],
` + adminMenuInventoryLinkedMenuItemSelect + `
			COALESCE(menu_items.isFromOcr, 0) AS [[isFromOcr]],
			COALESCE(menu_items.created, '') AS [[created]],
			COALESCE(menu_items.updated, '') AS [[updated]],
			COALESCE(menu_items.createdBy, '') AS [[createdBy]],
			COALESCE(creator.id, '') AS [[creatorId]],
			COALESCE(creator.email, '') AS [[creatorEmail]],
			COALESCE(creator.name, '') AS [[creatorName]],
			COALESCE(creator.isAdmin, 0) AS [[creatorIsAdmin]],
			COALESCE(creator.isSubscriber, 0) AS [[creatorIsSubscriber]],
			COALESCE(creator.isBetaUser, 0) AS [[creatorIsBetaUser]],
			COALESCE(creator.created, '') AS [[creatorCreated]],
			COALESCE(creator.updated, '') AS [[creatorUpdated]]
		FROM menu_items
		LEFT JOIN restaurants ON restaurants.id = menu_items.restaurant
		LEFT JOIN users creator ON creator.id = menu_items.createdBy
		LEFT JOIN menu_images source ON source.id = menu_items.sourceImage
		WHERE menu_items.restaurant = {:restaurantId}
			AND COALESCE(menu_items.sourceImage, '') != {:imageId}
		ORDER BY menu_items.name ASC, menu_items.created DESC
	`).Bind(dbx.Params{
		"restaurantId": restaurantID,
		"imageId":      imageID,
	}).All(&rows); err != nil {
		return nil, err
	}

	return rows, nil
}

func loadAdminRestaurantInventoryRowByID(app core.App, restaurantID string) (adminMenuInventoryRestaurantRow, error) {
	row := adminMenuInventoryRestaurantRow{}
	if err := app.DB().NewQuery(`
		SELECT
			restaurants.id AS [[id]],
			COALESCE(restaurants.name, '') AS [[name]],
			COALESCE(restaurants.location, '') AS [[location]],
			COALESCE(restaurants.cuisineType, '') AS [[cuisineType]],
			COALESCE(restaurants.placeId, '') AS [[placeId]],
			COALESCE(restaurants.isGooglePlace, 0) AS [[isGooglePlace]],
			COALESCE(restaurants.googlePlaceCachedAt, '') AS [[googlePlaceCachedAt]],
			COALESCE(restaurants.latitude, 0) AS [[latitude]],
			COALESCE(restaurants.longitude, 0) AS [[longitude]],
			COALESCE(restaurants.visibility, '') AS [[visibility]],
			COALESCE(restaurants.created, '') AS [[created]],
			COALESCE(restaurants.updated, '') AS [[updated]],
			COALESCE(restaurants.createdBy, '') AS [[createdBy]],
			COALESCE(restaurants.restaurantGroup, '') AS [[restaurantGroup]],
			COALESCE(restaurant_groups.id, '') AS [[groupId]],
			COALESCE(restaurant_groups.name, '') AS [[groupName]],
			COALESCE(restaurant_groups.notes, '') AS [[groupNotes]],
			COALESCE(restaurant_groups.createdBy, '') AS [[groupCreatedBy]],
			COALESCE(restaurant_groups.created, '') AS [[groupCreated]],
			COALESCE(restaurant_groups.updated, '') AS [[groupUpdated]],
			COALESCE(creator.id, '') AS [[creatorId]],
			COALESCE(creator.email, '') AS [[creatorEmail]],
			COALESCE(creator.name, '') AS [[creatorName]],
			COALESCE(creator.isAdmin, 0) AS [[creatorIsAdmin]],
			COALESCE(creator.isSubscriber, 0) AS [[creatorIsSubscriber]],
			COALESCE(creator.isBetaUser, 0) AS [[creatorIsBetaUser]],
			COALESCE(creator.created, '') AS [[creatorCreated]],
			COALESCE(creator.updated, '') AS [[creatorUpdated]],
			(
				SELECT COUNT(*)
				FROM menu_items
				WHERE menu_items.restaurant = restaurants.id
			) AS [[menuItemCount]],
			(
				SELECT COUNT(*)
				FROM menu_images
				WHERE menu_images.restaurant = restaurants.id
			) AS [[menuImageCount]]
		FROM restaurants
		LEFT JOIN users creator ON creator.id = restaurants.createdBy
		LEFT JOIN restaurant_groups ON restaurant_groups.id = restaurants.restaurantGroup
		WHERE restaurants.id = {:restaurantId}
	`).Bind(dbx.Params{
		"restaurantId": restaurantID,
	}).One(&row); err != nil {
		return adminMenuInventoryRestaurantRow{}, err
	}

	return row, nil
}

func loadAdminRestaurantMenuItemRows(app core.App, restaurantID string, orderBy string, limit int, offset int) ([]adminMenuInventoryMenuItemRow, error) {
	rows := []adminMenuInventoryMenuItemRow{}
	query := `
		SELECT
			menu_items.id AS [[id]],
			COALESCE(menu_items.name, '') AS [[name]],
			COALESCE(menu_items.restaurant, '') AS [[restaurant]],
			COALESCE(restaurants.name, '') AS [[restaurantName]],
			COALESCE(restaurants.location, '') AS [[restaurantLocation]],
			COALESCE(menu_items.sourceImage, '') AS [[sourceImage]],
			COALESCE(source.image, '') AS [[sourceImageFile]],
			COALESCE(menu_items.visibility, '') AS [[visibility]],
			COALESCE(menu_items.approvalStatus, 'unreviewed') AS [[approvalStatus]],
			COALESCE(menu_items.approvalReviewedBy, '') AS [[approvalReviewedBy]],
			COALESCE(menu_items.approvalReviewedAt, '') AS [[approvalReviewedAt]],
			COALESCE(menu_items.groupSuitable, 0) AS [[groupSuitable]],
			COALESCE(menu_items.promotedFrom, '') AS [[promotedFrom]],
			COALESCE(menu_items.promotedTo, '') AS [[promotedTo]],
` + adminMenuInventoryLinkedMenuItemSelect + `
			COALESCE(menu_items.isFromOcr, 0) AS [[isFromOcr]],
			COALESCE(menu_items.created, '') AS [[created]],
			COALESCE(menu_items.updated, '') AS [[updated]],
			COALESCE(menu_items.createdBy, '') AS [[createdBy]],
			COALESCE(creator.id, '') AS [[creatorId]],
			COALESCE(creator.email, '') AS [[creatorEmail]],
			COALESCE(creator.name, '') AS [[creatorName]],
			COALESCE(creator.isAdmin, 0) AS [[creatorIsAdmin]],
			COALESCE(creator.isSubscriber, 0) AS [[creatorIsSubscriber]],
			COALESCE(creator.isBetaUser, 0) AS [[creatorIsBetaUser]],
			COALESCE(creator.created, '') AS [[creatorCreated]],
			COALESCE(creator.updated, '') AS [[creatorUpdated]]
		FROM menu_items
		LEFT JOIN restaurants ON restaurants.id = menu_items.restaurant
		LEFT JOIN users creator ON creator.id = menu_items.createdBy
		LEFT JOIN menu_images source ON source.id = menu_items.sourceImage
		WHERE menu_items.restaurant = {:restaurantId}
		ORDER BY ` + orderBy
	params := dbx.Params{"restaurantId": restaurantID}
	if limit > 0 {
		query += " LIMIT {:limit} OFFSET {:offset}"
		params["limit"] = limit
		params["offset"] = offset
	}

	if err := app.DB().NewQuery(query).Bind(params).All(&rows); err != nil {
		return nil, err
	}

	return rows, nil
}

func loadAdminRestaurantMenuImageRows(app core.App, restaurantID string, orderBy string, limit int, offset int) ([]adminMenuInventoryMenuImageRow, error) {
	rows := []adminMenuInventoryMenuImageRow{}
	query := `
		SELECT
			menu_images.id AS [[id]],
			COALESCE(menu_images.image, '') AS [[image]],
			COALESCE(menu_images.restaurant, '') AS [[restaurant]],
			COALESCE(restaurants.name, '') AS [[restaurantName]],
			COALESCE(restaurants.location, '') AS [[restaurantLocation]],
			COALESCE(menu_images.uploadedBy, '') AS [[uploadedBy]],
			COALESCE(menu_images.created, '') AS [[created]],
			COALESCE(menu_images.updated, '') AS [[updated]],
			COALESCE(uploader.id, '') AS [[uploaderId]],
			COALESCE(uploader.email, '') AS [[uploaderEmail]],
			COALESCE(uploader.name, '') AS [[uploaderName]],
			COALESCE(uploader.isAdmin, 0) AS [[uploaderIsAdmin]],
			COALESCE(uploader.isSubscriber, 0) AS [[uploaderIsSubscriber]],
			COALESCE(uploader.isBetaUser, 0) AS [[uploaderIsBetaUser]],
			COALESCE(uploader.created, '') AS [[uploaderCreated]],
			COALESCE(uploader.updated, '') AS [[uploaderUpdated]]
		FROM menu_images
		LEFT JOIN restaurants ON restaurants.id = menu_images.restaurant
		LEFT JOIN users uploader ON uploader.id = menu_images.uploadedBy
		WHERE menu_images.restaurant = {:restaurantId}
		ORDER BY ` + orderBy
	params := dbx.Params{"restaurantId": restaurantID}
	if limit > 0 {
		query += " LIMIT {:limit} OFFSET {:offset}"
		params["limit"] = limit
		params["offset"] = offset
	}

	if err := app.DB().NewQuery(query).Bind(params).All(&rows); err != nil {
		return nil, err
	}

	return rows, nil
}

func loadAdminMenuItemInventory(app core.App, query adminMenuInventoryQuery) (map[string]any, error) {
	whereClause, params := buildAdminMenuInventorySearch(
		query.Search,
		[]string{
			"menu_items.id",
			"menu_items.name",
			"menu_items.restaurant",
			"restaurants.name",
			"restaurants.location",
			"creator.email",
			"creator.name",
		},
	)

	fromClause := `
		menu_items
		LEFT JOIN restaurants ON restaurants.id = menu_items.restaurant
		LEFT JOIN users creator ON creator.id = menu_items.createdBy
		LEFT JOIN menu_images source ON source.id = menu_items.sourceImage
	`

	total, err := countAdminMenuInventoryRows(app, fromClause, whereClause, params)
	if err != nil {
		return nil, err
	}

	rows := []adminMenuInventoryMenuItemRow{}
	if err := app.DB().NewQuery(`
		SELECT
			menu_items.id AS [[id]],
			COALESCE(menu_items.name, '') AS [[name]],
			COALESCE(menu_items.restaurant, '') AS [[restaurant]],
			COALESCE(restaurants.name, '') AS [[restaurantName]],
			COALESCE(restaurants.location, '') AS [[restaurantLocation]],
			COALESCE(menu_items.sourceImage, '') AS [[sourceImage]],
			COALESCE(source.image, '') AS [[sourceImageFile]],
			COALESCE(menu_items.visibility, '') AS [[visibility]],
			COALESCE(menu_items.approvalStatus, 'unreviewed') AS [[approvalStatus]],
			COALESCE(menu_items.approvalReviewedBy, '') AS [[approvalReviewedBy]],
			COALESCE(menu_items.approvalReviewedAt, '') AS [[approvalReviewedAt]],
			COALESCE(menu_items.groupSuitable, 0) AS [[groupSuitable]],
			COALESCE(menu_items.promotedFrom, '') AS [[promotedFrom]],
			COALESCE(menu_items.promotedTo, '') AS [[promotedTo]],
` + adminMenuInventoryLinkedMenuItemSelect + `
			COALESCE(menu_items.isFromOcr, 0) AS [[isFromOcr]],
			COALESCE(menu_items.created, '') AS [[created]],
			COALESCE(menu_items.updated, '') AS [[updated]],
			COALESCE(menu_items.createdBy, '') AS [[createdBy]],
			COALESCE(creator.id, '') AS [[creatorId]],
			COALESCE(creator.email, '') AS [[creatorEmail]],
			COALESCE(creator.name, '') AS [[creatorName]],
			COALESCE(creator.isAdmin, 0) AS [[creatorIsAdmin]],
			COALESCE(creator.isSubscriber, 0) AS [[creatorIsSubscriber]],
			COALESCE(creator.isBetaUser, 0) AS [[creatorIsBetaUser]],
			COALESCE(creator.created, '') AS [[creatorCreated]],
			COALESCE(creator.updated, '') AS [[creatorUpdated]]
		FROM ` + fromClause + `
		` + whereClause + `
		ORDER BY menu_items.updated DESC, menu_items.created DESC, menu_items.name ASC
		LIMIT {:limit} OFFSET {:offset}
	`).Bind(withPaginationParams(params, query)).All(&rows); err != nil {
		return nil, err
	}

	items := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		items = append(items, serializeAdminMenuItemInventoryRow(row))
	}

	return serializeAdminMenuInventoryResponse(query, total, items), nil
}

func loadAdminMenuImageInventory(app core.App, query adminMenuInventoryQuery) (map[string]any, error) {
	whereClause, params := buildAdminMenuInventorySearch(
		query.Search,
		[]string{
			"menu_images.id",
			"menu_images.restaurant",
			"restaurants.name",
			"restaurants.location",
			"uploader.email",
			"uploader.name",
		},
	)

	fromClause := `
		menu_images
		LEFT JOIN restaurants ON restaurants.id = menu_images.restaurant
		LEFT JOIN users uploader ON uploader.id = menu_images.uploadedBy
	`

	total, err := countAdminMenuInventoryRows(app, fromClause, whereClause, params)
	if err != nil {
		return nil, err
	}

	rows := []adminMenuInventoryMenuImageRow{}
	if err := app.DB().NewQuery(`
		SELECT
			menu_images.id AS [[id]],
			COALESCE(menu_images.image, '') AS [[image]],
			COALESCE(menu_images.restaurant, '') AS [[restaurant]],
			COALESCE(restaurants.name, '') AS [[restaurantName]],
			COALESCE(restaurants.location, '') AS [[restaurantLocation]],
			COALESCE(menu_images.uploadedBy, '') AS [[uploadedBy]],
			COALESCE(menu_images.created, '') AS [[created]],
			COALESCE(menu_images.updated, '') AS [[updated]],
			COALESCE(uploader.id, '') AS [[uploaderId]],
			COALESCE(uploader.email, '') AS [[uploaderEmail]],
			COALESCE(uploader.name, '') AS [[uploaderName]],
			COALESCE(uploader.isAdmin, 0) AS [[uploaderIsAdmin]],
			COALESCE(uploader.isSubscriber, 0) AS [[uploaderIsSubscriber]],
			COALESCE(uploader.isBetaUser, 0) AS [[uploaderIsBetaUser]],
			COALESCE(uploader.created, '') AS [[uploaderCreated]],
			COALESCE(uploader.updated, '') AS [[uploaderUpdated]]
		FROM ` + fromClause + `
		` + whereClause + `
		ORDER BY menu_images.created DESC, menu_images.updated DESC
		LIMIT {:limit} OFFSET {:offset}
	`).Bind(withPaginationParams(params, query)).All(&rows); err != nil {
		return nil, err
	}

	items := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		items = append(items, serializeAdminMenuImageInventoryRow(row))
	}

	return serializeAdminMenuInventoryResponse(query, total, items), nil
}

func buildAdminMenuInventorySearch(search string, columns []string) (string, dbx.Params) {
	params := dbx.Params{}
	trimmedSearch := strings.TrimSpace(search)
	if trimmedSearch == "" {
		return "", params
	}

	conditions := make([]string, 0, len(columns))
	for index, column := range columns {
		key := fmt.Sprintf("search%d", index)
		conditions = append(conditions, fmt.Sprintf("LOWER(TRIM(COALESCE(%s, ''))) LIKE {:%s} ESCAPE '\\'", column, key))
		params[key] = "%" + escapeFriendsSearchValue(trimmedSearch) + "%"
	}

	return "WHERE " + strings.Join(conditions, " OR "), params
}

func countAdminMenuInventoryRows(app core.App, fromClause string, whereClause string, params dbx.Params) (int, error) {
	row := adminMenuInventoryCountRow{}
	if err := app.DB().NewQuery(`
		SELECT COUNT(*) AS [[total]]
		FROM ` + fromClause + `
		` + whereClause + `
	`).Bind(params).One(&row); err != nil {
		return 0, err
	}
	return row.Total, nil
}

func withPaginationParams(params dbx.Params, query adminMenuInventoryQuery) dbx.Params {
	nextParams := dbx.Params{}
	for key, value := range params {
		nextParams[key] = value
	}
	nextParams["limit"] = query.Limit
	nextParams["offset"] = query.Offset
	return nextParams
}

func serializeAdminMenuInventoryResponse(query adminMenuInventoryQuery, total int, items []map[string]any) map[string]any {
	totalPages := 0
	if total > 0 {
		totalPages = int(math.Ceil(float64(total) / float64(query.PerPage)))
	}

	return map[string]any{
		"type":       query.InventoryType,
		"page":       query.Page,
		"perPage":    query.PerPage,
		"totalItems": total,
		"totalPages": totalPages,
		"items":      items,
	}
}

func serializeAdminRestaurantInventoryRow(row adminMenuInventoryRestaurantRow) map[string]any {
	return map[string]any{
		"id":                  row.ID,
		"name":                row.Name,
		"location":            row.Location,
		"cuisineType":         row.CuisineType,
		"placeId":             row.PlaceID,
		"isGooglePlace":       row.IsGooglePlace != 0,
		"googlePlaceCachedAt": row.GooglePlaceCachedAt,
		"latitude":            row.Latitude,
		"longitude":           row.Longitude,
		"visibility":          row.Visibility,
		"created":             row.Created,
		"updated":             row.Updated,
		"createdBy":           row.CreatedBy,
		"creator":             serializeAdminMenuInventoryUser(row.CreatorID, row.CreatorEmail, row.CreatorName, row.CreatorIsAdmin, row.CreatorIsSubscriber, row.CreatorIsBetaUser, row.CreatorCreated, row.CreatorUpdated),
		"restaurantGroupId":   row.RestaurantGroup,
		"restaurantGroup":     serializeAdminRestaurantGroupFromRestaurantRow(row),
		"menuItemCount":       row.MenuItemCount,
		"menuImageCount":      row.MenuImageCount,
	}
}

func serializeAdminRestaurantInventoryRows(rows []adminMenuInventoryRestaurantRow) []map[string]any {
	items := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		items = append(items, serializeAdminRestaurantInventoryRow(row))
	}
	return items
}

func serializeAdminMenuItemInventoryRows(rows []adminMenuInventoryMenuItemRow) []map[string]any {
	items := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		items = append(items, serializeAdminMenuItemInventoryRow(row))
	}
	return items
}

func serializeAdminLinkedMenuItemInventorySummary(id string, name string, visibility string, approvalStatus string, createdBy string, creatorEmail string) map[string]any {
	if strings.TrimSpace(id) == "" {
		return nil
	}

	return map[string]any{
		"id":             id,
		"name":           name,
		"visibility":     visibility,
		"approvalStatus": resolveMenuItemApprovalStatus(approvalStatus),
		"createdBy":      createdBy,
		"creatorEmail":   creatorEmail,
	}
}

func serializeAdminMenuItemInventoryRow(row adminMenuInventoryMenuItemRow) map[string]any {
	return map[string]any{
		"id":                 row.ID,
		"name":               row.Name,
		"restaurant":         row.Restaurant,
		"restaurantName":     row.RestaurantName,
		"restaurantLocation": row.RestaurantLocation,
		"sourceImage":        row.SourceImage,
		"sourceImageFile":    row.SourceImageFile,
		"visibility":         row.Visibility,
		"approvalStatus":     resolveMenuItemApprovalStatus(row.ApprovalStatus),
		"approvalReviewedBy": row.ApprovalReviewedBy,
		"approvalReviewedAt": row.ApprovalReviewedAt,
		"groupSuitable":      row.GroupSuitable != 0,
		"promotedFrom":       row.PromotedFrom,
		"promotedTo":         row.PromotedTo,
		"promotedFromItem":   serializeAdminLinkedMenuItemInventorySummary(row.PromotedFrom, row.PromotedFromName, row.PromotedFromVisibility, row.PromotedFromApprovalStatus, row.PromotedFromCreatedBy, row.PromotedFromCreatorEmail),
		"promotedToItem":     serializeAdminLinkedMenuItemInventorySummary(row.PromotedTo, row.PromotedToName, row.PromotedToVisibility, row.PromotedToApprovalStatus, row.PromotedToCreatedBy, row.PromotedToCreatorEmail),
		"isFromOcr":          row.IsFromOCR != 0,
		"created":            row.Created,
		"updated":            row.Updated,
		"createdBy":          row.CreatedBy,
		"creator":            serializeAdminMenuInventoryUser(row.CreatorID, row.CreatorEmail, row.CreatorName, row.CreatorIsAdmin, row.CreatorIsSubscriber, row.CreatorIsBetaUser, row.CreatorCreated, row.CreatorUpdated),
	}
}

func serializeAdminMenuImageInventoryRows(rows []adminMenuInventoryMenuImageRow) []map[string]any {
	items := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		items = append(items, serializeAdminMenuImageInventoryRow(row))
	}
	return items
}

func serializeAdminMenuImageInventoryRow(row adminMenuInventoryMenuImageRow) map[string]any {
	return map[string]any{
		"id":                 row.ID,
		"image":              row.Image,
		"restaurant":         row.Restaurant,
		"restaurantName":     row.RestaurantName,
		"restaurantLocation": row.RestaurantLocation,
		"uploadedBy":         row.UploadedBy,
		"uploader":           serializeAdminMenuInventoryUser(row.UploaderID, row.UploaderEmail, row.UploaderName, row.UploaderIsAdmin, row.UploaderIsSubscriber, row.UploaderIsBetaUser, row.UploaderCreated, row.UploaderUpdated),
		"created":            row.Created,
		"updated":            row.Updated,
	}
}

func serializeAdminMenuInventoryUser(id string, email string, name string, isAdmin int, isSubscriber int, isBetaUser int, created string, updated string) map[string]any {
	if strings.TrimSpace(id) == "" {
		return nil
	}

	return map[string]any{
		"id":           id,
		"email":        email,
		"name":         strings.TrimSpace(name),
		"isAdmin":      isAdmin != 0,
		"isSubscriber": isSubscriber != 0,
		"isBetaUser":   isBetaUser != 0,
		"created":      created,
		"updated":      updated,
	}
}
