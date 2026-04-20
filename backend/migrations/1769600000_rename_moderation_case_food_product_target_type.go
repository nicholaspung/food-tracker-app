package migrations

import (
	"fmt"
	"log"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

const (
	legacyFoodProductTargetType = "quick-track"
	foodProductTargetType       = "food-product"
)

func init() {
	m.Register(func(app core.App) error {
		if err := updateModerationCaseTargetTypeFieldValues(app, []string{
			"visit",
			"food-item",
			legacyFoodProductTargetType,
			foodProductTargetType,
			"list",
			"list-item",
			"note",
			"photo",
			"user",
		}); err != nil {
			return err
		}

		if err := ensureModerationCaseTargetTypeMigrationSafe(app, legacyFoodProductTargetType, foodProductTargetType); err != nil {
			return err
		}

		if err := rewriteModerationCaseTargetTypes(app, legacyFoodProductTargetType, foodProductTargetType); err != nil {
			return err
		}

		if err := updateModerationCaseTargetTypeFieldValues(app, []string{
			"visit",
			"food-item",
			foodProductTargetType,
			"list",
			"list-item",
			"note",
			"photo",
			"user",
		}); err != nil {
			return err
		}

		log.Println("✓ Renamed moderation case targetType quick-track to food-product")
		return nil
	}, func(app core.App) error {
		if err := updateModerationCaseTargetTypeFieldValues(app, []string{
			"visit",
			"food-item",
			legacyFoodProductTargetType,
			foodProductTargetType,
			"list",
			"list-item",
			"note",
			"photo",
			"user",
		}); err != nil {
			return err
		}

		if err := ensureModerationCaseTargetTypeMigrationSafe(app, foodProductTargetType, legacyFoodProductTargetType); err != nil {
			return err
		}

		if err := rewriteModerationCaseTargetTypes(app, foodProductTargetType, legacyFoodProductTargetType); err != nil {
			return err
		}

		if err := updateModerationCaseTargetTypeFieldValues(app, []string{
			"visit",
			"food-item",
			legacyFoodProductTargetType,
			"list",
			"list-item",
			"note",
			"photo",
			"user",
		}); err != nil {
			return err
		}

		log.Println("✓ Restored moderation case targetType food-product to quick-track")
		return nil
	})
}

func updateModerationCaseTargetTypeFieldValues(app core.App, values []string) error {
	collection, err := app.FindCollectionByNameOrId("moderation_cases")
	if err != nil {
		return err
	}

	if existingField := collection.Fields.GetByName("targetType"); existingField != nil {
		collection.Fields.RemoveByName("targetType")
	}

	collection.Fields.Add(&core.SelectField{
		Name:      "targetType",
		Required:  true,
		MaxSelect: 1,
		Values:    values,
	})

	return app.Save(collection)
}

func ensureModerationCaseTargetTypeMigrationSafe(app core.App, fromType string, toType string) error {
	row := struct {
		Count int `db:"count"`
	}{}

	err := app.DB().NewQuery(`
		SELECT COUNT(*) AS [[count]]
		FROM (
			SELECT targetRecordId
			FROM moderation_cases
			WHERE targetType IN ({:fromType}, {:toType})
			GROUP BY targetRecordId
			HAVING COUNT(DISTINCT targetType) > 1
		) collisions
	`).Bind(dbx.Params{
		"fromType": strings.TrimSpace(fromType),
		"toType":   strings.TrimSpace(toType),
	}).One(&row)
	if err != nil {
		return err
	}

	if row.Count > 0 {
		return fmt.Errorf("moderation_cases targetType migration aborted: found %d duplicate targetRecordId collisions", row.Count)
	}

	return nil
}

func rewriteModerationCaseTargetTypes(app core.App, fromType string, toType string) error {
	_, err := app.DB().NewQuery(`
		UPDATE moderation_cases
		SET
			targetType = {:toType},
			targetLabel = CASE
				WHEN TRIM(COALESCE(targetLabel, '')) = {:legacyLabel} THEN {:nextLabel}
				ELSE targetLabel
			END
		WHERE targetType = {:fromType}
	`).Bind(dbx.Params{
		"fromType":    strings.TrimSpace(fromType),
		"toType":      strings.TrimSpace(toType),
		"legacyLabel": resolveFoodProductTargetLabel(fromType),
		"nextLabel":   resolveFoodProductTargetLabel(toType),
	}).Execute()

	return err
}

func resolveFoodProductTargetLabel(targetType string) string {
	if strings.TrimSpace(targetType) == foodProductTargetType {
		return "Food Product"
	}

	return "Quick Track"
}
