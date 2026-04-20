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
)

const (
	visitLocalDateFieldName = "visitLocalDate"
	visitLocalDateLayout    = "2006-01-02"
)

type visitCreateRequest struct {
	RestaurantID   string                  `json:"restaurantId"`
	RestaurantName string                  `json:"restaurantName"`
	Items          []visitItemWriteRequest `json:"items"`
	VisitedAt      string                  `json:"visitedAt"`
	VisitedOn      string                  `json:"visitedOn"`
	Visibility     string                  `json:"visibility"`
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
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Rating      float64 `json:"rating"`
	Description string  `json:"description"`
	Notes       string  `json:"notes"`
}

type visitItemResponse struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Rating      float64 `json:"rating"`
	Description string  `json:"description,omitempty"`
	Notes       string  `json:"notes,omitempty"`
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
	ID                    string   `json:"id"`
	Name                  string   `json:"name"`
	UserID                string   `json:"userId,omitempty"`
	FriendshipID          string   `json:"friendshipId,omitempty"`
	AmountOwed            float64  `json:"amountOwed"`
	CustomTipContribution *float64 `json:"customTipContribution,omitempty"`
	PaidStatus            string   `json:"paidStatus"`
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

	se.Router.POST("/api/bills", func(e *core.RequestEvent) error {
		if e.Auth == nil {
			return apis.NewUnauthorizedError("authentication required", nil)
		}

		requestBody := billCreateRequest{}
		if err := e.BindBody(&requestBody); err != nil {
			return apis.NewBadRequestError("invalid request body", err)
		}

		var responsePayload billResponse
		if err := app.RunInTransaction(func(txApp core.App) error {
			billRecord, err := createBillTransaction(txApp, e.Auth, requestBody)
			if err != nil {
				return err
			}

			responsePayload, err = buildBillResponse(txApp, billRecord, e.Auth.Id)
			if err != nil {
				return apis.NewApiError(500, "failed to load created bill", err)
			}

			return nil
		}); err != nil {
			return err
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
		if err := app.RunInTransaction(func(txApp core.App) error {
			billRecord, err := updateBillTransaction(txApp, e.Auth, billID, requestBody)
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

	restaurantRecord, err := resolveRestaurantForWrite(app, authRecord, restaurantResolveInput{
		RestaurantID:   requestBody.RestaurantID,
		RestaurantName: requestBody.RestaurantName,
	})
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

	createdItemIDs, err := appendVisitItems(app, authRecord.Id, visitRecord.Id, requestBody.Items)
	if err != nil {
		return result, err
	}

	result.VisitRecord = visitRecord
	result.PrioritizedItemIDs = createdItemIDs
	return result, nil
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
		if err := syncVisitItems(app, authRecord.Id, visitID, existingItems, *requestBody.Items); err != nil {
			return nil, err
		}
	}

	return visitRecord, nil
}

func appendVisitItems(
	app core.App,
	userID string,
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

		createdItem := core.NewRecord(foodItemsCollection)
		createdItem.Set("name", trimmedName)
		createdItem.Set("rating", item.Rating)
		createdItem.Set("description", emptyStringToNil(description))
		createdItem.Set("notes", emptyStringToNil(notes))
		createdItem.Set("visit", visitID)
		createdItem.Set("user", userID)
		createdItem.Set("itemType", foodItemTypeVisitItem)
		if err := app.Save(createdItem); err != nil {
			return nil, apis.NewApiError(500, "failed to create visit item", err)
		}

		createdItemIDs = append(createdItemIDs, createdItem.Id)
	}

	return createdItemIDs, nil
}

func syncVisitItems(
	app core.App,
	userID string,
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

		if existingItem, ok := existingItemsByID[item.ID]; ok {
			existingItem.Set("name", trimmedName)
			existingItem.Set("rating", item.Rating)
			existingItem.Set("description", description)
			existingItem.Set("notes", notes)
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
		createdItem.Set("user", userID)
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
	responseItems := make([]visitItemResponse, 0, len(items))
	for _, item := range items {
		if !canAccessFoodItemRecord(item, visitsByID, viewerUserID, isAdmin, acceptedFriendIDs) {
			continue
		}

		responseItems = append(responseItems, visitItemResponse{
			ID:          item.Id,
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

		responseParticipants = append(responseParticipants, billParticipantResponse{
			ID:                    participant.Id,
			Name:                  name,
			UserID:                userID,
			FriendshipID:          friendshipIDsByUserID[userID],
			AmountOwed:            sanitizeCurrency(participant.GetFloat("amount_owed")),
			CustomTipContribution: sanitizeOptionalCurrencyResponse(participant.Get("custom_tip_contribution")),
			PaidStatus:            normalizePaidStatus(participant.GetString("paid_status")),
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

func canAccessVisitRecord(
	record *core.Record,
	userID string,
	isAdmin bool,
	acceptedFriendIDs map[string]struct{},
) bool {
	if record == nil {
		return false
	}

	if isAdmin {
		return true
	}

	ownerID := strings.TrimSpace(record.GetString("user"))
	status := record.GetString("moderationStatus")
	if ownerID == userID {
		return isOwnerAccessibleModerationStatus(status)
	}

	if !isVisibleModerationStatus(status) {
		return false
	}

	switch strings.TrimSpace(record.GetString("visibility")) {
	case "public":
		return true
	case "friends":
		return hasAcceptedFriend(acceptedFriendIDs, ownerID)
	default:
		return false
	}
}

func listBillParticipants(app core.App, billID string) ([]*core.Record, error) {
	return app.FindRecordsByFilter("bill_participants", "bill = {:billId}", "created", 200, 0, dbx.Params{
		"billId": billID,
	})
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
