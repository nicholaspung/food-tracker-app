package handlers

import (
	"encoding/base64"
	"mime/multipart"
	"strings"
	"testing"
)

func TestDetectUploadedImageFormatAcceptsMatchingJPEG(t *testing.T) {
	jpegData := decodeBase64Fixture(
		t,
		"/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBxAQEBAQEBAVFRUVFRUVFRUVFRUVFRUVFRUWFhUVFRUYHSggGBolGxUVITEhJSkrLi4uFx8zODMsNygtLisBCgoKDg0OGhAQGi0fHyUtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLf/AABEIAAEAAQMBIgACEQEDEQH/xAAbAAABBQEBAAAAAAAAAAAAAAAFAAIDBAYBB//EADQQAAIBAwMCBAQEBgMAAAAAAAECAwAEEQUSITFBEyJRYXGBkQYyobHB0fAjQlJicuHw/8QAGQEBAAMBAQAAAAAAAAAAAAAAAAECBAMF/8QAIhEBAQACAgICAgMAAAAAAAAAAAECEQMhEjEEE0FRImFx/9oADAMBAAIRAxEAPwD3qIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgP/Z",
	)

	mimeType, format, err := detectUploadedImageFormat(
		&multipart.FileHeader{Filename: "upload.jpg", Size: int64(len(jpegData))},
		jpegData,
		allowedImageExtensions,
	)
	if err != nil {
		t.Fatalf("expected JPEG upload to validate, got %v", err)
	}
	if mimeType != "image/jpeg" {
		t.Fatalf("expected image/jpeg, got %q", mimeType)
	}
	if format != "jpeg" {
		t.Fatalf("expected jpeg format, got %q", format)
	}
}

func TestDetectUploadedImageFormatRejectsExtensionContentMismatch(t *testing.T) {
	pngData := decodeBase64Fixture(
		t,
		"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/58BAQUBAO+XnP8AAAAASUVORK5CYII=",
	)

	_, _, err := detectUploadedImageFormat(
		&multipart.FileHeader{Filename: "upload.jpg", Size: int64(len(pngData))},
		pngData,
		allowedImageExtensions,
	)
	if err == nil {
		t.Fatalf("expected mismatched content type to be rejected")
	}
	if !strings.Contains(err.Error(), "contents do not match") {
		t.Fatalf("expected mismatch error, got %v", err)
	}
}

func decodeBase64Fixture(t *testing.T, encoded string) []byte {
	t.Helper()

	data, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		t.Fatalf("failed to decode fixture: %v", err)
	}

	return data
}
