package migrations

import (
	"log"
	"strings"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

const (
	waitlistJoinTransitionsCollection    = "waitlist_join_transitions"
	waitlistTransitionMigrationBatchSize = 500
)

func init() {
	m.Register(func(app core.App) error {
		return createWaitlistJoinTransitionOutbox(app)
	}, func(app core.App) error {
		return removeWaitlistJoinTransitionOutbox(app)
	})
}

func createWaitlistJoinTransitionOutbox(app core.App) error {
	return createWaitlistJoinTransitionOutboxWithBatchSize(app, waitlistTransitionMigrationBatchSize)
}

func createWaitlistJoinTransitionOutboxWithBatchSize(app core.App, batchSize int) error {
	waitlistEntries, err := app.FindCollectionByNameOrId("waitlist_entries")
	if err != nil {
		return err
	}

	collection, err := app.FindCollectionByNameOrId(waitlistJoinTransitionsCollection)
	if err != nil {
		collection = core.NewBaseCollection(waitlistJoinTransitionsCollection)
		collection.ListRule = nil
		collection.ViewRule = nil
		collection.CreateRule = nil
		collection.UpdateRule = nil
		collection.DeleteRule = nil
		collection.Fields.Add(&core.RelationField{
			Name:          "waitlistEntry",
			CollectionId:  waitlistEntries.Id,
			MaxSelect:     1,
			Required:      true,
			CascadeDelete: true,
		})
		collection.Fields.Add(&core.TextField{Name: "previousStatus", Max: 20})
		collection.Fields.Add(&core.TextField{Name: "currentStatus", Required: true, Max: 20})
		collection.Fields.Add(&core.TextField{Name: "source", Max: 120})
		collection.Fields.Add(&core.BoolField{Name: "contactSyncPending"})
		collection.Fields.Add(&core.BoolField{Name: "joinedEventPending"})
		collection.Fields.Add(&core.DateField{Name: "joinedEventAttemptedAt"})
		collection.Fields.Add(&core.DateField{Name: "joinedEventSentAt"})
		collection.Fields.Add(&core.TextField{Name: "idempotencyKey", Required: true, Max: 100})
		collection.Fields.Add(&core.TextField{Name: "lastError", Max: 2000})
		collection.Fields.Add(&core.AutodateField{Name: "created", OnCreate: true})
		collection.Indexes = []string{
			"CREATE UNIQUE INDEX idx_waitlist_join_transitions_idempotency ON waitlist_join_transitions (idempotencyKey)",
			"CREATE INDEX idx_waitlist_join_transitions_pending ON waitlist_join_transitions (created) WHERE contactSyncPending = TRUE OR joinedEventPending = TRUE",
		}
		if err := app.Save(collection); err != nil {
			return err
		}
	}

	if batchSize < 1 {
		batchSize = waitlistTransitionMigrationBatchSize
	}
	migratedCount := 0
	for {
		legacyRecords, err := app.FindRecordsByFilter(
			"waitlist_entries",
			"loopsSyncPending = true",
			"created,id",
			batchSize,
			0,
		)
		if err != nil {
			return err
		}
		if len(legacyRecords) == 0 {
			break
		}

		for _, record := range legacyRecords {
			key := "legacy-" + record.Id
			existing, findErr := app.FindFirstRecordByFilter(
				waitlistJoinTransitionsCollection,
				"idempotencyKey = {:key}",
				map[string]any{"key": key},
			)
			if findErr != nil || existing == nil {
				transition := core.NewRecord(collection)
				transition.Set("waitlistEntry", record.Id)
				transition.Set("currentStatus", record.GetString("status"))
				transition.Set("source", record.GetString("source"))
				transition.Set("contactSyncPending", true)
				// The legacy flag was set by every anonymous replay, including
				// approved and signed-up entries, so it does not prove that a new
				// lifecycle transition occurred. Preserve contact reconciliation
				// without synthesizing a potentially duplicate joined event.
				transition.Set("joinedEventPending", false)
				transition.Set("idempotencyKey", key)
				if err := app.Save(transition); err != nil {
					return err
				}
			}
			record.Set("loopsSyncPending", false)
			if err := app.Save(record); err != nil {
				return err
			}
			migratedCount++
		}
	}

	log.Printf("✓ Created durable waitlist transition outbox and migrated %d pending join(s)", migratedCount)
	return nil
}

func removeWaitlistJoinTransitionOutbox(app core.App) error {
	collection, err := app.FindCollectionByNameOrId(waitlistJoinTransitionsCollection)
	if err != nil {
		return err
	}

	restoredCount := 0
	cursorCreated := ""
	cursorID := ""
	for {
		filter := "(contactSyncPending = true || joinedEventPending = true)"
		params := map[string]any{}
		if cursorCreated != "" {
			filter += " && (created > {:cursorCreated} || (created = {:cursorCreated} && id > {:cursorID}))"
			params["cursorCreated"] = cursorCreated
			params["cursorID"] = cursorID
		}
		pendingTransitions, err := app.FindRecordsByFilter(
			waitlistJoinTransitionsCollection,
			filter,
			"created,id",
			waitlistTransitionMigrationBatchSize,
			0,
			params,
		)
		if err != nil {
			return err
		}
		if len(pendingTransitions) == 0 {
			break
		}
		for _, transition := range pendingTransitions {
			entryID := strings.TrimSpace(transition.GetString("waitlistEntry"))
			if entryID == "" {
				continue
			}
			record, findErr := app.FindRecordById("waitlist_entries", entryID)
			if findErr != nil {
				continue
			}
			record.Set("loopsSyncPending", true)
			if err := app.Save(record); err != nil {
				return err
			}
			restoredCount++
		}
		last := pendingTransitions[len(pendingTransitions)-1]
		cursorCreated = last.GetString("created")
		cursorID = last.Id
	}

	if err := app.Delete(collection); err != nil {
		return err
	}

	log.Printf("✓ Removed waitlist transition outbox and restored %d pending join(s)", restoredCount)
	return nil
}
