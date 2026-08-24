package migrations

import (
	"fmt"
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		if err := setMenuImageFileProtection(app, true); err != nil {
			return err
		}

		log.Println("✓ Protected Menu Scan Source Image files")
		return nil
	}, func(app core.App) error {
		if err := setMenuImageFileProtection(app, false); err != nil {
			return err
		}

		log.Println("✓ Restored public Menu Scan Source Image files")
		return nil
	})
}

func setMenuImageFileProtection(app core.App, protected bool) error {
	collection, err := app.FindCollectionByNameOrId("menu_images")
	if err != nil {
		return err
	}

	imageField, ok := collection.Fields.GetByName("image").(*core.FileField)
	if !ok {
		return fmt.Errorf("menu_images.image is not a file field")
	}

	imageField.Protected = protected
	return app.Save(collection)
}
