package lib

import (
	"fmt"
	"reflect"
	"sort"
	"strings"

	"github.com/pocketbase/pocketbase/core"
)

const AuditLogsCollectionName = "audit_logs"
const AuditActionView = "view"

type AuditLogInput struct {
	Action           string
	Actor            *core.Record
	Before           map[string]any
	After            map[string]any
	Metadata         map[string]any
	RequestIP        string
	RequestMethod    string
	RequestPath      string
	Summary          string
	TargetCollection string
	TargetLabel      string
	TargetRecordID   string
	UserAgent        string
}

var auditIgnoredDiffFields = map[string]struct{}{
	core.FieldNameCollectionId:   {},
	core.FieldNameCollectionName: {},
	"created":                    {},
	"updated":                    {},
}

func ShouldAuditRecordCollection(collectionName string) bool {
	normalized := strings.TrimSpace(collectionName)
	return normalized != "" && normalized != AuditLogsCollectionName
}

func RecordAuditSnapshot(record *core.Record) map[string]any {
	if record == nil {
		return nil
	}

	export := record.Fresh().IgnoreEmailVisibility(true).PublicExport()
	delete(export, core.FieldNameCollectionId)
	delete(export, core.FieldNameCollectionName)
	delete(export, core.FieldNameExpand)

	return sanitizeAuditMap(export)
}

func CreateAuditLogForRecordRequest(
	app core.App,
	requestEvent *core.RequestEvent,
	record *core.Record,
	action string,
	before map[string]any,
	after map[string]any,
	metadata map[string]any,
) error {
	if record == nil {
		return nil
	}

	return CreateAuditLog(app, AuditLogInput{
		Action:           action,
		Actor:            requestEvent.Auth,
		Before:           before,
		After:            after,
		Metadata:         metadata,
		RequestIP:        requestEvent.RealIP(),
		RequestMethod:    requestEvent.Request.Method,
		RequestPath:      requestEvent.Request.URL.Path,
		TargetCollection: record.Collection().Name,
		TargetLabel:      ResolveAuditTargetLabel(record, after, before),
		TargetRecordID:   record.Id,
		UserAgent:        requestEvent.Request.UserAgent(),
	})
}

func CreateAuditLog(app core.App, input AuditLogInput) error {
	if !ShouldAuditRecordCollection(input.TargetCollection) {
		return nil
	}

	changedFields := diffAuditFields(input.Before, input.After)
	if input.Action == core.ModelEventTypeUpdate && len(changedFields) == 0 {
		return nil
	}

	collection, err := app.FindCollectionByNameOrId(AuditLogsCollectionName)
	if err != nil {
		return err
	}

	record := core.NewRecord(collection)
	record.Set("action", strings.TrimSpace(input.Action))
	record.Set("actorEmail", resolveAuditActorEmail(input.Actor))
	record.Set("changedFields", changedFields)
	record.Set("summary", resolveAuditSummary(input, changedFields))
	record.Set("targetCollection", strings.TrimSpace(input.TargetCollection))
	record.Set("targetLabel", strings.TrimSpace(input.TargetLabel))
	record.Set("targetRecordId", strings.TrimSpace(input.TargetRecordID))
	record.Set("requestIp", strings.TrimSpace(input.RequestIP))
	record.Set("requestMethod", strings.TrimSpace(input.RequestMethod))
	record.Set("requestPath", strings.TrimSpace(input.RequestPath))
	record.Set("userAgent", strings.TrimSpace(input.UserAgent))

	if input.Actor != nil {
		record.Set("actor", input.Actor.Id)
	}

	if input.Before != nil {
		record.Set("beforeJson", sanitizeAuditMap(input.Before))
	}

	if input.After != nil {
		record.Set("afterJson", sanitizeAuditMap(input.After))
	}

	if input.Metadata != nil {
		record.Set("metadataJson", sanitizeAuditMap(input.Metadata))
	}

	return app.Save(record)
}

func ResolveAuditTargetLabel(record *core.Record, candidates ...map[string]any) string {
	for _, candidate := range candidates {
		if label := resolveAuditTargetLabelFromMap(candidate); label != "" {
			return label
		}
	}

	if record == nil {
		return ""
	}

	for _, fieldName := range []string{"name", "title", "email", "code"} {
		if value := strings.TrimSpace(record.GetString(fieldName)); value != "" {
			return value
		}
	}

	return ""
}

func resolveAuditActorEmail(actor *core.Record) string {
	if actor == nil {
		return ""
	}

	if email := strings.TrimSpace(actor.Email()); email != "" {
		return email
	}

	return strings.TrimSpace(actor.GetString("email"))
}

func resolveAuditTargetLabelFromMap(candidate map[string]any) string {
	if len(candidate) == 0 {
		return ""
	}

	for _, fieldName := range []string{"name", "title", "email", "code"} {
		value, ok := candidate[fieldName]
		if !ok {
			continue
		}

		if stringValue := strings.TrimSpace(fmt.Sprint(value)); stringValue != "" && stringValue != "<nil>" {
			return stringValue
		}
	}

	return ""
}

func resolveAuditSummary(input AuditLogInput, changedFields []string) string {
	if summary := strings.TrimSpace(input.Summary); summary != "" {
		return summary
	}

	target := input.TargetCollection
	if label := strings.TrimSpace(input.TargetLabel); label != "" {
		target = fmt.Sprintf("%s (%s)", target, label)
	}

	switch input.Action {
	case core.ModelEventTypeCreate:
		return fmt.Sprintf("Created %s", target)
	case core.ModelEventTypeDelete:
		return fmt.Sprintf("Deleted %s", target)
	case AuditActionView:
		return fmt.Sprintf("Viewed %s", target)
	default:
		if len(changedFields) == 0 {
			return fmt.Sprintf("Updated %s", target)
		}

		visibleFields := changedFields
		if len(visibleFields) > 3 {
			visibleFields = visibleFields[:3]
		}

		return fmt.Sprintf("Updated %s: %s", target, strings.Join(visibleFields, ", "))
	}
}

func diffAuditFields(before map[string]any, after map[string]any) []string {
	keys := make(map[string]struct{}, len(before)+len(after))
	for key := range before {
		keys[key] = struct{}{}
	}
	for key := range after {
		keys[key] = struct{}{}
	}

	changed := make([]string, 0, len(keys))
	for key := range keys {
		if _, ignored := auditIgnoredDiffFields[key]; ignored {
			continue
		}

		if reflect.DeepEqual(before[key], after[key]) {
			continue
		}

		changed = append(changed, key)
	}

	sort.Strings(changed)
	return changed
}

func sanitizeAuditMap(input map[string]any) map[string]any {
	if len(input) == 0 {
		return nil
	}

	output := make(map[string]any, len(input))
	for key, value := range input {
		output[key] = sanitizeAuditValue(key, value)
	}

	return output
}

func sanitizeAuditValue(key string, value any) any {
	if isSensitiveAuditKey(key) {
		return "[REDACTED]"
	}

	switch typed := value.(type) {
	case map[string]any:
		return sanitizeAuditMap(typed)
	case []any:
		result := make([]any, len(typed))
		for index, item := range typed {
			result[index] = sanitizeAuditValue("", item)
		}
		return result
	default:
		return typed
	}
}

func isSensitiveAuditKey(key string) bool {
	normalized := strings.ToLower(strings.TrimSpace(key))
	if normalized == "" {
		return false
	}

	return normalized == "password" ||
		normalized == "passwordconfirm" ||
		normalized == "oldpassword" ||
		normalized == "newpassword" ||
		normalized == "tokenkey" ||
		normalized == "accesstoken" ||
		normalized == "refreshtoken" ||
		normalized == "secret" ||
		normalized == "otp" ||
		strings.Contains(normalized, "password") ||
		strings.HasSuffix(normalized, "_token") ||
		strings.HasSuffix(normalized, "token")
}
