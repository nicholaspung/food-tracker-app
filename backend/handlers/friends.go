package handlers

import (
	"database/sql"
	"errors"
	"fmt"
	"strconv"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"

	"myapp/lib"
)

const (
	friendsSectionAccepted = "friends"
	friendsSectionIncoming = "requests"
	friendsSectionSent     = "sent"

	defaultFriendsPageSize = 20
	maxFriendsPageSize     = 100
)

type friendsListItem struct {
	ID          string `db:"id" json:"id"`
	UserID      string `db:"userId" json:"userId"`
	DisplayName string `json:"displayName"`
	Status      string `json:"status"`
	CreatedAt   string `db:"createdAt" json:"createdAt"`
}

type friendsListRow struct {
	ID         string `db:"id"`
	UserID     string `db:"userId"`
	OtherName  string `db:"otherName"`
	OtherEmail string `db:"otherEmail"`
	CreatedAt  string `db:"createdAt"`
}

type friendsListResponse struct {
	Items       []friendsListItem       `json:"items"`
	Summary     *friendsSummaryResponse `json:"summary,omitempty"`
	Page        int                     `json:"page"`
	PageSize    int                     `json:"pageSize"`
	TotalItems  int                     `json:"totalItems"`
	TotalPages  int                     `json:"totalPages"`
	HasNextPage bool                    `json:"hasNextPage"`
}

type friendsListFilters struct {
	Search  string
	UserIDs []string
}

// RegisterFriendHandlers registers authenticated friendship endpoints used by mobile surfaces.
func RegisterFriendHandlers(se *core.ServeEvent, app core.App) {
	se.Router.GET("/api/friends", func(e *core.RequestEvent) error {
		if e.Auth == nil {
			return apis.NewUnauthorizedError("authentication required", nil)
		}

		section, err := normalizeFriendsSection(e.Request.URL.Query().Get("section"))
		if err != nil {
			return apis.NewBadRequestError(err.Error(), nil)
		}

		page, pageSize, err := parseFriendsPagination(e.Request.URL.Query().Get("page"), e.Request.URL.Query().Get("pageSize"))
		if err != nil {
			return apis.NewBadRequestError(err.Error(), nil)
		}

		filters := parseFriendsFilters(
			e.Request.URL.Query().Get("search"),
			e.Request.URL.Query()["userIds"],
		)

		response, err := listFriendsPageResponse(app, e.Auth.Id, section, page, pageSize, filters)
		if err != nil {
			return apis.NewApiError(500, "failed to load friends", err)
		}

		return e.JSON(200, response)
	}).Bind(apis.RequireAuth())

	se.Router.POST("/api/friends/invite", func(e *core.RequestEvent) error {
		if e.Auth == nil {
			return apis.NewUnauthorizedError("authentication required", nil)
		}

		data := struct {
			Code string `json:"code"`
		}{}
		if err := e.BindBody(&data); err != nil {
			return apis.NewBadRequestError("invalid request body", err)
		}

		normalizedCode := lib.NormalizeFriendCode(data.Code)
		if normalizedCode == "" {
			return apis.NewBadRequestError("Friend code is required.", nil)
		}
		if len(normalizedCode) != lib.FriendCodeLength {
			return apis.NewBadRequestError("Friend code is invalid.", nil)
		}

		responsePayload := friendsListItem{}
		idempotentFriendshipID := deriveFeatureWriteRecordID(
			"friend-request:"+e.Auth.Id,
			resolveFeatureWriteIdempotencyKey(e),
		)
		err := app.RunInTransaction(func(txApp core.App) error {
			targetUser, err := txApp.FindFirstRecordByFilter(
				"users",
				"friendCode = {:code}",
				dbx.Params{"code": normalizedCode},
			)
			if err != nil {
				if errors.Is(err, sql.ErrNoRows) {
					return apis.NewNotFoundError("Friend code not found.", nil)
				}
				return apis.NewApiError(500, "failed to look up friend code", err)
			}
			if targetUser == nil {
				return apis.NewNotFoundError("Friend code not found.", nil)
			}

			if strings.TrimSpace(targetUser.Id) == strings.TrimSpace(e.Auth.Id) {
				return apis.NewBadRequestError("Cannot add yourself as a friend.", nil)
			}

			existing, err := findFriendshipBetweenUsers(txApp, e.Auth.Id, targetUser.Id)
			if err != nil {
				return apis.NewApiError(500, "failed to resolve friendship", err)
			}
			if existing != nil {
				if idempotentFriendshipID != "" &&
					existing.Id == idempotentFriendshipID &&
					existing.GetString("user") == e.Auth.Id &&
					existing.GetString("friend") == targetUser.Id {
					responsePayload = friendsListItem{
						ID:          existing.Id,
						UserID:      targetUser.Id,
						DisplayName: lib.ResolveUserDisplayName(targetUser),
						Status:      friendsSectionStatus(friendsSectionSent),
						CreatedAt:   existing.GetString("created"),
					}
					return nil
				}
				return apis.NewBadRequestError("Friend request already exists.", nil)
			}

			collection, err := txApp.FindCollectionByNameOrId("friendships")
			if err != nil {
				return apis.NewApiError(500, "friendships collection missing", err)
			}

			record := core.NewRecord(collection)
			if idempotentFriendshipID != "" {
				record.SetRaw("id", idempotentFriendshipID)
			}
			record.Set("user", e.Auth.Id)
			record.Set("friend", targetUser.Id)
			record.Set("status", "pending")

			if err := txApp.Save(record); err != nil {
				if isUniqueConstraintError(err) {
					return apis.NewBadRequestError("Friend request already exists.", nil)
				}
				return apis.NewApiError(500, "failed to create friend request", err)
			}

			responsePayload = friendsListItem{
				ID:          record.Id,
				UserID:      targetUser.Id,
				DisplayName: lib.ResolveUserDisplayName(targetUser),
				Status:      friendsSectionStatus(friendsSectionSent),
				CreatedAt:   record.GetString("created"),
			}
			return nil
		})
		if err != nil {
			return err
		}

		return e.JSON(200, responsePayload)
	}).Bind(apis.RequireAuth())

	se.Router.POST("/api/friends/suggestions/accept", func(e *core.RequestEvent) error {
		if e.Auth == nil {
			return apis.NewUnauthorizedError("authentication required", nil)
		}

		data := struct {
			InviterID string `json:"inviterId"`
		}{}
		if err := e.BindBody(&data); err != nil {
			return apis.NewBadRequestError("invalid request body", err)
		}

		inviterID := strings.TrimSpace(data.InviterID)
		if inviterID == "" {
			return apis.NewBadRequestError("inviterId is required", nil)
		}
		if inviterID == e.Auth.Id {
			return apis.NewBadRequestError("cannot add yourself as a friend", nil)
		}

		friendshipID := ""
		friendshipStatus := ""

		err := app.RunInTransaction(func(txApp core.App) error {
			if _, err := txApp.FindRecordById("users", inviterID); err != nil {
				return apis.NewNotFoundError("inviter not found", err)
			}

			validSuggestion, err := userWasInvitedBy(txApp, inviterID, e.Auth.Id)
			if err != nil {
				return apis.NewApiError(500, "failed to validate friend suggestion", err)
			}
			if !validSuggestion {
				return apis.NewForbiddenError("friend suggestion is no longer valid", nil)
			}

			existing, err := findFriendshipBetweenUsers(txApp, inviterID, e.Auth.Id)
			if err != nil {
				return apis.NewApiError(500, "failed to resolve friendship", err)
			}

			if existing != nil {
				switch strings.TrimSpace(existing.GetString("status")) {
				case "accepted":
					friendshipID = existing.Id
					friendshipStatus = "accepted"
					return nil
				case "pending":
					if strings.TrimSpace(existing.GetString("friend")) != e.Auth.Id {
						return apis.NewForbiddenError("friend request already exists", nil)
					}

					existing.Set("status", "accepted")
					if err := txApp.Save(existing); err != nil {
						return apis.NewApiError(500, "failed to accept friendship", err)
					}

					friendshipID = existing.Id
					friendshipStatus = "accepted"
					return nil
				default:
					return apis.NewBadRequestError("friend suggestion can no longer be accepted", nil)
				}
			}

			collection, err := txApp.FindCollectionByNameOrId("friendships")
			if err != nil {
				return apis.NewApiError(500, "friendships collection missing", err)
			}

			record := core.NewRecord(collection)
			record.Set("user", inviterID)
			record.Set("friend", e.Auth.Id)
			record.Set("status", "accepted")

			if err := txApp.Save(record); err != nil {
				return apis.NewApiError(500, "failed to accept friend suggestion", err)
			}

			friendshipID = record.Id
			friendshipStatus = "accepted"
			return nil
		})
		if err != nil {
			return err
		}

		return e.JSON(200, map[string]any{
			"friendshipId": friendshipID,
			"status":       friendshipStatus,
			"success":      true,
		})
	}).Bind(apis.RequireAuth())
}

func normalizeFriendsSection(raw string) (string, error) {
	switch strings.TrimSpace(raw) {
	case "", friendsSectionAccepted:
		return friendsSectionAccepted, nil
	case friendsSectionIncoming:
		return friendsSectionIncoming, nil
	case friendsSectionSent:
		return friendsSectionSent, nil
	default:
		return "", fmt.Errorf("invalid friends section")
	}
}

func parseFriendsPagination(pageRaw string, pageSizeRaw string) (int, int, error) {
	page := 1
	if strings.TrimSpace(pageRaw) != "" {
		parsedPage, err := strconv.Atoi(pageRaw)
		if err != nil || parsedPage < 1 {
			return 0, 0, fmt.Errorf("invalid page")
		}
		page = parsedPage
	}

	pageSize := defaultFriendsPageSize
	if strings.TrimSpace(pageSizeRaw) != "" {
		parsedPageSize, err := strconv.Atoi(pageSizeRaw)
		if err != nil || parsedPageSize < 1 {
			return 0, 0, fmt.Errorf("invalid pageSize")
		}
		if parsedPageSize > maxFriendsPageSize {
			pageSize = maxFriendsPageSize
		} else {
			pageSize = parsedPageSize
		}
	}

	return page, pageSize, nil
}

func parseFriendsFilters(searchRaw string, userIDValues []string) friendsListFilters {
	normalizedSearch := strings.ToLower(strings.TrimSpace(searchRaw))
	if len(userIDValues) == 0 {
		return friendsListFilters{Search: normalizedSearch}
	}

	userIDs := make([]string, 0, len(userIDValues))
	seen := map[string]struct{}{}
	for _, rawValue := range userIDValues {
		for _, rawUserID := range strings.Split(rawValue, ",") {
			trimmedUserID := strings.TrimSpace(rawUserID)
			if trimmedUserID == "" {
				continue
			}
			if _, exists := seen[trimmedUserID]; exists {
				continue
			}

			seen[trimmedUserID] = struct{}{}
			userIDs = append(userIDs, trimmedUserID)
		}
	}

	return friendsListFilters{
		Search:  normalizedSearch,
		UserIDs: userIDs,
	}
}

func listFriendsPageResponse(
	app core.App,
	userID string,
	section string,
	page int,
	pageSize int,
	filters friendsListFilters,
) (friendsListResponse, error) {
	filterSQL, filterParams := buildFriendsSectionFilter(userID, section, filters)

	totalItems, err := countFriendsForSection(app, filterSQL, filterParams)
	if err != nil {
		return friendsListResponse{}, err
	}

	rows, err := findFriendsForSection(app, filterSQL, filterParams, userID, page, pageSize)
	if err != nil {
		return friendsListResponse{}, err
	}

	items := make([]friendsListItem, 0, len(rows))
	for _, row := range rows {
		items = append(items, friendsListItem{
			ID:          row.ID,
			UserID:      row.UserID,
			DisplayName: resolveFriendDisplayName(row.OtherName, row.OtherEmail),
			Status:      friendsSectionStatus(section),
			CreatedAt:   row.CreatedAt,
		})
	}

	totalPages := 0
	if totalItems > 0 {
		totalPages = (totalItems + pageSize - 1) / pageSize
	}

	response := friendsListResponse{
		Items:       items,
		Page:        page,
		PageSize:    pageSize,
		TotalItems:  totalItems,
		TotalPages:  totalPages,
		HasNextPage: totalPages > 0 && page < totalPages,
	}

	if shouldIncludeFriendsSummary(page, filters) {
		summary, err := getFriendsSummary(app, userID)
		if err != nil {
			return friendsListResponse{}, err
		}

		response.Summary = &summary
	}

	return response, nil
}

func shouldIncludeFriendsSummary(page int, filters friendsListFilters) bool {
	return page == 1 && filters.Search == "" && len(filters.UserIDs) == 0
}

func buildFriendsSectionFilter(userID string, section string, filters friendsListFilters) (string, dbx.Params) {
	params := dbx.Params{"userId": userID}
	conditions := make([]string, 0, 3)

	switch section {
	case friendsSectionIncoming:
		conditions = append(conditions, "f.status = 'pending' AND f.friend = {:userId}")
	case friendsSectionSent:
		conditions = append(conditions, "f.status = 'pending' AND f.user = {:userId}")
	default:
		conditions = append(conditions, "(f.user = {:userId} OR f.friend = {:userId}) AND f.status = 'accepted'")
	}

	if filters.Search != "" {
		params["search"] = "%" + escapeFriendsSearchValue(filters.Search) + "%"
		conditions = append(
			conditions,
			"(LOWER(COALESCE(u.name, '')) LIKE {:search} ESCAPE '\\' OR LOWER(COALESCE(u.email, '')) LIKE {:search} ESCAPE '\\')",
		)
	}

	if len(filters.UserIDs) > 0 {
		userIDClauses := make([]string, 0, len(filters.UserIDs))
		for index, filteredUserID := range filters.UserIDs {
			paramKey := fmt.Sprintf("friendUserId%d", index)
			params[paramKey] = filteredUserID
			userIDClauses = append(userIDClauses, fmt.Sprintf("u.id = {:%s}", paramKey))
		}

		userIDFilter := userIDClauses[0]
		if len(userIDClauses) > 1 {
			userIDFilter = "(" + strings.Join(userIDClauses, " OR ") + ")"
		}
		conditions = append(conditions, userIDFilter)
	}

	return strings.Join(conditions, " AND "), params
}

func escapeFriendsSearchValue(value string) string {
	replacer := strings.NewReplacer(
		`\\`, `\\\\`,
		`%`, `\%`,
		`_`, `\_`,
	)
	return replacer.Replace(value)
}

func countFriendsForSection(app core.App, filterSQL string, params dbx.Params) (int, error) {
	var totalItems int
	err := app.DB().NewQuery(`
		SELECT COUNT(*)
		FROM friendships f
		JOIN users u
			ON u.id = CASE WHEN f.user = {:userId} THEN f.friend ELSE f.user END
		WHERE ` + filterSQL).
		Bind(params).
		Row(&totalItems)
	return totalItems, err
}

func findFriendsForSection(
	app core.App,
	filterSQL string,
	params dbx.Params,
	userID string,
	page int,
	pageSize int,
) ([]friendsListRow, error) {
	rows := []friendsListRow{}
	offset := (page - 1) * pageSize

	queryParams := dbx.Params{
		"userId": userID,
		"limit":  pageSize,
		"offset": offset,
	}
	for key, value := range params {
		queryParams[key] = value
	}

	err := app.DB().NewQuery(`
		SELECT
			f.id AS [[id]],
			CASE WHEN f.user = {:userId} THEN f.friend ELSE f.user END AS [[userId]],
			u.name AS [[otherName]],
			u.email AS [[otherEmail]],
			f.created AS [[createdAt]]
		FROM friendships f
		JOIN users u
			ON u.id = CASE WHEN f.user = {:userId} THEN f.friend ELSE f.user END
		WHERE ` + filterSQL + `
		ORDER BY f.created DESC
		LIMIT {:limit} OFFSET {:offset}
	`).
		Bind(queryParams).
		All(&rows)

	return rows, err
}

func resolveFriendDisplayName(name string, email string) string {
	trimmedName := strings.TrimSpace(name)
	if trimmedName != "" {
		return trimmedName
	}

	trimmedEmail := strings.TrimSpace(email)
	if atIndex := strings.Index(trimmedEmail, "@"); atIndex > 0 {
		return trimmedEmail[:atIndex]
	}

	return "Unknown"
}

func friendsSectionStatus(section string) string {
	switch section {
	case friendsSectionIncoming:
		return "pending_received"
	case friendsSectionSent:
		return "pending_sent"
	default:
		return "friend"
	}
}

func userWasInvitedBy(app core.App, inviterID string, invitedUserID string) (bool, error) {
	record, err := app.FindFirstRecordByFilter(
		"invite_codes",
		"createdBy = {:createdBy} && usedBy = {:usedBy} && used = true",
		dbx.Params{
			"createdBy": inviterID,
			"usedBy":    invitedUserID,
		},
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return false, nil
		}
		return false, err
	}

	return record != nil, nil
}

func findFriendshipBetweenUsers(app core.App, leftUserID string, rightUserID string) (*core.Record, error) {
	record, err := app.FindFirstRecordByFilter(
		"friendships",
		"((user = {:leftUser} && friend = {:rightUser}) || (user = {:rightUser} && friend = {:leftUser}))",
		dbx.Params{
			"leftUser":  leftUserID,
			"rightUser": rightUserID,
		},
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}

	return record, nil
}
