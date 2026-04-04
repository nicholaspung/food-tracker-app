package lib

import (
	"crypto/rand"
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

const FriendCodeLength = 8

const friendCodeCharset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

func NormalizeFriendCode(raw string) string {
	var builder strings.Builder
	builder.Grow(FriendCodeLength)

	for _, char := range strings.TrimSpace(raw) {
		switch {
		case char >= 'a' && char <= 'z':
			builder.WriteRune(char - 32)
		case (char >= 'A' && char <= 'Z') || (char >= '0' && char <= '9'):
			builder.WriteRune(char)
		}

		if builder.Len() >= FriendCodeLength {
			break
		}
	}

	return builder.String()
}

func LegacyFriendCodeFromUserID(userID string) string {
	normalized := NormalizeFriendCode(userID)
	if len(normalized) >= FriendCodeLength {
		return normalized[:FriendCodeLength]
	}

	return normalized
}

func ResolveUserDisplayName(user *core.Record) string {
	if user == nil {
		return ""
	}

	return strings.TrimSpace(user.GetString("name"))
}

func EnsureUserFriendCode(app core.App, user *core.Record) (string, error) {
	if user == nil {
		return "", errors.New("user record is required")
	}

	existing := NormalizeFriendCode(user.GetString("friendCode"))
	if len(existing) == FriendCodeLength {
		user.Set("friendCode", existing)
		return existing, nil
	}

	preferred := LegacyFriendCodeFromUserID(user.Id)
	if len(preferred) == FriendCodeLength {
		available, err := isFriendCodeAvailable(app, preferred, user.Id)
		if err != nil {
			return "", err
		}

		if available {
			user.Set("friendCode", preferred)
			return preferred, nil
		}
	}

	for i := 0; i < 16; i++ {
		candidate, err := randomFriendCode()
		if err != nil {
			return "", err
		}

		available, err := isFriendCodeAvailable(app, candidate, user.Id)
		if err != nil {
			return "", err
		}

		if available {
			user.Set("friendCode", candidate)
			return candidate, nil
		}
	}

	return "", errors.New("failed to generate unique friend code")
}

func isFriendCodeAvailable(app core.App, code string, excludeUserID string) (bool, error) {
	record, err := app.FindFirstRecordByFilter(
		"users",
		"friendCode = {:code}",
		dbx.Params{"code": code},
	)
	if errors.Is(err, sql.ErrNoRows) || record == nil {
		return true, nil
	}
	if err != nil {
		return false, fmt.Errorf("failed to check friend code availability: %w", err)
	}

	return record.Id == excludeUserID, nil
}

func randomFriendCode() (string, error) {
	bytes := make([]byte, FriendCodeLength)
	if _, err := rand.Read(bytes); err != nil {
		return "", fmt.Errorf("failed to generate friend code: %w", err)
	}

	var builder strings.Builder
	builder.Grow(FriendCodeLength)
	for _, value := range bytes {
		builder.WriteByte(friendCodeCharset[int(value)%len(friendCodeCharset)])
	}

	return builder.String(), nil
}
