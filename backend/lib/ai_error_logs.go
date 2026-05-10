package lib

import (
	"strings"

	"github.com/pocketbase/pocketbase/core"
)

const AIErrorLogsCollectionName = "ai_error_logs"

type AIErrorLogInput struct {
	RequestID      string
	UserID         string
	Route          string
	UseCase        string
	Provider       string
	Model          string
	Status         string
	HTTPStatusCode int
	ErrorType      string
	ErrorMessage   string
	DurationMs     int64
	PromptTokens   int
	OutputTokens   int
	TotalTokens    int
	ImageMimeType  string
	ImageSizeBytes int
	RestaurantID   string
	RestaurantName string
	Metadata       map[string]any
}

func CreateAIErrorLog(app core.App, input AIErrorLogInput) error {
	collection, err := app.FindCollectionByNameOrId(AIErrorLogsCollectionName)
	if err != nil {
		return err
	}

	record := core.NewRecord(collection)
	record.Set("requestId", strings.TrimSpace(input.RequestID))
	record.Set("route", strings.TrimSpace(input.Route))
	record.Set("useCase", strings.TrimSpace(input.UseCase))
	record.Set("provider", strings.TrimSpace(input.Provider))
	record.Set("model", strings.TrimSpace(input.Model))
	record.Set("status", strings.TrimSpace(input.Status))
	record.Set("errorType", strings.TrimSpace(input.ErrorType))
	record.Set("errorMessage", strings.TrimSpace(input.ErrorMessage))
	record.Set("imageMimeType", strings.TrimSpace(input.ImageMimeType))
	record.Set("restaurantId", strings.TrimSpace(input.RestaurantID))
	record.Set("restaurantName", strings.TrimSpace(input.RestaurantName))

	if userID := strings.TrimSpace(input.UserID); userID != "" {
		record.Set("user", userID)
	}
	if input.HTTPStatusCode > 0 {
		record.Set("httpStatusCode", input.HTTPStatusCode)
	}
	if input.DurationMs > 0 {
		record.Set("durationMs", input.DurationMs)
	}
	if input.PromptTokens > 0 {
		record.Set("promptTokens", input.PromptTokens)
	}
	if input.OutputTokens > 0 {
		record.Set("outputTokens", input.OutputTokens)
	}
	if input.TotalTokens > 0 {
		record.Set("totalTokens", input.TotalTokens)
	}
	if input.ImageSizeBytes > 0 {
		record.Set("imageSizeBytes", input.ImageSizeBytes)
	}
	if input.Metadata != nil {
		record.Set("metadataJson", input.Metadata)
	}

	return app.Save(record)
}
