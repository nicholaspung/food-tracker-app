package handlers

import (
	"strings"

	"github.com/google/uuid"
	"github.com/pocketbase/pocketbase/core"
)

const requestIDHeaderName = "X-Request-ID"

func resolveRequestID(e *core.RequestEvent) string {
	if e != nil && e.Request != nil {
		if requestID := safeRequestID(e.Request.Header.Get(requestIDHeaderName)); requestID != "" {
			return requestID
		}
	}

	return uuid.NewString()
}

func setRequestIDHeader(e *core.RequestEvent, requestID string) {
	if e == nil || e.Response == nil {
		return
	}

	if resolved := safeRequestID(requestID); resolved != "" {
		e.Response.Header().Set(requestIDHeaderName, resolved)
	}
}

func safeRequestID(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if len(trimmed) < 8 || len(trimmed) > 80 {
		return ""
	}

	for _, char := range trimmed {
		if char >= 'a' && char <= 'z' {
			continue
		}
		if char >= 'A' && char <= 'Z' {
			continue
		}
		if char >= '0' && char <= '9' {
			continue
		}
		if char == '_' || char == '-' || char == '.' || char == ':' {
			continue
		}
		return ""
	}

	return trimmed
}
