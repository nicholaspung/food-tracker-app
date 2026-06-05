package handlers

import (
	"database/sql"
	"errors"
	"sort"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

type groupMenuSuggestionSourceResponse struct {
	RestaurantID       string   `json:"restaurantId"`
	RestaurantName     string   `json:"restaurantName"`
	RestaurantLocation string   `json:"restaurantLocation,omitempty"`
	MenuItemIDs        []string `json:"menuItemIds"`
	MenuItemCount      int      `json:"menuItemCount"`
	LatestUpdatedAt    string   `json:"latestUpdatedAt,omitempty"`
}

type groupMenuSuggestionResponse struct {
	NormalizedItemName    string                              `json:"normalizedItemName"`
	DisplayName           string                              `json:"displayName"`
	SourceRestaurantCount int                                 `json:"sourceRestaurantCount"`
	SourceItemCount       int                                 `json:"sourceItemCount"`
	LatestSourceUpdatedAt string                              `json:"latestSourceUpdatedAt,omitempty"`
	OwnOrderCount         int                                 `json:"ownOrderCount,omitempty"`
	LatestOwnOrderedAt    string                              `json:"latestOwnOrderedAt,omitempty"`
	Sources               []groupMenuSuggestionSourceResponse `json:"sources"`
}

type groupMenuSuggestionsResponse struct {
	RestaurantID      string                        `json:"restaurantId"`
	RestaurantGroupID string                        `json:"restaurantGroupId,omitempty"`
	Suggestions       []groupMenuSuggestionResponse `json:"suggestions"`
}

type groupMenuSuggestionSourceRow struct {
	MenuItemID         string `db:"menuItemId"`
	MenuItemName       string `db:"menuItemName"`
	NormalizedItemName string `db:"normalizedItemName"`
	RestaurantID       string `db:"restaurantId"`
	RestaurantName     string `db:"restaurantName"`
	RestaurantLocation string `db:"restaurantLocation"`
	LatestUpdatedAt    string `db:"latestUpdatedAt"`
}

type groupMenuSuggestionOwnHistoryRow struct {
	NormalizedItemName string `db:"normalizedItemName"`
	OwnOrderCount      int    `db:"ownOrderCount"`
	LatestOwnOrderedAt string `db:"latestOwnOrderedAt"`
}

type groupMenuSuggestionAccumulator struct {
	normalizedItemName    string
	displayName           string
	sourceItemCount       int
	latestSourceUpdatedAt string
	sourcesByRestaurant   map[string]*groupMenuSuggestionSourceResponse
	ownOrderCount         int
	latestOwnOrderedAt    string
}

func getGroupMenuSuggestionsForRestaurant(
	app core.App,
	authRecord *core.Record,
	restaurantID string,
) (groupMenuSuggestionsResponse, error) {
	response := groupMenuSuggestionsResponse{
		RestaurantID: strings.TrimSpace(restaurantID),
		Suggestions:  []groupMenuSuggestionResponse{},
	}
	if authRecord == nil {
		return response, apis.NewUnauthorizedError("authentication required", nil)
	}

	viewerUserID := strings.TrimSpace(authRecord.Id)
	isAdmin := authRecord.GetBool("isAdmin")
	acceptedFriendIDs := map[string]struct{}{}
	if !isAdmin && viewerUserID != "" {
		friendIDs, err := listAcceptedFriendIDs(app, viewerUserID)
		if err != nil {
			return response, apis.NewApiError(500, "failed to resolve restaurant visibility", err)
		}
		acceptedFriendIDs = friendIDs
	}

	restaurantRecord, err := findAccessibleRestaurantByID(app, restaurantID, viewerUserID, isAdmin, acceptedFriendIDs)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return response, apis.NewNotFoundError("restaurant not found", nil)
		}
		return response, apis.NewApiError(500, "failed to resolve restaurant", err)
	}

	response.RestaurantID = restaurantRecord.Id
	response.RestaurantGroupID = strings.TrimSpace(restaurantRecord.GetString("restaurantGroup"))
	if response.RestaurantGroupID == "" {
		return response, nil
	}

	sourceRows, err := listGroupMenuSuggestionSourceRows(app, restaurantRecord.Id, response.RestaurantGroupID)
	if err != nil {
		return response, apis.NewApiError(500, "failed to load group menu suggestions", err)
	}
	if len(sourceRows) == 0 {
		return response, nil
	}

	ownHistoryRows, err := listExactRestaurantOwnHistoryRows(app, restaurantRecord.Id, viewerUserID)
	if err != nil {
		return response, apis.NewApiError(500, "failed to load exact restaurant ordered history", err)
	}

	response.Suggestions = buildGroupMenuSuggestionResponses(sourceRows, ownHistoryRows)
	return response, nil
}

func listGroupMenuSuggestionSourceRows(
	app core.App,
	restaurantID string,
	restaurantGroupID string,
) ([]groupMenuSuggestionSourceRow, error) {
	rows := []groupMenuSuggestionSourceRow{}
	err := app.DB().NewQuery(`
		SELECT
			menu_items.id AS [[menuItemId]],
			COALESCE(menu_items.name, '') AS [[menuItemName]],
			LOWER(TRIM(COALESCE(menu_items.name, ''))) AS [[normalizedItemName]],
			restaurants.id AS [[restaurantId]],
			COALESCE(restaurants.name, '') AS [[restaurantName]],
			COALESCE(restaurants.location, '') AS [[restaurantLocation]],
			COALESCE(NULLIF(TRIM(menu_items.updated), ''), menu_items.created) AS [[latestUpdatedAt]]
		FROM menu_items
		INNER JOIN restaurants ON restaurants.id = menu_items.restaurant
		WHERE restaurants.restaurantGroup = {:restaurantGroupId}
			AND restaurants.id != {:restaurantId}
			AND COALESCE(menu_items.approvalStatus, 'unreviewed') = 'approved'
			AND COALESCE(menu_items.visibility, '') = 'public'
			AND COALESCE(menu_items.groupSuitable, 0) = 1
			AND TRIM(COALESCE(menu_items.name, '')) != ''
			AND NOT EXISTS (
				SELECT 1
				FROM menu_items exact_items
				WHERE exact_items.restaurant = {:restaurantId}
					AND LOWER(TRIM(COALESCE(exact_items.name, ''))) = LOWER(TRIM(COALESCE(menu_items.name, '')))
					AND TRIM(COALESCE(exact_items.name, '')) != ''
			)
		ORDER BY
			LOWER(TRIM(COALESCE(menu_items.name, ''))) ASC,
			restaurants.name ASC,
			COALESCE(NULLIF(TRIM(menu_items.updated), ''), menu_items.created) DESC,
			menu_items.id DESC
	`).Bind(dbx.Params{
		"restaurantId":      strings.TrimSpace(restaurantID),
		"restaurantGroupId": strings.TrimSpace(restaurantGroupID),
	}).All(&rows)
	if err != nil {
		return nil, err
	}

	result := make([]groupMenuSuggestionSourceRow, 0, len(rows))
	for _, row := range rows {
		row.MenuItemID = strings.TrimSpace(row.MenuItemID)
		row.MenuItemName = strings.TrimSpace(row.MenuItemName)
		row.NormalizedItemName = strings.TrimSpace(row.NormalizedItemName)
		row.RestaurantID = strings.TrimSpace(row.RestaurantID)
		row.RestaurantName = strings.TrimSpace(row.RestaurantName)
		row.RestaurantLocation = strings.TrimSpace(row.RestaurantLocation)
		row.LatestUpdatedAt = strings.TrimSpace(row.LatestUpdatedAt)
		if row.MenuItemID == "" || row.NormalizedItemName == "" || row.RestaurantID == "" {
			continue
		}
		result = append(result, row)
	}

	return result, nil
}

func listExactRestaurantOwnHistoryRows(
	app core.App,
	restaurantID string,
	userID string,
) ([]groupMenuSuggestionOwnHistoryRow, error) {
	if strings.TrimSpace(userID) == "" {
		return []groupMenuSuggestionOwnHistoryRow{}, nil
	}

	rows := []groupMenuSuggestionOwnHistoryRow{}
	err := app.DB().NewQuery(`
		SELECT
			LOWER(TRIM(COALESCE(food_items.name, ''))) AS [[normalizedItemName]],
			COUNT(food_items.id) AS [[ownOrderCount]],
			MAX(
				COALESCE(
					NULLIF(TRIM(visits.visitDate), ''),
					NULLIF(TRIM(food_items.itemDate), ''),
					food_items.created
				)
			) AS [[latestOwnOrderedAt]]
		FROM food_items
		INNER JOIN visits ON visits.id = food_items.visit
		WHERE food_items.user = {:userId}
			AND visits.user = {:userId}
			AND visits.restaurant = {:restaurantId}
			AND TRIM(COALESCE(food_items.name, '')) != ''
			AND (
				` + visitItemSQL("food_items") + `
				OR ` + foodProductSQL("food_items") + `
			)
			AND ` + ownerAccessibleVisitModerationCondition + `
			AND COALESCE(food_items.moderationStatus, '') IN ('', 'active', 'reviewed', 'under_review')
		GROUP BY LOWER(TRIM(COALESCE(food_items.name, '')))
	`).Bind(dbx.Params{
		"restaurantId": strings.TrimSpace(restaurantID),
		"userId":       strings.TrimSpace(userID),
	}).All(&rows)
	if err != nil {
		return nil, err
	}

	result := make([]groupMenuSuggestionOwnHistoryRow, 0, len(rows))
	for _, row := range rows {
		row.NormalizedItemName = strings.TrimSpace(row.NormalizedItemName)
		row.LatestOwnOrderedAt = strings.TrimSpace(row.LatestOwnOrderedAt)
		if row.NormalizedItemName == "" {
			continue
		}
		result = append(result, row)
	}

	return result, nil
}

func buildGroupMenuSuggestionResponses(
	sourceRows []groupMenuSuggestionSourceRow,
	ownHistoryRows []groupMenuSuggestionOwnHistoryRow,
) []groupMenuSuggestionResponse {
	ownHistoryByName := map[string]groupMenuSuggestionOwnHistoryRow{}
	for _, row := range ownHistoryRows {
		ownHistoryByName[row.NormalizedItemName] = row
	}

	accumulators := map[string]*groupMenuSuggestionAccumulator{}
	for _, row := range sourceRows {
		accumulator := accumulators[row.NormalizedItemName]
		if accumulator == nil {
			accumulator = &groupMenuSuggestionAccumulator{
				normalizedItemName:  row.NormalizedItemName,
				displayName:         row.MenuItemName,
				sourcesByRestaurant: map[string]*groupMenuSuggestionSourceResponse{},
			}
			if history, ok := ownHistoryByName[row.NormalizedItemName]; ok {
				accumulator.ownOrderCount = history.OwnOrderCount
				accumulator.latestOwnOrderedAt = history.LatestOwnOrderedAt
			}
			accumulators[row.NormalizedItemName] = accumulator
		}

		if accumulator.displayName == "" || len(row.MenuItemName) < len(accumulator.displayName) {
			accumulator.displayName = row.MenuItemName
		}
		accumulator.sourceItemCount++
		if row.LatestUpdatedAt > accumulator.latestSourceUpdatedAt {
			accumulator.latestSourceUpdatedAt = row.LatestUpdatedAt
		}

		source := accumulator.sourcesByRestaurant[row.RestaurantID]
		if source == nil {
			source = &groupMenuSuggestionSourceResponse{
				RestaurantID:       row.RestaurantID,
				RestaurantName:     row.RestaurantName,
				RestaurantLocation: row.RestaurantLocation,
				MenuItemIDs:        []string{},
			}
			accumulator.sourcesByRestaurant[row.RestaurantID] = source
		}
		source.MenuItemIDs = append(source.MenuItemIDs, row.MenuItemID)
		source.MenuItemCount++
		if row.LatestUpdatedAt > source.LatestUpdatedAt {
			source.LatestUpdatedAt = row.LatestUpdatedAt
		}
	}

	suggestions := make([]groupMenuSuggestionResponse, 0, len(accumulators))
	for _, accumulator := range accumulators {
		sources := make([]groupMenuSuggestionSourceResponse, 0, len(accumulator.sourcesByRestaurant))
		for _, source := range accumulator.sourcesByRestaurant {
			sort.Strings(source.MenuItemIDs)
			sources = append(sources, *source)
		}
		sort.Slice(sources, func(i, j int) bool {
			if sources[i].LatestUpdatedAt != sources[j].LatestUpdatedAt {
				return sources[i].LatestUpdatedAt > sources[j].LatestUpdatedAt
			}
			if sources[i].RestaurantName != sources[j].RestaurantName {
				return sources[i].RestaurantName < sources[j].RestaurantName
			}
			return sources[i].RestaurantID < sources[j].RestaurantID
		})

		suggestions = append(suggestions, groupMenuSuggestionResponse{
			NormalizedItemName:    accumulator.normalizedItemName,
			DisplayName:           accumulator.displayName,
			SourceRestaurantCount: len(sources),
			SourceItemCount:       accumulator.sourceItemCount,
			LatestSourceUpdatedAt: accumulator.latestSourceUpdatedAt,
			OwnOrderCount:         accumulator.ownOrderCount,
			LatestOwnOrderedAt:    accumulator.latestOwnOrderedAt,
			Sources:               sources,
		})
	}

	sort.Slice(suggestions, func(i, j int) bool {
		if suggestions[i].SourceRestaurantCount != suggestions[j].SourceRestaurantCount {
			return suggestions[i].SourceRestaurantCount > suggestions[j].SourceRestaurantCount
		}
		if suggestions[i].SourceItemCount != suggestions[j].SourceItemCount {
			return suggestions[i].SourceItemCount > suggestions[j].SourceItemCount
		}
		if suggestions[i].OwnOrderCount != suggestions[j].OwnOrderCount {
			return suggestions[i].OwnOrderCount > suggestions[j].OwnOrderCount
		}
		if suggestions[i].LatestSourceUpdatedAt != suggestions[j].LatestSourceUpdatedAt {
			return suggestions[i].LatestSourceUpdatedAt > suggestions[j].LatestSourceUpdatedAt
		}
		return suggestions[i].DisplayName < suggestions[j].DisplayName
	})

	return suggestions
}
