package handlers

import (
	"strings"
	"testing"
)

func TestParseHomeFeedMapBoundsAcceptsStandardBounds(t *testing.T) {
	bounds, err := parseHomeFeedMapBounds("38", "37", "-121", "-123")
	if err != nil {
		t.Fatalf("expected standard bounds, got %v", err)
	}
	if bounds.WrapsAntimeridian {
		t.Fatal("standard bounds should not wrap")
	}
}

func TestParseHomeFeedMapBoundsAcceptsAntimeridianBounds(t *testing.T) {
	bounds, err := parseHomeFeedMapBounds("20", "0", "-170", "170")
	if err != nil {
		t.Fatalf("expected wrapped bounds, got %v", err)
	}
	if !bounds.WrapsAntimeridian {
		t.Fatal("expected antimeridian wrapping")
	}
	condition := buildHomeFeedMapSpatialCondition("latitude", "longitude", bounds)
	if !strings.Contains(condition, "longitude >= {:west} OR longitude <= {:east}") {
		t.Fatalf("expected wrapped longitude condition, got %s", condition)
	}
}

func TestParseHomeFeedMapBoundsRejectsMalformedAndNonFiniteValues(t *testing.T) {
	for _, value := range []string{"", "nope", "NaN", "+Inf"} {
		if _, err := parseHomeFeedMapBounds(value, "0", "10", "-10"); err == nil {
			t.Fatalf("expected %q to be rejected", value)
		}
	}
}

func TestParseHomeFeedMapBoundsRejectsInvertedOrOutOfRangeBounds(t *testing.T) {
	invalid := [][4]string{
		{"0", "1", "10", "-10"},
		{"91", "0", "10", "-10"},
		{"10", "-91", "10", "-10"},
		{"10", "0", "181", "-10"},
		{"10", "0", "10", "-181"},
		{"10", "0", "10", "10"},
	}
	for _, input := range invalid {
		if _, err := parseHomeFeedMapBounds(input[0], input[1], input[2], input[3]); err == nil {
			t.Fatalf("expected bounds %#v to be rejected", input)
		}
	}
}

func TestParseHomeFeedMapBoundsRejectsExcessiveArea(t *testing.T) {
	if _, err := parseHomeFeedMapBounds("70", "-70", "150", "-150"); err == nil {
		t.Fatal("expected excessive bounds to be rejected")
	}
}
