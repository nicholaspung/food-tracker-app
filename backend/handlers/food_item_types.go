package handlers

import (
	"fmt"
	"strings"

	"github.com/pocketbase/pocketbase/core"
)

const (
	foodItemTypeVisitItem   = "visit-item"
	foodItemTypeFoodProduct = "food-product"
)

func isFoodProductRecord(record *core.Record) bool {
	if record == nil {
		return false
	}

	return strings.TrimSpace(record.GetString("itemType")) == foodItemTypeFoodProduct
}

func isVisitItemRecord(record *core.Record) bool {
	if record == nil {
		return false
	}

	return strings.TrimSpace(record.GetString("itemType")) == foodItemTypeVisitItem
}

func foodProductSQL(alias string) string {
	itemTypeColumn := qualifyFoodItemColumn(alias, "itemType")
	return fmt.Sprintf(
		"(COALESCE(%s, '') = '%s')",
		itemTypeColumn,
		foodItemTypeFoodProduct,
	)
}

func visitItemSQL(alias string) string {
	itemTypeColumn := qualifyFoodItemColumn(alias, "itemType")
	return fmt.Sprintf(
		"(COALESCE(%s, '') = '%s')",
		itemTypeColumn,
		foodItemTypeVisitItem,
	)
}

func qualifyFoodItemColumn(alias string, column string) string {
	trimmedAlias := strings.TrimSpace(alias)
	if trimmedAlias == "" {
		return column
	}

	return trimmedAlias + "." + column
}
