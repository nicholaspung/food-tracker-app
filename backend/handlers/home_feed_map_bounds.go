package handlers

import (
	"fmt"
	"math"
	"strconv"
)

const maxHomeFeedMapBoundsAreaSquareKm = 30_000_000.0
const earthRadiusKm = 6371.0

type homeFeedMapBounds struct {
	North             float64
	South             float64
	East              float64
	West              float64
	WrapsAntimeridian bool
}

func parseHomeFeedMapBounds(northRaw, southRaw, eastRaw, westRaw string) (homeFeedMapBounds, error) {
	parseCoordinate := func(name, raw string) (float64, error) {
		if raw == "" {
			return 0, fmt.Errorf("%s map bound is required", name)
		}
		value, err := strconv.ParseFloat(raw, 64)
		if err != nil || math.IsNaN(value) || math.IsInf(value, 0) {
			return 0, fmt.Errorf("%s map bound is invalid", name)
		}
		return value, nil
	}

	north, err := parseCoordinate("north", northRaw)
	if err != nil {
		return homeFeedMapBounds{}, err
	}
	south, err := parseCoordinate("south", southRaw)
	if err != nil {
		return homeFeedMapBounds{}, err
	}
	east, err := parseCoordinate("east", eastRaw)
	if err != nil {
		return homeFeedMapBounds{}, err
	}
	west, err := parseCoordinate("west", westRaw)
	if err != nil {
		return homeFeedMapBounds{}, err
	}
	if north < -90 || north > 90 || south < -90 || south > 90 || north <= south {
		return homeFeedMapBounds{}, fmt.Errorf("latitude map bounds are invalid")
	}
	if east < -180 || east > 180 || west < -180 || west > 180 || east == west {
		return homeFeedMapBounds{}, fmt.Errorf("longitude map bounds are invalid")
	}

	longitudeSpan := east - west
	wrapsAntimeridian := west > east
	if wrapsAntimeridian {
		longitudeSpan = 360 - west + east
	}
	if longitudeSpan <= 0 || longitudeSpan >= 360 {
		return homeFeedMapBounds{}, fmt.Errorf("longitude map bounds are invalid")
	}
	areaSquareKm := earthRadiusKm * earthRadiusKm *
		math.Abs(math.Sin(north*math.Pi/180)-math.Sin(south*math.Pi/180)) *
		(longitudeSpan * math.Pi / 180)
	if areaSquareKm > maxHomeFeedMapBoundsAreaSquareKm {
		return homeFeedMapBounds{}, fmt.Errorf("map bounds cover too large an area")
	}

	return homeFeedMapBounds{
		North:             north,
		South:             south,
		East:              east,
		West:              west,
		WrapsAntimeridian: wrapsAntimeridian,
	}, nil
}

func buildHomeFeedMapSpatialCondition(latitudeColumn, longitudeColumn string, bounds homeFeedMapBounds) string {
	longitudeCondition := fmt.Sprintf(
		"%s >= {:west} AND %s <= {:east}",
		longitudeColumn,
		longitudeColumn,
	)
	if bounds.WrapsAntimeridian {
		longitudeCondition = fmt.Sprintf(
			"(%s >= {:west} OR %s <= {:east})",
			longitudeColumn,
			longitudeColumn,
		)
	}
	return fmt.Sprintf(
		"%s >= {:south} AND %s <= {:north} AND %s",
		latitudeColumn,
		latitudeColumn,
		longitudeCondition,
	)
}
