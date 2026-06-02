package migrations

import (
	"log"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		records, err := app.FindRecordsByFilter(
			"restaurant_lists",
			"isDefault = true && name = {:name}",
			"",
			0,
			0,
			dbx.Params{"name": "Saved"},
		)
		if err != nil {
			return err
		}

		for _, record := range records {
			record.Set("name", "Want to Try")
			record.Set("description", "Restaurants and recommendations you want to try later")
			if err := app.Save(record); err != nil {
				return err
			}
		}

		log.Printf("✓ Renamed %d default restaurant lists to Want to Try", len(records))
		return nil
	}, func(app core.App) error {
		records, err := app.FindRecordsByFilter(
			"restaurant_lists",
			"isDefault = true && name = {:name}",
			"",
			0,
			0,
			dbx.Params{"name": "Want to Try"},
		)
		if err != nil {
			return err
		}

		for _, record := range records {
			record.Set("name", "Saved")
			record.Set("description", "Items saved from other lists")
			if err := app.Save(record); err != nil {
				return err
			}
		}

		log.Printf("✓ Restored %d default restaurant lists to Saved", len(records))
		return nil
	})
}
