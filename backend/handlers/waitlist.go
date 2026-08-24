package handlers

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"fmt"
	"log"
	"net/mail"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/mailer"
	"github.com/pocketbase/pocketbase/tools/security"

	"myapp/lib"
)

const (
	WaitlistStatusPending  = "pending"
	WaitlistStatusApproved = "approved"
	WaitlistStatusRejected = "rejected"
	WaitlistStatusSignedUp = "signed_up"

	WaitlistJoinedEventName   = "waitlist_joined"
	WaitlistApprovedEventName = "waitlist_approved"
	WaitlistRejectedEventName = "waitlist_rejected"
	AccountCreatedEventName   = "account_created"

	waitlistApprovalTokenType     = "waitlist_approval"
	waitlistApprovalTokenDuration = 14 * 24 * time.Hour
	waitlistWorkerShutdownTimeout = 2 * time.Second
	waitlistJoinTransitionsName   = "waitlist_join_transitions"
	waitlistWorkerBatchSize       = 500
	// Loops only deduplicates event idempotency keys for 24 hours. Stop
	// automatic retries an hour earlier so a request cannot cross that bound.
	waitlistLoopsSafeRetryWindow = 23 * time.Hour
)

type waitlistRequest struct {
	Email  string `json:"email"`
	Source string `json:"source"`
}

type waitlistUpsertResult struct {
	PreviousStatus        string
	CurrentStatus         string
	DidTransition         bool
	ShouldSendJoinedEmail bool
}

type waitlistLoopsClient interface {
	UpsertContact(input lib.LoopsContactInput) (string, error)
	SendEvent(input lib.LoopsEventInput) error
}

type waitlistJoinWorker struct {
	app              core.App
	runtimeResources lib.RuntimeResources
	wake             chan struct{}
	stop             chan struct{}
	done             chan struct{}
	stopOnce         sync.Once
	newLoopsClient   func() waitlistLoopsClient
	workBatchSize    int
}

type WaitlistEntry struct {
	ID                   string
	Email                string
	Status               string
	Source               string
	ApprovedAt           string
	ApprovedBy           string
	RejectedAt           string
	RejectedBy           string
	SignedUpAt           string
	SignedUpUser         string
	LoopsContactID       string
	LastLoopsSyncError   string
	JoinedEmailSentAt    string
	LastJoinedEmailError string
	Created              string
	Updated              string
}

func RegisterWaitlistHandlers(se *core.ServeEvent, app core.App, runtimeResources lib.RuntimeResources) {
	joinWorker := newWaitlistJoinWorker(app, runtimeResources)

	se.Router.POST("/api/waitlist", func(e *core.RequestEvent) error {
		var requestBody waitlistRequest
		if err := e.BindBody(&requestBody); err != nil {
			return apis.NewBadRequestError("invalid request body", err)
		}

		email, err := normalizeEmail(requestBody.Email)
		if err != nil {
			return apis.NewBadRequestError(err.Error(), nil)
		}
		_, err = upsertWaitlistEntry(app, requestBody, email)
		if err != nil {
			log.Printf("Waitlist upsert failed for %s: %v", email, err)
			return apis.NewApiError(500, "failed to join waitlist", err)
		}
		joinWorker.Wake()

		return e.JSON(200, map[string]any{
			"success": true,
		})
	})

	se.Router.GET("/api/admin/waitlist", func(e *core.RequestEvent) error {
		if err := requireAdmin(e); err != nil {
			return err
		}

		entries, page, pageSize, totalItems, totalPages, err := listWaitlistEntries(app, e.Request.URL.Query())
		if err != nil {
			log.Printf("Admin waitlist load failed: %v", err)
			return apis.NewApiError(500, "failed to load waitlist", err)
		}

		items := make([]map[string]any, 0, len(entries))
		for _, entry := range entries {
			items = append(items, serializeWaitlistRecord(entry))
		}

		return e.JSON(200, map[string]any{
			"items":      items,
			"page":       page,
			"pageSize":   pageSize,
			"totalItems": totalItems,
			"totalPages": totalPages,
		})
	})

	se.Router.POST("/api/admin/waitlist/{entryId}/approve", func(e *core.RequestEvent) error {
		if err := requireAdmin(e); err != nil {
			return err
		}

		var record *core.Record
		err := app.RunInTransaction(func(txApp core.App) error {
			updated, beforeSnapshot, updateErr := updateWaitlistDecision(txApp, e.Request.PathValue("entryId"), WaitlistStatusApproved, e.Auth.Id)
			if updateErr != nil {
				return updateErr
			}
			record = updated

			return createAdminRecordAuditLog(
				txApp,
				e,
				record,
				core.ModelEventTypeUpdate,
				beforeSnapshot,
				lib.RecordAuditSnapshot(record),
				map[string]any{"source": "admin_waitlist_decision", "decision": WaitlistStatusApproved},
				fmt.Sprintf("Approved waitlist entry for %s", record.GetString("email")),
			)
		})
		if err != nil {
			return err
		}

		if err := sendWaitlistApprovalEmail(app, runtimeResources, record); err != nil {
			log.Printf("Waitlist approval email failed for %s: %v", record.GetString("email"), err)
		}

		return e.JSON(200, serializeWaitlistRecord(record))
	})

	se.Router.POST("/api/admin/waitlist/{entryId}/reject", func(e *core.RequestEvent) error {
		if err := requireAdmin(e); err != nil {
			return err
		}

		var record *core.Record
		err := app.RunInTransaction(func(txApp core.App) error {
			updated, beforeSnapshot, updateErr := updateWaitlistDecision(txApp, e.Request.PathValue("entryId"), WaitlistStatusRejected, e.Auth.Id)
			if updateErr != nil {
				return updateErr
			}
			record = updated

			return createAdminRecordAuditLog(
				txApp,
				e,
				record,
				core.ModelEventTypeUpdate,
				beforeSnapshot,
				lib.RecordAuditSnapshot(record),
				map[string]any{"source": "admin_waitlist_decision", "decision": WaitlistStatusRejected},
				fmt.Sprintf("Rejected waitlist entry for %s", record.GetString("email")),
			)
		})
		if err != nil {
			return err
		}

		if err := syncWaitlistRejectedToLoops(app, runtimeResources, record); err != nil {
			log.Printf("Loops waitlist rejection sync failed for %s: %v", record.GetString("email"), err)
		}

		return e.JSON(200, serializeWaitlistRecord(record))
	})
}

func newWaitlistJoinWorker(app core.App, runtimeResources lib.RuntimeResources) *waitlistJoinWorker {
	worker := &waitlistJoinWorker{
		app:              app,
		runtimeResources: runtimeResources,
		wake:             make(chan struct{}, 1),
		stop:             make(chan struct{}),
		done:             make(chan struct{}),
		workBatchSize:    waitlistWorkerBatchSize,
		newLoopsClient: func() waitlistLoopsClient {
			return lib.NewLoopsClientFromEnv()
		},
	}

	go worker.run()
	app.OnTerminate().BindFunc(func(e *core.TerminateEvent) error {
		worker.stopOnce.Do(func() {
			close(worker.stop)
		})
		select {
		case <-worker.done:
		case <-time.After(waitlistWorkerShutdownTimeout):
			log.Printf("Waitlist join worker did not stop within %s; pending work will resume on startup", waitlistWorkerShutdownTimeout)
		}
		return e.Next()
	})
	worker.Wake()

	return worker
}

func (w *waitlistJoinWorker) Wake() {
	select {
	case w.wake <- struct{}{}:
	default:
	}
}

func (w *waitlistJoinWorker) run() {
	defer close(w.done)

	for {
		select {
		case <-w.stop:
			return
		case <-w.wake:
			w.drain()
		}
	}
}

func (w *waitlistJoinWorker) drain() {
	w.drainLoopsTransitions()
	if !w.isStopping() {
		w.drainJoinedEmails()
	}
}

func (w *waitlistJoinWorker) isStopping() bool {
	select {
	case <-w.stop:
		return true
	default:
		return false
	}
}

func (w *waitlistJoinWorker) drainLoopsTransitions() {
	blockedEntries := map[string]bool{}
	cursorCreated := ""
	cursorID := ""
	for {
		transitions, err := findPendingWaitlistTransitionsPage(w.app, cursorCreated, cursorID, w.batchSize())
		if err != nil {
			log.Printf("Waitlist Loops queue load failed: %v", err)
			return
		}
		if len(transitions) == 0 {
			return
		}

		for _, transition := range transitions {
			if w.isStopping() {
				return
			}
			entryID := transition.GetString("waitlistEntry")
			if blockedEntries[entryID] {
				continue
			}
			if !w.processLoopsTransition(transition) {
				blockedEntries[entryID] = true
			}
		}

		last := transitions[len(transitions)-1]
		cursorCreated = last.GetString("created")
		cursorID = last.Id
	}
}

func findPendingWaitlistTransitionsPage(app core.App, cursorCreated string, cursorID string, limit int) ([]*core.Record, error) {
	filter := "(contactSyncPending = true || joinedEventPending = true)"
	params := dbx.Params{}
	if cursorCreated != "" {
		filter += " && (created > {:cursorCreated} || (created = {:cursorCreated} && id > {:cursorID}))"
		params["cursorCreated"] = cursorCreated
		params["cursorID"] = cursorID
	}
	return app.FindRecordsByFilter(waitlistJoinTransitionsName, filter, "created,id", limit, 0, params)
}

func (w *waitlistJoinWorker) processLoopsTransition(transition *core.Record) bool {
	record, err := w.app.FindRecordById("waitlist_entries", transition.GetString("waitlistEntry"))
	if err != nil {
		log.Printf("Waitlist transition %s entry load failed: %v", transition.Id, err)
		return false
	}

	email := record.GetString("email")
	client := w.newLoopsClient()
	if transition.GetBool("contactSyncPending") {
		contactID, err := syncWaitlistContactToLoops(w.runtimeResources, client, record)
		if w.isStopping() {
			return false
		}
		if err != nil {
			log.Printf("Loops waitlist sync failed for %s: %v", email, err)
			if saveErr := updateWaitlistTransitionError(w.app, transition.Id, record.Id, err.Error()); saveErr != nil {
				log.Printf("Loops waitlist sync error state save failed for %s: %v", email, saveErr)
			}
			return false
		}
		if saveErr := completeWaitlistLoopsContactSync(w.app, transition.Id, record.Id, contactID); saveErr != nil {
			log.Printf("Loops waitlist sync state save failed for %s: %v", email, saveErr)
			return false
		}
	}

	if transition.GetBool("joinedEventPending") {
		attemptedAt := transition.GetDateTime("joinedEventAttemptedAt")
		if !attemptedAt.IsZero() && !time.Now().UTC().Before(attemptedAt.Time().Add(waitlistLoopsSafeRetryWindow)) {
			lastError := "Loops waitlist joined event delivery is uncertain beyond the safe idempotency retry window; manual reconciliation is required"
			if saveErr := abandonWaitlistJoinedEvent(w.app, transition.Id, record.Id, lastError); saveErr != nil {
				log.Printf("Loops waitlist event reconciliation state save failed for %s: %v", email, saveErr)
				return false
			}
			return true
		}
		if attemptedAt.IsZero() {
			attemptedAtValue := time.Now().UTC().Format("2006-01-02 15:04:05.000Z")
			if saveErr := recordWaitlistJoinedEventAttempt(w.app, transition.Id, attemptedAtValue); saveErr != nil {
				log.Printf("Loops waitlist event attempt state save failed for %s: %v", email, saveErr)
				return false
			}
			transition.Set("joinedEventAttemptedAt", attemptedAtValue)
		}
		if err := sendWaitlistJoinedEventToLoops(w.runtimeResources, client, record, transition); err != nil {
			log.Printf("Loops waitlist joined event failed for %s: %v", email, err)
			if saveErr := updateWaitlistTransitionError(w.app, transition.Id, record.Id, err.Error()); saveErr != nil {
				log.Printf("Loops waitlist event error state save failed for %s: %v", email, saveErr)
			}
			return false
		}
		if saveErr := completeWaitlistJoinedEvent(w.app, transition.Id, record.Id); saveErr != nil {
			log.Printf("Loops waitlist event state save failed for %s: %v", email, saveErr)
			return false
		}
	}

	return true
}

func recordWaitlistJoinedEventAttempt(app core.App, transitionID string, attemptedAt string) error {
	_, err := app.DB().NewQuery(`
		UPDATE waitlist_join_transitions
		SET joinedEventAttemptedAt = CASE
			WHEN TRIM(COALESCE(joinedEventAttemptedAt, '')) = '' THEN {:attemptedAt}
			ELSE joinedEventAttemptedAt
		END
		WHERE id = {:transitionID}
	`).Bind(dbx.Params{
		"attemptedAt":  attemptedAt,
		"transitionID": transitionID,
	}).Execute()
	return err
}

func abandonWaitlistJoinedEvent(app core.App, transitionID string, recordID string, lastError string) error {
	return app.RunInTransaction(func(txApp core.App) error {
		_, err := txApp.DB().NewQuery(`
			UPDATE waitlist_join_transitions
			SET joinedEventPending = FALSE,
				lastError = {:lastError}
			WHERE id = {:transitionID}
		`).Bind(dbx.Params{
			"lastError":    lastError,
			"transitionID": transitionID,
		}).Execute()
		if err != nil {
			return err
		}

		_, err = txApp.DB().NewQuery(`
			UPDATE waitlist_entries
			SET lastLoopsSyncError = {:lastError}
			WHERE id = {:recordID}
		`).Bind(dbx.Params{
			"lastError": lastError,
			"recordID":  recordID,
		}).Execute()
		return err
	})
}

func (w *waitlistJoinWorker) drainJoinedEmails() {
	cursorCreated := ""
	cursorID := ""
	for {
		records, err := findPendingWaitlistJoinedEmailsPage(w.app, cursorCreated, cursorID, w.batchSize())
		if err != nil {
			log.Printf("Waitlist joined email queue load failed: %v", err)
			return
		}
		if len(records) == 0 {
			return
		}

		for _, record := range records {
			if w.isStopping() {
				return
			}
			email := record.GetString("email")
			if err := sendWaitlistJoinedEmail(w.app, w.runtimeResources, record); err != nil {
				log.Printf("Waitlist joined email failed for %s: %v", email, err)
				if saveErr := updateWaitlistJoinedEmailState(w.app, record.Id, "", err.Error()); saveErr != nil {
					log.Printf("Waitlist joined email error state save failed for %s: %v", email, saveErr)
				}
				continue
			}

			sentAt := time.Now().UTC().Format("2006-01-02 15:04:05.000Z")
			if err := updateWaitlistJoinedEmailState(w.app, record.Id, sentAt, ""); err != nil {
				log.Printf("Waitlist joined email sent state save failed for %s: %v", email, err)
			}
		}

		last := records[len(records)-1]
		cursorCreated = last.GetString("created")
		cursorID = last.Id
	}
}

func findPendingWaitlistJoinedEmailsPage(app core.App, cursorCreated string, cursorID string, limit int) ([]*core.Record, error) {
	filter := "status = {:status} && joinedEmailSentAt = '' && lastJoinedEmailError = ''"
	params := dbx.Params{"status": WaitlistStatusPending}
	if cursorCreated != "" {
		filter += " && (created > {:cursorCreated} || (created = {:cursorCreated} && id > {:cursorID}))"
		params["cursorCreated"] = cursorCreated
		params["cursorID"] = cursorID
	}
	return app.FindRecordsByFilter("waitlist_entries", filter, "created,id", limit, 0, params)
}

func (w *waitlistJoinWorker) batchSize() int {
	if w.workBatchSize > 0 {
		return w.workBatchSize
	}
	return waitlistWorkerBatchSize
}

func completeWaitlistLoopsContactSync(app core.App, transitionID string, recordID string, contactID string) error {
	return app.RunInTransaction(func(txApp core.App) error {
		_, err := txApp.DB().NewQuery(`
			UPDATE waitlist_join_transitions
			SET contactSyncPending = FALSE, lastError = ''
			WHERE id = {:transitionID}
		`).Bind(dbx.Params{"transitionID": transitionID}).Execute()
		if err != nil {
			return err
		}

		_, err = txApp.DB().NewQuery(`
			UPDATE waitlist_entries
			SET lastLoopsSyncError = '',
				loopsContactId = CASE
					WHEN TRIM({:contactID}) != '' THEN {:contactID}
					ELSE loopsContactId
				END
			WHERE id = {:recordID}
		`).Bind(dbx.Params{
			"contactID": contactID,
			"recordID":  recordID,
		}).Execute()
		return err
	})
}

func completeWaitlistJoinedEvent(app core.App, transitionID string, recordID string) error {
	return app.RunInTransaction(func(txApp core.App) error {
		_, err := txApp.DB().NewQuery(`
			UPDATE waitlist_join_transitions
			SET joinedEventPending = FALSE,
				joinedEventSentAt = {:sentAt},
				lastError = ''
			WHERE id = {:transitionID}
		`).Bind(dbx.Params{
			"sentAt":       time.Now().UTC().Format("2006-01-02 15:04:05.000Z"),
			"transitionID": transitionID,
		}).Execute()
		if err != nil {
			return err
		}

		_, err = txApp.DB().NewQuery(`
			UPDATE waitlist_entries
			SET lastLoopsSyncError = ''
			WHERE id = {:recordID}
		`).Bind(dbx.Params{"recordID": recordID}).Execute()
		return err
	})
}

func updateWaitlistTransitionError(app core.App, transitionID string, recordID string, lastError string) error {
	return app.RunInTransaction(func(txApp core.App) error {
		_, err := txApp.DB().NewQuery(`
			UPDATE waitlist_join_transitions
			SET lastError = {:lastError}
			WHERE id = {:transitionID}
		`).Bind(dbx.Params{
			"lastError":    lastError,
			"transitionID": transitionID,
		}).Execute()
		if err != nil {
			return err
		}

		_, err = txApp.DB().NewQuery(`
			UPDATE waitlist_entries
			SET lastLoopsSyncError = {:lastError}
			WHERE id = {:recordID}
		`).Bind(dbx.Params{
			"lastError": lastError,
			"recordID":  recordID,
		}).Execute()
		return err
	})
}

func updateWaitlistJoinedEmailState(app core.App, recordID string, sentAt string, lastError string) error {
	_, err := app.DB().NewQuery(`
		UPDATE waitlist_entries
		SET joinedEmailSentAt = {:sentAt}, lastJoinedEmailError = {:lastError}
		WHERE id = {:id}
	`).Bind(dbx.Params{
		"id":        recordID,
		"sentAt":    sentAt,
		"lastError": lastError,
	}).Execute()
	return err
}

func GenerateWaitlistApprovalToken(app core.App, record *core.Record) (string, error) {
	return generateWaitlistApprovalToken(app, record, waitlistApprovalTokenDuration)
}

func generateWaitlistApprovalToken(app core.App, record *core.Record, duration time.Duration) (string, error) {
	if record == nil {
		return "", fmt.Errorf("waitlist entry is required")
	}
	if duration <= 0 {
		return "", fmt.Errorf("waitlist approval token duration must be positive")
	}

	email, err := normalizeEmail(record.GetString("email"))
	if err != nil {
		return "", err
	}
	if record.GetString("status") != WaitlistStatusApproved {
		return "", fmt.Errorf("waitlist entry is not approved")
	}

	nonce := security.RandomString(32)
	token, err := security.NewJWT(map[string]any{
		"type":    waitlistApprovalTokenType,
		"entryId": record.Id,
		"email":   email,
		"nonce":   nonce,
	}, waitlistApprovalSigningKey(app), duration)
	if err != nil {
		return "", err
	}

	now := time.Now().UTC()
	record.Set("approvalTokenNonceHash", hashWaitlistApprovalNonce(nonce))
	record.Set("approvalTokenIssuedAt", now)
	record.Set("approvalTokenExpiresAt", now.Add(duration))
	record.Set("approvalTokenUsedAt", "")
	if err := app.Save(record); err != nil {
		return "", err
	}

	return token, nil
}

func ValidateAndReserveWaitlistApprovalToken(app core.App, email string, rawToken string) (*core.Record, error) {
	normalizedEmail, err := normalizeEmail(email)
	if err != nil {
		return nil, err
	}

	token := strings.TrimSpace(rawToken)
	if token == "" {
		return nil, fmt.Errorf("waitlist approval token is required")
	}

	claims, err := security.ParseJWT(token, waitlistApprovalSigningKey(app))
	if err != nil {
		return nil, fmt.Errorf("waitlist approval token is invalid or expired")
	}

	if claimString(claims["type"]) != waitlistApprovalTokenType {
		return nil, fmt.Errorf("waitlist approval token is invalid")
	}
	if claimString(claims["email"]) != normalizedEmail {
		return nil, fmt.Errorf("waitlist approval token email mismatch")
	}

	entryID := claimString(claims["entryId"])
	nonce := claimString(claims["nonce"])
	if entryID == "" || nonce == "" {
		return nil, fmt.Errorf("waitlist approval token is invalid")
	}

	nonceHash := hashWaitlistApprovalNonce(nonce)
	record, err := app.FindRecordById("waitlist_entries", entryID)
	if err != nil {
		return nil, fmt.Errorf("waitlist approval token is invalid")
	}
	recordEmail, err := normalizeEmail(record.GetString("email"))
	if err != nil {
		return nil, err
	}
	if recordEmail != normalizedEmail ||
		record.GetString("status") != WaitlistStatusApproved ||
		record.GetString("approvalTokenNonceHash") != nonceHash ||
		strings.TrimSpace(record.GetString("approvalTokenUsedAt")) != "" {
		return nil, fmt.Errorf("waitlist approval token is invalid or already used")
	}

	result, err := app.DB().NewQuery(`
		UPDATE waitlist_entries
		SET approvalTokenUsedAt = {:usedAt}
		WHERE id = {:id}
			AND status = {:status}
			AND approvalTokenNonceHash = {:nonceHash}
			AND TRIM(COALESCE(approvalTokenUsedAt, '')) = ''
	`).
		Bind(dbx.Params{
			"id":        entryID,
			"status":    WaitlistStatusApproved,
			"nonceHash": nonceHash,
			"usedAt":    time.Now().UTC().Format("2006-01-02 15:04:05.000Z"),
		}).
		Execute()
	if err != nil {
		return nil, fmt.Errorf("failed to reserve waitlist approval token: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return nil, fmt.Errorf("failed to confirm waitlist approval token reservation: %w", err)
	}
	if rowsAffected == 0 {
		return nil, fmt.Errorf("waitlist approval token is invalid or already used")
	}

	return app.FindRecordById("waitlist_entries", entryID)
}

func ReleaseWaitlistApprovalTokenReservation(app core.App, entry *core.Record) error {
	if entry == nil || entry.Id == "" {
		return nil
	}

	_, err := app.DB().NewQuery(`
		UPDATE waitlist_entries
		SET approvalTokenUsedAt = ''
		WHERE id = {:id}
			AND status = {:status}
			AND TRIM(COALESCE(signedUpUser, '')) = ''
	`).
		Bind(dbx.Params{
			"id":     entry.Id,
			"status": WaitlistStatusApproved,
		}).
		Execute()
	if err != nil {
		return fmt.Errorf("failed to release waitlist approval token reservation: %w", err)
	}

	return nil
}

func MarkWaitlistEntrySignedUp(app core.App, runtimeResources lib.RuntimeResources, entry *core.Record, user *core.Record) error {
	if entry == nil || user == nil {
		return nil
	}

	now := time.Now().UTC()
	entry.Set("status", WaitlistStatusSignedUp)
	entry.Set("signedUpAt", now)
	entry.Set("signedUpUser", user.Id)
	entry.Set("lastLoopsSyncError", "")
	if err := app.Save(entry); err != nil {
		return err
	}

	client := lib.NewLoopsClientFromEnv()
	contactID, err := client.UpsertContact(lib.LoopsContactInput{
		Email:     entry.GetString("email"),
		FirstName: user.GetString("name"),
		UserID:    user.Id,
		Source:    waitlistDefaultString(strings.TrimSpace(entry.GetString("source")), "mobile_signup"),
		Properties: map[string]any{
			"waitlistStatus":   WaitlistStatusSignedUp,
			"accountCreatedAt": now.Format(time.RFC3339),
			"appEnvironment":   string(runtimeResources.Environment),
		},
	})
	if err != nil {
		entry.Set("lastLoopsSyncError", err.Error())
		_ = app.Save(entry)
		return nil
	}
	if strings.TrimSpace(contactID) != "" {
		entry.Set("loopsContactId", contactID)
		_ = app.Save(entry)
	}

	if err := client.SendEvent(lib.LoopsEventInput{
		Email:     entry.GetString("email"),
		UserID:    user.Id,
		EventName: AccountCreatedEventName,
		EventProperties: map[string]any{
			"userId":           user.Id,
			"appEnvironment":   string(runtimeResources.Environment),
			"accountCreatedAt": now.Format(time.RFC3339),
		},
	}); err != nil {
		entry.Set("lastLoopsSyncError", err.Error())
		_ = app.Save(entry)
	}

	return nil
}

func normalizeEmail(raw string) (string, error) {
	email := strings.ToLower(strings.TrimSpace(raw))
	if email == "" {
		return "", fmt.Errorf("email is required")
	}
	if len(email) > 320 {
		return "", fmt.Errorf("email is invalid")
	}
	address, err := mail.ParseAddress(email)
	if err != nil || strings.ToLower(strings.TrimSpace(address.Address)) != email {
		return "", fmt.Errorf("email is invalid")
	}

	return email, nil
}

func upsertWaitlistEntry(app core.App, requestBody waitlistRequest, email string) (waitlistUpsertResult, error) {
	result := waitlistUpsertResult{}
	err := app.RunInTransaction(func(txApp core.App) error {
		var upsertErr error
		result, upsertErr = upsertWaitlistEntryInTransaction(txApp, requestBody, email)
		return upsertErr
	})
	return result, err
}

func upsertWaitlistEntryInTransaction(app core.App, requestBody waitlistRequest, email string) (waitlistUpsertResult, error) {
	collection, err := app.FindCollectionByNameOrId("waitlist_entries")
	if err != nil {
		return waitlistUpsertResult{}, err
	}

	record, err := findWaitlistRecordByEmail(app, email)
	if err != nil {
		return waitlistUpsertResult{}, err
	}
	result := waitlistUpsertResult{}
	if record == nil {
		record = core.NewRecord(collection)
		record.Set("email", email)
		record.Set("status", WaitlistStatusPending)
		result.CurrentStatus = WaitlistStatusPending
		result.DidTransition = true
		result.ShouldSendJoinedEmail = true
	} else if record.GetString("status") == WaitlistStatusRejected {
		result.PreviousStatus = WaitlistStatusRejected
		result.CurrentStatus = WaitlistStatusPending
		result.DidTransition = true
		result.ShouldSendJoinedEmail = true
		record.Set("status", WaitlistStatusPending)
		record.Set("rejectedAt", "")
		record.Set("rejectedBy", "")
		record.Set("joinedEmailSentAt", "")
	} else {
		result.PreviousStatus = record.GetString("status")
		result.CurrentStatus = result.PreviousStatus
		if result.CurrentStatus == WaitlistStatusPending && strings.TrimSpace(record.GetString("joinedEmailSentAt")) == "" {
			result.ShouldSendJoinedEmail = true
			if strings.TrimSpace(record.GetString("lastJoinedEmailError")) != "" {
				if err := updateWaitlistJoinedEmailState(app, record.Id, "", ""); err != nil {
					return waitlistUpsertResult{}, err
				}
			}
		}
		return result, nil
	}

	record.Set("lastJoinedEmailError", "")
	record.Set("source", waitlistDefaultString(strings.TrimSpace(requestBody.Source), "mobile_signup"))
	record.Set("lastLoopsSyncError", "")

	if err := app.Save(record); err != nil {
		return waitlistUpsertResult{}, err
	}
	if err := createWaitlistJoinTransition(app, record, result); err != nil {
		return waitlistUpsertResult{}, err
	}

	return result, nil
}

func createWaitlistJoinTransition(app core.App, record *core.Record, result waitlistUpsertResult) error {
	collection, err := app.FindCollectionByNameOrId(waitlistJoinTransitionsName)
	if err != nil {
		return err
	}

	transition := core.NewRecord(collection)
	transition.Set("waitlistEntry", record.Id)
	transition.Set("previousStatus", result.PreviousStatus)
	transition.Set("currentStatus", result.CurrentStatus)
	transition.Set("source", record.GetString("source"))
	transition.Set("contactSyncPending", true)
	transition.Set("joinedEventPending", true)
	transition.Set("idempotencyKey", security.RandomString(32))
	return app.Save(transition)
}

func findWaitlistRecordByEmail(app core.App, email string) (*core.Record, error) {
	type row struct {
		ID string `db:"id"`
	}

	result := row{}
	err := app.DB().NewQuery(`
		SELECT id
		FROM waitlist_entries
		WHERE LOWER(TRIM(COALESCE(email, ''))) = {:email}
		ORDER BY created DESC
		LIMIT 1
	`).
		Bind(dbx.Params{"email": strings.ToLower(strings.TrimSpace(email))}).
		One(&result)
	if errorsIsNoRows(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	return app.FindRecordById("waitlist_entries", result.ID)
}

func listWaitlistEntries(app core.App, query url.Values) ([]*core.Record, int, int, int, int, error) {
	status := strings.TrimSpace(query.Get("status"))
	search := strings.ToLower(strings.TrimSpace(query.Get("search")))
	page := parsePositiveInt(query.Get("page"), 1)
	pageSize := parsePositiveInt(query.Get("pageSize"), 50)
	if pageSize > 100 {
		pageSize = 100
	}

	params := dbx.Params{
		"limit":  pageSize,
		"offset": (page - 1) * pageSize,
	}
	where := []string{}
	if status != "" && status != "all" {
		where = append(where, "status = {:status}")
		params["status"] = status
	}
	if search != "" {
		where = append(where, "LOWER(email) LIKE {:search}")
		params["search"] = "%" + search + "%"
	}

	whereSQL := ""
	if len(where) > 0 {
		whereSQL = "WHERE " + strings.Join(where, " AND ")
	}

	var countRow struct {
		Total int `db:"total"`
	}
	if err := app.DB().NewQuery("SELECT COUNT(*) AS total FROM waitlist_entries " + whereSQL).
		Bind(params).
		One(&countRow); err != nil {
		return nil, page, pageSize, 0, 0, err
	}

	type idRow struct {
		ID string `db:"id"`
	}
	rows := []idRow{}
	if err := app.DB().NewQuery(`
		SELECT id
		FROM waitlist_entries
		` + whereSQL + `
		ORDER BY created DESC
		LIMIT {:limit} OFFSET {:offset}
	`).
		Bind(params).
		All(&rows); err != nil {
		return nil, page, pageSize, 0, 0, err
	}

	ids := make([]string, 0, len(rows))
	for _, row := range rows {
		ids = append(ids, row.ID)
	}

	records, err := findRecordsByIDs(app, "waitlist_entries", ids)
	if err != nil {
		return nil, page, pageSize, 0, 0, err
	}
	recordsByID := mapRecordsByID(records)
	ordered := make([]*core.Record, 0, len(ids))
	for _, id := range ids {
		if record := recordsByID[id]; record != nil {
			ordered = append(ordered, record)
		}
	}

	totalPages := 0
	if countRow.Total > 0 {
		totalPages = (countRow.Total + pageSize - 1) / pageSize
	}

	return ordered, page, pageSize, countRow.Total, totalPages, nil
}

func updateWaitlistDecision(app core.App, entryID string, status string, adminID string) (*core.Record, map[string]any, error) {
	entryID = strings.TrimSpace(entryID)
	if entryID == "" {
		return nil, nil, apis.NewBadRequestError("entryId is required", nil)
	}

	record, err := app.FindRecordById("waitlist_entries", entryID)
	if err != nil {
		return nil, nil, apis.NewNotFoundError("waitlist entry not found", err)
	}

	beforeSnapshot := lib.RecordAuditSnapshot(record)
	now := time.Now().UTC()
	record.Set("status", status)
	record.Set("lastLoopsSyncError", "")
	if status == WaitlistStatusApproved {
		record.Set("approvedAt", now)
		record.Set("approvedBy", adminID)
		record.Set("rejectedAt", "")
		record.Set("rejectedBy", "")
	}
	if status == WaitlistStatusRejected {
		record.Set("rejectedAt", now)
		record.Set("rejectedBy", adminID)
	}

	if err := app.Save(record); err != nil {
		return nil, nil, apis.NewApiError(500, "failed to update waitlist entry", err)
	}

	return record, beforeSnapshot, nil
}

func syncWaitlistContactToLoops(runtimeResources lib.RuntimeResources, client waitlistLoopsClient, record *core.Record) (string, error) {
	status := record.GetString("status")
	return client.UpsertContact(waitlistContactInput(runtimeResources, record, status, waitlistStatusDateField(status)))
}

func sendWaitlistJoinedEventToLoops(runtimeResources lib.RuntimeResources, client waitlistLoopsClient, record *core.Record, transition *core.Record) error {
	return client.SendEvent(lib.LoopsEventInput{
		Email:          record.GetString("email"),
		EventName:      WaitlistJoinedEventName,
		IdempotencyKey: transition.GetString("idempotencyKey"),
		EventProperties: map[string]any{
			"source":         transition.GetString("source"),
			"appEnvironment": string(runtimeResources.Environment),
		},
		MailingLists: waitlistMailingLists(record),
	})
}

func sendWaitlistApprovalEmail(app core.App, runtimeResources lib.RuntimeResources, record *core.Record) error {
	email := strings.ToLower(strings.TrimSpace(record.GetString("email")))
	approvalToken, err := GenerateWaitlistApprovalToken(app, record)
	if err != nil {
		return err
	}
	signupURL := buildSignupURL(runtimeResources.AppURL, email, approvalToken)
	signupAppURL := buildSignupAppURL(runtimeResources.MobileAppScheme, email, approvalToken)
	senderName := strings.TrimSpace(app.Settings().Meta.SenderName)
	if senderName == "" {
		senderName = "Yummy Recs"
	}

	message := &mailer.Message{
		From: mail.Address{
			Address: app.Settings().Meta.SenderAddress,
			Name:    senderName,
		},
		To:      []mail.Address{{Address: email}},
		Subject: "You're approved for Yummy Recs",
		Text: fmt.Sprintf(
			"You're approved! You can now create your Yummy Recs account with %s. Create your account: %s",
			email,
			signupURL,
		),
		HTML: buildWaitlistApprovalEmailHTML(email, signupURL, signupAppURL, runtimeResources.MarketingURL),
	}

	return app.NewMailClient().Send(message)
}

func sendWaitlistJoinedEmail(app core.App, runtimeResources lib.RuntimeResources, record *core.Record) error {
	email := strings.ToLower(strings.TrimSpace(record.GetString("email")))
	appStoreURL := strings.TrimSpace(runtimeResources.IOSAppStoreURL)
	appOpenURL := buildAppOpenURL(runtimeResources.MobileAppScheme)
	senderName := strings.TrimSpace(app.Settings().Meta.SenderName)
	if senderName == "" {
		senderName = "Yummy Recs"
	}

	message := &mailer.Message{
		From: mail.Address{
			Address: app.Settings().Meta.SenderAddress,
			Name:    senderName,
		},
		To:      []mail.Address{{Address: email}},
		Subject: "You're on the Yummy Recs waitlist",
		Text:    buildWaitlistJoinedEmailText(email, appStoreURL),
		HTML:    buildWaitlistJoinedEmailHTML(email, appStoreURL, appOpenURL, runtimeResources.MarketingURL),
	}

	return app.NewMailClient().Send(message)
}

func buildWaitlistJoinedEmailText(email string, appStoreURL string) string {
	return fmt.Sprintf(
		"You're on the Yummy Recs waitlist. We received your waitlist request for %s. We'll email you when your account is ready.\n\nDownload Yummy Recs for iPhone if you don't have it already: %s",
		email,
		appStoreURL,
	)
}

func buildWaitlistJoinedEmailHTML(email string, appStoreURL string, appOpenURL string, marketingURL string) string {
	return lib.BuildTransactionalEmailHTML(lib.TransactionalEmailInput{
		AppURL:          strings.TrimSpace(appOpenURL),
		Body:            fmt.Sprintf("We received your waitlist request for %s. We'll email you when your account is ready.", email),
		ButtonLabel:     "Download on the App Store",
		MarketingURL:    marketingURL,
		Preheader:       "You're on the Yummy Recs waitlist.",
		SafetyNote:      "If you did not join the Yummy Recs waitlist, you can ignore this email.",
		SecondaryPrompt: "Already have the app?",
		SecondaryLabel:  "Open Yummy Recs",
		Title:           "You're on the waitlist",
		WebURL:          strings.TrimSpace(appStoreURL),
	})
}

func buildWaitlistApprovalEmailHTML(email string, signupURL string, signupAppURL string, marketingURL string) string {
	return lib.BuildTransactionalEmailHTML(lib.TransactionalEmailInput{
		AppURL:          signupAppURL,
		Body:            fmt.Sprintf("You can now create your Yummy Recs account with %s.", email),
		ButtonLabel:     "Create your account",
		MarketingURL:    marketingURL,
		Preheader:       "Your Yummy Recs account is ready.",
		SafetyNote:      "If you did not join the Yummy Recs waitlist, you can ignore this email.",
		SecondaryPrompt: "Already have the app?",
		SecondaryLabel:  "Open Yummy Recs",
		Title:           "You're approved!",
		WebURL:          signupURL,
	})
}

func syncWaitlistRejectedToLoops(app core.App, runtimeResources lib.RuntimeResources, record *core.Record) error {
	client := lib.NewLoopsClientFromEnv()
	_, err := client.UpsertContact(waitlistContactInput(runtimeResources, record, WaitlistStatusRejected, ""))
	if err != nil {
		record.Set("lastLoopsSyncError", err.Error())
		_ = app.Save(record)
		return err
	}

	return client.SendEvent(lib.LoopsEventInput{
		Email:     record.GetString("email"),
		EventName: WaitlistRejectedEventName,
		EventProperties: map[string]any{
			"appEnvironment": string(runtimeResources.Environment),
		},
	})
}

func waitlistContactInput(runtimeResources lib.RuntimeResources, record *core.Record, status string, dateField string) lib.LoopsContactInput {
	properties := map[string]any{
		"waitlistStatus":   status,
		"signupSource":     record.GetString("source"),
		"appEnvironment":   string(runtimeResources.Environment),
		"waitlistJoinedAt": record.GetString("created"),
	}
	if dateField != "" {
		properties[dateField] = record.GetString(dateField)
	}

	return lib.LoopsContactInput{
		Email:        record.GetString("email"),
		UserID:       record.GetString("signedUpUser"),
		Source:       waitlistDefaultString(record.GetString("source"), "mobile_signup"),
		MailingLists: waitlistMailingLists(record),
		Properties:   properties,
	}
}

func waitlistStatusDateField(status string) string {
	switch status {
	case WaitlistStatusApproved:
		return "approvedAt"
	case WaitlistStatusRejected:
		return "rejectedAt"
	case WaitlistStatusSignedUp:
		return "signedUpAt"
	default:
		return ""
	}
}

func waitlistMailingLists(record *core.Record) map[string]bool {
	lists := map[string]bool{}
	if id := strings.TrimSpace(os.Getenv("LOOPS_WAITLIST_MAILING_LIST_ID")); id != "" {
		lists[id] = true
	}
	return lists
}

func buildSignupURL(appURL string, email string, approvalToken string) string {
	base := strings.TrimRight(strings.TrimSpace(appURL), "/")
	if base == "" {
		base = "https://app.yummyrecs.com"
	}

	values := url.Values{}
	values.Set("email", strings.ToLower(strings.TrimSpace(email)))
	values.Set("mode", "waitlist_approved")
	values.Set("waitlistApprovalToken", strings.TrimSpace(approvalToken))

	return base + "/signup?" + values.Encode()
}

func buildSignupAppURL(appScheme string, email string, approvalToken string) string {
	scheme := strings.TrimSpace(appScheme)
	if scheme == "" {
		scheme = "yummyrecs"
	}

	values := url.Values{}
	values.Set("email", strings.ToLower(strings.TrimSpace(email)))
	values.Set("mode", "waitlist_approved")
	values.Set("waitlistApprovalToken", strings.TrimSpace(approvalToken))

	return scheme + "://signup?" + values.Encode()
}

func buildAppOpenURL(appScheme string) string {
	scheme := strings.TrimSpace(appScheme)
	if scheme == "" {
		scheme = "yummyrecs"
	}

	return scheme + "://"
}

func serializeWaitlistRecord(record *core.Record) map[string]any {
	return map[string]any{
		"id":                   record.Id,
		"email":                record.GetString("email"),
		"status":               record.GetString("status"),
		"source":               record.GetString("source"),
		"approvedAt":           record.GetString("approvedAt"),
		"approvedBy":           record.GetString("approvedBy"),
		"rejectedAt":           record.GetString("rejectedAt"),
		"rejectedBy":           record.GetString("rejectedBy"),
		"signedUpAt":           record.GetString("signedUpAt"),
		"signedUpUser":         record.GetString("signedUpUser"),
		"loopsContactId":       record.GetString("loopsContactId"),
		"lastLoopsSyncError":   record.GetString("lastLoopsSyncError"),
		"joinedEmailSentAt":    record.GetString("joinedEmailSentAt"),
		"lastJoinedEmailError": record.GetString("lastJoinedEmailError"),
		"created":              record.GetString("created"),
		"updated":              record.GetString("updated"),
	}
}

func parsePositiveInt(raw string, fallback int) int {
	value, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil || value < 1 {
		return fallback
	}
	return value
}

func errorsIsNoRows(err error) bool {
	return err == sql.ErrNoRows || (err != nil && strings.Contains(strings.ToLower(err.Error()), "no rows"))
}

func waitlistDefaultString(value string, fallback string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return fallback
	}
	return value
}

func waitlistApprovalSigningKey(app core.App) string {
	usersCollection, err := app.FindCollectionByNameOrId("users")
	if err != nil || usersCollection == nil {
		return "waitlist_approval_missing_users_collection"
	}

	return "waitlist_approval:" + usersCollection.VerificationToken.Secret
}

func hashWaitlistApprovalNonce(nonce string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(nonce)))
	return hex.EncodeToString(sum[:])
}

func claimString(value any) string {
	if text, ok := value.(string); ok {
		return strings.TrimSpace(text)
	}

	return ""
}
