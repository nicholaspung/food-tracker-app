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
  <body bgcolor="#f7f4ef">
    <table role="presentation" width="100%%" cellspacing="0" cellpadding="32" bgcolor="#f7f4ef">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellspacing="0" cellpadding="32" bgcolor="#ffffff">
            <tr>
              <td style="font-family:Arial,Helvetica,sans-serif;color:#241f1b;">
                <span style="font-size:12px;color:#75695f;">%s</span>
                <br><br>
                <span style="font-size:14px;color:#8a5a35;"><strong>Yummy Recs</strong></span>
                <br><br>
                <span style="font-size:28px;color:#241f1b;"><strong>%s</strong></span>
                <br><br>
                <span style="font-size:16px;color:#4b4038;">%s</span>
                <br><br>
                %s
                <br><br>
                <span style="font-size:14px;color:#5c5148;">%s %s</span>
                <br><br>
                <span style="font-size:14px;color:#5c5148;">%s</span>
                <br><br>
                <span style="font-size:13px;color:#75695f;">Visit %s.</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`,
		escapeEmailText(input.Preheader),
		escapeEmailText(input.Title),
		escapeEmailText(input.Body),
		renderButton(input.WebURL, input.ButtonLabel),
		escapeEmailText(input.SecondaryPrompt),
		renderTextLink(input.AppURL, input.SecondaryLabel),
		escapeEmailText(input.SafetyNote),
		renderTextLink(input.MarketingURL, "Yummy Recs"),
	)
}

func escapeEmailText(value string) string {
	return html.EscapeString(value)
}

func renderButton(href string, label string) string {
	return fmt.Sprintf(`<table role="presentation" cellspacing="0" cellpadding="13" bgcolor="#8a5a35">
                  <tr>
                    <td style="font-family:Arial,Helvetica,sans-serif;font-size:16px;">
                      <a href="%s" style="color:#ffffff;"><strong>%s</strong></a>
                    </td>
                  </tr>
                </table>`, escapeEmailText(href), escapeEmailText(label))
}

func renderTextLink(href string, label string) string {
	return fmt.Sprintf(`<a href="%s" style="color:#8a5a35;"><strong>%s</strong></a>`, escapeEmailText(href), escapeEmailText(label))
}
