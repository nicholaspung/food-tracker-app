package handlers

import (
	"fmt"
	"sort"
	"strings"

	"github.com/pocketbase/pocketbase/core"
)

const defaultAdminRecordType = "food-product"

type adminRecordTypeCountsDefinition struct {
	Description string
	EventAtExpr string
	Label       string
	TableName   string
	UserColumn  string
	WhereClause string
}

type adminRecordTypeCountTotals struct {
	TotalRecords     int `db:"totalRecords"`
	UsersWithRecords int `db:"usersWithRecords"`
}

type adminRecordTypeCountUserRow struct {
	LatestRecordAt   string `db:"latestRecordAt"`
	RecordCount      int    `db:"recordCount"`
	UserCreated      string `db:"userCreated"`
	UserEmail        string `db:"userEmail"`
	UserID           string `db:"userId"`
	UserIsAdmin      int    `db:"userIsAdmin"`
	UserIsBetaUser   int    `db:"userIsBetaUser"`
	UserIsSubscriber int    `db:"userIsSubscriber"`
	UserName         string `db:"userName"`
	UserUpdated      string `db:"userUpdated"`
}

var adminRecordTypeCountsDefinitions = map[string]adminRecordTypeCountsDefinition{
	"bill": {
		Description: "Bills created by users.",
		EventAtExpr: "r.created",
		Label:       "Bills",
		TableName:   "bills",
		UserColumn:  "user",
		WhereClause: "1 = 1",
	},
	"feedback-thread": {
		Description: "Feedback threads started by users.",
		EventAtExpr: "COALESCE(NULLIF(r.last_message_at, ''), r.updated, r.created)",
		Label:       "Feedback threads",
		TableName:   "feedback",
		UserColumn:  "user",
		WhereClause: "1 = 1",
	},
	"list": {
		Description: "Restaurant lists saved by users.",
		EventAtExpr: "r.created",
		Label:       "Restaurant lists",
		TableName:   "restaurant_lists",
		UserColumn:  "user",
		WhereClause: "1 = 1",
	},
	"note": {
		Description: "Notes saved by users.",
		EventAtExpr: "r.created",
		Label:       "Notes",
		TableName:   "notes",
		UserColumn:  "user",
		WhereClause: "1 = 1",
	},
	"photo-upload": {
		Description: "Photo uploads attached to visits or food products.",
		EventAtExpr: "r.created",
		Label:       "Photo uploads",
		TableName:   "visit_photos",
		UserColumn:  "user",
		WhereClause: "1 = 1",
	},
	"food-product": {
		Description: "Food products logged by users.",
		EventAtExpr: "COALESCE(NULLIF(r.itemDate, ''), r.created)",
		Label:       "Food products",
		TableName:   "food_items",
		UserColumn:  "user",
		WhereClause: foodProductSQL("r"),
	},
	"visit": {
		Description: "Visit records logged by users.",
		EventAtExpr: "COALESCE(NULLIF(r.visitDate, ''), r.created)",
		Label:       "Visits",
		TableName:   "visits",
		UserColumn:  "user",
		WhereClause: "1 = 1",
	},
}

func resolveAdminRecordTypeCountsDefinition(
	rawRecordType string,
) (string, adminRecordTypeCountsDefinition, error) {
	normalizedRecordType := strings.ToLower(strings.TrimSpace(rawRecordType))
	if normalizedRecordType == "" {
		normalizedRecordType = defaultAdminRecordType
	}

	definition, ok := adminRecordTypeCountsDefinitions[normalizedRecordType]
	if !ok {
		return "", adminRecordTypeCountsDefinition{}, fmt.Errorf(
			"unsupported recordType %q; supported values: %s",
			rawRecordType,
			strings.Join(listSupportedAdminRecordTypes(), ", "),
		)
	}

	return normalizedRecordType, definition, nil
}

func listSupportedAdminRecordTypes() []string {
	recordTypes := make([]string, 0, len(adminRecordTypeCountsDefinitions))
	for recordType := range adminRecordTypeCountsDefinitions {
		recordTypes = append(recordTypes, recordType)
	}

	sort.Strings(recordTypes)
	return recordTypes
}

func summarizeAdminRecordTypeCounts(
	app core.App,
	recordType string,
	definition adminRecordTypeCountsDefinition,
) (map[string]any, error) {
	totals := adminRecordTypeCountTotals{}
	totalsQuery := fmt.Sprintf(`
		SELECT
			COUNT(*) AS [[totalRecords]],
			COUNT(
				DISTINCT CASE
					WHEN TRIM(COALESCE(r.%s, '')) <> '' THEN r.%s
					ELSE NULL
				END
			) AS [[usersWithRecords]]
		FROM %s r
		WHERE %s
	`,
		definition.UserColumn,
		definition.UserColumn,
		definition.TableName,
		definition.WhereClause,
	)
	if err := app.DB().NewQuery(totalsQuery).One(&totals); err != nil {
		return nil, err
	}

	rows := []adminRecordTypeCountUserRow{}
	rowsQuery := fmt.Sprintf(`
		SELECT
			r.%s AS [[userId]],
			COUNT(*) AS [[recordCount]],
			MAX(%s) AS [[latestRecordAt]],
			COALESCE(u.email, '') AS [[userEmail]],
			COALESCE(TRIM(u.name), '') AS [[userName]],
			COALESCE(u.isAdmin, 0) AS [[userIsAdmin]],
			COALESCE(u.isSubscriber, 0) AS [[userIsSubscriber]],
			COALESCE(u.isBetaUser, 0) AS [[userIsBetaUser]],
			COALESCE(u.created, '') AS [[userCreated]],
			COALESCE(u.updated, '') AS [[userUpdated]]
		FROM %s r
		LEFT JOIN users u ON u.id = r.%s
		WHERE %s
			AND TRIM(COALESCE(r.%s, '')) <> ''
		GROUP BY r.%s
		ORDER BY
			COUNT(*) DESC,
			MAX(%s) DESC,
			COALESCE(u.email, '') ASC,
			r.%s ASC
	`,
		definition.UserColumn,
		definition.EventAtExpr,
		definition.TableName,
		definition.UserColumn,
		definition.WhereClause,
		definition.UserColumn,
		definition.UserColumn,
		definition.EventAtExpr,
		definition.UserColumn,
	)
	if err := app.DB().NewQuery(rowsQuery).All(&rows); err != nil {
		return nil, err
	}

	serializedRows := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		userSummary := map[string]any{
			"id":           row.UserID,
			"email":        row.UserEmail,
			"name":         row.UserName,
			"isAdmin":      row.UserIsAdmin != 0,
			"isSubscriber": row.UserIsSubscriber != 0,
			"isBetaUser":   row.UserIsBetaUser != 0,
			"created":      row.UserCreated,
			"updated":      row.UserUpdated,
		}

		serializedRows = append(serializedRows, map[string]any{
			"userId":         row.UserID,
			"recordCount":    row.RecordCount,
			"latestRecordAt": row.LatestRecordAt,
			"user":           userSummary,
		})
	}

	return map[string]any{
		"recordType":       recordType,
		"label":            definition.Label,
		"description":      definition.Description,
		"totalRecords":     totals.TotalRecords,
		"usersWithRecords": totals.UsersWithRecords,
		"rows":             serializedRows,
	}, nil
}
