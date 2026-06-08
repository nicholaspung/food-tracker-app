package handlers

import (
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"

	"myapp/lib"
)

const (
	menuItemApprovalStatusApproved   = "approved"
	menuItemApprovalStatusRejected   = "rejected"
	menuItemApprovalStatusUnreviewed = "unreviewed"
)

const adminMenuCatalogTrustEvidenceSelect = `
			COALESCE((
				SELECT COUNT(*)
				FROM menu_items contribution
				LEFT JOIN users contribution_creator ON contribution_creator.id = contribution.createdBy
				WHERE contribution.restaurant = menu_items.restaurant
					AND contribution.id != menu_items.id
					AND TRIM(COALESCE(contribution.name, '')) != ''
					AND LOWER(TRIM(COALESCE(contribution.name, ''))) = LOWER(TRIM(COALESCE(menu_items.name, '')))
					AND COALESCE(contribution.approvalStatus, 'unreviewed') != 'rejected'
					AND (
						contribution.promotedTo = menu_items.id
						OR menu_items.promotedFrom = contribution.id
						OR (
							COALESCE(menu_items.approvalStatus, 'unreviewed') = 'approved'
							AND TRIM(COALESCE(contribution.createdBy, '')) != ''
							AND COALESCE(contribution_creator.isAdmin, 0) = 0
						)
					)
			), 0) AS [[catalogContributionCount]],
			COALESCE((
				SELECT COUNT(*)
				FROM suggestion_provenance provenance
				WHERE provenance.targetRestaurant = menu_items.restaurant
					AND provenance.normalizedItemName = LOWER(TRIM(COALESCE(menu_items.name, '')))
					AND TRIM(COALESCE(menu_items.name, '')) != ''
			), 0) AS [[suggestionProvenanceCount]],
`

const adminRestaurantMenuCatalogTrustEvidenceSelect = `
			COALESCE((
				SELECT COUNT(DISTINCT contribution.id)
				FROM menu_items approved_items
				INNER JOIN menu_items contribution
					ON contribution.restaurant = approved_items.restaurant
					AND contribution.id != approved_items.id
					AND TRIM(COALESCE(contribution.name, '')) != ''
					AND LOWER(TRIM(COALESCE(contribution.name, ''))) = LOWER(TRIM(COALESCE(approved_items.name, '')))
				LEFT JOIN users contribution_creator ON contribution_creator.id = contribution.createdBy
				WHERE approved_items.restaurant = restaurants.id
					AND TRIM(COALESCE(approved_items.name, '')) != ''
					AND COALESCE(approved_items.approvalStatus, 'unreviewed') = 'approved'
					AND COALESCE(contribution.approvalStatus, 'unreviewed') != 'rejected'
					AND (
						contribution.promotedTo = approved_items.id
						OR approved_items.promotedFrom = contribution.id
						OR (
							TRIM(COALESCE(contribution.createdBy, '')) != ''
							AND COALESCE(contribution_creator.isAdmin, 0) = 0
						)
					)
			), 0) AS [[catalogContributionCount]],
			COALESCE((
				SELECT COUNT(*)
				FROM suggestion_provenance provenance
				WHERE provenance.targetRestaurant = restaurants.id
			), 0) AS [[suggestionProvenanceCount]]
`

type adminMenuItemApprovalRequest struct {
	Status string `json:"status"`
}

type adminMenuItemUpdateRequest struct {
	Name        string          `json:"name"`
	SourceImage json.RawMessage `json:"sourceImage"`
	Visibility  string          `json:"visibility"`
}

type adminMenuItemGroupSuitableRequest struct {
	GroupSuitable bool `json:"groupSuitable"`
}

type adminMenuItemPromotionResponse struct {
	MenuItem       map[string]any `json:"menuItem"`
	Contribution   map[string]any `json:"contribution"`
	ReusedExisting bool           `json:"reusedExisting"`
}

type adminMenuItemDepromotionResponse struct {
	Contribution    map[string]any `json:"contribution"`
	DeletedMenuItem map[string]any `json:"deletedMenuItem"`
	UnlinkedOnly    bool           `json:"unlinkedOnly"`
}

func RegisterAdminMenuCatalogTrustHandlers(se *core.ServeEvent, app core.App) {
	se.Router.PATCH("/api/admin/menu-items/{itemId}/approval", func(e *core.RequestEvent) error {
		if err := requireAdmin(e); err != nil {
			return err
		}

		itemID := strings.TrimSpace(e.Request.PathValue("itemId"))
		if itemID == "" {
			return apis.NewBadRequestError("itemId is required", nil)
		}

		requestBody := adminMenuItemApprovalRequest{}
		if err := e.BindBody(&requestBody); err != nil {
			return apis.NewBadRequestError("invalid request body", err)
		}

		var updated *core.Record
		if err := app.RunInTransaction(func(txApp core.App) error {
			var err error
			updated, err = updateAdminMenuItemApprovalStatus(txApp, e, itemID, e.Auth.Id, requestBody.Status)
			return err
		}); err != nil {
			return err
		}

		return e.JSON(200, serializeAdminMenuItemRecord(updated))
	})

	se.Router.PATCH("/api/admin/menu-items/{itemId}", func(e *core.RequestEvent) error {
		if err := requireAdmin(e); err != nil {
			return err
		}

		itemID := strings.TrimSpace(e.Request.PathValue("itemId"))
		if itemID == "" {
			return apis.NewBadRequestError("itemId is required", nil)
		}

		requestBody := adminMenuItemUpdateRequest{}
		if err := json.NewDecoder(e.Request.Body).Decode(&requestBody); err != nil {
			return apis.NewBadRequestError("invalid request body", err)
		}

		var updated *core.Record
		if err := app.RunInTransaction(func(txApp core.App) error {
			var err error
			updated, err = updateAdminMenuItemTrustFields(txApp, e, itemID, requestBody)
			return err
		}); err != nil {
			return err
		}

		return e.JSON(200, serializeAdminMenuItemRecord(updated))
	})

	se.Router.PATCH("/api/admin/menu-items/{itemId}/group-suitable", func(e *core.RequestEvent) error {
		if err := requireAdmin(e); err != nil {
			return err
		}

		itemID := strings.TrimSpace(e.Request.PathValue("itemId"))
		if itemID == "" {
			return apis.NewBadRequestError("itemId is required", nil)
		}

		requestBody := adminMenuItemGroupSuitableRequest{}
		if err := e.BindBody(&requestBody); err != nil {
			return apis.NewBadRequestError("invalid request body", err)
		}

		var updated *core.Record
		if err := app.RunInTransaction(func(txApp core.App) error {
			var err error
			updated, err = updateAdminMenuItemGroupSuitable(txApp, e, itemID, requestBody.GroupSuitable)
			return err
		}); err != nil {
			return err
		}

		return e.JSON(200, serializeAdminMenuItemRecord(updated))
	})

	se.Router.POST("/api/admin/menu-items/{itemId}/promote", func(e *core.RequestEvent) error {
		if err := requireAdmin(e); err != nil {
			return err
		}

		itemID := strings.TrimSpace(e.Request.PathValue("itemId"))
		if itemID == "" {
			return apis.NewBadRequestError("itemId is required", nil)
		}

		var result adminMenuItemPromotionResponse
		if err := app.RunInTransaction(func(txApp core.App) error {
			var err error
			result, err = promoteAdminMenuItemContribution(txApp, e, itemID, e.Auth.Id)
			return err
		}); err != nil {
			return err
		}

		return e.JSON(200, result)
	})

	se.Router.DELETE("/api/admin/menu-items/{itemId}/promotion", func(e *core.RequestEvent) error {
		if err := requireAdmin(e); err != nil {
			return err
		}

		itemID := strings.TrimSpace(e.Request.PathValue("itemId"))
		if itemID == "" {
			return apis.NewBadRequestError("itemId is required", nil)
		}

		var result adminMenuItemDepromotionResponse
		if err := app.RunInTransaction(func(txApp core.App) error {
			var err error
			result, err = depromoteAdminMenuItem(txApp, e, itemID)
			return err
		}); err != nil {
			return err
		}

		return e.JSON(200, result)
	})
}

func updateAdminMenuItemApprovalStatus(
	app core.App,
	e *core.RequestEvent,
	itemID string,
	adminID string,
	rawStatus string,
) (*core.Record, error) {
	status := strings.TrimSpace(rawStatus)
	if !isValidMenuItemApprovalStatus(status) {
		return nil, apis.NewBadRequestError("status must be unreviewed, approved, or rejected", nil)
	}

	item, err := app.FindRecordById("menu_items", itemID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, apis.NewNotFoundError("menu item was not found", err)
		}
		return nil, apis.NewApiError(500, "failed to load menu item", err)
	}

	beforeSnapshot := lib.RecordAuditSnapshot(item)
	applyMenuItemApprovalStatus(item, status, adminID)
	enforceMenuItemGroupSuitableInvariant(item)
	if err := app.Save(item); err != nil {
		log.Printf("Admin menu item approval update failed for item=%q status=%q: %v", itemID, status, err)
		return nil, apis.NewApiError(500, "failed to update menu item approval", err)
	}

	if err := createAdminRecordAuditLog(
		app,
		e,
		item,
		core.ModelEventTypeUpdate,
		beforeSnapshot,
		lib.RecordAuditSnapshot(item),
		adminMenuItemTrustAuditMetadata(app, "admin_menu_item_approval", item, map[string]any{
			"approvalStatus": status,
			"menuItemId":     item.Id,
		}),
		adminMenuItemApprovalAuditSummary(status, item),
	); err != nil {
		return nil, apis.NewApiError(500, "failed to audit menu item approval", err)
	}

	return item, nil
}

func updateAdminMenuItemTrustFields(
	app core.App,
	e *core.RequestEvent,
	itemID string,
	requestBody adminMenuItemUpdateRequest,
) (*core.Record, error) {
	visibility := strings.TrimSpace(requestBody.Visibility)
	if !isValidMenuItemVisibility(visibility) {
		return nil, apis.NewBadRequestError("visibility must be private, friends, or public", nil)
	}

	name := strings.TrimSpace(requestBody.Name)
	if name == "" {
		return nil, apis.NewBadRequestError("name is required", nil)
	}

	item, err := app.FindRecordById("menu_items", itemID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, apis.NewNotFoundError("menu item was not found", err)
		}
		return nil, apis.NewApiError(500, "failed to load menu item", err)
	}

	beforeSnapshot := lib.RecordAuditSnapshot(item)
	item.Set("name", name)
	item.Set("visibility", visibility)
	if err := applyAdminMenuItemSourceImageUpdate(item, requestBody.SourceImage); err != nil {
		return nil, err
	}
	enforceMenuItemGroupSuitableInvariant(item)

	if err := app.Save(item); err != nil {
		log.Printf("Admin menu item update failed for item=%q: %v", itemID, err)
		return nil, apis.NewApiError(500, "failed to update menu item", err)
	}

	if err := createAdminRecordAuditLog(
		app,
		e,
		item,
		core.ModelEventTypeUpdate,
		beforeSnapshot,
		lib.RecordAuditSnapshot(item),
		adminMenuItemTrustAuditMetadata(app, "admin_menu_item_update", item, map[string]any{
			"source":         "admin_menu_item_update",
			"visibility":     visibility,
			"groupSuitable":  item.GetBool("groupSuitable"),
			"approvalStatus": menuItemApprovalStatus(item),
			"menuItemId":     item.Id,
		}),
		"Updated menu item "+strings.TrimSpace(item.GetString("name")),
	); err != nil {
		return nil, apis.NewApiError(500, "failed to audit menu item update", err)
	}

	return item, nil
}

func applyAdminMenuItemSourceImageUpdate(item *core.Record, rawSourceImage json.RawMessage) error {
	if len(rawSourceImage) == 0 {
		return nil
	}

	if strings.TrimSpace(string(rawSourceImage)) == "null" {
		item.Set("sourceImage", "")
		return nil
	}

	sourceImage := ""
	if err := json.Unmarshal(rawSourceImage, &sourceImage); err != nil {
		return apis.NewBadRequestError("sourceImage must be a string or null", err)
	}
	item.Set("sourceImage", strings.TrimSpace(sourceImage))
	return nil
}

func updateAdminMenuItemGroupSuitable(
	app core.App,
	e *core.RequestEvent,
	itemID string,
	groupSuitable bool,
) (*core.Record, error) {
	item, err := app.FindRecordById("menu_items", itemID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, apis.NewNotFoundError("menu item was not found", err)
		}
		return nil, apis.NewApiError(500, "failed to load menu item", err)
	}

	if groupSuitable && !canMenuItemBeGroupSuitable(item) {
		return nil, apis.NewBadRequestError("group-suitable can only be enabled for public approved menu items", nil)
	}

	beforeSnapshot := lib.RecordAuditSnapshot(item)
	item.Set("groupSuitable", groupSuitable)
	enforceMenuItemGroupSuitableInvariant(item)

	if err := app.Save(item); err != nil {
		log.Printf("Admin menu item group-suitable update failed for item=%q: %v", itemID, err)
		return nil, apis.NewApiError(500, "failed to update menu item group-suitable status", err)
	}

	if err := createAdminRecordAuditLog(
		app,
		e,
		item,
		core.ModelEventTypeUpdate,
		beforeSnapshot,
		lib.RecordAuditSnapshot(item),
		adminMenuItemTrustAuditMetadata(app, "admin_menu_item_group_suitable", item, map[string]any{
			"groupSuitable":  item.GetBool("groupSuitable"),
			"approvalStatus": menuItemApprovalStatus(item),
			"visibility":     strings.TrimSpace(item.GetString("visibility")),
			"menuItemId":     item.Id,
		}),
		adminMenuItemGroupSuitableAuditSummary(item),
	); err != nil {
		return nil, apis.NewApiError(500, "failed to audit menu item group-suitable update", err)
	}

	return item, nil
}

func promoteAdminMenuItemContribution(
	app core.App,
	e *core.RequestEvent,
	contributionID string,
	adminID string,
) (adminMenuItemPromotionResponse, error) {
	contribution, err := app.FindRecordById("menu_items", contributionID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return adminMenuItemPromotionResponse{}, apis.NewNotFoundError("menu item was not found", err)
		}
		return adminMenuItemPromotionResponse{}, apis.NewApiError(500, "failed to load menu item", err)
	}

	contributionBeforeSnapshot := lib.RecordAuditSnapshot(contribution)
	restaurantID := strings.TrimSpace(contribution.GetString("restaurant"))
	if restaurantID == "" {
		return adminMenuItemPromotionResponse{}, apis.NewBadRequestError("menu item is not attached to a restaurant", nil)
	}

	itemName := strings.TrimSpace(contribution.GetString("name"))
	if itemName == "" {
		return adminMenuItemPromotionResponse{}, apis.NewBadRequestError("menu item name is required", nil)
	}

	target, reusedExisting, err := findApprovedMenuItemByNormalizedName(app, restaurantID, itemName)
	if err != nil {
		return adminMenuItemPromotionResponse{}, apis.NewApiError(500, "failed to find approved menu item", err)
	}

	createdTarget := false
	if target == nil {
		collection, collectionErr := app.FindCollectionByNameOrId("menu_items")
		if collectionErr != nil {
			return adminMenuItemPromotionResponse{}, apis.NewApiError(500, "failed to resolve menu item collection", collectionErr)
		}

		target = core.NewRecord(collection)
		target.Set("restaurant", restaurantID)
		target.Set("name", itemName)
		target.Set("createdBy", strings.TrimSpace(adminID))
		target.Set("visibility", "public")
		target.Set("isFromOCR", contribution.GetBool("isFromOCR"))
		if sourceImageID := strings.TrimSpace(contribution.GetString("sourceImage")); sourceImageID != "" {
			target.Set("sourceImage", sourceImageID)
		}
		target.Set("promotedFrom", contribution.Id)
		applyMenuItemApprovalStatus(target, menuItemApprovalStatusApproved, adminID)

		if err := app.Save(target); err != nil {
			refetchedTarget, _, lookupErr := findApprovedMenuItemByNormalizedName(app, restaurantID, itemName)
			if lookupErr == nil && refetchedTarget != nil {
				target = refetchedTarget
				reusedExisting = true
			} else {
				log.Printf("Admin menu item promotion create failed for contribution=%q: %v", contributionID, err)
				return adminMenuItemPromotionResponse{}, apis.NewApiError(500, "failed to promote menu item", err)
			}
		} else {
			createdTarget = true
		}
	}

	targetID := ""
	if target != nil {
		targetID = target.Id
	}
	if contribution.Id != target.Id {
		contribution.Set("promotedTo", target.Id)
		if err := app.Save(contribution); err != nil {
			log.Printf("Admin menu item promotion link failed for contribution=%q target=%q: %v", contribution.Id, target.Id, err)
			return adminMenuItemPromotionResponse{}, apis.NewApiError(500, "failed to link promoted menu item", err)
		}
	}

	if createdTarget {
		if err := createAdminRecordAuditLog(
			app,
			e,
			target,
			core.ModelEventTypeCreate,
			nil,
			lib.RecordAuditSnapshot(target),
			adminMenuItemTrustAuditMetadata(app, "admin_menu_item_promotion", target, map[string]any{
				"catalogContributionId": contribution.Id,
				"contributionId":        contribution.Id,
				"menuItemId":            target.Id,
				"restaurantId":          restaurantID,
			}),
			"Promoted menu contribution into approved item "+strings.TrimSpace(target.GetString("name")),
		); err != nil {
			return adminMenuItemPromotionResponse{}, apis.NewApiError(500, "failed to audit promoted menu item", err)
		}
	}

	if contribution.Id != targetID {
		if err := createAdminRecordAuditLog(
			app,
			e,
			contribution,
			core.ModelEventTypeUpdate,
			contributionBeforeSnapshot,
			lib.RecordAuditSnapshot(contribution),
			adminMenuItemTrustAuditMetadata(app, "admin_menu_item_promotion", contribution, map[string]any{
				"catalogContributionId": contribution.Id,
				"menuItemId":            targetID,
				"promotedTo":            targetID,
				"restaurantId":          restaurantID,
				"reusedExisting":        reusedExisting,
			}),
			"Linked menu contribution to approved item "+strings.TrimSpace(contribution.GetString("name")),
		); err != nil {
			return adminMenuItemPromotionResponse{}, apis.NewApiError(500, "failed to audit menu item promotion link", err)
		}
	}

	return adminMenuItemPromotionResponse{
		MenuItem:       serializeAdminMenuItemRecord(target),
		Contribution:   serializeAdminMenuItemRecord(contribution),
		ReusedExisting: reusedExisting,
	}, nil
}

func depromoteAdminMenuItem(
	app core.App,
	e *core.RequestEvent,
	itemID string,
) (adminMenuItemDepromotionResponse, error) {
	item, err := app.FindRecordById("menu_items", itemID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return adminMenuItemDepromotionResponse{}, apis.NewNotFoundError("menu item was not found", err)
		}
		return adminMenuItemDepromotionResponse{}, apis.NewApiError(500, "failed to load menu item", err)
	}

	promotedFromID := strings.TrimSpace(item.GetString("promotedFrom"))
	promotedToID := strings.TrimSpace(item.GetString("promotedTo"))
	if promotedFromID == "" && promotedToID == "" {
		return adminMenuItemDepromotionResponse{}, apis.NewBadRequestError("menu item is not promoted", nil)
	}

	if promotedFromID != "" {
		return depromotePromotedMenuItem(app, e, item, promotedFromID)
	}

	return unlinkMenuItemPromotionContribution(app, e, item, promotedToID)
}

func depromotePromotedMenuItem(
	app core.App,
	e *core.RequestEvent,
	promotedItem *core.Record,
	contributionID string,
) (adminMenuItemDepromotionResponse, error) {
	deletedSnapshot := serializeAdminMenuItemRecord(promotedItem)
	deletedBeforeSnapshot := lib.RecordAuditSnapshot(promotedItem)

	var contribution *core.Record
	if source, err := app.FindRecordById("menu_items", contributionID); err == nil {
		contribution = source
	} else if !errors.Is(err, sql.ErrNoRows) {
		return adminMenuItemDepromotionResponse{}, apis.NewApiError(500, "failed to load promotion contribution", err)
	}

	var contributionSnapshot map[string]any
	if contribution != nil && strings.TrimSpace(contribution.GetString("promotedTo")) == promotedItem.Id {
		beforeSnapshot := lib.RecordAuditSnapshot(contribution)
		contribution.Set("promotedTo", "")
		if err := app.Save(contribution); err != nil {
			log.Printf("Admin menu item depromotion unlink failed for contribution=%q target=%q: %v", contribution.Id, promotedItem.Id, err)
			return adminMenuItemDepromotionResponse{}, apis.NewApiError(500, "failed to unlink menu item promotion", err)
		}
		contributionSnapshot = serializeAdminMenuItemRecord(contribution)

		if err := auditAdminMenuItemPromotionUnlink(app, e, contribution, beforeSnapshot, promotedItem.Id, false); err != nil {
			return adminMenuItemDepromotionResponse{}, err
		}
	}

	if err := createAdminRecordAuditLog(
		app,
		e,
		promotedItem,
		core.ModelEventTypeDelete,
		deletedBeforeSnapshot,
		nil,
		adminMenuItemTrustAuditMetadata(app, "admin_menu_item_depromotion", promotedItem, map[string]any{
			"catalogContributionId": contributionID,
			"contributionId":        contributionID,
			"deletedMenuItemId":     promotedItem.Id,
			"menuItemId":            promotedItem.Id,
		}),
		"De-promoted menu item "+strings.TrimSpace(promotedItem.GetString("name")),
	); err != nil {
		return adminMenuItemDepromotionResponse{}, apis.NewApiError(500, "failed to audit menu item depromotion", err)
	}

	if err := app.Delete(promotedItem); err != nil {
		log.Printf("Admin menu item depromotion delete failed for item=%q contribution=%q: %v", promotedItem.Id, contributionID, err)
		return adminMenuItemDepromotionResponse{}, apis.NewApiError(500, "failed to delete promoted menu item", err)
	}

	return adminMenuItemDepromotionResponse{
		Contribution:    contributionSnapshot,
		DeletedMenuItem: deletedSnapshot,
		UnlinkedOnly:    false,
	}, nil
}

func unlinkMenuItemPromotionContribution(
	app core.App,
	e *core.RequestEvent,
	contribution *core.Record,
	promotedToID string,
) (adminMenuItemDepromotionResponse, error) {
	unlinkedOnly := true
	var deletedSnapshot map[string]any

	target, err := app.FindRecordById("menu_items", promotedToID)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return adminMenuItemDepromotionResponse{}, apis.NewApiError(500, "failed to load promoted menu item", err)
	}

	if target != nil && strings.TrimSpace(target.GetString("promotedFrom")) == contribution.Id {
		deletedSnapshot = serializeAdminMenuItemRecord(target)
		unlinkedOnly = false
	}

	beforeSnapshot := lib.RecordAuditSnapshot(contribution)
	contribution.Set("promotedTo", "")
	if err := app.Save(contribution); err != nil {
		log.Printf("Admin menu item promotion unlink failed for contribution=%q target=%q: %v", contribution.Id, promotedToID, err)
		return adminMenuItemDepromotionResponse{}, apis.NewApiError(500, "failed to unlink menu item promotion", err)
	}

	if err := auditAdminMenuItemPromotionUnlink(app, e, contribution, beforeSnapshot, promotedToID, unlinkedOnly); err != nil {
		return adminMenuItemDepromotionResponse{}, err
	}

	if target != nil && !unlinkedOnly {
		targetBeforeSnapshot := lib.RecordAuditSnapshot(target)
		if err := createAdminRecordAuditLog(
			app,
			e,
			target,
			core.ModelEventTypeDelete,
			targetBeforeSnapshot,
			nil,
			adminMenuItemTrustAuditMetadata(app, "admin_menu_item_depromotion", target, map[string]any{
				"catalogContributionId": contribution.Id,
				"contributionId":        contribution.Id,
				"deletedMenuItemId":     target.Id,
				"menuItemId":            target.Id,
			}),
			"De-promoted menu item "+strings.TrimSpace(target.GetString("name")),
		); err != nil {
			return adminMenuItemDepromotionResponse{}, apis.NewApiError(500, "failed to audit menu item depromotion", err)
		}

		if err := app.Delete(target); err != nil {
			log.Printf("Admin menu item depromotion delete failed for item=%q contribution=%q: %v", target.Id, contribution.Id, err)
			return adminMenuItemDepromotionResponse{}, apis.NewApiError(500, "failed to delete promoted menu item", err)
		}
	}

	return adminMenuItemDepromotionResponse{
		Contribution:    serializeAdminMenuItemRecord(contribution),
		DeletedMenuItem: deletedSnapshot,
		UnlinkedOnly:    unlinkedOnly,
	}, nil
}

func auditAdminMenuItemPromotionUnlink(
	app core.App,
	e *core.RequestEvent,
	contribution *core.Record,
	beforeSnapshot map[string]any,
	promotedToID string,
	unlinkedOnly bool,
) error {
	if err := createAdminRecordAuditLog(
		app,
		e,
		contribution,
		core.ModelEventTypeUpdate,
		beforeSnapshot,
		lib.RecordAuditSnapshot(contribution),
		adminMenuItemTrustAuditMetadata(app, "admin_menu_item_depromotion", contribution, map[string]any{
			"catalogContributionId": contribution.Id,
			"menuItemId":            promotedToID,
			"promotedTo":            "",
			"previousPromotedTo":    promotedToID,
			"reusedExisting":        unlinkedOnly,
		}),
		"Unlinked menu contribution from promoted item "+strings.TrimSpace(contribution.GetString("name")),
	); err != nil {
		return apis.NewApiError(500, "failed to audit menu item promotion unlink", err)
	}

	return nil
}

func adminMenuItemTrustAuditMetadata(
	app core.App,
	source string,
	item *core.Record,
	extra map[string]any,
) map[string]any {
	metadata := map[string]any{
		"source": strings.TrimSpace(source),
	}
	for key, value := range extra {
		metadata[key] = value
	}

	if item == nil {
		return metadata
	}

	if _, ok := metadata["menuItemId"]; !ok {
		metadata["menuItemId"] = item.Id
	}

	restaurantID := strings.TrimSpace(item.GetString("restaurant"))
	if restaurantID == "" {
		return metadata
	}
	metadata["restaurantId"] = restaurantID

	restaurant, err := app.FindRecordById("restaurants", restaurantID)
	if err != nil {
		return metadata
	}
	if restaurantGroupID := strings.TrimSpace(restaurant.GetString("restaurantGroup")); restaurantGroupID != "" {
		metadata["restaurantGroupId"] = restaurantGroupID
	}

	return metadata
}

func adminMenuItemApprovalAuditSummary(status string, item *core.Record) string {
	name := strings.TrimSpace(item.GetString("name"))
	switch status {
	case menuItemApprovalStatusApproved:
		return "Approved menu item " + name
	case menuItemApprovalStatusRejected:
		return "Rejected menu item " + name
	case menuItemApprovalStatusUnreviewed:
		return "Restored menu item " + name + " to unreviewed"
	default:
		return "Updated menu item approval for " + name
	}
}

func adminMenuItemGroupSuitableAuditSummary(item *core.Record) string {
	name := strings.TrimSpace(item.GetString("name"))
	if item.GetBool("groupSuitable") {
		return "Enabled group suggestions for menu item " + name
	}
	return "Disabled group suggestions for menu item " + name
}

func applyMenuItemApprovalStatus(record *core.Record, status string, adminID string) {
	record.Set("approvalStatus", status)

	if status == menuItemApprovalStatusUnreviewed {
		record.Set("approvalReviewedBy", "")
		record.Set("approvalReviewedAt", "")
		return
	}

	record.Set("approvalReviewedBy", strings.TrimSpace(adminID))
	record.Set("approvalReviewedAt", time.Now().UTC().Format("2006-01-02 15:04:05.000Z"))
}

func canMenuItemBeGroupSuitable(record *core.Record) bool {
	return menuItemApprovalStatus(record) == menuItemApprovalStatusApproved &&
		strings.TrimSpace(record.GetString("visibility")) == "public"
}

func enforceMenuItemGroupSuitableInvariant(record *core.Record) {
	if !canMenuItemBeGroupSuitable(record) {
		record.Set("groupSuitable", false)
	}
}

func isValidMenuItemVisibility(visibility string) bool {
	return visibility == "private" || visibility == "friends" || visibility == "public"
}

func findApprovedMenuItemByNormalizedName(
	app core.App,
	restaurantID string,
	itemName string,
) (*core.Record, bool, error) {
	normalizedName := normalizeMenuItemName(itemName)
	if normalizedName == "" {
		return nil, false, nil
	}

	rows := []struct {
		ID string `db:"id"`
	}{}
	if err := app.DB().NewQuery(`
		SELECT menu_items.id AS [[id]]
		FROM menu_items
		LEFT JOIN users creator ON creator.id = menu_items.createdBy
		WHERE menu_items.restaurant = {:restaurantId}
			AND LOWER(TRIM(COALESCE(menu_items.name, ''))) = {:normalizedName}
			AND COALESCE(menu_items.approvalStatus, 'unreviewed') = 'approved'
			AND COALESCE(menu_items.visibility, '') = 'public'
			AND (
				TRIM(COALESCE(menu_items.createdBy, '')) = ''
				OR COALESCE(creator.isAdmin, 0) = 1
			)
		ORDER BY
			menu_items.updated DESC,
			menu_items.created DESC
		LIMIT 1
	`).Bind(dbx.Params{
		"normalizedName": normalizedName,
		"restaurantId":   strings.TrimSpace(restaurantID),
	}).All(&rows); err != nil {
		return nil, false, err
	}
	if len(rows) == 0 {
		return nil, false, nil
	}

	record, err := app.FindRecordById("menu_items", rows[0].ID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, false, nil
		}
		return nil, false, err
	}

	return record, true, nil
}

func isValidMenuItemApprovalStatus(status string) bool {
	return status == menuItemApprovalStatusUnreviewed ||
		status == menuItemApprovalStatusApproved ||
		status == menuItemApprovalStatusRejected
}

func menuItemApprovalStatus(record *core.Record) string {
	return resolveMenuItemApprovalStatus(record.GetString("approvalStatus"))
}

func resolveMenuItemApprovalStatus(rawStatus string) string {
	status := strings.TrimSpace(rawStatus)
	if isValidMenuItemApprovalStatus(status) {
		return status
	}
	return menuItemApprovalStatusUnreviewed
}

func serializeAdminMenuItemRecord(record *core.Record) map[string]any {
	if record == nil {
		return nil
	}

	return map[string]any{
		"id":                 record.Id,
		"name":               record.GetString("name"),
		"restaurant":         record.GetString("restaurant"),
		"sourceImage":        record.GetString("sourceImage"),
		"visibility":         record.GetString("visibility"),
		"isFromOcr":          record.GetBool("isFromOCR"),
		"approvalStatus":     menuItemApprovalStatus(record),
		"approvalReviewedBy": record.GetString("approvalReviewedBy"),
		"approvalReviewedAt": record.GetString("approvalReviewedAt"),
		"groupSuitable":      record.GetBool("groupSuitable"),
		"promotedFrom":       record.GetString("promotedFrom"),
		"promotedTo":         record.GetString("promotedTo"),
		"created":            record.GetString("created"),
		"updated":            record.GetString("updated"),
		"createdBy":          record.GetString("createdBy"),
	}
}
