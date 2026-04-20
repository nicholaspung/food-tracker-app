package migrations

import (
	"fmt"
	"log"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		if err := updateContentReportTargetTypeFieldValues(app, []string{
			"visit",
			legacyFoodProductTargetType,
			foodProductTargetType,
		}); err != nil {
			return err
		}

		if err := ensureContentReportTargetTypeMigrationSafe(app, legacyFoodProductTargetType, foodProductTargetType); err != nil {
			return err
		}

		if err := rewriteContentReportTargetTypes(app, legacyFoodProductTargetType, foodProductTargetType); err != nil {
			return err
		}

		if err := updateContentReportTargetTypeFieldValues(app, []string{
			"visit",
			foodProductTargetType,
		}); err != nil {
			return err
		}

		log.Println("✓ Renamed content report targetType quick-track to food-product")
		return nil
	}, func(app core.App) error {
		if err := updateContentReportTargetTypeFieldValues(app, []string{
			"visit",
			legacyFoodProductTargetType,
			foodProductTargetType,
		}); err != nil {
			return err
		}

		if err := ensureContentReportTargetTypeMigrationSafe(app, foodProductTargetType, legacyFoodProductTargetType); err != nil {
			return err
		}

		if err := rewriteContentReportTargetTypes(app, foodProductTargetType, legacyFoodProductTargetType); err != nil {
			return err
		}

		if err := updateContentReportTargetTypeFieldValues(app, []string{
			"visit",
			legacyFoodProductTargetType,
		}); err != nil {
			return err
		}

		log.Println("✓ Restored content report targetType food-product to quick-track")
		return nil
	})
}

func updateContentReportTargetTypeFieldValues(app core.App, values []string) error {
	collection, err := app.FindCollectionByNameOrId("content_reports")
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

func ensureContentReportTargetTypeMigrationSafe(app core.App, fromType string, toType string) error {
	row := struct {
		Count int `db:"count"`
	}{}

	err := app.DB().NewQuery(`
		SELECT COUNT(*) AS [[count]]
		FROM (
			SELECT reporter, targetRecordId
			FROM content_reports
			WHERE targetType IN ({:fromType}, {:toType})
			GROUP BY reporter, targetRecordId
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
		return fmt.Errorf("content_reports targetType migration aborted: found %d duplicate reporter/targetRecordId collisions", row.Count)
	}

	return nil
}

func rewriteContentReportTargetTypes(app core.App, fromType string, toType string) error {
	_, err := app.DB().NewQuery(`
		UPDATE content_reports
		SET targetType = {:toType}
		WHERE targetType = {:fromType}
	`).Bind(dbx.Params{
		"fromType": strings.TrimSpace(fromType),
		"toType":   strings.TrimSpace(toType),
	}).Execute()

	return err
}
