package hooks

import (
	"github.com/pocketbase/pocketbase/core"

	"myapp/lib"
)

// RegisterRestaurantHistoryNameHooks keeps the indexed All Locations History
// lookup key synchronized with the Restaurant name.
func RegisterRestaurantHistoryNameHooks(app core.App) {
	app.OnRecordCreate("restaurants").BindFunc(setRestaurantHistoryNormalizedName)
	app.OnRecordUpdate("restaurants").BindFunc(setRestaurantHistoryNormalizedName)
}

func setRestaurantHistoryNormalizedName(e *core.RecordEvent) error {
	e.Record.Set(
		"historyNormalizedName",
		lib.NormalizeRestaurantHistoryName(e.Record.GetString("name")),
	)
	return e.Next()
}
