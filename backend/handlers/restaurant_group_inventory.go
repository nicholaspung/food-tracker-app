package handlers

import (
	"log"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

const adminRestaurantGroupCandidateLimit = 25

type adminRestaurantGroupCreateRequest struct {
	Name         string `json:"name"`
	Notes        string `json:"notes"`
	RestaurantID string `json:"restaurantId"`
}

type adminRestaurantGroupMetadataRequest struct {
	Name  string `json:"name"`
	Notes string `json:"notes"`
}

type adminRestaurantGroupMembershipRequest struct {
	GroupID string `json:"groupId"`
}

func createAdminRestaurantGroup(app core.App, adminID string, request adminRestaurantGroupCreateRequest) (map[string]any, error) {
	name := strings.TrimSpace(request.Name)
	if name == "" {
		return nil, apis.NewBadRequestError("group name is required", nil)
	}

	notes := strings.TrimSpace(request.Notes)
	restaurantID := strings.TrimSpace(request.RestaurantID)
	var groupID string

	if err := app.RunInTransaction(func(txApp core.App) error {
		groupsCollection, err := txApp.FindCollectionByNameOrId("restaurant_groups")
		if err != nil {
			return apis.NewApiError(500, "restaurant groups are not available", err)
		}

		if restaurantID != "" {
			if _, err := txApp.FindRecordById("restaurants", restaurantID); err != nil {
				return apis.NewNotFoundError("restaurant was not found", err)
			}
		}

		group := core.NewRecord(groupsCollection)
		group.Set("name", name)
		group.Set("notes", notes)
		group.Set("createdBy", strings.TrimSpace(adminID))
		if err := txApp.Save(group); err != nil {
			log.Printf("Admin restaurant group create failed for name=%q: %v", name, err)
			return apis.NewApiError(500, "failed to create restaurant group", err)
		}
		groupID = group.Id

		if restaurantID != "" {
			restaurant, err := txApp.FindRecordById("restaurants", restaurantID)
			if err != nil {
				return apis.NewNotFoundError("restaurant was not found", err)
			}
			restaurant.Set("restaurantGroup", groupID)
			if err := txApp.Save(restaurant); err != nil {
				log.Printf("Admin restaurant group assignment failed for restaurant=%q group=%q: %v", restaurantID, groupID, err)
				return apis.NewApiError(500, "failed to assign restaurant group", err)
			}
		}

		return nil
	}); err != nil {
		return nil, err
	}

	group, err := app.FindRecordById("restaurant_groups", groupID)
	if err != nil {
		return nil, apis.NewApiError(500, "failed to load restaurant group", err)
	}

	result := map[string]any{
		"restaurantGroup": serializeAdminRestaurantGroupRecord(group),
	}

	if restaurantID != "" {
		detail, err := loadAdminRestaurantInventoryDetail(app, restaurantID)
		if err != nil {
			return nil, err
		}
		result["restaurantDetail"] = detail
	}

	return result, nil
}

func updateAdminRestaurantGroupMetadata(app core.App, groupID string, request adminRestaurantGroupMetadataRequest) (map[string]any, error) {
	name := strings.TrimSpace(request.Name)
	if name == "" {
		return nil, apis.NewBadRequestError("group name is required", nil)
	}

	notes := strings.TrimSpace(request.Notes)

	group, err := app.FindRecordById("restaurant_groups", strings.TrimSpace(groupID))
	if err != nil {
		return nil, apis.NewNotFoundError("restaurant group was not found", err)
	}

	group.Set("name", name)
	group.Set("notes", notes)
	if err := app.Save(group); err != nil {
		log.Printf("Admin restaurant group metadata update failed for group=%q: %v", groupID, err)
		return nil, apis.NewApiError(500, "failed to update restaurant group", err)
	}

	return serializeAdminRestaurantGroupRecord(group), nil
}

func updateAdminRestaurantGroupMembership(app core.App, restaurantID string, request adminRestaurantGroupMembershipRequest) (map[string]any, error) {
	groupID := strings.TrimSpace(request.GroupID)

	if err := app.RunInTransaction(func(txApp core.App) error {
		restaurant, err := txApp.FindRecordById("restaurants", restaurantID)
		if err != nil {
			return apis.NewNotFoundError("restaurant was not found", err)
		}

		if groupID != "" {
			if _, err := txApp.FindRecordById("restaurant_groups", groupID); err != nil {
				return apis.NewNotFoundError("restaurant group was not found", err)
			}
		}

		restaurant.Set("restaurantGroup", groupID)
		if err := txApp.Save(restaurant); err != nil {
			log.Printf("Admin restaurant group membership update failed for restaurant=%q group=%q: %v", restaurantID, groupID, err)
			return apis.NewApiError(500, "failed to update restaurant group membership", err)
		}

		return nil
	}); err != nil {
		return nil, err
	}

	return loadAdminRestaurantInventoryDetail(app, restaurantID)
}

func loadAdminRestaurantGroupSameNameCandidates(app core.App, restaurant adminMenuInventoryRestaurantRow) ([]adminMenuInventoryRestaurantRow, error) {
	normalizedName := strings.ToLower(strings.TrimSpace(restaurant.Name))
	if normalizedName == "" {
		return []adminMenuInventoryRestaurantRow{}, nil
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
		WHERE LOWER(TRIM(COALESCE(restaurants.name, ''))) = {:name}
			AND restaurants.id != {:restaurantId}
		ORDER BY
			CASE WHEN COALESCE(restaurants.restaurantGroup, '') = COALESCE({:currentGroupId}, '') AND COALESCE({:currentGroupId}, '') != '' THEN 0 ELSE 1 END,
			restaurants.location ASC,
			restaurants.updated DESC
		LIMIT {:limit}
	`).Bind(dbx.Params{
		"name":           normalizedName,
		"restaurantId":   restaurant.ID,
		"currentGroupId": restaurant.RestaurantGroup,
		"limit":          adminRestaurantGroupCandidateLimit,
	}).All(&rows); err != nil {
		return nil, err
	}

	return rows, nil
}

func serializeAdminRestaurantGroupFromRestaurantRow(row adminMenuInventoryRestaurantRow) map[string]any {
	if strings.TrimSpace(row.GroupID) == "" {
		return nil
	}

	return map[string]any{
		"id":        row.GroupID,
		"name":      row.GroupName,
		"notes":     row.GroupNotes,
		"createdBy": row.GroupCreatedBy,
		"created":   row.GroupCreated,
		"updated":   row.GroupUpdated,
	}
}

func serializeAdminRestaurantGroupRecord(record *core.Record) map[string]any {
	if record == nil {
		return nil
	}

	return map[string]any{
		"id":        record.Id,
		"name":      record.GetString("name"),
		"notes":     record.GetString("notes"),
		"createdBy": record.GetString("createdBy"),
		"created":   record.GetString("created"),
		"updated":   record.GetString("updated"),
	}
}
