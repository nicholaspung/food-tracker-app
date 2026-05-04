package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		projectsCollection, err := app.FindCollectionByNameOrId("tool_projects")
		if err != nil {
			return err
		}

		collection := core.NewBaseCollection("tool_assets")
		recordRule := types.Pointer("id != ''")

		collection.ListRule = recordRule
		collection.ViewRule = recordRule
		collection.CreateRule = types.Pointer("filename != ''")
		collection.UpdateRule = recordRule
		collection.DeleteRule = recordRule

		collection.Fields.Add(&core.RelationField{
			Name:          "project",
			CollectionId:  projectsCollection.Id,
			MaxSelect:     1,
			Required:      true,
			CascadeDelete: true,
		})
		collection.Fields.Add(&core.SelectField{
			Name:      "kind",
			Required:  true,
			Values:    []string{"source_reference", "screenshot_png", "clip_mp4", "thumbnail_png", "gif_export", "mov_export"},
			MaxSelect: 1,
		})
		collection.Fields.Add(&core.TextField{Name: "itemId", Max: 160})
		collection.Fields.Add(&core.TextField{Name: "label", Max: 260})
		collection.Fields.Add(&core.FileField{
			Name:      "file",
			Required:  false,
			MaxSelect: 1,
			MaxSize:   104857600,
			MimeTypes: []string{
				"image/png",
				"image/gif",
				"video/mp4",
				"video/quicktime",
			},
		})
		collection.Fields.Add(&core.TextField{Name: "externalPath", Max: 2000})
		collection.Fields.Add(&core.TextField{
			Name:     "filename",
			Required: true,
			Min:      1,
			Max:      260,
		})
		collection.Fields.Add(&core.TextField{
			Name:     "mimeType",
			Required: true,
			Min:      1,
			Max:      160,
		})
		collection.Fields.Add(&core.NumberField{Name: "bytes"})
		collection.Fields.Add(&core.NumberField{Name: "duration"})
		collection.Fields.Add(&core.NumberField{Name: "width"})
		collection.Fields.Add(&core.NumberField{Name: "height"})
		collection.Fields.Add(&core.NumberField{Name: "sourceStart"})
		collection.Fields.Add(&core.NumberField{Name: "sourceEnd"})
		collection.Fields.Add(&core.NumberField{Name: "sourceTimestamp"})
		collection.Fields.Add(&core.JSONField{Name: "metadata"})
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

		log.Println("Created tool_assets collection")
		return nil
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("tool_assets")
		if err != nil {
			return err
		}
		return app.Delete(collection)
	})
}
