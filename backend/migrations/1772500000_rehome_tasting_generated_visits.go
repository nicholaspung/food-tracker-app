package migrations

import (
	"database/sql"
	"errors"
	"log"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		updatedCount, err := rehomeTastingGeneratedVisitItems(app)
		if err != nil {
			return err
		}

		log.Printf("✓ Rehomed %d tasting generated visit items by rating date", updatedCount)
		return nil
	}, func(app core.App) error {
		log.Println("✓ Skipped reverting tasting generated visit item rehome")
		return nil
	})
}

func rehomeTastingGeneratedVisitItems(app core.App) (int, error) {
	ratings, err := app.FindAllRecords("tasting_session_ratings")
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return 0, nil
		}
		return 0, err
	}

	updatedCount := 0
	visitCache := map[string]*core.Record{}
	for _, rating := range ratings {
		userID := strings.TrimSpace(rating.GetString("user"))
		generatedVisitID := strings.TrimSpace(rating.GetString("generated_visit"))
		generatedFoodItemID := strings.TrimSpace(rating.GetString("generated_food_item"))
		if userID == "" || generatedVisitID == "" || generatedFoodItemID == "" {
			continue
		}

		generatedVisit, err := app.FindRecordById("visits", generatedVisitID)
		if err != nil {
			continue
		}
		generatedFoodItem, err := app.FindRecordById("food_items", generatedFoodItemID)
		if err != nil {
			continue
		}

		restaurantID := strings.TrimSpace(generatedVisit.GetString("restaurant"))
		visitLocalDate := resolveMigrationVisitLocalDate(rating.GetString("created"), generatedFoodItem.GetString("created"))
		if restaurantID == "" || visitLocalDate == "" {
			continue
		}

		targetVisit, err := findOrCreateTastingGeneratedVisitByLocalDate(
			app,
			visitCache,
			userID,
			restaurantID,
			visitLocalDate,
			rating.GetString("created"),
		)
		if err != nil {
			return updatedCount, err
		}

		if strings.TrimSpace(rating.GetString("generated_visit")) != targetVisit.Id {
			rating.Set("generated_visit", targetVisit.Id)
			if err := app.Save(rating); err != nil {
				return updatedCount, err
			}
		}

		if strings.TrimSpace(generatedFoodItem.GetString("visit")) != targetVisit.Id ||
			strings.TrimSpace(generatedFoodItem.GetString("user")) != userID ||
			strings.TrimSpace(generatedFoodItem.GetString("itemType")) != "visit-item" {
			generatedFoodItem.Set("visit", targetVisit.Id)
			generatedFoodItem.Set("user", userID)
			generatedFoodItem.Set("itemType", "visit-item")
			generatedFoodItem.Set("visibility", "friends")
			if err := app.Save(generatedFoodItem); err != nil {
				return updatedCount, err
			}
			updatedCount += 1
		}
	}

	return updatedCount, nil
}

func findOrCreateTastingGeneratedVisitByLocalDate(
	app core.App,
	cache map[string]*core.Record,
	userID string,
	restaurantID string,
	visitLocalDate string,
	visitedAt string,
) (*core.Record, error) {
	cacheKey := userID + "\x00" + restaurantID + "\x00" + visitLocalDate
	if cachedVisit := cache[cacheKey]; cachedVisit != nil {
		return cachedVisit, nil
	}

	record, err := app.FindFirstRecordByFilter(
		"visits",
		"user = {:user} && restaurant = {:restaurant} && visibility = 'friends' && "+visitLocalDateFieldName+" = {:visitLocalDate}",
		dbx.Params{
			"user":           userID,
			"restaurant":     restaurantID,
			"visitLocalDate": visitLocalDate,
		},
	)
	if err == nil && record != nil {
		cache[cacheKey] = record
		return record, nil
	}
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}

	collection, err := app.FindCollectionByNameOrId("visits")
	if err != nil {
		return nil, err
	}

	record = core.NewRecord(collection)
	record.Set("restaurant", restaurantID)
	record.Set("user", userID)
	record.Set("visitDate", strings.TrimSpace(visitedAt))
	record.Set(visitLocalDateFieldName, visitLocalDate)
	record.Set("visibility", "friends")
	if err := app.Save(record); err != nil {
		return nil, err
	}

	cache[cacheKey] = record
	return record, nil
}
