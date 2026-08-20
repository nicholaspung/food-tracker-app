package handlers

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/google/generative-ai-go/genai"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"

	"myapp/lib"
	_ "myapp/migrations"
	"myapp/testutil"
)

func TestReceiptScanPostDispatchOutcomesRetainMonthlyUsage(t *testing.T) {
	tests := []struct {
		name   string
		result geminiGenerationResult
	}{
		{name: "provider error", result: geminiGenerationResult{Err: errors.New("provider failed"), Model: "fake"}},
		{name: "cancellation", result: geminiGenerationResult{Err: context.Canceled, Model: "fake"}},
		{name: "empty response", result: geminiGenerationResult{Model: "fake"}},
		{name: "invalid response", result: fakeReceiptGenerationResult("not-json")},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			server := newReceiptScanTestServer(t)
			calls := 0
			restore := setReceiptScanContentGeneratorForTests(func(context.Context, *genai.Client, string, genai.Part, geminiGenerationOptions) geminiGenerationResult {
				calls++
				return test.result
			})
			t.Cleanup(restore)

			response := performReceiptScanRequest(t, server.mux, server.token, validReceiptScanJPEG(t))
			if response.Code == http.StatusOK {
				t.Fatalf("expected failed provider outcome, got 200: %s", response.Body.String())
			}
			if calls != 1 {
				t.Fatalf("expected one provider invocation, got %d", calls)
			}
			assertReceiptScanUsage(t, server.app, server.user, 1)
		})
	}
}

func TestReceiptScanSuccessRetainsUsageAndReturnsParsedBill(t *testing.T) {
	server := newReceiptScanTestServer(t)
	restore := setReceiptScanContentGeneratorForTests(func(context.Context, *genai.Client, string, genai.Part, geminiGenerationOptions) geminiGenerationResult {
		return fakeReceiptGenerationResult(`{"isReceipt":true,"restaurantName":"Test Cafe","items":[{"name":"Lunch","price":12.5,"confidence":"high"}],"finalTotal":12.5,"confidence":"high","warnings":[]}`)
	})
	t.Cleanup(restore)

	response := performReceiptScanRequest(t, server.mux, server.token, validReceiptScanJPEG(t))
	if response.Code != http.StatusOK {
		t.Fatalf("expected successful Receipt Scan, got %d: %s", response.Code, response.Body.String())
	}
	assertReceiptScanUsage(t, server.app, server.user, 1)
}

func TestReceiptScanPreDispatchValidationFailureDoesNotChargeOrInvokeProvider(t *testing.T) {
	server := newReceiptScanTestServer(t)
	calls := 0
	restore := setReceiptScanContentGeneratorForTests(func(context.Context, *genai.Client, string, genai.Part, geminiGenerationOptions) geminiGenerationResult {
		calls++
		return geminiGenerationResult{Err: errors.New("unexpected invocation")}
	})
	t.Cleanup(restore)

	response := performReceiptScanRequest(t, server.mux, server.token, []byte("not an image"))
	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected invalid upload to return 400, got %d: %s", response.Code, response.Body.String())
	}
	if calls != 0 {
		t.Fatalf("expected validation failure before provider invocation, got %d calls", calls)
	}
	assertReceiptScanUsage(t, server.app, server.user, 0)
}

func TestReceiptScanSixthBurstAttemptIsRejectedBeforeProvider(t *testing.T) {
	server := newReceiptScanTestServer(t)
	calls := 0
	restore := setReceiptScanContentGeneratorForTests(func(context.Context, *genai.Client, string, genai.Part, geminiGenerationOptions) geminiGenerationResult {
		calls++
		return geminiGenerationResult{Err: errors.New("provider failed"), Model: "fake"}
	})
	t.Cleanup(restore)
	imageData := validReceiptScanJPEG(t)

	for i := 0; i < 5; i++ {
		response := performReceiptScanRequest(t, server.mux, server.token, imageData)
		if response.Code == http.StatusTooManyRequests {
			t.Fatalf("attempt %d was rate limited early: %s", i+1, response.Body.String())
		}
	}
	sixth := performReceiptScanRequest(t, server.mux, server.token, imageData)
	if sixth.Code != http.StatusTooManyRequests {
		t.Fatalf("expected sixth attempt to return 429, got %d: %s", sixth.Code, sixth.Body.String())
	}
	if calls != 5 {
		t.Fatalf("expected rate limit before sixth provider invocation, got %d calls", calls)
	}
	assertReceiptScanUsage(t, server.app, server.user, 5)
}

func TestReceiptScanFreeUserTwentySixthDispatchIsRejected(t *testing.T) {
	server := newReceiptScanTestServer(t)
	if _, err := lib.ConsumeUsage(server.app, server.user, lib.UsageMetricReceiptScans, 25); err != nil {
		t.Fatalf("failed to seed Receipt Scan usage: %v", err)
	}
	calls := 0
	restore := setReceiptScanContentGeneratorForTests(func(context.Context, *genai.Client, string, genai.Part, geminiGenerationOptions) geminiGenerationResult {
		calls++
		return fakeReceiptGenerationResult(`{"isReceipt":true,"finalTotal":10,"confidence":"high"}`)
	})
	t.Cleanup(restore)

	response := performReceiptScanRequest(t, server.mux, server.token, validReceiptScanJPEG(t))
	if response.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 26th monthly attempt to return 429, got %d: %s", response.Code, response.Body.String())
	}
	if calls != 0 {
		t.Fatalf("expected monthly limit before provider invocation, got %d calls", calls)
	}
	assertReceiptScanUsage(t, server.app, server.user, 25)
}

func TestUsageReservationConcurrentCommitAndReleaseAdjustsAtMostOnce(t *testing.T) {
	server := newReceiptScanTestServer(t)
	if _, err := lib.ConsumeUsage(server.app, server.user, lib.UsageMetricReceiptScans, 10); err != nil {
		t.Fatalf("failed to seed Receipt Scan usage: %v", err)
	}
	reservation, err := newUsageReservation(server.app, server.user, lib.UsageMetricReceiptScans, 1)
	if err != nil {
		t.Fatalf("failed to reserve usage: %v", err)
	}

	start := make(chan struct{})
	var waitGroup sync.WaitGroup
	waitGroup.Add(21)
	go func() {
		defer waitGroup.Done()
		<-start
		reservation.Commit()
	}()
	for i := 0; i < 20; i++ {
		go func() {
			defer waitGroup.Done()
			<-start
			reservation.ReleaseIfNeeded()
		}()
	}
	close(start)
	waitGroup.Wait()

	snapshot, err := lib.GetMonthlyUsageSnapshot(server.app, server.user)
	if err != nil {
		t.Fatalf("failed to load usage snapshot: %v", err)
	}
	if snapshot.Usage.ReceiptScans < 10 || snapshot.Usage.ReceiptScans > 11 {
		t.Fatalf("expected concurrent commit/release to adjust at most once, got %d", snapshot.Usage.ReceiptScans)
	}
}

type receiptScanTestServer struct {
	app   core.App
	mux   http.Handler
	user  *core.Record
	token string
}

func newReceiptScanTestServer(t *testing.T) receiptScanTestServer {
	t.Helper()
	t.Setenv("GEMINI_API_KEY", "test-key")
	app := testutil.NewTestApp(t)
	router, err := apis.NewRouter(app)
	if err != nil {
		t.Fatalf("failed to create router: %v", err)
	}
	serveEvent := &core.ServeEvent{App: app, Router: router}
	if err := app.OnServe().Trigger(serveEvent, func(event *core.ServeEvent) error {
		RegisterMenuParsingHandlers(event, app)
		return nil
	}); err != nil {
		t.Fatalf("failed to register Receipt Scan handler: %v", err)
	}
	mux, err := router.BuildMux()
	if err != nil {
		t.Fatalf("failed to build router: %v", err)
	}

	users, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		t.Fatalf("failed to find users collection: %v", err)
	}
	user := core.NewRecord(users)
	user.Set("email", fmt.Sprintf("receipt_%d@example.com", time.Now().UnixNano()))
	user.Set("name", "Receipt Test User")
	user.Set("defaultRestaurantVisibility", "friends")
	user.Set("defaultVisitVisibility", "friends")
	user.SetVerified(true)
	user.SetPassword("password123")
	if err := app.Save(user); err != nil {
		t.Fatalf("failed to create user: %v", err)
	}
	token, err := user.NewAuthToken()
	if err != nil {
		t.Fatalf("failed to create auth token: %v", err)
	}
	return receiptScanTestServer{app: app, mux: mux, user: user, token: token}
}

func performReceiptScanRequest(t *testing.T, mux http.Handler, token string, imageData []byte) *httptest.ResponseRecorder {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("image", "receipt.jpg")
	if err != nil {
		t.Fatalf("failed to create multipart image: %v", err)
	}
	if _, err := io.Copy(part, bytes.NewReader(imageData)); err != nil {
		t.Fatalf("failed to write multipart image: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("failed to close multipart body: %v", err)
	}

	request := httptest.NewRequest(http.MethodPost, "/api/parse-receipt", &body)
	request.Header.Set("Authorization", "Bearer "+token)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	response := httptest.NewRecorder()
	mux.ServeHTTP(response, request)
	return response
}

func validReceiptScanJPEG(t *testing.T) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 2, 2))
	img.Set(0, 0, color.White)
	var output bytes.Buffer
	if err := jpeg.Encode(&output, img, nil); err != nil {
		t.Fatalf("failed to encode JPEG fixture: %v", err)
	}
	return output.Bytes()
}

func fakeReceiptGenerationResult(responseText string) geminiGenerationResult {
	return geminiGenerationResult{
		Response: &genai.GenerateContentResponse{Candidates: []*genai.Candidate{{Content: &genai.Content{Parts: []genai.Part{genai.Text(responseText)}}}}},
		Model:    "fake",
		Attempts: []geminiGenerationAttempt{{Model: "fake", Status: "success"}},
	}
}

func assertReceiptScanUsage(t *testing.T, app core.App, user *core.Record, expected int) {
	t.Helper()
	snapshot, err := lib.GetMonthlyUsageSnapshot(app, user)
	if err != nil {
		t.Fatalf("failed to load usage snapshot: %v", err)
	}
	if snapshot.Usage.ReceiptScans != expected {
		t.Fatalf("expected Receipt Scan usage=%d, got %d", expected, snapshot.Usage.ReceiptScans)
	}
}
