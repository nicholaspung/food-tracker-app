package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("recommendation_usage")
		if err != nil {
			return err
		}
		visitsCollection, err := app.FindCollectionByNameOrId("visits")
		if err != nil {
			return err
		}
		foodItemsCollection, err := app.FindCollectionByNameOrId("food_items")
		if err != nil {
			return err
		}

		if kindField, ok := collection.Fields.GetByName("kind").(*core.SelectField); ok {
			kindField.Values = []string{"saved_recommendation", "tried_recommendation", "rated_after_try"}
		}
		if actionField, ok := collection.Fields.GetByName("action").(*core.SelectField); ok {
			actionField.Values = []string{"saved", "removed", "tried", "rated"}
		}
		if collection.Fields.GetByName("sourceListItemSnapshotId") == nil {
			collection.Fields.Add(&core.TextField{Name: "sourceListItemSnapshotId", Required: false})
		}
		if collection.Fields.GetByName("targetListItemSnapshotId") == nil {
			collection.Fields.Add(&core.TextField{Name: "targetListItemSnapshotId", Required: false})
		}
		if collection.Fields.GetByName("targetVisit") == nil {
			collection.Fields.Add(&core.RelationField{Name: "targetVisit", CollectionId: visitsCollection.Id, MaxSelect: 1, Required: false, CascadeDelete: false})
		}
		if collection.Fields.GetByName("targetVisitItem") == nil {
			collection.Fields.Add(&core.RelationField{Name: "targetVisitItem", CollectionId: foodItemsCollection.Id, MaxSelect: 1, Required: false, CascadeDelete: false})
		}
		collection.Indexes = append(collection.Indexes,
			"CREATE INDEX idx_recommendation_usage_source_list_item_snapshot ON recommendation_usage (sourceListItemSnapshotId, actor, action) WHERE sourceListItemSnapshotId IS NOT NULL AND sourceListItemSnapshotId != ''",
			"CREATE INDEX idx_recommendation_usage_target_visit ON recommendation_usage (targetVisit, action, actedAt) WHERE targetVisit IS NOT NULL AND targetVisit != ''",
			"CREATE INDEX idx_recommendation_usage_target_visit_item ON recommendation_usage (targetVisitItem, action, actedAt) WHERE targetVisitItem IS NOT NULL AND targetVisitItem != ''",
		)

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("Extended recommendation_usage for visit recommendation events")
		return nil
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("recommendation_usage")
		if err != nil {
			return err
		}

		if kindField, ok := collection.Fields.GetByName("kind").(*core.SelectField); ok {
			kindField.Values = []string{"saved_recommendation"}
		}
		if actionField, ok := collection.Fields.GetByName("action").(*core.SelectField); ok {
			actionField.Values = []string{"saved", "removed"}
		}
		if field := collection.Fields.GetByName("sourceListItemSnapshotId"); field != nil {
			collection.Fields.RemoveById(field.GetId())
		}
		if field := collection.Fields.GetByName("targetListItemSnapshotId"); field != nil {
			collection.Fields.RemoveById(field.GetId())
		}
		if field := collection.Fields.GetByName("targetVisit"); field != nil {
			collection.Fields.RemoveById(field.GetId())
		}
		if field := collection.Fields.GetByName("targetVisitItem"); field != nil {
			collection.Fields.RemoveById(field.GetId())
		}
		collection.Indexes = []string{
			recommendationUsageActorActionIndex,
			recommendationUsageSourceUserIndex,
			recommendationUsageTargetListIndex,
		}

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("Removed visit recommendation event fields from recommendation_usage")
		return nil
	})
}
