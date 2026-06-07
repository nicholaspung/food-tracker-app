package handlers

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/types"

	"myapp/lib"
)

const (
	visitLocalDateFieldName = "visitLocalDate"
	visitLocalDateLayout    = "2006-01-02"
)

type visitCreateRequest struct {
	RestaurantID     string                  `json:"restaurantId"`
	RestaurantName   string                  `json:"restaurantName"`
	SourceListItemID string                  `json:"sourceListItemId"`
	Items            []visitItemWriteRequest `json:"items"`
	VisitedAt        string                  `json:"visitedAt"`
	VisitedOn        string                  `json:"visitedOn"`
	Visibility       string                  `json:"visibility"`
}

type visitUpdateRequest struct {
	RestaurantID   *string                  `json:"restaurantId"`
	RestaurantName *string                  `json:"restaurantName"`
	Items          *[]visitItemWriteRequest `json:"items"`
	VisitedAt      *string                  `json:"visitedAt"`
	VisitedOn      *string                  `json:"visitedOn"`
	Visibility     *string                  `json:"visibility"`
}

type visitItemWriteRequest struct {
	ID               string                            `json:"id"`
	MenuItemID       string                            `json:"menuItemId"`
	Name             string                            `json:"name"`
	Rating           float64                           `json:"rating"`
	Description      string                            `json:"description"`
	Notes            string                            `json:"notes"`
	SuggestionSource *visitItemSuggestionSourceRequest `json:"suggestionSource"`
}

type visitItemSuggestionSourceRequest struct {
	Type               string `json:"type"`
	SourceMenuItemID   string `json:"sourceMenuItemId"`
	SourceRestaurantID string `json:"sourceRestaurantId"`
	RestaurantGroupID  string `json:"restaurantGroupId"`
	NormalizedItemName string `json:"normalizedItemName"`
}

type moveVisitItemRequest struct {
	DestinationVisitID string `json:"destinationVisitId"`
}

type convertVisitItemToFoodProductResponse struct {
	FoodProductID      string `json:"foodProductId"`
	SourceVisitID      string `json:"sourceVisitId"`
	DeletedSourceVisit bool   `json:"deletedSourceVisit"`
}

type visitItemResponse struct {
	ID          string  `json:"id"`
	MenuItemID  string  `json:"menuItemId,omitempty"`
	Name        string  `json:"name"`
	Rating      float64 `json:"rating"`
	Description string  `json:"description,omitempty"`
	Notes       string  `json:"notes,omitempty"`
}

type moveVisitItemResponse struct {
	ItemID             string `json:"itemId"`
	DestinationVisitID string `json:"destinationVisitId"`
}

type visitResponse struct {
	ID                    string              `json:"id"`
	RestaurantID          string              `json:"restaurantId,omitempty"`
	RestaurantName        string              `json:"restaurantName"`
	RestaurantLocation    string              `json:"restaurantLocation,omitempty"`
	RestaurantCuisineType string              `json:"restaurantCuisineType,omitempty"`
	VisitedAt             string              `json:"visitedAt"`
	Items                 []visitItemResponse `json:"items"`
	Source                string              `json:"source"`
	UserID                string              `json:"userId,omitempty"`
	UserName              string              `json:"userName,omitempty"`
	Visibility            string              `json:"visibility,omitempty"`
	ModerationStatus      string              `json:"moderationStatus,omitempty"`
	CreatedAt             string              `json:"createdAt"`
	UpdatedAt             string              `json:"updatedAt"`
}

type buildVisitResponseOptions struct {
	ItemSort           string
	PrioritizedItemIDs []string
}

type visitCreateTransactionResult struct {
	PrioritizedItemIDs []string
	VisitRecord        *core.Record
}

type billCreateRequest struct {
	Title           string                        `json:"title"`
	Items           []billItemWriteRequest        `json:"items"`
	Participants    []billParticipantWriteRequest `json:"participants"`
	TotalAmount     *float64                      `json:"totalAmount"`
	Tax             float64                       `json:"tax"`
	Tip             float64                       `json:"tip"`
	Fees            float64                       `json:"fees"`
	ExtrasSplitMode string                        `json:"extrasSplitMode"`
}

type billUpdateRequest struct {
	Title           *string                        `json:"title"`
	Items           *[]billItemWriteRequest        `json:"items"`
	Participants    *[]billParticipantWriteRequest `json:"participants"`
	TotalAmount     *float64                       `json:"totalAmount"`
	Tax             *float64                       `json:"tax"`
	Tip             *float64                       `json:"tip"`
	Fees            *float64                       `json:"fees"`
	ExtrasSplitMode *string                        `json:"extrasSplitMode"`
	Status          *string                        `json:"status"`
}

type billParticipantPaidStatusUpdateRequest struct {
	PaidStatus string `json:"paidStatus"`
}

type billParticipantWriteRequest struct {
	ID                    string   `json:"id"`
	Name                  string   `json:"name"`
	UserID                string   `json:"userId"`
	AmountOwed            float64  `json:"amountOwed"`
	CustomTipContribution *float64 `json:"customTipContribution"`
	PaidStatus            string   `json:"paidStatus"`
}

type billItemWriteRequest struct {
	ID                       string                      `json:"id"`
	ItemName                 string                      `json:"itemName"`
	Price                    float64                     `json:"price"`
	AssignedToParticipantIDs []string                    `json:"assignedToParticipantIds"`
	SplitMode                string                      `json:"splitMode"`
	SplitConfig              []billItemSplitWriteRequest `json:"splitConfig"`
}

type billItemSplitWriteRequest struct {
	ParticipantID string  `json:"participantId"`
	Type          string  `json:"type"`
	Value         float64 `json:"value"`
}

type billParticipantResponse struct {
	ID                         string   `json:"id"`
	Name                       string   `json:"name"`
	UserID                     string   `json:"userId,omitempty"`
	FriendshipID               string   `json:"friendshipId,omitempty"`
	AmountOwed                 float64  `json:"amountOwed"`
	CustomTipContribution      *float64 `json:"customTipContribution,omitempty"`
	PaidStatus                 string   `json:"paidStatus"`
	PaymentReminderAvailable   bool     `json:"paymentReminderAvailable"`
	PaymentReminderAvailableAt *string  `json:"paymentReminderAvailableAt"`
}

type billItemSplitResponse struct {
	ParticipantID string  `json:"participantId"`
	Type          string  `json:"type"`
	Value         float64 `json:"value"`
}

type billItemResponse struct {
	ID                       string                  `json:"id"`
	ItemName                 string                  `json:"itemName"`
	Price                    float64                 `json:"price"`
	AssignedToParticipantIDs []string                `json:"assignedToParticipantIds"`
	SplitMode                string                  `json:"splitMode,omitempty"`
	SplitConfig              []billItemSplitResponse `json:"splitConfig,omitempty"`
}

type billResponse struct {
	ID              string                    `json:"id"`
	Title           string                    `json:"title"`
	RestaurantName  string                    `json:"restaurantName"`
	CreatedByUserID string                    `json:"createdByUserId"`
	TotalAmount     float64                   `json:"totalAmount"`
	Items           []billItemResponse        `json:"items"`
	Participants    []billParticipantResponse `json:"participants"`
	Tax             float64                   `json:"tax"`
	Tip             float64                   `json:"tip"`
	Fees            float64                   `json:"fees"`
	SplitMode       string                    `json:"splitMode,omitempty"`
	ExtrasSplitMode string                    `json:"extrasSplitMode"`
	Status          string                    `json:"status"`
	CreatedAt       string                    `json:"createdAt"`
	UpdatedAt       string                    `json:"updatedAt"`
}

// RegisterFeatureWriteHandlers registers authenticated transactional write endpoints for visit and bill flows.
func RegisterFeatureWriteHandlers(se *core.ServeEvent, app core.App) {
	registerRestaurantWriteHandlers(se, app)
	registerRestaurantListWriteHandlers(se, app)
	registerRestaurantListSharingWriteHandlers(se, app)

	se.Router.GET("/api/visits/{visitId}", func(e *core.RequestEvent) error {
		if e.Auth == nil {
			return apis.NewUnauthorizedError("authentication required", nil)
		}

		visitID := strings.TrimSpace(e.Request.PathValue("visitId"))
		if visitID == "" {
			return apis.NewBadRequestError("visitId is required", nil)
		}

		visitRecord, err := app.FindRecordById("visits", visitID)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return apis.NewNotFoundError("visit not found", nil)
			}
			return apis.NewApiError(500, "failed to load visit", err)
		}

		responsePayload, err := buildVisitResponse(app, visitRecord, e.Auth, buildVisitResponseOptions{
			ItemSort: "-created",
		})
		if err != nil {
			return err
		}

		return e.JSON(200, responsePayload)
	}).Bind(apis.RequireAuth())

	se.Router.POST("/api/visits", func(e *core.RequestEvent) error {
		if e.Auth == nil {
			return apis.NewUnauthorizedError("authentication required", nil)
		}

		requestBody := visitCreateRequest{}
		if err := e.BindBody(&requestBody); err != nil {
			return apis.NewBadRequestError("invalid request body", err)
		}

		var responsePayload visitResponse
		if err := app.RunInTransaction(func(txApp core.App) error {
			createResult, err := createVisitTransaction(txApp, e.Auth, requestBody)
			if err != nil {
				return err
			}

			responsePayload, err = buildVisitResponse(txApp, createResult.VisitRecord, e.Auth, buildVisitResponseOptions{
				PrioritizedItemIDs: createResult.PrioritizedItemIDs,
			})
			if err != nil {
				return apis.NewApiError(500, "failed to load created visit", err)
			}

			return nil
		}); err != nil {
			return err
		}

		return e.JSON(200, responsePayload)
	}).Bind(apis.RequireAuth())

	se.Router.PUT("/api/visits/{visitId}", func(e *core.RequestEvent) error {
		if e.Auth == nil {
			return apis.NewUnauthorizedError("authentication required", nil)
		}

		visitID := strings.TrimSpace(e.Request.PathValue("visitId"))
		if visitID == "" {
			return apis.NewBadRequestError("visitId is required", nil)
		}

		requestBody := visitUpdateRequest{}
		if err := e.BindBody(&requestBody); err != nil {
			return apis.NewBadRequestError("invalid request body", err)
		}

		var responsePayload visitResponse
		if err := app.RunInTransaction(func(txApp core.App) error {
			visitRecord, err := updateVisitTransaction(txApp, e.Auth, visitID, requestBody)
			if err != nil {
				return err
			}

			responsePayload, err = buildVisitResponse(txApp, visitRecord, e.Auth, buildVisitResponseOptions{})
			if err != nil {
				return apis.NewApiError(500, "failed to load updated visit", err)
			}

			return nil
		}); err != nil {
			return err
		}

		return e.JSON(200, responsePayload)
	}).Bind(apis.RequireAuth())

	se.Router.POST("/api/visit-items/{itemId}/move", func(e *core.RequestEvent) error {
		if e.Auth == nil {
			return apis.NewUnauthorizedError("authentication required", nil)
		}

		itemID := strings.TrimSpace(e.Request.PathValue("itemId"))
		if itemID == "" {
			return apis.NewBadRequestError("itemId is required", nil)
		}

		requestBody := moveVisitItemRequest{}
		if err := e.BindBody(&requestBody); err != nil {
			return apis.NewBadRequestError("invalid request body", err)
		}

		var responsePayload moveVisitItemResponse
		if err := app.RunInTransaction(func(txApp core.App) error {
			moveResult, err := moveVisitItemTransaction(txApp, e.Auth, itemID, requestBody)
			if err != nil {
				return err
			}

			responsePayload = moveResult
			return nil
		}); err != nil {
			return err
		}

		return e.JSON(200, responsePayload)
	}).Bind(apis.RequireAuth())

	se.Router.POST("/api/visit-items/{itemId}/convert-to-food-product", func(e *core.RequestEvent) error {
		if e.Auth == nil {
			return apis.NewUnauthorizedError("authentication required", nil)
		}

		itemID := strings.TrimSpace(e.Request.PathValue("itemId"))
		if itemID == "" {
			return apis.NewBadRequestError("itemId is required", nil)
		}

		var responsePayload convertVisitItemToFoodProductResponse
		if err := app.RunInTransaction(func(txApp core.App) error {
			convertResult, err := convertVisitItemToFoodProductTransaction(txApp, e.Auth, itemID)
			if err != nil {
				return err
			}

			responsePayload = convertResult
			return nil
		}); err != nil {
			return err
		}

		return e.JSON(200, responsePayload)
	}).Bind(apis.RequireAuth())

	se.Router.POST("/api/bills", func(e *core.RequestEvent) error {
		if e.Auth == nil {
			return apis.NewUnauthorizedError("authentication required", nil)
		}

		requestBody := billCreateRequest{}
		if err := e.BindBody(&requestBody); err != nil {
			return apis.NewBadRequestError("invalid request body", err)
		}

		var responsePayload billResponse
		var createdBillID string
		var createdBillTitle string
		if err := app.RunInTransaction(func(txApp core.App) error {
			billRecord, err := createBillTransaction(txApp, e.Auth, requestBody)
			if err != nil {
				return err
			}
			createdBillID = billRecord.Id
			createdBillTitle = billRecord.GetString("bill_name")

			responsePayload, err = buildBillResponse(txApp, billRecord, e.Auth.Id)
			if err != nil {
				return apis.NewApiError(500, "failed to load created bill", err)
			}

			return nil
		}); err != nil {
			return err
		}

		if err := deliverBillOwedNotifications(app, billOwedNotificationSignalInput{
			BillID:           createdBillID,
			BillTitle:        createdBillTitle,
			ActorUserID:      e.Auth.Id,
			NextParticipants: billResponseParticipantsToNotificationSignals(responsePayload.Participants),
		}); err != nil {
			return apis.NewApiError(500, "failed to deliver bill notifications", err)
		}

		return e.JSON(200, responsePayload)
	}).Bind(apis.RequireAuth())

	se.Router.PUT("/api/bills/{billId}", func(e *core.RequestEvent) error {
		if e.Auth == nil {
			return apis.NewUnauthorizedError("authentication required", nil)
		}

		billID := strings.TrimSpace(e.Request.PathValue("billId"))
		if billID == "" {
			return apis.NewBadRequestError("billId is required", nil)
		}

		requestBody := billUpdateRequest{}
		if err := e.BindBody(&requestBody); err != nil {
			return apis.NewBadRequestError("invalid request body", err)
		}

		var responsePayload billResponse
		var previousParticipantSignals []billNotificationParticipantSignal
		var updatedBillTitle string
		if err := app.RunInTransaction(func(txApp core.App) error {
			existingParticipants, err := listBillParticipants(txApp, billID)
			if err != nil {
				return apis.NewApiError(500, "failed to load bill participants", err)
			}
			previousParticipantSignals = billParticipantRecordsToNotificationSignals(existingParticipants)

			billRecord, err := updateBillTransaction(txApp, e.Auth, billID, requestBody)
			if err != nil {
				return err
			}
			updatedBillTitle = billRecord.GetString("bill_name")

			responsePayload, err = buildBillResponse(txApp, billRecord, e.Auth.Id)
			if err != nil {
				return apis.NewApiError(500, "failed to load updated bill", err)
			}

			return nil
		}); err != nil {
			return err
		}

		if err := deliverBillOwedNotifications(app, billOwedNotificationSignalInput{
			BillID:               billID,
			BillTitle:            updatedBillTitle,
			ActorUserID:          e.Auth.Id,
			PreviousParticipants: previousParticipantSignals,
			NextParticipants:     billResponseParticipantsToNotificationSignals(responsePayload.Participants),
		}); err != nil {
			return apis.NewApiError(500, "failed to deliver bill notifications", err)
		}

		return e.JSON(200, responsePayload)
	}).Bind(apis.RequireAuth())

	se.Router.DELETE("/api/bills/{billId}", func(e *core.RequestEvent) error {
		if e.Auth == nil {
			return apis.NewUnauthorizedError("authentication required", nil)
		}

		billID := strings.TrimSpace(e.Request.PathValue("billId"))
		if billID == "" {
			return apis.NewBadRequestError("billId is required", nil)
		}

		if err := app.RunInTransaction(func(txApp core.App) error {
			return deleteBillTransaction(txApp, e.Auth, billID)
		}); err != nil {
			return err
		}

		return e.JSON(200, map[string]any{"success": true})
	}).Bind(apis.RequireAuth())

	se.Router.PATCH("/api/bills/{billId}/participants/{participantId}/paid-status", func(e *core.RequestEvent) error {
		if e.Auth == nil {
			return apis.NewUnauthorizedError("authentication required", nil)
		}

		billID := strings.TrimSpace(e.Request.PathValue("billId"))
		if billID == "" {
			return apis.NewBadRequestError("billId is required", nil)
		}

		participantID := strings.TrimSpace(e.Request.PathValue("participantId"))
		if participantID == "" {
			return apis.NewBadRequestError("participantId is required", nil)
		}

		requestBody := billParticipantPaidStatusUpdateRequest{}
		if err := e.BindBody(&requestBody); err != nil {
			return apis.NewBadRequestError("invalid request body", err)
		}

		var responsePayload billResponse
		if err := app.RunInTransaction(func(txApp core.App) error {
			billRecord, err := updateBillParticipantPaidStatusTransaction(
				txApp,
				e.Auth,
				billID,
				participantID,
				requestBody,
			)
			if err != nil {
				return err
			}

			responsePayload, err = buildBillResponse(txApp, billRecord, e.Auth.Id)
			if err != nil {
				return apis.NewApiError(500, "failed to load updated bill", err)
			}

			return nil
		}); err != nil {
			return err
		}

		return e.JSON(200, responsePayload)
	}).Bind(apis.RequireAuth())

	se.Router.POST("/api/bills/{billId}/participants/{participantId}/payment-reminder", func(e *core.RequestEvent) error {
		if e.Auth == nil {
			return apis.NewUnauthorizedError("authentication required", nil)
		}

		billID := strings.TrimSpace(e.Request.PathValue("billId"))
		if billID == "" {
			return apis.NewBadRequestError("billId is required", nil)
		}

		participantID := strings.TrimSpace(e.Request.PathValue("participantId"))
		if participantID == "" {
			return apis.NewBadRequestError("participantId is required", nil)
		}

		billRecord, err := app.FindRecordById("bills", billID)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return apis.NewNotFoundError("bill not found", err)
			}
			return apis.NewApiError(500, "failed to load bill", err)
		}
		if strings.TrimSpace(billRecord.GetString("creator_user")) != e.Auth.Id {
			return apis.NewForbiddenError("only the bill creator can send payment reminders", nil)
		}

		participantRecord, err := app.FindRecordById("bill_participants", participantID)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return apis.NewNotFoundError("bill participant not found", err)
			}
			return apis.NewApiError(500, "failed to load bill participant", err)
		}
		if strings.TrimSpace(participantRecord.GetString("bill")) != billID {
			return apis.NewNotFoundError("bill participant not found", nil)
		}

		recipientID := strings.TrimSpace(participantRecord.GetString("user"))
		if recipientID == "" || recipientID == e.Auth.Id {
			return apis.NewBadRequestError("participant is not eligible for payment reminders", nil)
		}
		if normalizePaidStatus(participantRecord.GetString("paid_status")) != "pending" || sanitizeCurrency(participantRecord.GetFloat("amount_owed")) <= 0 {
			return apis.NewBadRequestError("participant is not eligible for payment reminders", nil)
		}

		result, err := deliverBillPaymentReminder(app, billPaymentReminderInput{
			BillID:        billRecord.Id,
			BillTitle:     billRecord.GetString("bill_name"),
			ParticipantID: participantRecord.Id,
			ActorUserID:   e.Auth.Id,
			RecipientID:   recipientID,
		})
		if err != nil {
			return apis.NewApiError(500, "failed to deliver payment reminder", err)
		}

		if result.Status == "skipped_rate_limited" {
			return apis.NewBadRequestError("payment reminder already sent this week", nil)
		}

		return e.JSON(200, map[string]any{"status": result.Status})
	}).Bind(apis.RequireAuth())
}

func createVisitTransaction(
	app core.App,
	authRecord *core.Record,
	requestBody visitCreateRequest,
) (visitCreateTransactionResult, error) {
	result := visitCreateTransactionResult{}

	if strings.TrimSpace(requestBody.RestaurantID) == "" && strings.TrimSpace(requestBody.RestaurantName) == "" {
		return result, apis.NewBadRequestError("restaurant name is required", nil)
	}

	if len(requestBody.Items) == 0 {
		return result, apis.NewBadRequestError("at least one item is required", nil)
	}

	restaurantRecord, err := resolveVisitCreateRestaurant(app, authRecord, requestBody)
	if err != nil {
		return result, wrapRestaurantResolveError(err)
	}

	normalizedVisitedAt := normalizeVisitDate(requestBody.VisitedAt)
	visitLocalDate, err := resolveVisitLocalDate(requestBody.VisitedOn, normalizedVisitedAt)
	if err != nil {
		return result, err
	}
	normalizedVisibility := normalizeVisitVisibility(requestBody.Visibility)

	visitRecord, err := findMergeableVisitRecord(
		app,
		authRecord.Id,
		restaurantRecord.Id,
		normalizedVisibility,
		visitLocalDate,
	)
	if err != nil {
		return result, apis.NewApiError(500, "failed to load existing visit", err)
	}

	if visitRecord == nil {
		visitsCollection, collectionErr := app.FindCollectionByNameOrId("visits")
		if collectionErr != nil {
			return result, apis.NewApiError(500, "internal error", collectionErr)
		}

		visitRecord = core.NewRecord(visitsCollection)
		visitRecord.Set("restaurant", restaurantRecord.Id)
		visitRecord.Set("user", authRecord.Id)
		visitRecord.Set("visitDate", normalizedVisitedAt)
		visitRecord.Set(visitLocalDateFieldName, visitLocalDate)
		visitRecord.Set("visibility", normalizedVisibility)

		if err := app.Save(visitRecord); err != nil {
			return result, apis.NewApiError(500, "failed to create visit", err)
		}
	}

	createdItemIDs, err := appendVisitItems(app, authRecord, restaurantRecord.Id, visitRecord.Id, requestBody.Items)
	if err != nil {
		return result, err
	}

	recordSuggestionProvenanceForVisitItems(
		app,
		authRecord.Id,
		restaurantRecord,
		visitRecord.Id,
		requestBody.Items,
		createdItemIDs,
	)

	if err := syncRestaurantListBookmarksAfterVisitCreate(
		app,
		authRecord,
		restaurantRecord.Id,
		strings.TrimSpace(requestBody.SourceListItemID),
		requestBody.Items,
		createdItemIDs,
	); err != nil {
		return result, err
	}

	result.VisitRecord = visitRecord
	result.PrioritizedItemIDs = createdItemIDs
	return result, nil
}

func resolveVisitCreateRestaurant(
	app core.App,
	authRecord *core.Record,
	requestBody visitCreateRequest,
) (*core.Record, error) {
	sourceListItemID := strings.TrimSpace(requestBody.SourceListItemID)
	if sourceListItemID == "" {
		return resolveRestaurantForWrite(app, authRecord, restaurantResolveInput{
			RestaurantID:   requestBody.RestaurantID,
			RestaurantName: requestBody.RestaurantName,
		})
	}

	listItemRecord, err := app.FindRecordById("list_items", sourceListItemID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, apis.NewNotFoundError("list item not found", err)
		}
		return nil, apis.NewApiError(500, "failed to load restaurant list item", err)
	}

	listID := strings.TrimSpace(listItemRecord.GetString("list"))
	listRecord, err := app.FindRecordById("restaurant_lists", listID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, apis.NewNotFoundError("restaurant list not found", err)
		}
		return nil, apis.NewApiError(500, "failed to load restaurant list", err)
	}

	isListOwner := strings.TrimSpace(listRecord.GetString("user")) == authRecord.Id
	isItemAdder := strings.TrimSpace(listItemRecord.GetString("addedBy")) == authRecord.Id
	if !isListOwner && !isItemAdder {
		return nil, apis.NewForbiddenError("you can only create visits from bookmarks in your own lists", nil)
	}

	restaurantID := strings.TrimSpace(listItemRecord.GetString("restaurant"))
	if restaurantID == "" {
		return nil, apis.NewNotFoundError("restaurant not found", nil)
	}

	requestRestaurantID := strings.TrimSpace(requestBody.RestaurantID)
	if requestRestaurantID != "" && requestRestaurantID != restaurantID {
		return nil, apis.NewBadRequestError("restaurant does not match source list item", nil)
	}

	sourceFoodItemID := strings.TrimSpace(listItemRecord.GetString("foodItem"))
	if sourceFoodItemID != "" {
		sourceFoodItemRecord, sourceVisitRecord, err := findFoodItemWithVisit(app, sourceFoodItemID)
		if err != nil {
			return nil, err
		}
		if err := ensureFoodItemVisibleToUser(app, authRecord, sourceFoodItemRecord, sourceVisitRecord); err != nil {
			return nil, err
		}
		if err := ensureFoodItemMatchesRestaurant(sourceFoodItemRecord, sourceVisitRecord, restaurantID, true); err != nil {
			return nil, err
		}
	}

	sourceMenuItemID := strings.TrimSpace(listItemRecord.GetString("menuItem"))
	if sourceMenuItemID != "" {
		if _, err := findVisibleMenuItemForRestaurant(app, authRecord, sourceMenuItemID, restaurantID); err != nil {
			return nil, err
		}
	}

	restaurantRecord, err := app.FindRecordById("restaurants", restaurantID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, apis.NewNotFoundError("restaurant not found", err)
		}
		return nil, apis.NewApiError(500, "failed to load restaurant", err)
	}

	return restaurantRecord, nil
}

func syncRestaurantListBookmarksAfterVisitCreate(
	app core.App,
	authRecord *core.Record,
	restaurantID string,
	sourceListItemID string,
	requestItems []visitItemWriteRequest,
	createdItemIDs []string,
) error {
	if sourceListItemID != "" {
		if err := linkSourceListItemAfterVisitCreate(app, authRecord, sourceListItemID, createdItemIDs); err != nil {
			return err
		}
	}

	return removeMatchingWantToTryBookmarksAfterVisitCreate(
		app,
		authRecord,
		restaurantID,
		sourceListItemID,
		requestItems,
	)
}

func linkSourceListItemAfterVisitCreate(
	app core.App,
	authRecord *core.Record,
	sourceListItemID string,
	createdItemIDs []string,
) error {
	if sourceListItemID == "" || len(createdItemIDs) == 0 {
		return nil
	}

	listItemRecord, err := app.FindRecordById("list_items", sourceListItemID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil
		}
		return apis.NewApiError(500, "failed to load source restaurant list item", err)
	}

	listID := strings.TrimSpace(listItemRecord.GetString("list"))
	listRecord, err := app.FindRecordById("restaurant_lists", listID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil
		}
		return apis.NewApiError(500, "failed to load source restaurant list", err)
	}

	if listRecord.GetBool("isDefault") {
		return nil
	}

	_, _, err = linkRestaurantListVisitTransaction(app, authRecord, sourceListItemID, restaurantListLinkVisitRequest{
		UserFoodItemID: createdItemIDs[0],
	})
	return err
}

func removeMatchingWantToTryBookmarksAfterVisitCreate(
	app core.App,
	authRecord *core.Record,
	restaurantID string,
	sourceListItemID string,
	requestItems []visitItemWriteRequest,
) error {
	defaultListRecord, err := findDefaultRestaurantListRecordForUser(app, authRecord.Id)
	if err != nil {
		return apis.NewApiError(500, "failed to load default Want to Try list", err)
	}
	if defaultListRecord == nil {
		return nil
	}

	targets := map[string]*core.Record{}
	if sourceListItemID != "" {
		sourceListItemRecord, err := app.FindRecordById("list_items", sourceListItemID)
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return apis.NewApiError(500, "failed to load source Want to Try item", err)
		}
		if sourceListItemRecord != nil &&
			strings.TrimSpace(sourceListItemRecord.GetString("list")) == defaultListRecord.Id &&
			strings.TrimSpace(sourceListItemRecord.GetString("restaurant")) == restaurantID {
			targets[sourceListItemRecord.Id] = sourceListItemRecord
		}
	}

	groupItems, err := listRestaurantListGroupRecords(app, defaultListRecord.Id, restaurantID, "position,created")
	if err != nil {
		return apis.NewApiError(500, "failed to load Want to Try bookmarks", err)
	}

	menuItemIDs := map[string]struct{}{}
	normalizedItemNames := map[string]struct{}{}
	for _, item := range requestItems {
		if menuItemID := strings.TrimSpace(item.MenuItemID); menuItemID != "" {
			menuItemIDs[menuItemID] = struct{}{}
		}
		if normalizedName := normalizeMenuItemName(item.Name); normalizedName != "" {
			normalizedItemNames[normalizedName] = struct{}{}
		}
	}

	foodItemRecordsByID, menuItemRecordsByID, err := loadListItemBookmarkRecords(app, groupItems)
	if err != nil {
		return err
	}

	for _, listItemRecord := range groupItems {
		if _, exists := targets[listItemRecord.Id]; exists {
			continue
		}

		if isRestaurantOnlyListItem(listItemRecord) {
			targets[listItemRecord.Id] = listItemRecord
			continue
		}

		menuItemID := strings.TrimSpace(listItemRecord.GetString("menuItem"))
		if menuItemID != "" {
			if _, exists := menuItemIDs[menuItemID]; exists {
				targets[listItemRecord.Id] = listItemRecord
				continue
			}
			if menuItemRecord := menuItemRecordsByID[menuItemID]; menuItemRecord != nil {
				if _, exists := normalizedItemNames[normalizeMenuItemName(menuItemRecord.GetString("name"))]; exists {
					targets[listItemRecord.Id] = listItemRecord
					continue
				}
			}
		}

		foodItemID := strings.TrimSpace(listItemRecord.GetString("foodItem"))
		if foodItemRecord := foodItemRecordsByID[foodItemID]; foodItemRecord != nil {
			if _, exists := normalizedItemNames[normalizeMenuItemName(foodItemRecord.GetString("name"))]; exists {
				targets[listItemRecord.Id] = listItemRecord
			}
		}
	}

	for _, target := range targets {
		if err := app.Delete(target); err != nil {
			return apis.NewApiError(500, "failed to remove Want to Try bookmark", err)
		}
	}

	return nil
}

func loadListItemBookmarkRecords(
	app core.App,
	listItemRecords []*core.Record,
) (map[string]*core.Record, map[string]*core.Record, error) {
	foodItemIDs := make([]string, 0, len(listItemRecords))
	menuItemIDs := make([]string, 0, len(listItemRecords))
	foodItemIDSet := map[string]struct{}{}
	menuItemIDSet := map[string]struct{}{}

	for _, listItemRecord := range listItemRecords {
		foodItemIDs = appendUniqueTrimmedID(foodItemIDs, foodItemIDSet, listItemRecord.GetString("foodItem"))
		menuItemIDs = appendUniqueTrimmedID(menuItemIDs, menuItemIDSet, listItemRecord.GetString("menuItem"))
	}

	foodItemRecords, err := findRecordsByIDs(app, "food_items", foodItemIDs)
	if err != nil {
		return nil, nil, apis.NewApiError(500, "failed to load Want to Try food items", err)
	}
	menuItemRecords, err := findRecordsByIDs(app, "menu_items", menuItemIDs)
	if err != nil {
		return nil, nil, apis.NewApiError(500, "failed to load Want to Try menu items", err)
	}

	return mapRecordsByID(foodItemRecords), mapRecordsByID(menuItemRecords), nil
}

func updateVisitTransaction(
	app core.App,
	authRecord *core.Record,
	visitID string,
	requestBody visitUpdateRequest,
) (*core.Record, error) {
	visitRecord, err := app.FindRecordById("visits", visitID)
	if err != nil {
		return nil, apis.NewNotFoundError("visit not found", err)
	}

	if visitRecord.GetString("user") != authRecord.Id {
		return nil, apis.NewForbiddenError("you can only edit your own visits", nil)
	}

	if requestBody.RestaurantID != nil || requestBody.RestaurantName != nil {
		nextRestaurantID := ""
		if requestBody.RestaurantID != nil {
			nextRestaurantID = strings.TrimSpace(*requestBody.RestaurantID)
		}

		nextRestaurantName := ""
		if requestBody.RestaurantName != nil {
			nextRestaurantName = strings.TrimSpace(*requestBody.RestaurantName)
		}

		if nextRestaurantID != "" || nextRestaurantName != "" {
			restaurantRecord, resolveErr := resolveRestaurantForWrite(app, authRecord, restaurantResolveInput{
				RestaurantID:   nextRestaurantID,
				RestaurantName: nextRestaurantName,
			})
			if resolveErr != nil {
				return nil, wrapRestaurantResolveError(resolveErr)
			}
			visitRecord.Set("restaurant", restaurantRecord.Id)
		}
	}

	if requestBody.VisitedAt != nil {
		visitRecord.Set("visitDate", normalizeVisitDate(strings.TrimSpace(*requestBody.VisitedAt)))
	}

	if requestBody.VisitedAt != nil || requestBody.VisitedOn != nil {
		nextVisitedAt := firstNonEmpty(
			visitRecord.GetString("visitDate"),
			visitRecord.GetString("created"),
		)
		nextVisitedOn := ""
		if requestBody.VisitedOn != nil {
			nextVisitedOn = strings.TrimSpace(*requestBody.VisitedOn)
		}

		visitLocalDate, resolveErr := resolveVisitLocalDate(nextVisitedOn, nextVisitedAt)
		if resolveErr != nil {
			return nil, resolveErr
		}
		visitRecord.Set(visitLocalDateFieldName, visitLocalDate)
	}

	if requestBody.Visibility != nil {
		visitRecord.Set("visibility", normalizeVisitVisibility(strings.TrimSpace(*requestBody.Visibility)))
	}

	if err := app.Save(visitRecord); err != nil {
		return nil, apis.NewApiError(500, "failed to update visit", err)
	}

	if requestBody.Items != nil {
		existingItems, listErr := listFoodItemsForVisit(app, visitID)
		if listErr != nil {
			return nil, apis.NewApiError(500, "failed to load visit items", listErr)
		}
		if err := syncVisitItems(app, authRecord, visitRecord.GetString("restaurant"), visitID, existingItems, *requestBody.Items); err != nil {
			return nil, err
		}
	}

	return visitRecord, nil
}

func appendVisitItems(
	app core.App,
	authRecord *core.Record,
	restaurantID string,
	visitID string,
	requestItems []visitItemWriteRequest,
) ([]string, error) {
	foodItemsCollection, err := app.FindCollectionByNameOrId("food_items")
	if err != nil {
		return nil, apis.NewApiError(500, "internal error", err)
	}

	createdItemIDs := make([]string, 0, len(requestItems))
	for _, item := range requestItems {
		trimmedName := strings.TrimSpace(item.Name)
		if trimmedName == "" {
			return nil, apis.NewBadRequestError("item name is required", nil)
		}

		description := strings.TrimSpace(item.Description)
		notes := strings.TrimSpace(item.Notes)
		menuItemID, err := resolveVisitItemMenuItemID(app, authRecord, restaurantID, item.MenuItemID)
		if err != nil {
			return nil, err
		}

		createdItem := core.NewRecord(foodItemsCollection)
		createdItem.Set("name", trimmedName)
		createdItem.Set("rating", item.Rating)
		createdItem.Set("description", emptyStringToNil(description))
		createdItem.Set("notes", emptyStringToNil(notes))
		createdItem.Set("visit", visitID)
		createdItem.Set("user", authRecord.Id)
		createdItem.Set("menuItem", emptyStringToNil(menuItemID))
		createdItem.Set("itemType", foodItemTypeVisitItem)
		if err := app.Save(createdItem); err != nil {
			return nil, apis.NewApiError(500, "failed to create visit item", err)
		}

		createdItemIDs = append(createdItemIDs, createdItem.Id)
	}

	return createdItemIDs, nil
}

type qualifiedSuggestionProvenanceSource struct {
	NormalizedItemName string
	RestaurantGroupID  string
	SourceMenuItemID   string
	SourceRestaurantID string
}

func recordSuggestionProvenanceForVisitItems(
	app core.App,
	userID string,
	targetRestaurantRecord *core.Record,
	visitID string,
	requestItems []visitItemWriteRequest,
	createdItemIDs []string,
) {
	if targetRestaurantRecord == nil || len(requestItems) == 0 || len(createdItemIDs) == 0 {
		return
	}

	collection, err := app.FindCollectionByNameOrId("suggestion_provenance")
	if err != nil {
		return
	}

	for index, item := range requestItems {
		if index >= len(createdItemIDs) {
			return
		}

		source := resolveQualifiedSuggestionProvenanceSource(app, targetRestaurantRecord, item)
		if source == nil {
			continue
		}

		record := core.NewRecord(collection)
		record.Set("sourceType", "group_menu_suggestion")
		record.Set("normalizedItemName", source.NormalizedItemName)
		record.Set("user", userID)
		record.Set("visit", visitID)
		record.Set("visitItem", createdItemIDs[index])
		record.Set("targetRestaurant", targetRestaurantRecord.Id)
		record.Set("sourceRestaurant", source.SourceRestaurantID)
		record.Set("sourceMenuItem", source.SourceMenuItemID)
		record.Set("restaurantGroup", source.RestaurantGroupID)
		_ = app.Save(record)
	}
}

func resolveQualifiedSuggestionProvenanceSource(
	app core.App,
	targetRestaurantRecord *core.Record,
	item visitItemWriteRequest,
) *qualifiedSuggestionProvenanceSource {
	if item.SuggestionSource == nil {
		return nil
	}

	sourceType := strings.TrimSpace(item.SuggestionSource.Type)
	if sourceType != "groupMenuSuggestion" && sourceType != "group_menu_suggestion" {
		return nil
	}

	sourceMenuItemID := strings.TrimSpace(item.SuggestionSource.SourceMenuItemID)
	if sourceMenuItemID == "" {
		return nil
	}

	normalizedItemName := normalizeMenuItemName(firstNonEmpty(
		item.SuggestionSource.NormalizedItemName,
		item.Name,
	))
	if normalizedItemName == "" {
		return nil
	}

	targetRestaurantID := strings.TrimSpace(targetRestaurantRecord.Id)
	targetRestaurantGroupID := strings.TrimSpace(targetRestaurantRecord.GetString("restaurantGroup"))
	if targetRestaurantID == "" || targetRestaurantGroupID == "" {
		return nil
	}

	sourceMenuItemRecord, err := app.FindRecordById("menu_items", sourceMenuItemID)
	if err != nil {
		return nil
	}
	sourceRestaurantID := strings.TrimSpace(sourceMenuItemRecord.GetString("restaurant"))
	if sourceRestaurantID == "" || sourceRestaurantID == targetRestaurantID {
		return nil
	}
	if strings.TrimSpace(item.SuggestionSource.SourceRestaurantID) != "" &&
		strings.TrimSpace(item.SuggestionSource.SourceRestaurantID) != sourceRestaurantID {
		return nil
	}
	if strings.TrimSpace(item.SuggestionSource.RestaurantGroupID) != "" &&
		strings.TrimSpace(item.SuggestionSource.RestaurantGroupID) != targetRestaurantGroupID {
		return nil
	}
	if normalizeMenuItemName(sourceMenuItemRecord.GetString("name")) != normalizedItemName {
		return nil
	}
	if sourceMenuItemRecord.GetString("approvalStatus") != "approved" ||
		sourceMenuItemRecord.GetString("visibility") != "public" ||
		!sourceMenuItemRecord.GetBool("groupSuitable") {
		return nil
	}

	sourceRestaurantRecord, err := app.FindRecordById("restaurants", sourceRestaurantID)
	if err != nil {
		return nil
	}
	if strings.TrimSpace(sourceRestaurantRecord.GetString("restaurantGroup")) != targetRestaurantGroupID {
		return nil
	}

	exactMatchCount := struct {
		Count int `db:"count"`
	}{}
	if err := app.DB().NewQuery(`
		SELECT COUNT(*) AS [[count]]
		FROM menu_items
		WHERE restaurant = {:restaurantId}
			AND LOWER(TRIM(COALESCE(name, ''))) = {:normalizedItemName}
			AND TRIM(COALESCE(name, '')) != ''
	`).Bind(dbx.Params{
		"normalizedItemName": normalizedItemName,
		"restaurantId":       targetRestaurantID,
	}).One(&exactMatchCount); err != nil || exactMatchCount.Count > 0 {
		return nil
	}

	return &qualifiedSuggestionProvenanceSource{
		NormalizedItemName: normalizedItemName,
		RestaurantGroupID:  targetRestaurantGroupID,
		SourceMenuItemID:   sourceMenuItemRecord.Id,
		SourceRestaurantID: sourceRestaurantID,
	}
}

func syncVisitItems(
	app core.App,
	authRecord *core.Record,
	restaurantID string,
	visitID string,
	existingItems []*core.Record,
	requestItems []visitItemWriteRequest,
) error {
	foodItemsCollection, err := app.FindCollectionByNameOrId("food_items")
	if err != nil {
		return apis.NewApiError(500, "internal error", err)
	}

	existingItemsByID := make(map[string]*core.Record, len(existingItems))
	for _, existingItem := range existingItems {
		existingItemsByID[existingItem.Id] = existingItem
	}

	retainedItemIDs := make(map[string]struct{}, len(requestItems))
	for _, item := range requestItems {
		trimmedName := strings.TrimSpace(item.Name)
		if trimmedName == "" {
			return apis.NewBadRequestError("item name is required", nil)
		}

		description := strings.TrimSpace(item.Description)
		notes := strings.TrimSpace(item.Notes)
		menuItemID, err := resolveVisitItemMenuItemID(app, authRecord, restaurantID, item.MenuItemID)
		if err != nil {
			return err
		}

		if existingItem, ok := existingItemsByID[item.ID]; ok {
			existingItem.Set("name", trimmedName)
			existingItem.Set("rating", item.Rating)
			existingItem.Set("description", description)
			existingItem.Set("notes", notes)
			existingItem.Set("menuItem", emptyStringToNil(menuItemID))
			if err := app.Save(existingItem); err != nil {
				return apis.NewApiError(500, "failed to update visit item", err)
			}
			retainedItemIDs[existingItem.Id] = struct{}{}
			continue
		}

		createdItem := core.NewRecord(foodItemsCollection)
		createdItem.Set("name", trimmedName)
		createdItem.Set("rating", item.Rating)
		createdItem.Set("description", emptyStringToNil(description))
		createdItem.Set("notes", emptyStringToNil(notes))
		createdItem.Set("visit", visitID)
		createdItem.Set("user", authRecord.Id)
		createdItem.Set("menuItem", emptyStringToNil(menuItemID))
		createdItem.Set("itemType", foodItemTypeVisitItem)
		if err := app.Save(createdItem); err != nil {
			return apis.NewApiError(500, "failed to create visit item", err)
		}
		retainedItemIDs[createdItem.Id] = struct{}{}
	}

	for _, existingItem := range existingItems {
		if _, keep := retainedItemIDs[existingItem.Id]; keep {
			continue
		}
		if err := app.Delete(existingItem); err != nil {
			return apis.NewApiError(500, "failed to delete removed visit item", err)
		}
	}

	return nil
}

func resolveVisitItemMenuItemID(
	app core.App,
	authRecord *core.Record,
	restaurantID string,
	menuItemID string,
) (string, error) {
	trimmedMenuItemID := strings.TrimSpace(menuItemID)
	if trimmedMenuItemID == "" {
		return "", nil
	}

	record, err := findVisibleMenuItemForRestaurant(app, authRecord, trimmedMenuItemID, strings.TrimSpace(restaurantID))
	if err != nil {
		return "", err
	}

	return record.Id, nil
}

func moveVisitItemTransaction(
	app core.App,
	authRecord *core.Record,
	itemID string,
	requestBody moveVisitItemRequest,
) (moveVisitItemResponse, error) {
	response := moveVisitItemResponse{}
	destinationVisitID := strings.TrimSpace(requestBody.DestinationVisitID)
	if destinationVisitID == "" {
		return response, apis.NewBadRequestError("destinationVisitId is required", nil)
	}

	itemRecord, err := app.FindRecordById("food_items", itemID)
	if err != nil {
		return response, apis.NewNotFoundError("visit item not found", err)
	}

	if itemRecord.GetString("user") != authRecord.Id {
		return response, apis.NewForbiddenError("you can only move your own visit items", nil)
	}

	currentVisitID := strings.TrimSpace(itemRecord.GetString("visit"))
	if !isVisitItemRecord(itemRecord) || currentVisitID == "" {
		return response, apis.NewBadRequestError("only visit items can be moved", nil)
	}

	destinationVisitRecord, err := app.FindRecordById("visits", destinationVisitID)
	if err != nil {
		return response, apis.NewNotFoundError("destination visit not found", err)
	}

	if destinationVisitRecord.GetString("user") != authRecord.Id {
		return response, apis.NewForbiddenError("you can only move items into your own visits", nil)
	}

	if currentVisitID == destinationVisitID {
		return moveVisitItemResponse{
			ItemID:             itemRecord.Id,
			DestinationVisitID: destinationVisitID,
		}, nil
	}

	itemRecord.Set("visit", destinationVisitID)
	if err := app.Save(itemRecord); err != nil {
		return response, apis.NewApiError(500, "failed to move visit item", err)
	}

	photoRecords, err := findRecordsByRelationValues(app, "visit_photos", "food_item", []string{itemRecord.Id}, "")
	if err != nil {
		return response, apis.NewApiError(500, "failed to load visit item photos", err)
	}

	for _, photoRecord := range photoRecords {
		photoRecord.Set("visit", destinationVisitID)
		if err := app.Save(photoRecord); err != nil {
			return response, apis.NewApiError(500, "failed to move visit item photos", err)
		}
	}

	return moveVisitItemResponse{
		ItemID:             itemRecord.Id,
		DestinationVisitID: destinationVisitID,
	}, nil
}

func convertVisitItemToFoodProductTransaction(
	app core.App,
	authRecord *core.Record,
	itemID string,
) (convertVisitItemToFoodProductResponse, error) {
	response := convertVisitItemToFoodProductResponse{}

	itemRecord, err := app.FindRecordById("food_items", itemID)
	if err != nil {
		return response, apis.NewNotFoundError("visit item not found", err)
	}

	if itemRecord.GetString("user") != authRecord.Id {
		return response, apis.NewForbiddenError("you can only convert your own visit items", nil)
	}

	sourceVisitID := strings.TrimSpace(itemRecord.GetString("visit"))
	if !isVisitItemRecord(itemRecord) || sourceVisitID == "" {
		return response, apis.NewBadRequestError("only visit items can be converted to food products", nil)
	}

	visitRecord, err := app.FindRecordById("visits", sourceVisitID)
	if err != nil {
		return response, apis.NewNotFoundError("source visit not found", err)
	}

	if visitRecord.GetString("user") != authRecord.Id {
		return response, apis.NewForbiddenError("you can only convert items from your own visits", nil)
	}

	locationText := ""
	restaurantID := strings.TrimSpace(visitRecord.GetString("restaurant"))
	if restaurantID != "" {
		if restaurantRecord, restaurantErr := app.FindRecordById("restaurants", restaurantID); restaurantErr == nil {
			locationText = strings.TrimSpace(restaurantRecord.GetString("name"))
		}
	}

	itemRecord.Set("itemType", foodItemTypeFoodProduct)
	itemRecord.Set("visit", "")
	itemRecord.Set("location_text", locationText)
	itemRecord.Set("itemDate", firstNonEmpty(
		visitRecord.GetString("visitDate"),
		visitRecord.GetString("created"),
	))
	itemRecord.Set("visibility", normalizeVisitVisibility(visitRecord.GetString("visibility")))
	itemRecord.Set("itemCategory", "")
	itemRecord.Set("notes", combineVisitItemDescriptionAndNotes(
		itemRecord.GetString("description"),
		itemRecord.GetString("notes"),
	))
	itemRecord.Set("description", "")

	if err := app.Save(itemRecord); err != nil {
		return response, apis.NewApiError(500, "failed to convert visit item", err)
	}

	photoRecords, err := findRecordsByRelationValues(app, "visit_photos", "food_item", []string{itemRecord.Id}, "")
	if err != nil {
		return response, apis.NewApiError(500, "failed to load visit item photos", err)
	}

	for _, photoRecord := range photoRecords {
		photoRecord.Set("visit", "")
		if err := app.Save(photoRecord); err != nil {
			return response, apis.NewApiError(500, "failed to convert visit item photos", err)
		}
	}

	remainingVisitItems, err := app.FindRecordsByFilter(
		"food_items",
		"visit = {:visitId} && itemType = {:itemType}",
		"created",
		1,
		0,
		dbx.Params{
			"itemType": foodItemTypeVisitItem,
			"visitId":  sourceVisitID,
		},
	)
	if err != nil {
		return response, apis.NewApiError(500, "failed to load remaining visit items", err)
	}

	deletedSourceVisit := false
	if len(remainingVisitItems) == 0 {
		if err := app.Delete(visitRecord); err != nil {
			return response, apis.NewApiError(500, "failed to delete empty source visit", err)
		}
		deletedSourceVisit = true
	}

	return convertVisitItemToFoodProductResponse{
		FoodProductID:      itemRecord.Id,
		SourceVisitID:      sourceVisitID,
		DeletedSourceVisit: deletedSourceVisit,
	}, nil
}

func combineVisitItemDescriptionAndNotes(description string, notes string) string {
	trimmedDescription := strings.TrimSpace(description)
	trimmedNotes := strings.TrimSpace(notes)
	if trimmedDescription == "" {
		return trimmedNotes
	}
	if trimmedNotes == "" {
		return trimmedDescription
	}
	return trimmedDescription + "\n\n" + trimmedNotes
}

func createBillTransaction(app core.App, authRecord *core.Record, requestBody billCreateRequest) (*core.Record, error) {
	trimmedTitle := strings.TrimSpace(requestBody.Title)
	if trimmedTitle == "" {
		return nil, apis.NewBadRequestError("bill title is required", nil)
	}

	billsCollection, err := app.FindCollectionByNameOrId("bills")
	if err != nil {
		return nil, apis.NewApiError(500, "internal error", err)
	}

	normalizedTax := sanitizeCurrency(requestBody.Tax)
	normalizedTip := sanitizeCurrency(requestBody.Tip)
	normalizedFees := sanitizeCurrency(requestBody.Fees)
	subtotal := 0.0
	for _, item := range requestBody.Items {
		subtotal += sanitizeCurrency(item.Price)
	}
	computedTotalAmount := sanitizeCurrency(subtotal + normalizedTax + normalizedTip + normalizedFees)
	totalAmount := computedTotalAmount
	if requestBody.TotalAmount != nil && isFinite(*requestBody.TotalAmount) {
		totalAmount = sanitizeCurrency(*requestBody.TotalAmount)
	}

	billRecord := core.NewRecord(billsCollection)
	billRecord.Set("creator_user", authRecord.Id)
	billRecord.Set("bill_name", trimmedTitle)
	billRecord.Set("total_amount", totalAmount)
	billRecord.Set("tax", normalizedTax)
	billRecord.Set("tip", normalizedTip)
	billRecord.Set("fees", normalizedFees)
	billRecord.Set("split_mode", toBillCollectionSplitMode(requestBody.ExtrasSplitMode))
	billRecord.Set("extras_split_mode", normalizeExtrasSplitMode(requestBody.ExtrasSplitMode))
	billRecord.Set("status", deriveBillStatusFromParticipants(requestBody.Participants))

	if err := app.Save(billRecord); err != nil {
		return nil, apis.NewApiError(500, "failed to create bill", err)
	}

	if _, _, err := syncBillChildren(app, billRecord.Id, nil, nil, requestBody.Participants, requestBody.Items); err != nil {
		return nil, err
	}

	return billRecord, nil
}

func updateBillTransaction(
	app core.App,
	authRecord *core.Record,
	billID string,
	requestBody billUpdateRequest,
) (*core.Record, error) {
	billRecord, err := app.FindRecordById("bills", billID)
	if err != nil {
		return nil, apis.NewNotFoundError("bill not found", err)
	}

	if billRecord.GetString("creator_user") != authRecord.Id {
		return nil, apis.NewForbiddenError("only the bill creator can edit this bill", nil)
	}

	existingParticipants, err := listBillParticipants(app, billID)
	if err != nil {
		return nil, apis.NewApiError(500, "failed to load bill participants", err)
	}

	existingItems, err := listBillItems(app, billID)
	if err != nil {
		return nil, apis.NewApiError(500, "failed to load bill items", err)
	}

	nextTitle := billRecord.GetString("bill_name")
	if requestBody.Title != nil {
		nextTitle = strings.TrimSpace(*requestBody.Title)
		if nextTitle == "" {
			return nil, apis.NewBadRequestError("bill title is required", nil)
		}
	}

	nextParticipants := cloneBillParticipantPayloads(existingParticipants)
	if requestBody.Participants != nil {
		nextParticipants = *requestBody.Participants
	}

	nextItems := cloneBillItemPayloads(existingItems)
	if requestBody.Items != nil {
		nextItems = *requestBody.Items
	}

	nextTax := sanitizeCurrency(billRecord.GetFloat("tax"))
	if requestBody.Tax != nil {
		nextTax = sanitizeCurrency(*requestBody.Tax)
	}

	nextTip := sanitizeCurrency(billRecord.GetFloat("tip"))
	if requestBody.Tip != nil {
		nextTip = sanitizeCurrency(*requestBody.Tip)
	}

	nextFees := sanitizeCurrency(billRecord.GetFloat("fees"))
	if requestBody.Fees != nil {
		nextFees = sanitizeCurrency(*requestBody.Fees)
	}

	nextSubtotal := 0.0
	for _, item := range nextItems {
		nextSubtotal += sanitizeCurrency(item.Price)
	}
	computedTotalAmount := sanitizeCurrency(nextSubtotal + nextTax + nextTip + nextFees)
	nextTotalAmount := computedTotalAmount
	if requestBody.TotalAmount != nil && isFinite(*requestBody.TotalAmount) {
		nextTotalAmount = sanitizeCurrency(*requestBody.TotalAmount)
	}

	nextStatus := normalizeBillRecordStatus(billRecord.GetString("status"))
	switch {
	case requestBody.Status != nil:
		nextStatus = normalizeBillStatus(*requestBody.Status)
	case requestBody.Participants != nil:
		nextStatus = deriveBillStatusFromParticipants(nextParticipants)
	}

	billRecord.Set("bill_name", nextTitle)
	billRecord.Set("total_amount", nextTotalAmount)
	billRecord.Set("tax", nextTax)
	billRecord.Set("tip", nextTip)
	billRecord.Set("fees", nextFees)
	if requestBody.ExtrasSplitMode != nil {
		billRecord.Set("extras_split_mode", normalizeExtrasSplitMode(*requestBody.ExtrasSplitMode))
	}
	billRecord.Set("status", nextStatus)

	if err := app.Save(billRecord); err != nil {
		return nil, apis.NewApiError(500, "failed to update bill", err)
	}

	var requestedParticipants []billParticipantWriteRequest
	if requestBody.Participants != nil {
		requestedParticipants = *requestBody.Participants
	}

	var requestedItems []billItemWriteRequest
	if requestBody.Items != nil {
		requestedItems = *requestBody.Items
	}

	if _, _, err := syncBillChildren(
		app,
		billID,
		existingParticipants,
		existingItems,
		requestedParticipants,
		requestedItems,
	); err != nil {
		return nil, err
	}

	return billRecord, nil
}

func deleteBillTransaction(app core.App, authRecord *core.Record, billID string) error {
	billRecord, err := app.FindRecordById("bills", billID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return apis.NewNotFoundError("bill not found", err)
		}

		return apis.NewApiError(500, "failed to load bill", err)
	}

	if billRecord.GetString("creator_user") != authRecord.Id {
		return apis.NewForbiddenError("only the bill creator can delete this bill", nil)
	}

	items, err := listBillItems(app, billID)
	if err != nil {
		return apis.NewApiError(500, "failed to load bill items", err)
	}

	participants, err := listBillParticipants(app, billID)
	if err != nil {
		return apis.NewApiError(500, "failed to load bill participants", err)
	}

	for _, item := range items {
		if err := app.Delete(item); err != nil {
			return apis.NewApiError(500, "failed to delete bill item", err)
		}
	}

	for _, participant := range participants {
		if err := app.Delete(participant); err != nil {
			return apis.NewApiError(500, "failed to delete bill participant", err)
		}
	}

	if err := app.Delete(billRecord); err != nil {
		return apis.NewApiError(500, "failed to delete bill", err)
	}

	return nil
}

func updateBillParticipantPaidStatusTransaction(
	app core.App,
	authRecord *core.Record,
	billID string,
	participantID string,
	requestBody billParticipantPaidStatusUpdateRequest,
) (*core.Record, error) {
	billRecord, err := app.FindRecordById("bills", billID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, apis.NewNotFoundError("bill not found", err)
		}

		return nil, apis.NewApiError(500, "failed to load bill", err)
	}

	participantRecord, err := app.FindRecordById("bill_participants", participantID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, apis.NewNotFoundError("bill participant not found", err)
		}

		return nil, apis.NewApiError(500, "failed to load bill participant", err)
	}

	if participantRecord.GetString("bill") != billID {
		return nil, apis.NewNotFoundError("bill participant not found", nil)
	}

	isCreator := strings.TrimSpace(billRecord.GetString("creator_user")) == authRecord.Id
	isSelfParticipant := strings.TrimSpace(participantRecord.GetString("user")) == authRecord.Id
	if !isCreator && !isSelfParticipant {
		return nil, apis.NewForbiddenError("you can only update your own participant status", nil)
	}

	nextPaidStatus := normalizePaidStatus(requestBody.PaidStatus)
	if !isCreator && nextPaidStatus != "paid" {
		return nil, apis.NewForbiddenError("participants can only mark themselves as paid", nil)
	}

	participantRecord.Set("paid_status", nextPaidStatus)
	participantRecord.Set("paid_date", paidDateValue(nextPaidStatus))
	if err := app.Save(participantRecord); err != nil {
		return nil, apis.NewApiError(500, "failed to update bill participant", err)
	}

	participants, err := listBillParticipants(app, billID)
	if err != nil {
		return nil, apis.NewApiError(500, "failed to load bill participants", err)
	}

	billRecord.Set("status", deriveBillStatusFromParticipantRecords(participants))
	if err := app.Save(billRecord); err != nil {
		return nil, apis.NewApiError(500, "failed to update bill status", err)
	}

	return billRecord, nil
}

func syncBillChildren(
	app core.App,
	billID string,
	existingParticipants []*core.Record,
	existingItems []*core.Record,
	requestParticipants []billParticipantWriteRequest,
	requestItems []billItemWriteRequest,
) (map[string]string, []string, error) {
	participantsCollection, err := app.FindCollectionByNameOrId("bill_participants")
	if err != nil {
		return nil, nil, apis.NewApiError(500, "internal error", err)
	}

	billItemsCollection, err := app.FindCollectionByNameOrId("bill_items")
	if err != nil {
		return nil, nil, apis.NewApiError(500, "internal error", err)
	}

	participantIDRemap := map[string]string{}
	participantIDsToDelete := []string{}

	if requestParticipants != nil {
		existingParticipantsByID := make(map[string]*core.Record, len(existingParticipants))
		for _, participant := range existingParticipants {
			existingParticipantsByID[participant.Id] = participant
		}

		retainedParticipantIDs := make(map[string]struct{}, len(requestParticipants))
		for _, participant := range requestParticipants {
			participantName := strings.TrimSpace(participant.Name)
			participantUserID := strings.TrimSpace(participant.UserID)
			if participantName == "" && participantUserID == "" {
				return nil, nil, apis.NewBadRequestError("participant name is required", nil)
			}

			customTipContribution := sanitizeOptionalCurrency(participant.CustomTipContribution)
			paidStatus := normalizePaidStatus(participant.PaidStatus)

			if existingParticipant, ok := existingParticipantsByID[participant.ID]; ok {
				existingParticipant.Set("bill", billID)
				existingParticipant.Set("user", emptyStringToNil(participantUserID))
				existingParticipant.Set("participant_name", emptyStringToNil(participantName))
				existingParticipant.Set("amount_owed", sanitizeCurrency(participant.AmountOwed))
				existingParticipant.Set("paid_status", paidStatus)
				existingParticipant.Set("paid_date", paidDateValue(paidStatus))
				existingParticipant.Set("custom_tip_contribution", customTipContribution)

				if err := app.Save(existingParticipant); err != nil {
					return nil, nil, apis.NewApiError(500, "failed to update bill participant", err)
				}

				retainedParticipantIDs[existingParticipant.Id] = struct{}{}
				participantIDRemap[participant.ID] = existingParticipant.Id
				continue
			}

			createdParticipant := core.NewRecord(participantsCollection)
			createdParticipant.Set("bill", billID)
			createdParticipant.Set("user", emptyStringToNil(participantUserID))
			createdParticipant.Set("participant_name", emptyStringToNil(participantName))
			createdParticipant.Set("amount_owed", sanitizeCurrency(participant.AmountOwed))
			createdParticipant.Set("paid_status", paidStatus)
			createdParticipant.Set("paid_date", paidDateValue(paidStatus))
			createdParticipant.Set("custom_tip_contribution", customTipContribution)

			if err := app.Save(createdParticipant); err != nil {
				return nil, nil, apis.NewApiError(500, "failed to create bill participant", err)
			}

			retainedParticipantIDs[createdParticipant.Id] = struct{}{}
			participantIDRemap[participant.ID] = createdParticipant.Id
		}

		for _, existingParticipant := range existingParticipants {
			if _, keep := retainedParticipantIDs[existingParticipant.Id]; keep {
				continue
			}
			participantIDsToDelete = append(participantIDsToDelete, existingParticipant.Id)
		}
	}

	if requestItems != nil {
		existingItemsByID := make(map[string]*core.Record, len(existingItems))
		for _, item := range existingItems {
			existingItemsByID[item.Id] = item
		}

		allParticipantIDs, listErr := listBillParticipantIDs(app, billID)
		if listErr != nil {
			return nil, nil, apis.NewApiError(500, "failed to load bill participants", listErr)
		}

		retainedItemIDs := make(map[string]struct{}, len(requestItems))
		for _, item := range requestItems {
			trimmedName := strings.TrimSpace(item.ItemName)
			if trimmedName == "" {
				return nil, nil, apis.NewBadRequestError("bill item name is required", nil)
			}

			normalizedSplitMode := normalizeBillItemSplitMode(item.SplitMode)
			normalizedSplitConfig, normalizeErr := normalizeBillItemSplitConfig(item.SplitConfig, participantIDRemap)
			if normalizeErr != nil {
				return nil, nil, normalizeErr
			}

			normalizedAssignedToIDs := normalizeAssignedParticipantIDs(item.AssignedToParticipantIDs, participantIDRemap)
			if len(normalizedAssignedToIDs) == 0 {
				normalizedAssignedToIDs = append(normalizedAssignedToIDs, allParticipantIDs...)
			}

			if existingItem, ok := existingItemsByID[item.ID]; ok {
				existingItem.Set("bill", billID)
				existingItem.Set("item_name", trimmedName)
				existingItem.Set("price", sanitizeCurrency(item.Price))
				existingItem.Set("assigned_to", normalizedAssignedToIDs)
				existingItem.Set("split_mode", normalizedSplitMode)
				existingItem.Set("split_config", normalizedBillItemSplitConfigValue(normalizedSplitMode, normalizedSplitConfig))

				if err := app.Save(existingItem); err != nil {
					return nil, nil, apis.NewApiError(500, "failed to update bill item", err)
				}

				retainedItemIDs[existingItem.Id] = struct{}{}
				continue
			}

			createdItem := core.NewRecord(billItemsCollection)
			createdItem.Set("bill", billID)
			createdItem.Set("item_name", trimmedName)
			createdItem.Set("price", sanitizeCurrency(item.Price))
			createdItem.Set("assigned_to", normalizedAssignedToIDs)
			createdItem.Set("split_mode", normalizedSplitMode)
			createdItem.Set("split_config", normalizedBillItemSplitConfigValue(normalizedSplitMode, normalizedSplitConfig))

			if err := app.Save(createdItem); err != nil {
				return nil, nil, apis.NewApiError(500, "failed to create bill item", err)
			}

			retainedItemIDs[createdItem.Id] = struct{}{}
		}

		for _, existingItem := range existingItems {
			if _, keep := retainedItemIDs[existingItem.Id]; keep {
				continue
			}
			if err := app.Delete(existingItem); err != nil {
				return nil, nil, apis.NewApiError(500, "failed to delete removed bill item", err)
			}
		}
	}

	if requestItems == nil && len(participantIDsToDelete) > 0 {
		removedParticipantSet := make(map[string]struct{}, len(participantIDsToDelete))
		for _, participantID := range participantIDsToDelete {
			removedParticipantSet[participantID] = struct{}{}
		}

		for _, existingItem := range existingItems {
			nextAssignedTo := filterRemovedIDs(extractStringSlice(existingItem.Get("assigned_to")), removedParticipantSet)
			nextSplitConfig := filterRemovedSplitConfig(existingItem.Get("split_config"), removedParticipantSet)
			splitMode := normalizeBillItemSplitMode(existingItem.GetString("split_mode"))

			existingItem.Set("assigned_to", nextAssignedTo)
			existingItem.Set("split_config", normalizedBillItemSplitConfigValue(splitMode, nextSplitConfig))
			if err := app.Save(existingItem); err != nil {
				return nil, nil, apis.NewApiError(500, "failed to update bill items after participant removal", err)
			}
		}
	}

	for _, participantID := range participantIDsToDelete {
		participantRecord, findErr := app.FindRecordById("bill_participants", participantID)
		if findErr != nil {
			if errors.Is(findErr, sql.ErrNoRows) {
				continue
			}
			return nil, nil, apis.NewApiError(500, "failed to load removed participant", findErr)
		}

		if err := app.Delete(participantRecord); err != nil {
			return nil, nil, apis.NewApiError(500, "failed to delete removed participant", err)
		}
	}

	return participantIDRemap, participantIDsToDelete, nil
}

func buildVisitResponse(
	app core.App,
	visitRecord *core.Record,
	viewerRecord *core.Record,
	options buildVisitResponseOptions,
) (visitResponse, error) {
	if visitRecord == nil {
		return visitResponse{}, apis.NewNotFoundError("visit not found", nil)
	}
	if viewerRecord == nil {
		return visitResponse{}, apis.NewUnauthorizedError("authentication required", nil)
	}

	viewerUserID := strings.TrimSpace(viewerRecord.Id)
	isAdmin := viewerRecord.GetBool("isAdmin")
	acceptedFriendIDs := map[string]struct{}{}
	visitOwnerID := strings.TrimSpace(visitRecord.GetString("user"))
	if !isAdmin && visitOwnerID != "" && visitOwnerID != viewerUserID {
		friendIDs, err := listAcceptedFriendIDs(app, viewerUserID)
		if err != nil {
			return visitResponse{}, err
		}
		acceptedFriendIDs = friendIDs
	}

	if !canAccessVisitRecord(visitRecord, viewerUserID, isAdmin, acceptedFriendIDs) {
		return visitResponse{}, apis.NewNotFoundError("visit not found", nil)
	}
	if !isAdmin {
		hidden, err := lib.ReportedContentHiddenForViewer(app, viewerUserID, "visits", visitRecord)
		if err != nil {
			return visitResponse{}, err
		}
		if hidden {
			return visitResponse{}, apis.NewNotFoundError("visit not found", nil)
		}
	}

	restaurantRecord, err := app.FindRecordById("restaurants", visitRecord.GetString("restaurant"))
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return visitResponse{}, err
	}

	ownerRecord := viewerRecord
	if visitOwnerID != "" && visitOwnerID != viewerUserID {
		ownerRecord, err = app.FindRecordById("users", visitOwnerID)
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return visitResponse{}, err
		}
	}

	items, err := listFoodItemsForVisitWithSort(app, visitRecord.Id, options.ItemSort)
	if err != nil {
		return visitResponse{}, err
	}

	visitsByID := map[string]*core.Record{
		visitRecord.Id: visitRecord,
	}
	restaurantID := strings.TrimSpace(visitRecord.GetString("restaurant"))
	menuItemsByID, err := buildAccessibleMenuItemsByID(
		app,
		collectVisitItemMenuItemIDs(items),
		viewerUserID,
		isAdmin,
		acceptedFriendIDs,
	)
	if err != nil {
		return visitResponse{}, err
	}
	menuItemIDsByRestaurantAndName, err := buildMenuItemIDsByRestaurantAndName(
		app,
		[]string{restaurantID},
		viewerUserID,
		isAdmin,
		acceptedFriendIDs,
	)
	if err != nil {
		return visitResponse{}, err
	}
	responseItems := make([]visitItemResponse, 0, len(items))
	for _, item := range items {
		if !canAccessFoodItemRecord(item, visitsByID, viewerUserID, isAdmin, acceptedFriendIDs) {
			continue
		}

		responseItems = append(responseItems, visitItemResponse{
			ID:          item.Id,
			MenuItemID:  resolveHomeFeedVisitItemMenuItemID(item, restaurantID, menuItemsByID, menuItemIDsByRestaurantAndName),
			Name:        item.GetString("name"),
			Rating:      item.GetFloat("rating"),
			Description: strings.TrimSpace(item.GetString("description")),
			Notes:       strings.TrimSpace(item.GetString("notes")),
		})
	}
	responseItems = orderVisitResponseItems(responseItems, options.PrioritizedItemIDs)

	response := visitResponse{
		ID:           visitRecord.Id,
		RestaurantID: visitRecord.GetString("restaurant"),
		VisitedAt:    firstNonEmpty(visitRecord.GetString("visitDate"), visitRecord.GetString("created")),
		Items:        responseItems,
		Source:       "visit",
		UserID:       visitRecord.GetString("user"),
		UserName:     resolveHomeFeedUserName(ownerRecord),
		Visibility:   visitRecord.GetString("visibility"),
		CreatedAt:    visitRecord.GetString("created"),
		UpdatedAt:    visitRecord.GetString("updated"),
	}

	if moderationStatus := strings.TrimSpace(visitRecord.GetString("moderationStatus")); moderationStatus != "" {
		response.ModerationStatus = moderationStatus
	}

	if restaurantRecord != nil {
		response.RestaurantName = strings.TrimSpace(restaurantRecord.GetString("name"))
		response.RestaurantLocation = strings.TrimSpace(restaurantRecord.GetString("location"))
		response.RestaurantCuisineType = strings.TrimSpace(restaurantRecord.GetString("cuisineType"))
	}

	if response.RestaurantName == "" {
		response.RestaurantName = "Unknown Restaurant"
	}

	return response, nil
}

func buildBillResponse(app core.App, billRecord *core.Record, viewerUserID string) (billResponse, error) {
	participants, err := listBillParticipants(app, billRecord.Id)
	if err != nil {
		return billResponse{}, err
	}

	items, err := listBillItems(app, billRecord.Id)
	if err != nil {
		return billResponse{}, err
	}

	userRecordsByID, friendshipIDsByUserID, err := loadBillParticipantDisplayData(app, viewerUserID, participants)
	if err != nil {
		return billResponse{}, err
	}

	responseParticipants := make([]billParticipantResponse, 0, len(participants))
	for _, participant := range participants {
		userID := strings.TrimSpace(participant.GetString("user"))
		amountOwed := sanitizeCurrency(participant.GetFloat("amount_owed"))
		paidStatus := normalizePaidStatus(participant.GetString("paid_status"))
		name := strings.TrimSpace(participant.GetString("participant_name"))
		if name == "" {
			if userRecord := userRecordsByID[userID]; userRecord != nil {
				name = strings.TrimSpace(userRecord.GetString("name"))
				if name == "" {
					email := strings.TrimSpace(userRecord.GetString("email"))
					if email != "" {
						name = strings.Split(email, "@")[0]
					}
				}
			}
		}
		if name == "" {
			name = "Unknown"
		}

		paymentReminderAvailability := billPaymentReminderAvailability{Available: false}
		if userID != "" && userID != billRecord.GetString("creator_user") && paidStatus == "pending" && amountOwed > 0 {
			paymentReminderAvailability, err = getBillPaymentReminderAvailability(app, participant.Id, userID, time.Now().UTC())
			if err != nil {
				return billResponse{}, err
			}
		}

		responseParticipants = append(responseParticipants, billParticipantResponse{
			ID:                         participant.Id,
			Name:                       name,
			UserID:                     userID,
			FriendshipID:               friendshipIDsByUserID[userID],
			AmountOwed:                 amountOwed,
			CustomTipContribution:      sanitizeOptionalCurrencyResponse(participant.Get("custom_tip_contribution")),
			PaidStatus:                 paidStatus,
			PaymentReminderAvailable:   paymentReminderAvailability.Available,
			PaymentReminderAvailableAt: paymentReminderAvailability.AvailableAt,
		})
	}

	responseItems := make([]billItemResponse, 0, len(items))
	for _, item := range items {
		responseItems = append(responseItems, billItemResponse{
			ID:                       item.Id,
			ItemName:                 item.GetString("item_name"),
			Price:                    sanitizeCurrency(item.GetFloat("price")),
			AssignedToParticipantIDs: extractStringSlice(item.Get("assigned_to")),
			SplitMode:                normalizeBillItemSplitMode(item.GetString("split_mode")),
			SplitConfig:              mapBillItemSplitConfigResponse(item.Get("split_config")),
		})
	}

	return billResponse{
		ID:              billRecord.Id,
		Title:           billRecord.GetString("bill_name"),
		RestaurantName:  billRecord.GetString("bill_name"),
		CreatedByUserID: billRecord.GetString("creator_user"),
		TotalAmount:     sanitizeCurrency(billRecord.GetFloat("total_amount")),
		Items:           responseItems,
		Participants:    responseParticipants,
		Tax:             sanitizeCurrency(billRecord.GetFloat("tax")),
		Tip:             sanitizeCurrency(billRecord.GetFloat("tip")),
		Fees:            sanitizeCurrency(billRecord.GetFloat("fees")),
		SplitMode:       billRecord.GetString("split_mode"),
		ExtrasSplitMode: normalizeExtrasSplitMode(billRecord.GetString("extras_split_mode")),
		Status:          normalizeBillAPIStatus(billRecord.GetString("status")),
		CreatedAt:       billRecord.GetString("created"),
		UpdatedAt:       billRecord.GetString("updated"),
	}, nil
}

func loadBillParticipantDisplayData(
	app core.App,
	viewerUserID string,
	participants []*core.Record,
) (map[string]*core.Record, map[string]string, error) {
	userIDs := extractRelationFieldValues(participants, "user")
	userRecords, err := findRecordsByRelationValues(app, "users", "id", userIDs, "")
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return nil, nil, err
	}

	userRecordsByID := mapRecordsByID(userRecords)
	friendshipIDsByUserID := map[string]string{}

	if strings.TrimSpace(viewerUserID) == "" {
		return userRecordsByID, friendshipIDsByUserID, nil
	}

	friendshipRecordsByUserID, err := findAcceptedFriendshipRecordsByUserID(app, viewerUserID, userIDs)
	if err != nil {
		return nil, nil, err
	}

	for userID, friendshipRecord := range friendshipRecordsByUserID {
		friendshipIDsByUserID[userID] = friendshipRecord.Id
	}

	return userRecordsByID, friendshipIDsByUserID, nil
}

func findAcceptedFriendshipRecordsByUserID(
	app core.App,
	viewerUserID string,
	otherUserIDs []string,
) (map[string]*core.Record, error) {
	normalizedOtherUserIDs := make([]string, 0, len(otherUserIDs))
	seen := map[string]struct{}{}
	for _, otherUserID := range otherUserIDs {
		trimmedOtherUserID := strings.TrimSpace(otherUserID)
		if trimmedOtherUserID == "" || trimmedOtherUserID == viewerUserID {
			continue
		}
		if _, exists := seen[trimmedOtherUserID]; exists {
			continue
		}

		seen[trimmedOtherUserID] = struct{}{}
		normalizedOtherUserIDs = append(normalizedOtherUserIDs, trimmedOtherUserID)
	}

	if len(normalizedOtherUserIDs) == 0 {
		return map[string]*core.Record{}, nil
	}

	filterClauses := make([]string, 0, len(normalizedOtherUserIDs))
	params := dbx.Params{"viewerUserId": viewerUserID}
	for index, otherUserID := range normalizedOtherUserIDs {
		paramKey := fmt.Sprintf("otherUserId%d", index)
		params[paramKey] = otherUserID
		filterClauses = append(
			filterClauses,
			fmt.Sprintf(
				"((user = {:viewerUserId} && friend = {:%s}) || (user = {:%s} && friend = {:viewerUserId}))",
				paramKey,
				paramKey,
			),
		)
	}

	friendshipRecords, err := app.FindRecordsByFilter(
		"friendships",
		"status = 'accepted' && ("+strings.Join(filterClauses, " || ")+")",
		"",
		len(normalizedOtherUserIDs),
		0,
		params,
	)
	if err != nil {
		return nil, err
	}

	friendshipRecordsByUserID := make(map[string]*core.Record, len(friendshipRecords))
	for _, friendshipRecord := range friendshipRecords {
		otherUserID := strings.TrimSpace(friendshipRecord.GetString("user"))
		if otherUserID == viewerUserID {
			otherUserID = strings.TrimSpace(friendshipRecord.GetString("friend"))
		}
		if otherUserID == "" {
			continue
		}

		friendshipRecordsByUserID[otherUserID] = friendshipRecord
	}

	return friendshipRecordsByUserID, nil
}

func listFoodItemsForVisit(app core.App, visitID string) ([]*core.Record, error) {
	return listFoodItemsForVisitWithSort(app, visitID, "created")
}

func listFoodItemsForVisitWithSort(app core.App, visitID string, sort string) ([]*core.Record, error) {
	resolvedSort := strings.TrimSpace(sort)
	if resolvedSort == "" {
		resolvedSort = "created"
	}

	return app.FindRecordsByFilter("food_items", "visit = {:visitId}", resolvedSort, 200, 0, dbx.Params{
		"visitId": visitID,
	})
}

func findMergeableVisitRecord(
	app core.App,
	userID string,
	restaurantID string,
	visibility string,
	visitLocalDate string,
) (*core.Record, error) {
	records, err := app.FindRecordsByFilter(
		"visits",
		"user = {:userId} && restaurant = {:restaurantId} && visibility = {:visibility} && "+visitLocalDateFieldName+" = {:visitLocalDate}",
		"-visitDate,-updated,-created",
		20,
		0,
		dbx.Params{
			"restaurantId":   restaurantID,
			"userId":         userID,
			"visibility":     visibility,
			"visitLocalDate": visitLocalDate,
		},
	)
	if err != nil {
		return nil, err
	}

	for _, record := range records {
		if isOwnerAccessibleModerationStatus(record.GetString("moderationStatus")) {
			return record, nil
		}
	}

	return nil, nil
}

func orderVisitResponseItems(items []visitItemResponse, prioritizedItemIDs []string) []visitItemResponse {
	if len(prioritizedItemIDs) == 0 || len(items) < 2 {
		return items
	}

	itemsByID := make(map[string]visitItemResponse, len(items))
	for _, item := range items {
		itemsByID[item.ID] = item
	}

	orderedItems := make([]visitItemResponse, 0, len(items))
	seen := make(map[string]struct{}, len(prioritizedItemIDs))
	for _, itemID := range prioritizedItemIDs {
		if _, alreadySeen := seen[itemID]; alreadySeen {
			continue
		}

		item, ok := itemsByID[itemID]
		if !ok {
			continue
		}

		orderedItems = append(orderedItems, item)
		seen[itemID] = struct{}{}
	}

	for _, item := range items {
		if _, alreadySeen := seen[item.ID]; alreadySeen {
			continue
		}
		orderedItems = append(orderedItems, item)
	}

	return orderedItems
}

func listBillParticipants(app core.App, billID string) ([]*core.Record, error) {
	return app.FindRecordsByFilter("bill_participants", "bill = {:billId}", "created", 200, 0, dbx.Params{
		"billId": billID,
	})
}

func billParticipantRecordsToNotificationSignals(participants []*core.Record) []billNotificationParticipantSignal {
	signals := make([]billNotificationParticipantSignal, 0, len(participants))
	for _, participant := range participants {
		if participant == nil {
			continue
		}
		signals = append(signals, billNotificationParticipantSignal{
			UserID:     participant.GetString("user"),
			AmountOwed: participant.GetFloat("amount_owed"),
			PaidStatus: participant.GetString("paid_status"),
		})
	}
	return signals
}

func billResponseParticipantsToNotificationSignals(participants []billParticipantResponse) []billNotificationParticipantSignal {
	signals := make([]billNotificationParticipantSignal, 0, len(participants))
	for _, participant := range participants {
		signals = append(signals, billNotificationParticipantSignal{
			UserID:     participant.UserID,
			AmountOwed: participant.AmountOwed,
			PaidStatus: participant.PaidStatus,
		})
	}
	return signals
}

func listBillItems(app core.App, billID string) ([]*core.Record, error) {
	return app.FindRecordsByFilter("bill_items", "bill = {:billId}", "created", 200, 0, dbx.Params{
		"billId": billID,
	})
}

func listBillParticipantIDs(app core.App, billID string) ([]string, error) {
	participants, err := listBillParticipants(app, billID)
	if err != nil {
		return nil, err
	}

	ids := make([]string, 0, len(participants))
	for _, participant := range participants {
		ids = append(ids, participant.Id)
	}
	return ids, nil
}

func normalizeVisitDate(value string) string {
	trimmedValue := strings.TrimSpace(value)
	if trimmedValue != "" {
		return trimmedValue
	}
	return time.Now().UTC().Format(time.RFC3339Nano)
}

func resolveVisitLocalDate(visitedOn string, visitedAt string) (string, error) {
	trimmedVisitedOn := strings.TrimSpace(visitedOn)
	if trimmedVisitedOn != "" {
		if _, err := time.Parse(visitLocalDateLayout, trimmedVisitedOn); err != nil {
			return "", apis.NewBadRequestError("visitedOn must use YYYY-MM-DD format", err)
		}
		return trimmedVisitedOn, nil
	}

	trimmedVisitedAt := strings.TrimSpace(visitedAt)
	if len(trimmedVisitedAt) >= len(visitLocalDateLayout) {
		candidate := trimmedVisitedAt[:len(visitLocalDateLayout)]
		if _, err := time.Parse(visitLocalDateLayout, candidate); err == nil {
			return candidate, nil
		}
	}

	return "", apis.NewBadRequestError("visitedAt must include a valid calendar date", nil)
}

func normalizeVisitVisibility(value string) string {
	switch strings.TrimSpace(value) {
	case "private":
		return "private"
	default:
		return "friends"
	}
}

func normalizeRestaurantVisibility(value string) string {
	switch strings.TrimSpace(value) {
	case "private":
		return "private"
	default:
		return "friends"
	}
}

func normalizeExtrasSplitMode(value string) string {
	if strings.TrimSpace(value) == "equal" {
		return "equal"
	}
	return "proportional"
}

func normalizeBillStatus(value string) string {
	if strings.TrimSpace(value) == "settled" {
		return "settled"
	}
	return "active"
}

func normalizeBillRecordStatus(value string) string {
	if strings.TrimSpace(value) == "settled" {
		return "settled"
	}
	return "active"
}

func normalizeBillAPIStatus(value string) string {
	if strings.TrimSpace(value) == "settled" {
		return "settled"
	}
	return "open"
}

func normalizePaidStatus(value string) string {
	if strings.TrimSpace(value) == "paid" {
		return "paid"
	}
	return "pending"
}

func normalizeBillItemSplitMode(value string) string {
	if strings.TrimSpace(value) == "advanced" {
		return "advanced"
	}
	return "simple"
}

func toBillCollectionSplitMode(extrasSplitMode string) string {
	if normalizeExtrasSplitMode(extrasSplitMode) == "equal" {
		return "even"
	}
	return "itemized"
}

func deriveBillStatusFromParticipants(participants []billParticipantWriteRequest) string {
	if len(participants) == 0 {
		return "active"
	}

	for _, participant := range participants {
		if normalizePaidStatus(participant.PaidStatus) != "paid" {
			return "active"
		}
	}

	return "settled"
}

func deriveBillStatusFromParticipantRecords(participants []*core.Record) string {
	if len(participants) == 0 {
		return "active"
	}

	for _, participant := range participants {
		if normalizePaidStatus(participant.GetString("paid_status")) != "paid" {
			return "active"
		}
	}

	return "settled"
}

func sanitizeCurrency(value float64) float64 {
	if !isFinite(value) {
		return 0
	}

	return math.Round(value*100) / 100
}

func sanitizeOptionalCurrency(value *float64) any {
	if value == nil {
		return nil
	}
	if !isFinite(*value) {
		return nil
	}
	return sanitizeCurrency(*value)
}

func sanitizeOptionalCurrencyResponse(value any) *float64 {
	switch typed := value.(type) {
	case float64:
		normalized := sanitizeCurrency(typed)
		return &normalized
	case float32:
		normalized := sanitizeCurrency(float64(typed))
		return &normalized
	case int:
		normalized := sanitizeCurrency(float64(typed))
		return &normalized
	default:
		return nil
	}
}

func isFinite(value float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0)
}

func emptyStringToNil(value string) any {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return value
}

func paidDateValue(status string) any {
	if normalizePaidStatus(status) != "paid" {
		return nil
	}
	return time.Now().UTC().Format(time.RFC3339Nano)
}

func cloneBillParticipantPayloads(records []*core.Record) []billParticipantWriteRequest {
	result := make([]billParticipantWriteRequest, 0, len(records))
	for _, record := range records {
		var customTipContribution *float64
		if value := sanitizeOptionalCurrencyResponse(record.Get("custom_tip_contribution")); value != nil {
			customTipContribution = value
		}
		result = append(result, billParticipantWriteRequest{
			ID:                    record.Id,
			Name:                  strings.TrimSpace(record.GetString("participant_name")),
			UserID:                strings.TrimSpace(record.GetString("user")),
			AmountOwed:            sanitizeCurrency(record.GetFloat("amount_owed")),
			CustomTipContribution: customTipContribution,
			PaidStatus:            normalizePaidStatus(record.GetString("paid_status")),
		})
	}
	return result
}

func cloneBillItemPayloads(records []*core.Record) []billItemWriteRequest {
	result := make([]billItemWriteRequest, 0, len(records))
	for _, record := range records {
		result = append(result, billItemWriteRequest{
			ID:                       record.Id,
			ItemName:                 strings.TrimSpace(record.GetString("item_name")),
			Price:                    sanitizeCurrency(record.GetFloat("price")),
			AssignedToParticipantIDs: extractStringSlice(record.Get("assigned_to")),
			SplitMode:                normalizeBillItemSplitMode(record.GetString("split_mode")),
			SplitConfig:              mapBillItemSplitConfigWrite(record.Get("split_config")),
		})
	}
	return result
}

func normalizeAssignedParticipantIDs(
	participantIDs []string,
	participantIDRemap map[string]string,
) []string {
	result := make([]string, 0, len(participantIDs))
	seen := make(map[string]struct{}, len(participantIDs))
	for _, participantID := range participantIDs {
		trimmedID := strings.TrimSpace(participantID)
		if remappedID, ok := participantIDRemap[trimmedID]; ok {
			trimmedID = remappedID
		}
		if trimmedID == "" {
			continue
		}
		if _, exists := seen[trimmedID]; exists {
			continue
		}
		seen[trimmedID] = struct{}{}
		result = append(result, trimmedID)
	}
	return result
}

func normalizeBillItemSplitConfig(
	splitConfig []billItemSplitWriteRequest,
	participantIDRemap map[string]string,
) ([]billItemSplitResponse, error) {
	result := make([]billItemSplitResponse, 0, len(splitConfig))
	for _, entry := range splitConfig {
		participantID := strings.TrimSpace(entry.ParticipantID)
		if remappedID, ok := participantIDRemap[participantID]; ok {
			participantID = remappedID
		}
		if participantID == "" {
			continue
		}

		splitType := strings.TrimSpace(entry.Type)
		if splitType != "percentage" && splitType != "amount" {
			return nil, apis.NewBadRequestError("split config type must be percentage or amount", nil)
		}

		result = append(result, billItemSplitResponse{
			ParticipantID: participantID,
			Type:          splitType,
			Value:         sanitizeCurrency(entry.Value),
		})
	}

	return result, nil
}

func normalizedBillItemSplitConfigValue(splitMode string, splitConfig []billItemSplitResponse) any {
	if normalizeBillItemSplitMode(splitMode) != "advanced" {
		return nil
	}

	if len(splitConfig) == 0 {
		return []map[string]any{}
	}

	result := make([]map[string]any, 0, len(splitConfig))
	for _, entry := range splitConfig {
		result = append(result, map[string]any{
			"participant_id": entry.ParticipantID,
			"type":           entry.Type,
			"value":          entry.Value,
		})
	}
	return result
}

func extractStringSlice(value any) []string {
	switch typed := value.(type) {
	case []string:
		return append([]string(nil), typed...)
	case []any:
		result := make([]string, 0, len(typed))
		for _, candidate := range typed {
			if stringValue, ok := candidate.(string); ok && strings.TrimSpace(stringValue) != "" {
				result = append(result, strings.TrimSpace(stringValue))
			}
		}
		return result
	default:
		return []string{}
	}
}

func mapBillItemSplitConfigResponse(value any) []billItemSplitResponse {
	entries := extractSplitConfigEntries(value)
	result := make([]billItemSplitResponse, 0, len(entries))
	for _, entry := range entries {
		result = append(result, billItemSplitResponse{
			ParticipantID: entry.ParticipantID,
			Type:          entry.Type,
			Value:         sanitizeCurrency(entry.Value),
		})
	}
	return result
}

func mapBillItemSplitConfigWrite(value any) []billItemSplitWriteRequest {
	entries := extractSplitConfigEntries(value)
	result := make([]billItemSplitWriteRequest, 0, len(entries))
	for _, entry := range entries {
		result = append(result, billItemSplitWriteRequest{
			ParticipantID: entry.ParticipantID,
			Type:          entry.Type,
			Value:         sanitizeCurrency(entry.Value),
		})
	}
	return result
}

func extractSplitConfigEntries(value any) []billItemSplitResponse {
	switch typed := value.(type) {
	case []map[string]any:
		result := make([]billItemSplitResponse, 0, len(typed))
		for _, entry := range typed {
			result = append(result, parseSplitConfigEntry(entry))
		}
		return compactSplitConfigEntries(result)
	case []any:
		result := make([]billItemSplitResponse, 0, len(typed))
		for _, candidate := range typed {
			entry, ok := candidate.(map[string]any)
			if !ok {
				continue
			}
			result = append(result, parseSplitConfigEntry(entry))
		}
		return compactSplitConfigEntries(result)
	case string:
		return decodeSplitConfigJSON([]byte(typed))
	case []byte:
		return decodeSplitConfigJSON(typed)
	case types.JSONRaw:
		return decodeSplitConfigJSON([]byte(typed))
	default:
		return []billItemSplitResponse{}
	}
}

func decodeSplitConfigJSON(raw []byte) []billItemSplitResponse {
	trimmed := strings.TrimSpace(string(raw))
	if trimmed == "" || trimmed == "null" {
		return []billItemSplitResponse{}
	}

	var decoded []map[string]any
	if err := json.Unmarshal([]byte(trimmed), &decoded); err != nil {
		return []billItemSplitResponse{}
	}

	result := make([]billItemSplitResponse, 0, len(decoded))
	for _, entry := range decoded {
		result = append(result, parseSplitConfigEntry(entry))
	}
	return compactSplitConfigEntries(result)
}

func parseSplitConfigEntry(entry map[string]any) billItemSplitResponse {
	value := 0.0
	switch typed := entry["value"].(type) {
	case float64:
		value = typed
	case float32:
		value = float64(typed)
	case int:
		value = float64(typed)
	}

	return billItemSplitResponse{
		ParticipantID: strings.TrimSpace(anyToString(entry["participant_id"])),
		Type:          strings.TrimSpace(anyToString(entry["type"])),
		Value:         sanitizeCurrency(value),
	}
}

func compactSplitConfigEntries(entries []billItemSplitResponse) []billItemSplitResponse {
	result := make([]billItemSplitResponse, 0, len(entries))
	for _, entry := range entries {
		if entry.ParticipantID == "" {
			continue
		}
		if entry.Type != "percentage" && entry.Type != "amount" {
			continue
		}
		result = append(result, entry)
	}
	return result
}

func filterRemovedIDs(values []string, removed map[string]struct{}) []string {
	result := make([]string, 0, len(values))
	for _, value := range values {
		if _, shouldRemove := removed[value]; shouldRemove {
			continue
		}
		result = append(result, value)
	}
	return result
}

func filterRemovedSplitConfig(value any, removed map[string]struct{}) []billItemSplitResponse {
	entries := extractSplitConfigEntries(value)
	result := make([]billItemSplitResponse, 0, len(entries))
	for _, entry := range entries {
		if _, shouldRemove := removed[entry.ParticipantID]; shouldRemove {
			continue
		}
		result = append(result, entry)
	}
	return result
}

func anyToString(value any) string {
	stringValue, _ := value.(string)
	return stringValue
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}
