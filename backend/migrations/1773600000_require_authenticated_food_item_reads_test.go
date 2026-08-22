package migrations

import (
	"strings"
	"testing"

	"myapp/testutil"
)

func TestRequireAuthenticatedFoodItemReadsPreservesSupportedAccess(t *testing.T) {
	app := testutil.NewTestApp(t)
	owner := createFoodItemsMigrationTestUser(t, app, "food-product-owner@example.com")
	ownerToFriend := createFoodItemsMigrationTestUser(t, app, "food-product-owner-to-friend@example.com")
	friendToOwner := createFoodItemsMigrationTestUser(t, app, "food-product-friend-to-owner@example.com")
	pendingUser := createFoodItemsMigrationTestUser(t, app, "food-product-pending@example.com")
	blockedUser := createFoodItemsMigrationTestUser(t, app, "food-product-blocked@example.com")
	stranger := createFoodItemsMigrationTestUser(t, app, "food-product-stranger@example.com")
	createFoodItemAccessTestFriendship(t, app, owner.Id, ownerToFriend.Id, "accepted")
	createFoodItemAccessTestFriendship(t, app, friendToOwner.Id, owner.Id, "accepted")
	createFoodItemAccessTestFriendship(t, app, owner.Id, pendingUser.Id, "pending")
	createFoodItemAccessTestFriendship(t, app, owner.Id, blockedUser.Id, "blocked")

	publicProduct := createFoodItemsMigrationTestRecord(t, app, map[string]any{
		"name": "Public Food Product", "rating": 4, "user": owner.Id, "itemType": "food-product", "visibility": "friends",
	})
	friendsProduct := createFoodItemsMigrationTestRecord(t, app, map[string]any{
		"name": "Friends Food Product", "rating": 4, "user": owner.Id, "itemType": "food-product", "visibility": "friends",
	})
	privateProduct := createFoodItemsMigrationTestRecord(t, app, map[string]any{
		"name": "Private Food Product", "rating": 4, "user": owner.Id, "itemType": "food-product", "visibility": "private",
	})
	underReviewProduct := createFoodItemsMigrationTestRecord(t, app, map[string]any{
		"name": "Under Review Food Product", "rating": 4, "user": owner.Id, "itemType": "food-product", "visibility": "friends", "moderationStatus": "under_review",
	})
	hiddenProduct := createFoodItemsMigrationTestRecord(t, app, map[string]any{
		"name": "Hidden Food Product", "rating": 4, "user": owner.Id, "itemType": "food-product", "visibility": "friends", "moderationStatus": "hidden",
	})
	removedProduct := createFoodItemsMigrationTestRecord(t, app, map[string]any{
		"name": "Removed Food Product", "rating": 4, "user": owner.Id, "itemType": "food-product", "visibility": "friends", "moderationStatus": "removed",
	})
	// Public is retained in the effective read rule for legacy Food Product rows,
	// even though fresh writes currently accept only private or friends visibility.
	if _, err := app.DB().NewQuery(`
		UPDATE food_items
		SET visibility = 'public'
		WHERE id IN ({:publicId}, {:underReviewId}, {:hiddenId}, {:removedId})
	`).Bind(map[string]any{
		"publicId": publicProduct.Id, "underReviewId": underReviewProduct.Id,
		"hiddenId": hiddenProduct.Id, "removedId": removedProduct.Id,
	}).Execute(); err != nil {
		t.Fatalf("failed to seed legacy public Food Products: %v", err)
	}
	visit := createFoodItemsMigrationTestVisit(t, app, owner.Id)
	visitItem := createFoodItemsMigrationTestRecord(t, app, map[string]any{
		"name": "Friends Visit Item", "rating": 4, "user": owner.Id, "visit": visit.Id, "itemType": "visit-item",
	})

	if err := setFoodItemReadRule(app, foodItemsNoLegacyPublicVisitReadRule); err != nil {
		t.Fatalf("failed to install vulnerable food item read rule: %v", err)
	}
	mux := createLegacyVisitAccessTestRouter(t, app)
	assertCatalogListAllowed(t, mux, "food_items", publicProduct.Id, "", "anonymous legacy public Food Product")
	assertCatalogViewAllowed(t, mux, "food_items", publicProduct.Id, "", "anonymous legacy public Food Product")

	if err := setFoodItemReadRule(app, authenticatedFoodItemsReadRule); err != nil {
		t.Fatalf("failed to require authenticated food item reads: %v", err)
	}
	collection, err := app.FindCollectionByNameOrId("food_items")
	if err != nil {
		t.Fatalf("failed to resolve food_items collection: %v", err)
	}
	if collection.ListRule == nil || collection.ViewRule == nil ||
		!strings.HasPrefix(*collection.ListRule, "@request.auth.id != '' && (") ||
		!strings.HasPrefix(*collection.ViewRule, "@request.auth.id != '' && (") {
		t.Fatalf("food item read rules lack the authentication guard: list=%v view=%v", collection.ListRule, collection.ViewRule)
	}

	ownerToken := legacyVisitAccessTestToken(t, owner)
	ownerToFriendToken := legacyVisitAccessTestToken(t, ownerToFriend)
	friendToOwnerToken := legacyVisitAccessTestToken(t, friendToOwner)
	pendingToken := legacyVisitAccessTestToken(t, pendingUser)
	blockedToken := legacyVisitAccessTestToken(t, blockedUser)
	strangerToken := legacyVisitAccessTestToken(t, stranger)

	assertCatalogListDenied(t, mux, "food_items", publicProduct.Id, "", "anonymous public Food Product")
	assertCatalogViewDenied(t, mux, "food_items", publicProduct.Id, "", "anonymous public Food Product")
	assertCatalogListAllowed(t, mux, "food_items", publicProduct.Id, strangerToken, "authenticated public Food Product")
	assertCatalogViewAllowed(t, mux, "food_items", publicProduct.Id, strangerToken, "authenticated public Food Product")

	assertCatalogListAllowed(t, mux, "food_items", privateProduct.Id, ownerToken, "owner private Food Product")
	assertCatalogViewAllowed(t, mux, "food_items", privateProduct.Id, ownerToken, "owner private Food Product")
	assertCatalogViewDenied(t, mux, "food_items", privateProduct.Id, ownerToFriendToken, "accepted friend private Food Product")
	assertCatalogViewAllowed(t, mux, "food_items", friendsProduct.Id, ownerToFriendToken, "owner-to-friend accepted Food Product")
	assertCatalogViewAllowed(t, mux, "food_items", friendsProduct.Id, friendToOwnerToken, "friend-to-owner accepted Food Product")
	assertCatalogViewDenied(t, mux, "food_items", friendsProduct.Id, pendingToken, "pending relationship Food Product")
	assertCatalogViewDenied(t, mux, "food_items", friendsProduct.Id, blockedToken, "blocked relationship Food Product")
	assertCatalogViewDenied(t, mux, "food_items", friendsProduct.Id, strangerToken, "unrelated friends-only Food Product")

	assertCatalogViewAllowed(t, mux, "food_items", underReviewProduct.Id, ownerToken, "owner under-review Food Product")
	assertCatalogViewDenied(t, mux, "food_items", underReviewProduct.Id, strangerToken, "unrelated under-review Food Product")
	assertCatalogViewDenied(t, mux, "food_items", hiddenProduct.Id, ownerToken, "owner hidden Food Product")
	assertCatalogViewDenied(t, mux, "food_items", hiddenProduct.Id, strangerToken, "unrelated hidden Food Product")
	assertCatalogViewDenied(t, mux, "food_items", removedProduct.Id, ownerToken, "owner removed Food Product")
	assertCatalogViewDenied(t, mux, "food_items", removedProduct.Id, strangerToken, "unrelated removed Food Product")

	assertCatalogViewDenied(t, mux, "food_items", visitItem.Id, "", "anonymous Visit Item")
	assertCatalogViewAllowed(t, mux, "food_items", visitItem.Id, ownerToken, "owner Visit Item")
	assertCatalogViewAllowed(t, mux, "food_items", visitItem.Id, ownerToFriendToken, "accepted friend Visit Item")
	assertCatalogViewDenied(t, mux, "food_items", visitItem.Id, strangerToken, "unrelated Visit Item")
}
