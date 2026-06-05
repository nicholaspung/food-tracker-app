package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("menu_items")
		if err != nil {
			return err
		}

		usersCollection, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			return err
		}

		if collection.Fields.GetByName("approvalStatus") == nil {
			collection.Fields.Add(&core.SelectField{
				Name:      "approvalStatus",
				Required:  false,
				MaxSelect: 1,
				Values:    []string{"unreviewed", "approved", "rejected"},
			})
		}
		if collection.Fields.GetByName("approvalReviewedBy") == nil {
			collection.Fields.Add(&core.RelationField{
				Name:          "approvalReviewedBy",
				CollectionId:  usersCollection.Id,
				MaxSelect:     1,
				Required:      false,
				CascadeDelete: false,
			})
		}
		if collection.Fields.GetByName("approvalReviewedAt") == nil {
			collection.Fields.Add(&core.DateField{
				Name: "approvalReviewedAt",
			})
		}
		if collection.Fields.GetByName("promotedFrom") == nil {
			collection.Fields.Add(&core.RelationField{
				Name:          "promotedFrom",
				CollectionId:  collection.Id,
				MaxSelect:     1,
				Required:      false,
				CascadeDelete: false,
			})
		}
		if collection.Fields.GetByName("promotedTo") == nil {
			collection.Fields.Add(&core.RelationField{
				Name:          "promotedTo",
				CollectionId:  collection.Id,
				MaxSelect:     1,
				Required:      false,
				CascadeDelete: false,
			})
		}
		if collection.Fields.GetByName("groupSuitable") == nil {
			collection.Fields.Add(&core.BoolField{
				Name: "groupSuitable",
			})
		}

		if !hasCollectionIndex(collection.Indexes, "CREATE INDEX idx_menu_items_approval_status ON menu_items (approvalStatus)") {
			collection.Indexes = append(collection.Indexes, "CREATE INDEX idx_menu_items_approval_status ON menu_items (approvalStatus)")
		}
		if !hasCollectionIndex(collection.Indexes, "CREATE INDEX idx_menu_items_approved_restaurant_name ON menu_items (restaurant, LOWER(TRIM(name))) WHERE approvalStatus = 'approved'") {
			collection.Indexes = append(collection.Indexes, "CREATE INDEX idx_menu_items_approved_restaurant_name ON menu_items (restaurant, LOWER(TRIM(name))) WHERE approvalStatus = 'approved'")
		}
		if !hasCollectionIndex(collection.Indexes, "CREATE INDEX idx_menu_items_group_suitable ON menu_items (restaurant, LOWER(TRIM(name))) WHERE approvalStatus = 'approved' AND visibility = 'public' AND groupSuitable = TRUE") {
			collection.Indexes = append(collection.Indexes, "CREATE INDEX idx_menu_items_group_suitable ON menu_items (restaurant, LOWER(TRIM(name))) WHERE approvalStatus = 'approved' AND visibility = 'public' AND groupSuitable = TRUE")
		}

		if err := app.Save(collection); err != nil {
			return err
		}

		if _, err := app.DB().NewQuery(`
			UPDATE menu_items
			SET approvalStatus = 'unreviewed'
			WHERE TRIM(COALESCE(approvalStatus, '')) = ''
		`).Execute(); err != nil {
			return err
		}

		log.Println("Added menu item catalog trust fields")
		return nil
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("menu_items")
		if err != nil {
			return err
		}

		collection.Indexes = removeCollectionIndex(collection.Indexes, "CREATE INDEX idx_menu_items_approval_status ON menu_items (approvalStatus)")
		collection.Indexes = removeCollectionIndex(collection.Indexes, "CREATE INDEX idx_menu_items_approved_restaurant_name ON menu_items (restaurant, LOWER(TRIM(name))) WHERE approvalStatus = 'approved'")
		collection.Indexes = removeCollectionIndex(collection.Indexes, "CREATE INDEX idx_menu_items_group_suitable ON menu_items (restaurant, LOWER(TRIM(name))) WHERE approvalStatus = 'approved' AND visibility = 'public' AND groupSuitable = TRUE")
		collection.Fields.RemoveByName("approvalStatus")
		collection.Fields.RemoveByName("approvalReviewedBy")
		collection.Fields.RemoveByName("approvalReviewedAt")
		collection.Fields.RemoveByName("promotedFrom")
		collection.Fields.RemoveByName("promotedTo")
		collection.Fields.RemoveByName("groupSuitable")

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("Removed menu item catalog trust fields")
		return nil
	})
}
