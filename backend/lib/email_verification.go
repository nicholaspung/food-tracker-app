package lib

import (
	"time"

	"github.com/pocketbase/pocketbase/core"
)

const (
	EmailVerificationRequiredMessage = "Please verify your email to continue."
	EmailVerificationGracePeriod     = 72 * time.Hour
)

type EmailVerificationAccessStatus string

const (
	EmailVerificationStatusVerified     EmailVerificationAccessStatus = "verified"
	EmailVerificationStatusGracePeriod  EmailVerificationAccessStatus = "grace_period"
	EmailVerificationStatusGraceExpired EmailVerificationAccessStatus = "grace_expired"
)

type EmailVerificationAccess struct {
	Status      EmailVerificationAccessStatus
	GraceEndsAt time.Time
}

func ResolveEmailVerificationAccess(record *core.Record, now time.Time) EmailVerificationAccess {
	if record == nil {
		return EmailVerificationAccess{Status: EmailVerificationStatusGraceExpired}
	}

	if record.GetBool("verified") {
		return EmailVerificationAccess{Status: EmailVerificationStatusVerified}
	}

	createdAt := record.GetDateTime("created")
	if createdAt.IsZero() {
		return EmailVerificationAccess{Status: EmailVerificationStatusGraceExpired}
	}

	graceEndsAt := createdAt.Time().UTC().Add(EmailVerificationGracePeriod)
	if now.UTC().Before(graceEndsAt) {
		return EmailVerificationAccess{
			Status:      EmailVerificationStatusGracePeriod,
			GraceEndsAt: graceEndsAt,
		}
	}

	return EmailVerificationAccess{
		Status:      EmailVerificationStatusGraceExpired,
		GraceEndsAt: graceEndsAt,
	}
}

func IsEmailVerificationGraceExpired(record *core.Record, now time.Time) bool {
	return ResolveEmailVerificationAccess(record, now).Status == EmailVerificationStatusGraceExpired
}
