package hooks

import (
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"

	"myapp/lib"
)

// RegisterContentReportVisibilityHooks hides content from the user who reported it
// without changing global moderation state or visibility for other viewers.
func RegisterContentReportVisibilityHooks(app core.App) {
	app.OnRecordsListRequest("visits", "food_items", "visit_photos").BindFunc(func(e *core.RecordsListRequestEvent) error {
		if e == nil || e.Auth == nil || e.Auth.GetBool("isAdmin") || e.HasSuperuserAuth() {
			return e.Next()
		}

		filtered := make([]*core.Record, 0, len(e.Records))
		for _, record := range e.Records {
			hidden, err := lib.ReportedContentHiddenForViewer(e.App, e.Auth.Id, e.Collection.Name, record)
			if err != nil {
				return apis.NewApiError(500, "failed to apply report visibility", err)
			}
			if !hidden {
				filtered = append(filtered, record)
			}
		}

		if removed := len(e.Records) - len(filtered); removed > 0 {
			e.Records = filtered
			if e.Result != nil {
				e.Result.Items = filtered
				e.Result.TotalItems -= removed
				if e.Result.TotalItems < 0 {
					e.Result.TotalItems = 0
				}
				if e.Result.PerPage > 0 {
					e.Result.TotalPages = (e.Result.TotalItems + e.Result.PerPage - 1) / e.Result.PerPage
				}
			}
		}

		return e.Next()
	})

	app.OnRecordViewRequest("visits", "food_items", "visit_photos").BindFunc(func(e *core.RecordRequestEvent) error {
		if e == nil || e.Auth == nil || e.Auth.GetBool("isAdmin") || e.HasSuperuserAuth() {
			return e.Next()
		}

		hidden, err := lib.ReportedContentHiddenForViewer(e.App, e.Auth.Id, e.Collection.Name, e.Record)
		if err != nil {
			return apis.NewApiError(500, "failed to apply report visibility", err)
		}
		if hidden {
			return apis.NewNotFoundError("record not found", nil)
		}

		return e.Next()
	})
}
