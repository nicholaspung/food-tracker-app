package migrations

import (
	"log"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

const (
	visitLocalDateFieldName        = "visitLocalDate"
	visitLocalDateLayout           = "2006-01-02"
	visitsLocalDateMergeIndexQuery = "CREATE INDEX idx_visits_user_restaurant_local_date_visibility ON visits (user, restaurant, visitLocalDate, visibility)"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("visits")
		if err != nil {
			return err
		}

		if collection.Fields.GetByName(visitLocalDateFieldName) == nil {
			collection.Fields.Add(&core.TextField{
				Name:     visitLocalDateFieldName,
				Max:      10,
				Pattern:  `^\d{4}-\d{2}-\d{2}$`,
				Required: false,
			})
		}

		if err := app.Save(collection); err != nil {
			return err
		}

		if err := backfillVisitLocalDate(app); err != nil {
			return err
		}

		if err := addCollectionIndexes(app, "visits", visitsLocalDateMergeIndexQuery); err != nil {
			return err
		}

		log.Println("✓ Added visitLocalDate merge key to visits")
		return nil
	}, func(app core.App) error {
		if err := removeCollectionIndexes(app, "visits", visitsLocalDateMergeIndexQuery); err != nil {
			return err
		}

		collection, err := app.FindCollectionByNameOrId("visits")
		if err != nil {
			return err
		}

		if collection.Fields.GetByName(visitLocalDateFieldName) != nil {
			collection.Fields.RemoveByName(visitLocalDateFieldName)
		}

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Removed visitLocalDate merge key from visits")
		return nil
	})
}

func backfillVisitLocalDate(app core.App) error {
	records, err := app.FindAllRecords("visits")
	if err != nil {
		return err
	}

	updatedCount := 0
	for _, record := range records {
		nextVisitLocalDate := resolveMigrationVisitLocalDate(
			record.GetString("visitDate"),
			record.GetString("created"),
		)
		if nextVisitLocalDate == "" {
			continue
		}

		if strings.TrimSpace(record.GetString(visitLocalDateFieldName)) == nextVisitLocalDate {
			continue
		}

		record.Set(visitLocalDateFieldName, nextVisitLocalDate)
		if err := app.Save(record); err != nil {
			return err
		}
		updatedCount += 1
	}

	log.Printf("✓ Backfilled visitLocalDate for %d visits", updatedCount)
	return nil
}

func resolveMigrationVisitLocalDate(candidates ...string) string {
	for _, candidate := range candidates {
		trimmedCandidate := strings.TrimSpace(candidate)
		if trimmedCandidate == "" {
			continue
		}

		if len(trimmedCandidate) >= len(visitLocalDateLayout) {
			datePrefix := trimmedCandidate[:len(visitLocalDateLayout)]
			if _, err := time.Parse(visitLocalDateLayout, datePrefix); err == nil {
				return datePrefix
			}
		}
	}

	return ""
}
