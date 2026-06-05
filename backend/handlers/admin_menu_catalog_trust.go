package handlers

import (
	"database/sql"
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

type adminMenuItemApprovalRequest struct {
	Status string `json:"status"`
}

type adminMenuItemPromotionResponse struct {
	MenuItem       map[string]any `json:"menuItem"`
	Contribution   map[string]any `json:"contribution"`
	ReusedExisting bool           `json:"reusedExisting"`
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
		map[string]any{"source": "admin_menu_item_approval", "approvalStatus": status},
		"Updated menu item approval for "+strings.TrimSpace(item.GetString("name")),
	); err != nil {
		return nil, apis.NewApiError(500, "failed to audit menu item approval", err)
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
			map[string]any{
				"source":         "admin_menu_item_promotion",
				"contributionId": contribution.Id,
				"restaurantId":   restaurantID,
			},
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
			map[string]any{
				"source":         "admin_menu_item_promotion",
				"promotedTo":     targetID,
				"restaurantId":   restaurantID,
				"reusedExisting": reusedExisting,
			},
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
		"promotedFrom":       record.GetString("promotedFrom"),
		"promotedTo":         record.GetString("promotedTo"),
		"created":            record.GetString("created"),
		"updated":            record.GetString("updated"),
		"createdBy":          record.GetString("createdBy"),
	}
}
