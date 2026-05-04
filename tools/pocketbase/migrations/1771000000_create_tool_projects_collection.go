package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		collection := core.NewBaseCollection("tool_projects")
		recordRule := types.Pointer("id != ''")

		collection.ListRule = recordRule
		collection.ViewRule = recordRule
		collection.CreateRule = types.Pointer("name != ''")
		collection.UpdateRule = recordRule
		collection.DeleteRule = recordRule

		collection.Fields.Add(&core.TextField{
			Name:     "name",
			Required: true,
			Min:      1,
			Max:      180,
		})
		collection.Fields.Add(&core.SelectField{
			Name:      "toolType",
			Required:  true,
			Values:    []string{"mixed_gif"},
			MaxSelect: 1,
		})
		collection.Fields.Add(&core.TextField{
			Name:     "flowSlug",
			Required: false,
			Max:      160,
		})
		collection.Fields.Add(&core.TextField{
			Name:     "sourceVideoPath",
			Required: true,
			Min:      1,
			Max:      2000,
		})
		collection.Fields.Add(&core.TextField{
			Name:     "sourceVideoFilename",
			Required: true,
			Min:      1,
			Max:      260,
		})
		collection.Fields.Add(&core.NumberField{Name: "sourceVideoDuration"})
		collection.Fields.Add(&core.NumberField{Name: "sourceVideoWidth"})
		collection.Fields.Add(&core.NumberField{Name: "sourceVideoHeight"})
		collection.Fields.Add(&core.JSONField{
			Name:     "editorState",
			Required: true,
		})
		collection.Fields.Add(&core.JSONField{
			Name:     "exportSettings",
			Required: true,
		})
		collection.Fields.Add(&core.JSONField{Name: "tags"})
		collection.Fields.Add(&core.TextField{
			Name:     "notes",
			Required: false,
			Max:      5000,
		})
		collection.Fields.Add(&core.AutodateField{
			Name:     "created",
			OnCreate: true,
		})
		collection.Fields.Add(&core.AutodateField{
			Name:     "updated",
			OnUpdate: true,
		})

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("Created tool_projects collection")
		return nil
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("tool_projects")
		if err != nil {
			return err
		}
		return app.Delete(collection)
	})
}
