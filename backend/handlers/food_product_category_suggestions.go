package handlers

import (
	"log"
	"strconv"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

const (
	defaultFoodProductCategorySuggestionLimit = 8
	maxFoodProductCategorySuggestionLimit     = 12
)

type foodProductCategorySuggestionResponse struct {
	Label           string `db:"label" json:"label"`
	NormalizedLabel string `db:"normalizedLabel" json:"normalizedLabel"`
	UseCount        int    `db:"useCount" json:"useCount"`
	LastUsedAt      string `db:"lastUsedAt" json:"lastUsedAt"`
}

type foodProductCategorySuggestionsResponse struct {
	Items []foodProductCategorySuggestionResponse `json:"items"`
}

func registerFoodProductCategorySuggestionHandlers(se *core.ServeEvent, app core.App) {
	se.Router.GET("/api/food-products/category-suggestions", func(e *core.RequestEvent) error {
		if e.Auth == nil {
			return apis.NewUnauthorizedError("authentication required", nil)
		}

		limit, err := parseFoodProductCategorySuggestionLimit(e.Request.URL.Query().Get("limit"))
		if err != nil {
			return apis.NewBadRequestError(err.Error(), nil)
		}

		response, err := listFoodProductCategorySuggestions(
			app,
			e.Auth.Id,
			e.Request.URL.Query().Get("query"),
			limit,
		)
		if err != nil {
			log.Printf("Failed to load food product category suggestions for user %s: %v", e.Auth.Id, err)
			return apis.NewApiError(500, "failed to load food product category suggestions", err)
		}

		return e.JSON(200, response)
	}).Bind(apis.RequireAuth())
}

func parseFoodProductCategorySuggestionLimit(rawLimit string) (int, error) {
	trimmedLimit := strings.TrimSpace(rawLimit)
	if trimmedLimit == "" {
		return defaultFoodProductCategorySuggestionLimit, nil
	}

	limit, err := strconv.Atoi(trimmedLimit)
	if err != nil {
		return 0, apis.NewBadRequestError("limit must be a number", err)
	}
	if limit < 1 {
		return 0, apis.NewBadRequestError("limit must be at least 1", nil)
	}
	if limit > maxFoodProductCategorySuggestionLimit {
		return maxFoodProductCategorySuggestionLimit, nil
	}

	return limit, nil
}

func listFoodProductCategorySuggestions(
	app core.App,
	userID string,
	query string,
	limit int,
) (foodProductCategorySuggestionsResponse, error) {
	response := foodProductCategorySuggestionsResponse{
		Items: []foodProductCategorySuggestionResponse{},
	}

	normalizedQuery := strings.ToLower(strings.TrimSpace(query))
	params := dbx.Params{
		"limit":  limit,
		"userId": userID,
	}

	queryFilter := ""
	if normalizedQuery != "" {
		queryFilter = "AND LOWER(TRIM(COALESCE(itemCategory, ''))) LIKE {:queryLike}\n"
		params["queryLike"] = "%" + normalizedQuery + "%"
	}

	rows := []foodProductCategorySuggestionResponse{}
	sqlQuery := `
		WITH filtered AS (
			SELECT
				TRIM(COALESCE(itemCategory, '')) AS label,
				LOWER(TRIM(COALESCE(itemCategory, ''))) AS normalizedLabel,
				COALESCE(NULLIF(itemDate, ''), created) AS lastUsedAt,
				created
			FROM food_items
			WHERE user = {:userId}
				AND ` + foodProductSQL("food_items") + `
				AND TRIM(COALESCE(itemCategory, '')) != ''
				AND LOWER(TRIM(COALESCE(itemCategory, ''))) != 'restaurant'
				` + queryFilter + `
		),
		ranked AS (
			SELECT
				label,
				normalizedLabel,
				lastUsedAt,
				ROW_NUMBER() OVER (
					PARTITION BY normalizedLabel
					ORDER BY lastUsedAt DESC, created DESC, label ASC
				) AS rowNumber,
				COUNT(*) OVER (PARTITION BY normalizedLabel) AS useCount
			FROM filtered
		)
		SELECT
			label AS [[label]],
			normalizedLabel AS [[normalizedLabel]],
			useCount AS [[useCount]],
			lastUsedAt AS [[lastUsedAt]]
		FROM ranked
		WHERE rowNumber = 1
		ORDER BY lastUsedAt DESC, useCount DESC, label ASC
		LIMIT {:limit}
	`

	if err := app.DB().NewQuery(sqlQuery).Bind(params).All(&rows); err != nil {
		return response, err
	}

	response.Items = rows
	return response, nil
}
