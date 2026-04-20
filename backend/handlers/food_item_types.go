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

	switch strings.TrimSpace(record.GetString("itemType")) {
	case foodItemTypeFoodProduct:
		return true
	case foodItemTypeVisitItem:
		return false
	default:
		return record.GetBool("isQuickTrack")
	}
}

func isVisitItemRecord(record *core.Record) bool {
	if record == nil {
		return false
	}

	switch strings.TrimSpace(record.GetString("itemType")) {
	case foodItemTypeVisitItem:
		return true
	case foodItemTypeFoodProduct:
		return false
	default:
		return !record.GetBool("isQuickTrack")
	}
}

func foodProductSQL(alias string) string {
	itemTypeColumn := qualifyFoodItemColumn(alias, "itemType")
	legacyFlagColumn := qualifyFoodItemColumn(alias, "isQuickTrack")
	return fmt.Sprintf(
		"((COALESCE(%s, '') = '%s') OR (COALESCE(%s, '') = '' AND COALESCE(%s, 0) = 1))",
		itemTypeColumn,
		foodItemTypeFoodProduct,
		itemTypeColumn,
		legacyFlagColumn,
	)
}

func visitItemSQL(alias string) string {
	itemTypeColumn := qualifyFoodItemColumn(alias, "itemType")
	legacyFlagColumn := qualifyFoodItemColumn(alias, "isQuickTrack")
	return fmt.Sprintf(
		"((COALESCE(%s, '') = '%s') OR (COALESCE(%s, '') = '' AND COALESCE(%s, 0) != 1))",
		itemTypeColumn,
		foodItemTypeVisitItem,
		itemTypeColumn,
		legacyFlagColumn,
	)
}

func qualifyFoodItemColumn(alias string, column string) string {
	trimmedAlias := strings.TrimSpace(alias)
	if trimmedAlias == "" {
		return column
	}

	return trimmedAlias + "." + column
}
