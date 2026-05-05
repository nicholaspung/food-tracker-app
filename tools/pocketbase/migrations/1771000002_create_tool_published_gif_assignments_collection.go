package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		assetsCollection, err := app.FindCollectionByNameOrId("tool_assets")
		if err != nil {
			return err
		}
		projectsCollection, err := app.FindCollectionByNameOrId("tool_projects")
		if err != nil {
			return err
		}

		collection := core.NewBaseCollection("tool_published_gif_assignments")
		recordRule := types.Pointer("id != ''")

		collection.ListRule = recordRule
		collection.ViewRule = recordRule
		collection.CreateRule = types.Pointer("flowSlug != '' && asset != '' && project != ''")
		collection.UpdateRule = recordRule
		collection.DeleteRule = recordRule

		collection.Fields.Add(&core.TextField{
			Name:     "flowSlug",
			Required: true,
			Min:      1,
			Max:      160,
		})
		collection.Fields.Add(&core.TextField{
			Name:     "flowTitle",
			Required: true,
			Min:      1,
			Max:      260,
		})
		collection.Fields.Add(&core.TextField{Name: "flowSection", Max: 160})
		collection.Fields.Add(&core.RelationField{
			Name:         "asset",
			CollectionId: assetsCollection.Id,
			MaxSelect:    1,
			Required:     true,
		})
		collection.Fields.Add(&core.RelationField{
			Name:         "project",
			CollectionId: projectsCollection.Id,
			MaxSelect:    1,
			Required:     true,
		})
		collection.Fields.Add(&core.TextField{
			Name:     "assetFilename",
			Required: true,
			Min:      1,
			Max:      260,
		})
		collection.Fields.Add(&core.TextField{Name: "assetFile", Max: 260})
		collection.Fields.Add(&core.TextField{Name: "sourceProjectName", Max: 180})
		collection.Fields.Add(&core.TextField{Name: "sourceProjectFlowSlug", Max: 160})
		collection.Fields.Add(&core.TextField{Name: "sourceVideoPath", Max: 2000})
		collection.Fields.Add(&core.TextField{Name: "sourceVideoFilename", Max: 260})
		collection.Fields.Add(&core.TextField{Name: "targetRelativePath", Max: 2000})
		collection.Fields.Add(&core.TextField{Name: "copiedToPath", Max: 2000})
		collection.Fields.Add(&core.NumberField{Name: "copiedBytes"})
		collection.Fields.Add(&core.SelectField{
			Name:      "copyStatus",
			Required:  true,
			Values:    []string{"copied", "tracked_only", "copy_failed"},
			MaxSelect: 1,
		})
		collection.Fields.Add(&core.TextField{Name: "copyError", Max: 2000})
		collection.Fields.Add(&core.BoolField{Name: "isCurrent"})
		collection.Fields.Add(&core.TextField{Name: "notes", Max: 5000})
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

		log.Println("Created tool_published_gif_assignments collection")
		return nil
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("tool_published_gif_assignments")
		if err != nil {
			return err
		}
		return app.Delete(collection)
	})
}
