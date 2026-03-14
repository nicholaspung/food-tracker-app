package hooks

import (
	"log"

	"github.com/pocketbase/pocketbase/core"

	"myapp/lib"
)

// RegisterAuditHooks persists immutable audit log records for admin-authenticated writes.
func RegisterAuditHooks(app core.App) {
	app.OnRecordCreateRequest().BindFunc(func(e *core.RecordRequestEvent) error {
		if !shouldAuditRequest(e) {
			return e.Next()
		}

		err := e.Next()
		if err != nil {
			return err
		}

		if auditErr := lib.CreateAuditLogForRecordRequest(
			e.App,
			e.RequestEvent,
			e.Record,
			core.ModelEventTypeCreate,
			nil,
			lib.RecordAuditSnapshot(e.Record),
			nil,
		); auditErr != nil {
			log.Printf("Failed to write create audit log for %s/%s: %v", e.Collection.Name, e.Record.Id, auditErr)
		}

		return nil
	})

	app.OnRecordUpdateRequest().BindFunc(func(e *core.RecordRequestEvent) error {
		if !shouldAuditRequest(e) {
			return e.Next()
		}

		before := lib.RecordAuditSnapshot(e.Record.Original())

		err := e.Next()
		if err != nil {
			return err
		}

		if auditErr := lib.CreateAuditLogForRecordRequest(
			e.App,
			e.RequestEvent,
			e.Record,
			core.ModelEventTypeUpdate,
			before,
			lib.RecordAuditSnapshot(e.Record),
			nil,
		); auditErr != nil {
			log.Printf("Failed to write update audit log for %s/%s: %v", e.Collection.Name, e.Record.Id, auditErr)
		}

		return nil
	})

	app.OnRecordDeleteRequest().BindFunc(func(e *core.RecordRequestEvent) error {
		if !shouldAuditRequest(e) {
			return e.Next()
		}

		before := lib.RecordAuditSnapshot(e.Record)

		err := e.Next()
		if err != nil {
			return err
		}

		if auditErr := lib.CreateAuditLogForRecordRequest(
			e.App,
			e.RequestEvent,
			e.Record,
			core.ModelEventTypeDelete,
			before,
			nil,
			nil,
		); auditErr != nil {
			log.Printf("Failed to write delete audit log for %s/%s: %v", e.Collection.Name, e.Record.Id, auditErr)
		}

		return nil
	})
}

func shouldAuditRequest(e *core.RecordRequestEvent) bool {
	if e == nil || e.Auth == nil || !e.Auth.GetBool("isAdmin") || e.Collection == nil {
		return false
	}

	return lib.ShouldAuditRecordCollection(e.Collection.Name)
}
