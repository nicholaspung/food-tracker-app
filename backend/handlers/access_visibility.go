package handlers

import (
	"database/sql"
	"errors"
	"fmt"
	"sort"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

func listAcceptedFriendIDs(app core.App, userID string) (map[string]struct{}, error) {
	rows := []struct {
		FriendID string `db:"friendId"`
	}{}

	err := app.DB().NewQuery(`
		SELECT friend AS [[friendId]]
		FROM friendships
		WHERE user = {:userId} AND status = 'accepted'
		UNION
		SELECT user AS [[friendId]]
		FROM friendships
		WHERE friend = {:userId} AND status = 'accepted'
	`).
		Bind(dbx.Params{"userId": userID}).
		All(&rows)
	if err != nil {
		return nil, err
	}

	result := make(map[string]struct{}, len(rows))
	for _, row := range rows {
		trimmedID := strings.TrimSpace(row.FriendID)
		if trimmedID == "" {
			continue
		}
		result[trimmedID] = struct{}{}
	}

	return result, nil
}

func canAccessRestaurantListRecord(
	record *core.Record,
	userID string,
	isAdmin bool,
	acceptedFriendIDs map[string]struct{},
) bool {
	if record == nil {
		return false
	}

	if isAdmin {
		return true
	}

	if !isVisibleModerationStatus(record.GetString("moderationStatus")) {
		return false
	}

	ownerID := strings.TrimSpace(record.GetString("user"))
	if ownerID == userID {
		return true
	}

	return strings.TrimSpace(record.GetString("visibility")) == "friends" && hasAcceptedFriend(acceptedFriendIDs, ownerID)
}

func canAccessRestaurantRecord(
	record *core.Record,
	userID string,
	isAdmin bool,
	acceptedFriendIDs map[string]struct{},
) bool {
	if record == nil {
		return false
	}

	if isAdmin {
		return true
	}

	ownerID := strings.TrimSpace(record.GetString("createdBy"))
	if ownerID != "" && ownerID == userID {
		return true
	}

	switch strings.TrimSpace(record.GetString("visibility")) {
	case "public":
		return true
	case "friends":
		return ownerID != "" && hasAcceptedFriend(acceptedFriendIDs, ownerID)
	default:
		return false
	}
}

func findAccessibleRestaurantByID(
	app core.App,
	restaurantID string,
	userID string,
	isAdmin bool,
	acceptedFriendIDs map[string]struct{},
) (*core.Record, error) {
	record, err := app.FindRecordById("restaurants", strings.TrimSpace(restaurantID))
	if err != nil {
		return nil, err
	}

	if !canAccessRestaurantRecord(record, userID, isAdmin, acceptedFriendIDs) {
		return nil, sql.ErrNoRows
	}

	return record, nil
}

func findAccessibleRestaurantByNormalizedKeys(
	app core.App,
	userID string,
	isAdmin bool,
	acceptedFriendIDs map[string]struct{},
	restaurantName string,
	placeID string,
) (*core.Record, error) {
	if record, err := findAccessibleRestaurantByNormalizedPlaceID(
		app,
		userID,
		isAdmin,
		acceptedFriendIDs,
		placeID,
	); err != nil || record != nil {
		return record, err
	}

	return findAccessibleRestaurantByNormalizedName(
		app,
		userID,
		isAdmin,
		acceptedFriendIDs,
		restaurantName,
	)
}

func findAccessibleRestaurantByNormalizedPlaceID(
	app core.App,
	userID string,
	isAdmin bool,
	acceptedFriendIDs map[string]struct{},
	placeID string,
) (*core.Record, error) {
	normalizedPlaceID := strings.ToLower(strings.TrimSpace(placeID))
	if normalizedPlaceID == "" {
		return nil, nil
	}

	if record, err := findFirstRestaurantByNormalizedPlaceID(
		app,
		normalizedPlaceID,
		"COALESCE(isGooglePlace, 0) = 1",
		nil,
	); err != nil || record != nil {
		return record, err
	}

	if trimmedUserID := strings.TrimSpace(userID); trimmedUserID != "" {
		record, err := findFirstRestaurantByNormalizedPlaceID(
			app,
			normalizedPlaceID,
			"TRIM(COALESCE(createdBy, '')) = {:userId}",
			dbx.Params{"userId": trimmedUserID},
		)
		if err != nil || record != nil {
			return record, err
		}
	}

	friendFilter, friendParams := buildRestaurantCreatedByFriendFilter(acceptedFriendIDs, "friendPlaceId")
	if friendFilter != "" {
		record, err := findFirstRestaurantByNormalizedPlaceID(
			app,
			normalizedPlaceID,
			friendFilter+" AND COALESCE(visibility, '') = 'friends'",
			friendParams,
		)
		if err != nil || record != nil {
			return record, err
		}
	}

	if !isAdmin {
		return nil, nil
	}

	return findFirstRestaurantByNormalizedPlaceID(app, normalizedPlaceID, "", nil)
}

func findAccessibleRestaurantByNormalizedName(
	app core.App,
	userID string,
	isAdmin bool,
	acceptedFriendIDs map[string]struct{},
	restaurantName string,
) (*core.Record, error) {
	normalizedName := strings.ToLower(strings.TrimSpace(restaurantName))
	if normalizedName == "" {
		return nil, nil
	}

	if record, err := findFirstRestaurantByNormalizedName(
		app,
		normalizedName,
		"(COALESCE(visibility, '') = 'public' OR COALESCE(isGooglePlace, 0) = 1)",
		nil,
	); err != nil || record != nil {
		return record, err
	}

	if trimmedUserID := strings.TrimSpace(userID); trimmedUserID != "" {
		record, err := findFirstRestaurantByNormalizedName(
			app,
			normalizedName,
			"TRIM(COALESCE(createdBy, '')) = {:userId}",
			dbx.Params{"userId": trimmedUserID},
		)
		if err != nil || record != nil {
			return record, err
		}
	}

	friendFilter, friendParams := buildRestaurantCreatedByFriendFilter(acceptedFriendIDs, "friendName")
	if friendFilter != "" {
		record, err := findFirstRestaurantByNormalizedName(
			app,
			normalizedName,
			friendFilter+" AND COALESCE(visibility, '') = 'friends'",
			friendParams,
		)
		if err != nil || record != nil {
			return record, err
		}
	}

	if !isAdmin {
		return nil, nil
	}

	return findFirstRestaurantByNormalizedName(app, normalizedName, "", nil)
}

func findFirstRestaurantByNormalizedPlaceID(
	app core.App,
	normalizedPlaceID string,
	additionalFilter string,
	params dbx.Params,
) (*core.Record, error) {
	return findFirstRestaurantByNormalizedField(
		app,
		"LOWER(TRIM(COALESCE(placeId, '')))",
		normalizedPlaceID,
		`CASE WHEN COALESCE(isGooglePlace, 0) = 1 THEN 0 ELSE 1 END, updated DESC, created DESC, id ASC`,
		additionalFilter,
		params,
	)
}

func findFirstRestaurantByNormalizedName(
	app core.App,
	normalizedName string,
	additionalFilter string,
	params dbx.Params,
) (*core.Record, error) {
	return findFirstRestaurantByNormalizedField(
		app,
		"LOWER(TRIM(name))",
		normalizedName,
		`CASE WHEN TRIM(COALESCE(placeId, '')) != '' THEN 0 ELSE 1 END,
		 CASE WHEN COALESCE(isGooglePlace, 0) = 1 THEN 0 ELSE 1 END,
		 updated DESC,
		 created DESC,
		 id ASC`,
		additionalFilter,
		params,
	)
}

func findFirstRestaurantByNormalizedField(
	app core.App,
	fieldExpr string,
	normalizedValue string,
	orderBy string,
	additionalFilter string,
	params dbx.Params,
) (*core.Record, error) {
	row := struct {
		ID string `db:"id"`
	}{}

	queryParams := dbx.Params{"normalizedValue": normalizedValue}
	for key, value := range params {
		queryParams[key] = value
	}

	query := fmt.Sprintf(`
		SELECT id
		FROM restaurants
		WHERE %s = {:normalizedValue}
	`, fieldExpr)
	if strings.TrimSpace(additionalFilter) != "" {
		query += "\nAND (" + additionalFilter + ")\n"
	}
	query += "ORDER BY " + orderBy + "\nLIMIT 1"

	err := app.DB().NewQuery(query).
		Bind(queryParams).
		One(&row)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	record, err := app.FindRecordById("restaurants", row.ID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	return record, nil
}

func buildRestaurantCreatedByFriendFilter(
	acceptedFriendIDs map[string]struct{},
	paramPrefix string,
) (string, dbx.Params) {
	friendIDs := make([]string, 0, len(acceptedFriendIDs))
	for friendID := range acceptedFriendIDs {
		friendIDs = append(friendIDs, friendID)
	}
	sort.Strings(friendIDs)

	return buildSQLInFilter("createdBy", paramPrefix, friendIDs)
}

func canAccessVisitRecord(
	record *core.Record,
	userID string,
	isAdmin bool,
	acceptedFriendIDs map[string]struct{},
) bool {
	if record == nil {
		return false
	}

	if isAdmin {
		return true
	}

	ownerID := strings.TrimSpace(record.GetString("user"))
	status := record.GetString("moderationStatus")
	if ownerID == userID {
		return isOwnerAccessibleModerationStatus(status)
	}

	if !isVisibleModerationStatus(status) {
		return false
	}

	switch strings.TrimSpace(record.GetString("visibility")) {
	case "public":
		return true
	case "friends":
		return hasAcceptedFriend(acceptedFriendIDs, ownerID)
	default:
		return false
	}
}

func canAccessFoodItemRecord(
	record *core.Record,
	visitsByID map[string]*core.Record,
	userID string,
	isAdmin bool,
	acceptedFriendIDs map[string]struct{},
) bool {
	if record == nil {
		return false
	}

	if isAdmin {
		return true
	}

	ownerID := strings.TrimSpace(record.GetString("user"))
	status := record.GetString("moderationStatus")
	if ownerID == userID {
		return isOwnerAccessibleModerationStatus(status)
	}

	if !isVisibleModerationStatus(status) {
		return false
	}

	visitID := strings.TrimSpace(record.GetString("visit"))
	if visitID != "" {
		visit := visitsByID[visitID]
		if visit == nil || !isVisibleModerationStatus(visit.GetString("moderationStatus")) {
			return false
		}

		visitOwnerID := strings.TrimSpace(visit.GetString("user"))
		switch strings.TrimSpace(visit.GetString("visibility")) {
		case "public":
			return true
		case "friends":
			return hasAcceptedFriend(acceptedFriendIDs, visitOwnerID)
		default:
			return false
		}
	}

	if !isFoodProductRecord(record) {
		return false
	}

	switch strings.TrimSpace(record.GetString("visibility")) {
	case "public":
		return true
	case "friends":
		return hasAcceptedFriend(acceptedFriendIDs, ownerID)
	default:
		return false
	}
}

func canAccessMenuItemRecord(
	record *core.Record,
	userID string,
	isAdmin bool,
	acceptedFriendIDs map[string]struct{},
) bool {
	if record == nil {
		return false
	}

	if isAdmin {
		return true
	}

	ownerID := strings.TrimSpace(record.GetString("createdBy"))
	if ownerID != "" && ownerID == userID {
		return true
	}

	switch strings.TrimSpace(record.GetString("visibility")) {
	case "public":
		return true
	case "friends":
		return ownerID != "" && hasAcceptedFriend(acceptedFriendIDs, ownerID)
	default:
		return false
	}
}

func canAccessVisitPhotoRecord(
	record *core.Record,
	foodItemsByID map[string]*core.Record,
	visitsByID map[string]*core.Record,
	userID string,
	isAdmin bool,
	acceptedFriendIDs map[string]struct{},
) bool {
	if record == nil {
		return false
	}

	if isAdmin {
		return true
	}

	ownerID := strings.TrimSpace(record.GetString("user"))
	isOwner := ownerID != "" && ownerID == userID
	if isOwner {
		if !isOwnerAccessibleModerationStatus(record.GetString("moderationStatus")) {
			return false
		}
	} else if !isVisibleModerationStatus(record.GetString("moderationStatus")) {
		return false
	}

	foodItemID := strings.TrimSpace(record.GetString("food_item"))
	if foodItemID != "" {
		foodItem := foodItemsByID[foodItemID]
		if foodItem == nil || !canAccessFoodItemRecord(foodItem, visitsByID, userID, isAdmin, acceptedFriendIDs) {
			return false
		}
	}

	visitID := strings.TrimSpace(record.GetString("visit"))
	if visitID != "" {
		visit := visitsByID[visitID]
		if visit == nil || !canAccessVisitRecord(visit, userID, isAdmin, acceptedFriendIDs) {
			return false
		}
	}

	return foodItemID != "" || visitID != ""
}

func isVisibleModerationStatus(value string) bool {
	switch strings.TrimSpace(value) {
	case "", "active", "reviewed":
		return true
	default:
		return false
	}
}

func isOwnerAccessibleModerationStatus(value string) bool {
	switch strings.TrimSpace(value) {
	case "", "active", "reviewed", "under_review":
		return true
	default:
		return false
	}
}

func hasAcceptedFriend(acceptedFriendIDs map[string]struct{}, candidateID string) bool {
	_, exists := acceptedFriendIDs[strings.TrimSpace(candidateID)]
	return exists
}
