package handlers

import (
	"fmt"
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"myapp/hooks"
	_ "myapp/migrations"
	"myapp/testutil"
)

func TestSameNameRestaurantCandidateQueryUsesNormalizedNameIndex(t *testing.T) {
	app := testutil.NewTestApp(t)
	hooks.RegisterRestaurantHistoryNameHooks(app)

	createRestaurantHistoryQueryTestRecord(t, app, "McDonald's", "Hollywood, CA")
	updatedRestaurant := createRestaurantHistoryQueryTestRecord(t, app, "  McDonald’s  ", "Pasadena, CA")
	for index := range 500 {
		createRestaurantHistoryQueryTestRecord(
			t,
			app,
			fmt.Sprintf("Unrelated Restaurant %03d", index),
			fmt.Sprintf("Location %03d", index),
		)
	}

	rows, err := listAccessibleSameNameRestaurantCandidates(app, "", true, "mcdonald's")
	if err != nil {
		t.Fatalf("failed to load same-name Restaurant candidates: %v", err)
	}
	if len(rows) != 2 {
		t.Fatalf("expected only two normalized-name matches from large unrelated catalog, got %d", len(rows))
	}

	updatedRestaurant.Set("name", "Renamed Restaurant")
	if err := app.Save(updatedRestaurant); err != nil {
		t.Fatalf("failed to rename Restaurant: %v", err)
	}
	rows, err = listAccessibleSameNameRestaurantCandidates(app, "", true, "mcdonald's")
	if err != nil {
		t.Fatalf("failed to reload same-name Restaurant candidates: %v", err)
	}
	if len(rows) != 1 {
		t.Fatalf("expected normalized lookup key to follow Restaurant rename, got %d matches", len(rows))
	}

	planRows := []struct {
		Detail string `db:"detail"`
	}{}
	if err := app.DB().NewQuery("EXPLAIN QUERY PLAN " + buildAccessibleSameNameRestaurantCandidatesQuery(true)).
		Bind(dbx.Params{"normalizedName": "mcdonald's"}).
		All(&planRows); err != nil {
		t.Fatalf("failed to explain same-name Restaurant candidate query: %v", err)
	}

	planDetails := make([]string, 0, len(planRows))
	for _, row := range planRows {
		planDetails = append(planDetails, row.Detail)
	}
	plan := strings.Join(planDetails, "\n")
	if !strings.Contains(plan, "idx_restaurants_history_normalized_name") {
		t.Fatalf("expected normalized-name index in query plan, got:\n%s", plan)
	}
}

func createRestaurantHistoryQueryTestRecord(
	t *testing.T,
	app core.App,
	name string,
	location string,
) *core.Record {
	t.Helper()

	collection, err := app.FindCollectionByNameOrId("restaurants")
	if err != nil {
		t.Fatalf("failed to resolve Restaurants collection: %v", err)
	}
	record := core.NewRecord(collection)
	record.Set("name", name)
	record.Set("location", location)
	record.Set("visibility", "public")
	if err := app.Save(record); err != nil {
		t.Fatalf("failed to create Restaurant %q: %v", name, err)
	}
	return record
}
