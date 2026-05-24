package handlers

import (
	"bytes"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"strings"
	"testing"
)

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
