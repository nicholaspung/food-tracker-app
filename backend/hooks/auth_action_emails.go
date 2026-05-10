package hooks

import (
	"strings"

	"github.com/pocketbase/pocketbase/core"

	"myapp/lib"
)

func RegisterAuthActionEmailHooks(app core.App, resources lib.RuntimeResources) {
	app.OnMailerRecordPasswordResetSend("users").BindFunc(func(e *core.MailerRecordEvent) error {
		token, ok := authActionEmailToken(e)
		if !ok {
			return e.Next()
		}

		links, err := lib.BuildAuthActionLinks(resources, lib.AuthActionPasswordReset, token)
		if err != nil {
			return err
		}

		e.Message.Subject = "Reset your Yummy Recs password"
		e.Message.HTML = lib.BuildTransactionalEmailHTML(lib.TransactionalEmailInput{
			AppURL:          links.AppURL,
			Body:            "Use the button below to choose a new password for your Yummy Recs account.",
			ButtonLabel:     "Reset password",
			MarketingURL:    links.MarketingURL,
			Preheader:       "Choose a new password for your Yummy Recs account.",
			SafetyNote:      "If you did not ask to reset your password, you can ignore this email.",
			SecondaryPrompt: "Already have the app installed?",
			SecondaryLabel:  "Open this in Yummy Recs.",
			Title:           "Reset your password",
			WebURL:          links.WebURL,
		})

		return e.Next()
	})

	app.OnMailerRecordVerificationSend("users").BindFunc(func(e *core.MailerRecordEvent) error {
		token, ok := authActionEmailToken(e)
		if !ok {
			return e.Next()
		}

		links, err := lib.BuildAuthActionLinks(resources, lib.AuthActionVerifyEmail, token)
		if err != nil {
			return err
		}

		e.Message.Subject = "Verify your Yummy Recs email"
		e.Message.HTML = lib.BuildTransactionalEmailHTML(lib.TransactionalEmailInput{
			AppURL:          links.AppURL,
			Body:            "Use the button below to verify your email address and keep your Yummy Recs account active.",
			ButtonLabel:     "Verify email",
			MarketingURL:    links.MarketingURL,
			Preheader:       "Verify your email address for Yummy Recs.",
			SafetyNote:      "If you did not create a Yummy Recs account, you can ignore this email.",
			SecondaryPrompt: "Already have the app installed?",
			SecondaryLabel:  "Open this in Yummy Recs.",
			Title:           "Verify your email",
			WebURL:          links.WebURL,
		})

		return e.Next()
	})
}

func authActionEmailToken(e *core.MailerRecordEvent) (string, bool) {
	if e == nil || e.Message == nil || e.Meta == nil {
		return "", false
	}

	token, ok := e.Meta["token"].(string)
	token = strings.TrimSpace(token)
	if !ok || token == "" || strings.Count(token, ".") != 2 {
		return "", false
	}

	return token, true
}
