package lib

import "strings"

// NormalizeRestaurantHistoryName applies the conservative exact-name matching
// rule used by All Locations History.
func NormalizeRestaurantHistoryName(name string) string {
	normalized := strings.NewReplacer(
		"’", "'",
		"‘", "'",
		"＇", "'",
		"`", "'",
	).Replace(name)
	return strings.ToLower(strings.Join(strings.Fields(normalized), " "))
}
