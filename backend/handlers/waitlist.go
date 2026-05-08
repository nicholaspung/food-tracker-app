package handlers

import (
	"database/sql"
	"fmt"
	"html"
	"log"
	"net/mail"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/mailer"

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
)

type waitlistRequest struct {
	Email                        string `json:"email"`
	Source                       string `json:"source"`
	ProductUpdatesConsent        bool   `json:"productUpdatesConsent"`
	MarketingConsent             bool   `json:"marketingConsent"`
	OnboardingEmailsAcknowledged bool   `json:"onboardingEmailsAcknowledged"`
	ConsentVersion               string `json:"consentVersion"`
}

type WaitlistEntry struct {
	ID                           string
	Email                        string
	Status                       string
	Source                       string
	ProductUpdatesConsent        bool
	MarketingConsent             bool
	OnboardingEmailsAcknowledged bool
	ConsentVersion               string
	ConsentCapturedAt            string
	ApprovedAt                   string
	ApprovedBy                   string
	RejectedAt                   string
	RejectedBy                   string
	SignedUpAt                   string
	SignedUpUser                 string
	LoopsContactID               string
	LastLoopsSyncError           string
	Created                      string
	Updated                      string
}

func RegisterWaitlistHandlers(se *core.ServeEvent, app core.App, runtimeResources lib.RuntimeResources) {
	se.Router.POST("/api/waitlist", func(e *core.RequestEvent) error {
		var requestBody waitlistRequest
		if err := e.BindBody(&requestBody); err != nil {
			return apis.NewBadRequestError("invalid request body", err)
		}

		email, err := normalizeEmail(requestBody.Email)
		if err != nil {
			return apis.NewBadRequestError(err.Error(), nil)
		}
		if !requestBody.OnboardingEmailsAcknowledged {
			return apis.NewBadRequestError("onboarding email acknowledgement is required", nil)
		}

		record, err := upsertWaitlistEntry(app, requestBody, email)
		if err != nil {
			log.Printf("Waitlist upsert failed for %s: %v", email, err)
			return apis.NewApiError(500, "failed to join waitlist", err)
		}

		if err := syncWaitlistJoinedToLoops(app, runtimeResources, record); err != nil {
			log.Printf("Loops waitlist sync failed for %s: %v", email, err)
		}

		return e.JSON(200, map[string]any{
			"success": true,
			"status":  record.GetString("status"),
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

		record, err := updateWaitlistDecision(app, e.Request.PathValue("entryId"), WaitlistStatusApproved, e.Auth.Id)
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

		record, err := updateWaitlistDecision(app, e.Request.PathValue("entryId"), WaitlistStatusRejected, e.Auth.Id)
		if err != nil {
			return err
		}

		if err := syncWaitlistRejectedToLoops(app, runtimeResources, record); err != nil {
			log.Printf("Loops waitlist rejection sync failed for %s: %v", record.GetString("email"), err)
		}

		return e.JSON(200, serializeWaitlistRecord(record))
	})
}

func FindApprovedWaitlistEntryByEmail(app core.App, email string) (*core.Record, error) {
	normalizedEmail, err := normalizeEmail(email)
	if err != nil {
		return nil, err
	}

	record, err := findWaitlistRecordByEmail(app, normalizedEmail)
	if err != nil {
		return nil, err
	}
	if record == nil || record.GetString("status") != WaitlistStatusApproved {
		return nil, fmt.Errorf("email is not approved for signup")
	}

	return record, nil
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
			"waitlistStatus":               WaitlistStatusSignedUp,
			"accountCreatedAt":             now.Format(time.RFC3339),
			"productUpdatesConsent":        entry.GetBool("productUpdatesConsent"),
			"marketingConsent":             entry.GetBool("marketingConsent"),
			"emailConsentVersion":          strings.TrimSpace(entry.GetString("consentVersion")),
			"appEnvironment":               string(runtimeResources.Environment),
			"onboardingEmailsAcknowledged": entry.GetBool("onboardingEmailsAcknowledged"),
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

func upsertWaitlistEntry(app core.App, requestBody waitlistRequest, email string) (*core.Record, error) {
	collection, err := app.FindCollectionByNameOrId("waitlist_entries")
	if err != nil {
		return nil, err
	}

	record, err := findWaitlistRecordByEmail(app, email)
	if err != nil {
		return nil, err
	}
	if record == nil {
		record = core.NewRecord(collection)
		record.Set("email", email)
		record.Set("status", WaitlistStatusPending)
	} else if record.GetString("status") == WaitlistStatusRejected {
		record.Set("status", WaitlistStatusPending)
		record.Set("rejectedAt", "")
		record.Set("rejectedBy", "")
	}

	now := time.Now().UTC()
	record.Set("source", waitlistDefaultString(strings.TrimSpace(requestBody.Source), "mobile_signup"))
	record.Set("productUpdatesConsent", requestBody.ProductUpdatesConsent)
	record.Set("marketingConsent", requestBody.MarketingConsent)
	record.Set("onboardingEmailsAcknowledged", requestBody.OnboardingEmailsAcknowledged)
	record.Set("consentVersion", strings.TrimSpace(requestBody.ConsentVersion))
	record.Set("consentCapturedAt", now)
	record.Set("lastLoopsSyncError", "")

	return record, app.Save(record)
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

func updateWaitlistDecision(app core.App, entryID string, status string, adminID string) (*core.Record, error) {
	entryID = strings.TrimSpace(entryID)
	if entryID == "" {
		return nil, apis.NewBadRequestError("entryId is required", nil)
	}

	record, err := app.FindRecordById("waitlist_entries", entryID)
	if err != nil {
		return nil, apis.NewNotFoundError("waitlist entry not found", err)
	}

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
		return nil, apis.NewApiError(500, "failed to update waitlist entry", err)
	}

	return record, nil
}

func syncWaitlistJoinedToLoops(app core.App, runtimeResources lib.RuntimeResources, record *core.Record) error {
	client := lib.NewLoopsClientFromEnv()
	contactID, err := client.UpsertContact(waitlistContactInput(runtimeResources, record, WaitlistStatusPending, ""))
	if err != nil {
		record.Set("lastLoopsSyncError", err.Error())
		_ = app.Save(record)
		return err
	}
	if strings.TrimSpace(contactID) != "" {
		record.Set("loopsContactId", contactID)
		_ = app.Save(record)
	}

	return client.SendEvent(lib.LoopsEventInput{
		Email:     record.GetString("email"),
		EventName: WaitlistJoinedEventName,
		EventProperties: map[string]any{
			"source":         record.GetString("source"),
			"appEnvironment": string(runtimeResources.Environment),
		},
		MailingLists: waitlistMailingLists(record),
	})
}

func sendWaitlistApprovalEmail(app core.App, runtimeResources lib.RuntimeResources, record *core.Record) error {
	email := strings.ToLower(strings.TrimSpace(record.GetString("email")))
	signupURL := buildSignupURL(runtimeResources.MarketingURL, email)
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
			"You're approved! You can now create your Yummy Recs account with %s. Sign up here: %s",
			email,
			signupURL,
		),
		HTML: fmt.Sprintf(`
			<p>You're approved!</p>
			<p>You can now create your Yummy Recs account with <strong>%s</strong>.</p>
			<p><a href="%s">Create your account</a></p>
			<p>If the button does not work, copy and paste this link into your browser:</p>
			<p>%s</p>
		`, html.EscapeString(email), html.EscapeString(signupURL), html.EscapeString(signupURL)),
	}

	return app.NewMailClient().Send(message)
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
		"waitlistStatus":               status,
		"signupSource":                 record.GetString("source"),
		"appEnvironment":               string(runtimeResources.Environment),
		"productUpdatesConsent":        record.GetBool("productUpdatesConsent"),
		"marketingConsent":             record.GetBool("marketingConsent"),
		"onboardingEmailsAcknowledged": record.GetBool("onboardingEmailsAcknowledged"),
		"emailConsentVersion":          record.GetString("consentVersion"),
		"waitlistJoinedAt":             record.GetString("created"),
	}
	if dateField != "" {
		properties[dateField] = record.GetString(dateField)
	}

	return lib.LoopsContactInput{
		Email:        record.GetString("email"),
		Source:       waitlistDefaultString(record.GetString("source"), "mobile_signup"),
		MailingLists: waitlistMailingLists(record),
		Properties:   properties,
	}
}

func waitlistMailingLists(record *core.Record) map[string]bool {
	lists := map[string]bool{}
	if id := strings.TrimSpace(os.Getenv("LOOPS_WAITLIST_MAILING_LIST_ID")); id != "" {
		lists[id] = true
	}
	if id := strings.TrimSpace(os.Getenv("LOOPS_PRODUCT_UPDATES_MAILING_LIST_ID")); id != "" {
		lists[id] = record.GetBool("productUpdatesConsent")
	}
	if id := strings.TrimSpace(os.Getenv("LOOPS_MARKETING_MAILING_LIST_ID")); id != "" {
		lists[id] = record.GetBool("marketingConsent")
	}
	return lists
}

func buildSignupURL(marketingURL string, email string) string {
	base := strings.TrimRight(strings.TrimSpace(marketingURL), "/")
	if base == "" {
		base = "https://yummyrecs.com"
	}

	return base + "/signup?email=" + url.QueryEscape(strings.ToLower(strings.TrimSpace(email)))
}

func serializeWaitlistRecord(record *core.Record) map[string]any {
	return map[string]any{
		"id":                           record.Id,
		"email":                        record.GetString("email"),
		"status":                       record.GetString("status"),
		"source":                       record.GetString("source"),
		"productUpdatesConsent":        record.GetBool("productUpdatesConsent"),
		"marketingConsent":             record.GetBool("marketingConsent"),
		"onboardingEmailsAcknowledged": record.GetBool("onboardingEmailsAcknowledged"),
		"consentVersion":               record.GetString("consentVersion"),
		"consentCapturedAt":            record.GetString("consentCapturedAt"),
		"approvedAt":                   record.GetString("approvedAt"),
		"approvedBy":                   record.GetString("approvedBy"),
		"rejectedAt":                   record.GetString("rejectedAt"),
		"rejectedBy":                   record.GetString("rejectedBy"),
		"signedUpAt":                   record.GetString("signedUpAt"),
		"signedUpUser":                 record.GetString("signedUpUser"),
		"loopsContactId":               record.GetString("loopsContactId"),
		"lastLoopsSyncError":           record.GetString("lastLoopsSyncError"),
		"created":                      record.GetString("created"),
		"updated":                      record.GetString("updated"),
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
