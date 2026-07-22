package handlers

import "testing"

func TestResolveSharedRestaurantListPhotoContentType(t *testing.T) {
	tests := map[string]string{
		"photo.HEIC": "image/heic",
		"photo.heif": "image/heif",
		"photo.jpg":  "image/jpeg",
	}

	for filename, expected := range tests {
		t.Run(filename, func(t *testing.T) {
			if actual := resolveSharedRestaurantListPhotoContentType(filename); actual != expected {
				t.Fatalf("expected %q, got %q", expected, actual)
			}
		})
	}
}
