package migrations

import (
	"bytes"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/security"

	"myapp/testutil"
)

const (
	menuImageFileTestID       = "menuimgfile0001"
	menuImageFileTestFilename = "menu-source.png"
)

func TestProtectMenuImageFilesMigratesExistingRecordsAndEnforcesFileAuthorization(t *testing.T) {
	app := testutil.NewTestApp(t)
	initialCollection, err := app.FindCollectionByNameOrId("menu_images")
	if err != nil {
		t.Fatalf("failed to load migrated menu_images collection: %v", err)
	}
	initialImageField, ok := initialCollection.Fields.GetByName("image").(*core.FileField)
	if !ok || !initialImageField.Protected {
		t.Fatal("expected registered migration to protect menu_images.image")
	}
	if err := setMenuImageFileProtection(app, false); err != nil {
		t.Fatalf("failed to install pre-migration Menu Scan Source Image schema: %v", err)
	}
	owner := createFoodItemsMigrationTestUser(t, app, "menu-image-owner@example.com")
	admin := createFoodItemsMigrationTestUser(t, app, "menu-image-admin@example.com")
	admin.Set("isAdmin", true)
	if err := app.Save(admin); err != nil {
		t.Fatalf("failed to grant Menu Scan Source Image test admin access: %v", err)
	}
	stranger := createFoodItemsMigrationTestUser(t, app, "menu-image-stranger@example.com")
	restaurant := createCatalogReadTestRecord(t, app, "restaurants", map[string]any{
		"name":       "Protected Menu Archive",
		"location":   "Los Angeles, CA",
		"createdBy":  owner.Id,
		"visibility": "private",
	})
	imageBytes := encodeMenuImageFileTestFixture(t)
	record := insertMenuImageFileTestRecord(t, app, restaurant.Id, owner.Id, imageBytes)
	mux := createLegacyVisitAccessTestRouter(t, app)

	preMigration := performMenuImageFileTestRequest(t, mux, record.Id, "", "")
	if preMigration.Code != http.StatusOK || !bytes.Equal(preMigration.Body.Bytes(), imageBytes) {
		t.Fatalf("expected existing unprotected Menu Scan Source Image bytes before migration, got %d", preMigration.Code)
	}

	if err := setMenuImageFileProtection(app, true); err != nil {
		t.Fatalf("failed to protect Menu Scan Source Image files: %v", err)
	}
	collection, err := app.FindCollectionByNameOrId("menu_images")
	if err != nil {
		t.Fatalf("failed to reload menu_images collection: %v", err)
	}
	imageField, ok := collection.Fields.GetByName("image").(*core.FileField)
	if !ok || !imageField.Protected {
		t.Fatal("expected menu_images.image to be protected after migration")
	}

	ownerToken := menuImageFileTestToken(t, owner)
	adminToken := menuImageFileTestToken(t, admin)
	expiredOwnerToken := expiredMenuImageFileTestToken(t, owner)
	strangerToken := menuImageFileTestToken(t, stranger)

	for _, requestVariant := range []struct {
		name  string
		thumb string
	}{
		{name: "original"},
		{name: "thumbnail", thumb: "100x100"},
	} {
		t.Run(requestVariant.name, func(t *testing.T) {
			for _, actor := range []struct {
				name    string
				token   string
				allowed bool
			}{
				{name: "owner", token: ownerToken, allowed: true},
				{name: "administrator", token: adminToken, allowed: true},
				{name: "missing token"},
				{name: "malformed token", token: "not-a-file-token"},
				{name: "expired token", token: expiredOwnerToken},
				{name: "wrong-account token", token: strangerToken},
			} {
				t.Run(actor.name, func(t *testing.T) {
					response := performMenuImageFileTestRequest(
						t,
						mux,
						record.Id,
						actor.token,
						requestVariant.thumb,
					)
					if actor.allowed {
						if response.Code != http.StatusOK {
							t.Fatalf("expected authorized file request 200, got %d: %s", response.Code, response.Body.String())
						}
						if requestVariant.thumb == "" && !bytes.Equal(response.Body.Bytes(), imageBytes) {
							t.Fatal("authorized original request returned unexpected bytes")
						}
						return
					}
					if response.Code != http.StatusNotFound {
						t.Fatalf("expected unauthorized protected file request 404, got %d", response.Code)
					}
				})
			}
		})
	}

	if err := app.Delete(record); err != nil {
		t.Fatalf("failed to delete Menu Scan Source Image test record: %v", err)
	}
	deletedRecordResponse := performMenuImageFileTestRequest(t, mux, record.Id, ownerToken, "")
	if deletedRecordResponse.Code != http.StatusNotFound {
		t.Fatalf("expected deleted Menu Scan Source Image file request 404, got %d", deletedRecordResponse.Code)
	}
}

func insertMenuImageFileTestRecord(
	t *testing.T,
	app core.App,
	restaurantID string,
	uploaderID string,
	contents []byte,
) *core.Record {
	t.Helper()

	now := time.Now().UTC().Format(time.RFC3339Nano)
	if _, err := app.DB().NewQuery(`
		INSERT INTO menu_images (id, image, restaurant, uploadedBy, created, updated)
		VALUES ({:id}, {:image}, {:restaurant}, {:uploadedBy}, {:created}, {:updated})
	`).Bind(dbx.Params{
		"id":         menuImageFileTestID,
		"image":      menuImageFileTestFilename,
		"restaurant": restaurantID,
		"uploadedBy": uploaderID,
		"created":    now,
		"updated":    now,
	}).Execute(); err != nil {
		t.Fatalf("failed to insert pre-migration Menu Scan Source Image: %v", err)
	}

	record, err := app.FindRecordById("menu_images", menuImageFileTestID)
	if err != nil {
		t.Fatalf("failed to load pre-migration Menu Scan Source Image: %v", err)
	}
	fsys, err := app.NewFilesystem()
	if err != nil {
		t.Fatalf("failed to create Menu Scan Source Image test filesystem: %v", err)
	}
	defer fsys.Close()
	if err := fsys.Upload(contents, record.BaseFilesPath()+"/"+menuImageFileTestFilename); err != nil {
		t.Fatalf("failed to upload Menu Scan Source Image test fixture: %v", err)
	}
	return record
}

func encodeMenuImageFileTestFixture(t *testing.T) []byte {
	t.Helper()

	fixture := image.NewRGBA(image.Rect(0, 0, 2, 2))
	fixture.Set(0, 0, color.RGBA{R: 0xff, G: 0x66, A: 0xff})
	var encoded bytes.Buffer
	if err := png.Encode(&encoded, fixture); err != nil {
		t.Fatalf("failed to encode Menu Scan Source Image test fixture: %v", err)
	}
	return encoded.Bytes()
}

func menuImageFileTestToken(t *testing.T, user *core.Record) string {
	t.Helper()

	token, err := user.NewFileToken()
	if err != nil {
		t.Fatalf("failed to create Menu Scan Source Image file token: %v", err)
	}
	return token
}

func expiredMenuImageFileTestToken(t *testing.T, user *core.Record) string {
	t.Helper()

	token, err := security.NewJWT(jwt.MapClaims{
		core.TokenClaimType:         core.TokenTypeFile,
		core.TokenClaimId:           user.Id,
		core.TokenClaimCollectionId: user.Collection().Id,
	}, user.TokenKey()+user.Collection().FileToken.Secret, -time.Minute)
	if err != nil {
		t.Fatalf("failed to create expired Menu Scan Source Image file token: %v", err)
	}
	return token
}

func performMenuImageFileTestRequest(
	t *testing.T,
	mux http.Handler,
	recordID string,
	token string,
	thumb string,
) *httptest.ResponseRecorder {
	t.Helper()

	query := url.Values{}
	if token != "" {
		query.Set("token", token)
	}
	if thumb != "" {
		query.Set("thumb", thumb)
	}
	path := fmt.Sprintf("/api/files/menu_images/%s/%s", recordID, menuImageFileTestFilename)
	if encodedQuery := query.Encode(); encodedQuery != "" {
		path += "?" + encodedQuery
	}
	request := httptest.NewRequest(http.MethodGet, path, nil)
	response := httptest.NewRecorder()
	mux.ServeHTTP(response, request)
	return response
}
