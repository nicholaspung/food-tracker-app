package lib

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

const loopsAPIBaseURL = "https://app.loops.so/api/v1"

type LoopsClient struct {
	apiKey     string
	httpClient *http.Client
}

type LoopsContactInput struct {
	Email        string
	FirstName    string
	LastName     string
	Source       string
	UserID       string
	UserGroup    string
	MailingLists map[string]bool
	Properties   map[string]any
}

type LoopsEventInput struct {
	Email           string
	UserID          string
	EventName       string
	EventProperties map[string]any
	MailingLists    map[string]bool
}

type LoopsTransactionalInput struct {
	TransactionalID string
	Email           string
	DataVariables   map[string]any
	AddToAudience   bool
}

type loopsResponse struct {
	Success bool   `json:"success"`
	ID      string `json:"id"`
	Message string `json:"message"`
}

func NewLoopsClientFromEnv() LoopsClient {
	return LoopsClient{
		apiKey: strings.TrimSpace(os.Getenv("LOOPS_API_KEY")),
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

func (client LoopsClient) IsConfigured() bool {
	return strings.TrimSpace(client.apiKey) != ""
}

func (client LoopsClient) UpsertContact(input LoopsContactInput) (string, error) {
	if !client.IsConfigured() {
		return "", nil
	}

	payload := map[string]any{}
	for key, value := range input.Properties {
		payload[key] = value
	}

	if strings.TrimSpace(input.Email) != "" {
		payload["email"] = strings.ToLower(strings.TrimSpace(input.Email))
	}
	if strings.TrimSpace(input.FirstName) != "" {
		payload["firstName"] = strings.TrimSpace(input.FirstName)
	}
	if strings.TrimSpace(input.LastName) != "" {
		payload["lastName"] = strings.TrimSpace(input.LastName)
	}
	if strings.TrimSpace(input.Source) != "" {
		payload["source"] = strings.TrimSpace(input.Source)
	}
	if strings.TrimSpace(input.UserID) != "" {
		payload["userId"] = strings.TrimSpace(input.UserID)
	}
	if strings.TrimSpace(input.UserGroup) != "" {
		payload["userGroup"] = strings.TrimSpace(input.UserGroup)
	}
	if len(input.MailingLists) > 0 {
		payload["mailingLists"] = input.MailingLists
	}

	var response loopsResponse
	if err := client.doJSON(http.MethodPut, "/contacts/update", payload, &response); err != nil {
		return "", err
	}

	return response.ID, nil
}

func (client LoopsClient) SendEvent(input LoopsEventInput) error {
	if !client.IsConfigured() {
		return nil
	}

	payload := map[string]any{
		"eventName": strings.TrimSpace(input.EventName),
	}
	if strings.TrimSpace(input.Email) != "" {
		payload["email"] = strings.ToLower(strings.TrimSpace(input.Email))
	}
	if strings.TrimSpace(input.UserID) != "" {
		payload["userId"] = strings.TrimSpace(input.UserID)
	}
	if len(input.EventProperties) > 0 {
		payload["eventProperties"] = input.EventProperties
	}
	if len(input.MailingLists) > 0 {
		payload["mailingLists"] = input.MailingLists
	}

	var response loopsResponse
	return client.doJSON(http.MethodPost, "/events/send", payload, &response)
}

func (client LoopsClient) SendTransactionalEmail(input LoopsTransactionalInput) error {
	if !client.IsConfigured() {
		return nil
	}

	payload := map[string]any{
		"transactionalId": strings.TrimSpace(input.TransactionalID),
		"email":           strings.ToLower(strings.TrimSpace(input.Email)),
		"dataVariables":   input.DataVariables,
	}
	if input.AddToAudience {
		payload["addToAudience"] = true
	}

	var response loopsResponse
	return client.doJSON(http.MethodPost, "/transactional", payload, &response)
}

func (client LoopsClient) doJSON(method string, path string, payload map[string]any, target *loopsResponse) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	request, err := http.NewRequest(method, loopsAPIBaseURL+path, bytes.NewReader(body))
	if err != nil {
		return err
	}
	request.Header.Set("Authorization", "Bearer "+client.apiKey)
	request.Header.Set("Content-Type", "application/json")

	httpClient := client.httpClient
	if httpClient == nil {
		httpClient = http.DefaultClient
	}

	response, err := httpClient.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()

	responseBody, _ := io.ReadAll(io.LimitReader(response.Body, 4096))
	if len(responseBody) > 0 && target != nil {
		_ = json.Unmarshal(responseBody, target)
	}

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		message := strings.TrimSpace(string(responseBody))
		if target != nil && strings.TrimSpace(target.Message) != "" {
			message = target.Message
		}
		return fmt.Errorf("loops API %s %s failed with status %d: %s", method, path, response.StatusCode, message)
	}

	return nil
}
