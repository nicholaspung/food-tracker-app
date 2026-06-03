package handlers

import (
	"fmt"
	"strings"

	"github.com/pocketbase/pocketbase/core"
)

func saveRecordWithUniqueCodeRetries(
	app core.App,
	collection *core.Collection,
	maxAttempts int,
	generateCode func() (string, error),
	populateRecord func(record *core.Record, code string),
) (*core.Record, error) {
	for attempt := 1; attempt <= maxAttempts; attempt++ {
		code, err := generateCode()
		if err != nil {
			return nil, err
		}

		record := core.NewRecord(collection)
		populateRecord(record, code)
		if err := app.Save(record); err != nil {
			if isUniqueConstraintError(err) {
				continue
			}

			return nil, err
		}

		return record, nil
	}

	return nil, fmt.Errorf("failed to generate a unique code after %d attempts", maxAttempts)
}

func isUniqueConstraintError(err error) bool {
	if err == nil {
		return false
	}

	normalized := strings.ToLower(err.Error())
	return strings.Contains(normalized, "unique constraint") ||
		strings.Contains(normalized, "is not unique") ||
		strings.Contains(normalized, "must be unique") ||
		strings.Contains(normalized, "validation_not_unique")
}
