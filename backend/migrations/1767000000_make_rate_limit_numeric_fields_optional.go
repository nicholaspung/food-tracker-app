package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("rate_limits")
		if err != nil {
			return err
		}

		if attemptsField := collection.Fields.GetByName("attempts"); attemptsField != nil {
			if numberField, ok := attemptsField.(*core.NumberField); ok {
				numberField.Required = false
			}
		}

		if lockedUntilField := collection.Fields.GetByName("locked_until"); lockedUntilField != nil {
			if numberField, ok := lockedUntilField.(*core.NumberField); ok {
				numberField.Required = false
			}
		}

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Updated rate_limits attempts/locked_until to optional")
		return nil
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("rate_limits")
		if err != nil {
			return err
		}

		if attemptsField := collection.Fields.GetByName("attempts"); attemptsField != nil {
			if numberField, ok := attemptsField.(*core.NumberField); ok {
				numberField.Required = true
			}
		}

		if lockedUntilField := collection.Fields.GetByName("locked_until"); lockedUntilField != nil {
			if numberField, ok := lockedUntilField.(*core.NumberField); ok {
				numberField.Required = true
			}
		}

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Reverted rate_limits attempts/locked_until required flags")
		return nil
	})
}
