package handlers

import (
	"strings"

	"github.com/pocketbase/pocketbase/core"

	"myapp/lib"
)

func createAdminRecordAuditLog(
	app core.App,
	e *core.RequestEvent,
	record *core.Record,
	action string,
	before map[string]any,
	after map[string]any,
	metadata map[string]any,
	summary string,
) error {
	if record == nil {
		return nil
	}

	return lib.CreateAuditLog(app, lib.AuditLogInput{
		Action:           action,
		Actor:            e.Auth,
		Before:           before,
		After:            after,
		Metadata:         metadata,
		RequestIP:        e.RealIP(),
		RequestMethod:    e.Request.Method,
		RequestPath:      e.Request.URL.Path,
		Summary:          strings.TrimSpace(summary),
		TargetCollection: record.Collection().Name,
		TargetLabel:      lib.ResolveAuditTargetLabel(record, after, before),
		TargetRecordID:   record.Id,
		UserAgent:        e.Request.UserAgent(),
	})
}

func createAdminActionAuditLog(
	app core.App,
	e *core.RequestEvent,
	action string,
	targetCollection string,
	targetRecordID string,
	targetLabel string,
	metadata map[string]any,
	summary string,
) error {
	return lib.CreateAuditLog(app, lib.AuditLogInput{
		Action:           action,
		Actor:            e.Auth,
		Metadata:         metadata,
		RequestIP:        e.RealIP(),
		RequestMethod:    e.Request.Method,
		RequestPath:      e.Request.URL.Path,
		Summary:          strings.TrimSpace(summary),
		TargetCollection: targetCollection,
		TargetLabel:      targetLabel,
		TargetRecordID:   targetRecordID,
		UserAgent:        e.Request.UserAgent(),
	})
}
