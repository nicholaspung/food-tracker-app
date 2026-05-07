package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("tool_projects")
		if err != nil {
			return err
		}

		if field, ok := collection.Fields.GetByName("sourceVideoPath").(*core.TextField); ok {
			field.Required = false
			field.Min = 0
		}
		if field, ok := collection.Fields.GetByName("sourceVideoFilename").(*core.TextField); ok {
			field.Required = false
			field.Min = 0
		}

		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("tool_projects")
		if err != nil {
			return err
		}

		if field, ok := collection.Fields.GetByName("sourceVideoPath").(*core.TextField); ok {
			field.Required = true
			field.Min = 1
		}
		if field, ok := collection.Fields.GetByName("sourceVideoFilename").(*core.TextField); ok {
			field.Required = true
			field.Min = 1
		}

		return app.Save(collection)
	})
}
