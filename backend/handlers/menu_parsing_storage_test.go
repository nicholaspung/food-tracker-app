package handlers

import (
	"bytes"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/core"

	"myapp/testutil"
)

func TestSaveMenuScanImagePreservesTrustedAttributionAndRestaurantAuthorization(t *testing.T) {
	app := testutil.NewTestApp(t)
	owner := createMenuScanStorageTestUser(t, app, false)
	scanner := createMenuScanStorageTestUser(t, app, false)
	acceptedFriend := createMenuScanStorageTestUser(t, app, false)
	admin := createMenuScanStorageTestUser(t, app, true)
	createMenuScanStorageTestFriendship(t, app, owner.Id, acceptedFriend.Id)

	publicRestaurant := createMenuScanStorageTestRestaurant(t, app, owner.Id, "public")
	privateRestaurant := createMenuScanStorageTestRestaurant(t, app, owner.Id, "private")
	friendsRestaurant := createMenuScanStorageTestRestaurant(t, app, owner.Id, "friends")
	imageData := encodePNGFixture(t, 8, 6)

	for _, testCase := range []struct {
		name       string
		actor      *core.Record
		restaurant *core.Record
		wantSaved  bool
	}{
		{name: "public Restaurant", actor: scanner, restaurant: publicRestaurant, wantSaved: true},
		{name: "owner private Restaurant", actor: owner, restaurant: privateRestaurant, wantSaved: true},
		{name: "accepted friend Restaurant", actor: acceptedFriend, restaurant: friendsRestaurant, wantSaved: true},
		{name: "inaccessible private Restaurant", actor: scanner, restaurant: privateRestaurant, wantSaved: false},
		{name: "inaccessible friends-only Restaurant", actor: scanner, restaurant: friendsRestaurant, wantSaved: false},
		{name: "administrator private Restaurant", actor: admin, restaurant: privateRestaurant, wantSaved: true},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			beforeCount := countMenuScanStorageTestRecords(t, app)
			result, err := saveMenuScanImage(
				app,
				testCase.actor,
				testCase.restaurant.Id,
				imageData,
				"trusted-menu.png",
			)
			if !testCase.wantSaved {
				if err == nil {
					t.Fatal("expected inaccessible Restaurant to be rejected")
				}
				if result.ID != "" {
					t.Fatalf("expected no Menu Scan Source Image id, got %q", result.ID)
				}
				if afterCount := countMenuScanStorageTestRecords(t, app); afterCount != beforeCount {
					t.Fatalf("expected rejected save to preserve record count %d, got %d", beforeCount, afterCount)
				}
				return
			}

			if err != nil {
				t.Fatalf("expected trusted save to succeed, got %v", err)
			}
			savedRecord, err := app.FindRecordById("menu_images", result.ID)
			if err != nil {
				t.Fatalf("failed to reload Menu Scan Source Image: %v", err)
			}
			if savedRecord.GetString("uploadedBy") != testCase.actor.Id {
				t.Fatalf("expected uploadedBy=%q, got %q", testCase.actor.Id, savedRecord.GetString("uploadedBy"))
			}
			if savedRecord.GetString("restaurant") != testCase.restaurant.Id {
				t.Fatalf("expected Restaurant=%q, got %q", testCase.restaurant.Id, savedRecord.GetString("restaurant"))
			}
			imageName := savedRecord.GetString("image")
			if imageName == "" {
				t.Fatal("expected trusted save to persist an image filename")
			}
			storedPath := filepath.Join(app.DataDir(), "storage", savedRecord.Collection().Id, savedRecord.Id, imageName)
			if _, err := os.Stat(storedPath); err != nil {
				t.Fatalf("expected trusted save to persist the image file: %v", err)
			}
		})
	}
}

func createMenuScanStorageTestUser(t *testing.T, app core.App, isAdmin bool) *core.Record {
	t.Helper()

	collection, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		t.Fatalf("failed to resolve users collection: %v", err)
	}
	record := core.NewRecord(collection)
	record.Set("email", fmt.Sprintf("menu-scan-%d@example.com", time.Now().UnixNano()))
	record.Set("name", "Menu Scan Storage Test User")
	record.Set("isAdmin", isAdmin)
	record.Set("defaultRestaurantVisibility", "friends")
	record.Set("defaultVisitVisibility", "friends")
	record.SetVerified(true)
	record.SetPassword("password123")
	if err := app.Save(record); err != nil {
		t.Fatalf("failed to create menu scan test user: %v", err)
	}
	return record
}

func createMenuScanStorageTestRestaurant(
	t *testing.T,
	app core.App,
	ownerID string,
	visibility string,
) *core.Record {
	t.Helper()

	collection, err := app.FindCollectionByNameOrId("restaurants")
	if err != nil {
		t.Fatalf("failed to resolve restaurants collection: %v", err)
	}
	record := core.NewRecord(collection)
	record.Set("name", "Menu Scan Storage Test Restaurant "+visibility)
	record.Set("location", "San Francisco, CA")
	record.Set("createdBy", ownerID)
	record.Set("visibility", visibility)
	if err := app.Save(record); err != nil {
		t.Fatalf("failed to create menu scan test Restaurant: %v", err)
	}
	return record
}

func createMenuScanStorageTestFriendship(t *testing.T, app core.App, userID string, friendID string) {
	t.Helper()

	collection, err := app.FindCollectionByNameOrId("friendships")
	if err != nil {
		t.Fatalf("failed to resolve friendships collection: %v", err)
	}
	record := core.NewRecord(collection)
	record.Set("user", userID)
	record.Set("friend", friendID)
	record.Set("status", "accepted")
	if err := app.Save(record); err != nil {
		t.Fatalf("failed to create accepted friendship: %v", err)
	}
}

func countMenuScanStorageTestRecords(t *testing.T, app core.App) int {
	t.Helper()

	records, err := app.FindRecordsByFilter("menu_images", "", "", 100, 0)
	if err != nil {
		t.Fatalf("failed to count Menu Scan Source Images: %v", err)
	}
	return len(records)
}

func TestPrepareStoredMenuImageResizesOversizedImage(t *testing.T) {
	imageData := encodeJPEGFixture(t, 4096, 2048)

	storedData, storedFileName, err := prepareStoredMenuImage(imageData, "menu-upload.png")
	if err != nil {
		t.Fatalf("expected oversized image to be prepared, got %v", err)
	}

	if storedFileName != "menu-upload.jpg" {
		t.Fatalf("expected jpeg filename, got %q", storedFileName)
	}

	decodedImage, format, err := image.Decode(bytes.NewReader(storedData))
	if err != nil {
		t.Fatalf("expected stored image to decode, got %v", err)
	}
	if format != "jpeg" {
		t.Fatalf("expected stored image to be jpeg, got %q", format)
	}

	bounds := decodedImage.Bounds()
	if bounds.Dx() > storedMenuImageMaxEdge || bounds.Dy() > storedMenuImageMaxEdge {
		t.Fatalf("expected image to fit within %dpx, got %dx%d", storedMenuImageMaxEdge, bounds.Dx(), bounds.Dy())
	}
	if bounds.Dx() != storedMenuImageMaxEdge {
		t.Fatalf("expected width to be resized to %d, got %d", storedMenuImageMaxEdge, bounds.Dx())
	}
}

func TestPrepareStoredMenuImageCompressesSmallImageAsJPEG(t *testing.T) {
	imageData := encodePNGFixture(t, 640, 480)

	storedData, storedFileName, err := prepareStoredMenuImage(imageData, "small-menu")
	if err != nil {
		t.Fatalf("expected small image to be prepared, got %v", err)
	}

	if storedFileName != "small-menu.jpg" {
		t.Fatalf("expected jpeg filename, got %q", storedFileName)
	}

	decodedImage, format, err := image.Decode(bytes.NewReader(storedData))
	if err != nil {
		t.Fatalf("expected stored image to decode, got %v", err)
	}
	if format != "jpeg" {
		t.Fatalf("expected stored image to be jpeg, got %q", format)
	}

	bounds := decodedImage.Bounds()
	if bounds.Dx() != 640 || bounds.Dy() != 480 {
		t.Fatalf("expected dimensions to remain 640x480, got %dx%d", bounds.Dx(), bounds.Dy())
	}
}

func TestPrepareStoredMenuImageRejectsInvalidImage(t *testing.T) {
	_, _, err := prepareStoredMenuImage([]byte("not an image"), "menu.jpg")
	if err == nil {
		t.Fatalf("expected invalid image to fail")
	}
	if !strings.Contains(err.Error(), "failed to decode menu image") {
		t.Fatalf("expected decode error, got %v", err)
	}
}

func encodeJPEGFixture(t *testing.T, width int, height int) []byte {
	t.Helper()

	var buffer bytes.Buffer
	if err := jpeg.Encode(&buffer, buildImageFixture(width, height), &jpeg.Options{Quality: 95}); err != nil {
		t.Fatalf("failed to encode jpeg fixture: %v", err)
	}

	return buffer.Bytes()
}

func encodePNGFixture(t *testing.T, width int, height int) []byte {
	t.Helper()

	var buffer bytes.Buffer
	if err := png.Encode(&buffer, buildImageFixture(width, height)); err != nil {
		t.Fatalf("failed to encode png fixture: %v", err)
	}

	return buffer.Bytes()
}

func buildImageFixture(width int, height int) image.Image {
	img := image.NewRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			img.Set(x, y, color.RGBA{
				R: uint8(x % 255),
				G: uint8(y % 255),
				B: uint8((x + y) % 255),
				A: 255,
			})
		}
	}

	return img
}
