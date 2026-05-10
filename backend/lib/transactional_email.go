package lib

import (
	"fmt"
	"html"
)

type TransactionalEmailInput struct {
	AppURL          string
	Body            string
	ButtonLabel     string
	MarketingURL    string
	Preheader       string
	SafetyNote      string
	SecondaryPrompt string
	SecondaryLabel  string
	Title           string
	WebURL          string
}

func BuildTransactionalEmailHTML(input TransactionalEmailInput) string {
	return fmt.Sprintf(`<!doctype html>
<html>
  <body style="margin:0;background:#f7f4ef;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#241f1b;">
    <div style="display:none;max-height:0;overflow:hidden;">%s</div>
    <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" style="background:#f7f4ef;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:16px;padding:32px;border:1px solid #e6ded5;">
            <tr>
              <td>
                <p style="margin:0 0 8px;font-size:14px;color:#8a5a35;font-weight:700;">Yummy Recs</p>
                <h1 style="margin:0 0 16px;font-size:28px;line-height:1.2;color:#241f1b;">%s</h1>
                <p style="margin:0 0 24px;font-size:16px;line-height:1.5;color:#4b4038;">%s</p>
                <p style="margin:0 0 24px;">
                  <a href="%s" target="_blank" rel="noopener" style="display:inline-block;background:#8a5a35;color:#ffffff;text-decoration:none;border-radius:8px;padding:13px 18px;font-weight:700;">%s</a>
                </p>
                <p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:#5c5148;">%s <a href="%s" style="color:#8a5a35;font-weight:700;">%s</a></p>
                <p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:#5c5148;">%s</p>
                <p style="margin:0;font-size:13px;line-height:1.5;color:#75695f;">Visit <a href="%s" style="color:#8a5a35;">Yummy Recs</a>.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`,
		html.EscapeString(input.Preheader),
		html.EscapeString(input.Title),
		html.EscapeString(input.Body),
		html.EscapeString(input.WebURL),
		html.EscapeString(input.ButtonLabel),
		html.EscapeString(input.SecondaryPrompt),
		html.EscapeString(input.AppURL),
		html.EscapeString(input.SecondaryLabel),
		html.EscapeString(input.SafetyNote),
		html.EscapeString(input.MarketingURL),
	)
}
