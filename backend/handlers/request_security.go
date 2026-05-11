package handlers

import (
	"context"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/gabriel-vasile/mimetype"
	"github.com/pocketbase/pocketbase/core"
)

const (
	maxImageUploadBytes          int64 = 10 << 20
	maxPlacesQueryLength               = 120
	maxPlacesLocationLength            = 200
	minPlacesRadiusMeters              = 100
	maxPlacesRadiusMeters              = 20000
	geminiRequestTimeout               = 90 * time.Second
	geminiGenerateAttemptTimeout       = 35 * time.Second
	googlePlacesRequestTimeout         = 15 * time.Second
	googleGeocodeRequestTimeout        = 10 * time.Second
	postHogProxyTimeout                = 10 * time.Second
)

var (
	errRequestBodyTooLarge = errors.New("request body exceeds allowed size")
	allowedImageExtensions = map[string]struct{}{
		".heic": {},
		".heif": {},
		".jpeg": {},
		".jpg":  {},
		".png":  {},
		".webp": {},
	}
	allowedHEICExtensions = map[string]struct{}{
		".heic": {},
		".heif": {},
	}
	allowedImageMimeTypesByExtension = map[string][]string{
		".heic": {"image/heic", "image/heif"},
		".heif": {"image/heic", "image/heif"},
		".jpeg": {"image/jpeg"},
		".jpg":  {"image/jpeg"},
		".png":  {"image/png"},
		".webp": {"image/webp"},
	}
	placesHTTPClient  = &http.Client{Timeout: googlePlacesRequestTimeout}
	geocodeHTTPClient = &http.Client{Timeout: googleGeocodeRequestTimeout}
	postHogHTTPClient = &http.Client{Timeout: postHogProxyTimeout}
)

func requestContextWithTimeout(e *core.RequestEvent, timeout time.Duration) (context.Context, context.CancelFunc) {
	if e != nil && e.Request != nil {
		return context.WithTimeout(e.Request.Context(), timeout)
	}

	return context.WithTimeout(context.Background(), timeout)
}

func validateUploadedImage(header *multipart.FileHeader, allowedExtensions map[string]struct{}) error {
	if header == nil {
		return fmt.Errorf("image file is required")
	}

	if header.Size <= 0 {
		return fmt.Errorf("image file is empty")
	}

	if header.Size > maxImageUploadBytes {
		return fmt.Errorf("image file exceeds %d MB limit", maxImageUploadBytes>>20)
	}

	extension := strings.ToLower(filepath.Ext(header.Filename))
	if _, ok := allowedExtensions[extension]; !ok {
		return fmt.Errorf("unsupported image format %q", extension)
	}

	return nil
}

func readUploadedFileWithLimit(file multipart.File, maxBytes int64) ([]byte, error) {
	if file == nil {
		return nil, fmt.Errorf("file is required")
	}

	reader := io.LimitReader(file, maxBytes+1)
	data, err := io.ReadAll(reader)
	if err != nil {
		return nil, err
	}

	if int64(len(data)) > maxBytes {
		return nil, fmt.Errorf("image file exceeds %d MB limit", maxBytes>>20)
	}

	return data, nil
}

func readPostHogProxyBody(body io.Reader, maxBytes int64) ([]byte, error) {
	if body == nil {
		return []byte{}, nil
	}

	reader := io.LimitReader(body, maxBytes+1)
	data, err := io.ReadAll(reader)
	if err != nil {
		return nil, fmt.Errorf("failed to read request body")
	}

	if int64(len(data)) > maxBytes {
		return nil, errRequestBodyTooLarge
	}

	return data, nil
}

func isRequestBodyTooLarge(err error) bool {
	return errors.Is(err, errRequestBodyTooLarge)
}

func detectUploadedImageFormat(
	header *multipart.FileHeader,
	data []byte,
	allowedExtensions map[string]struct{},
) (mimeType string, format string, err error) {
	if header == nil {
		return "", "", fmt.Errorf("image file is required")
	}

	if err := validateUploadedImage(header, allowedExtensions); err != nil {
		return "", "", err
	}

	if len(data) == 0 {
		return "", "", fmt.Errorf("image file is empty")
	}

	extension := strings.ToLower(filepath.Ext(header.Filename))
	detectedMimeType := mimetype.Detect(data).String()
	if !isAllowedDetectedImageMimeType(extension, detectedMimeType, allowedExtensions) {
		return "", "", fmt.Errorf("image contents do not match the uploaded file type")
	}

	imageFormat, err := imageFormatFromMimeType(detectedMimeType)
	if err != nil {
		return "", "", err
	}

	return detectedMimeType, imageFormat, nil
}

func isAllowedDetectedImageMimeType(
	extension string,
	mimeType string,
	allowedExtensions map[string]struct{},
) bool {
	if _, ok := allowedExtensions[extension]; !ok {
		return false
	}

	allowedMimeTypes, ok := allowedImageMimeTypesByExtension[extension]
	if !ok {
		return false
	}

	for _, allowedMimeType := range allowedMimeTypes {
		if mimeType == allowedMimeType {
			return true
		}
	}

	return false
}

func imageFormatFromMimeType(mimeType string) (string, error) {
	switch mimeType {
	case "image/heic":
		return "heic", nil
	case "image/heif":
		return "heif", nil
	case "image/jpeg":
		return "jpeg", nil
	case "image/png":
		return "png", nil
	case "image/webp":
		return "webp", nil
	default:
		return "", fmt.Errorf("unsupported detected image format %q", mimeType)
	}
}

func normalizeBoundedString(raw string, fieldName string, maxLength int) (string, error) {
	value := strings.TrimSpace(raw)
	if value == "" {
		return "", fmt.Errorf("%s is required", fieldName)
	}

	if len(value) > maxLength {
		return "", fmt.Errorf("%s must be %d characters or fewer", fieldName, maxLength)
	}

	return value, nil
}

func normalizePlacesRadius(rawRadius int, defaultRadius int) (int, error) {
	radius := rawRadius
	if radius == 0 {
		radius = defaultRadius
	}

	if radius < minPlacesRadiusMeters || radius > maxPlacesRadiusMeters {
		return 0, fmt.Errorf("radius must be between %d and %d meters", minPlacesRadiusMeters, maxPlacesRadiusMeters)
	}

	return radius, nil
}
