package hooks

import (
	"net/http"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"

	"myapp/lib"
)

// RegisterEmailVerificationHooks allows new users to use the app during the
// initial 72-hour verification grace period and blocks authenticated access
// after the grace window expires.
func RegisterEmailVerificationHooks(app core.App) {
	app.OnRecordAuthRequest("users").BindFunc(func(e *core.RecordAuthRequestEvent) error {
		if lib.IsEmailVerificationGraceExpired(e.Record, time.Now().UTC()) {
			return apis.NewForbiddenError(lib.EmailVerificationRequiredMessage, nil)
		}

		return e.Next()
	})

	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		se.Router.BindFunc(func(e *core.RequestEvent) error {
			if shouldBypassEmailVerificationMiddleware(e) {
				return e.Next()
			}

			if lib.IsEmailVerificationGraceExpired(e.Auth, time.Now().UTC()) {
				return apis.NewForbiddenError(lib.EmailVerificationRequiredMessage, nil)
			}

			return e.Next()
		})

		return se.Next()
	})
}

func shouldBypassEmailVerificationMiddleware(e *core.RequestEvent) bool {
	if e == nil || e.Auth == nil || e.HasSuperuserAuth() {
		return true
	}

	if !strings.HasPrefix(strings.TrimSpace(e.Request.URL.Path), "/api/") {
		return true
	}

	if e.Auth.Collection().Name != "users" {
		return true
	}

	path := strings.TrimSpace(e.Request.URL.Path)
	method := strings.ToUpper(strings.TrimSpace(e.Request.Method))

	return method == http.MethodPost && (path == "/api/collections/users/request-verification" ||
		path == "/api/collections/users/confirm-verification")
}
