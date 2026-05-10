package lib

import (
	"strings"
	"testing"
)

func TestBuildTransactionalEmailHTMLRendersBrandTitleAndCTA(t *testing.T) {
	html := BuildTransactionalEmailHTML(TransactionalEmailInput{
		AppURL:          "yummyrecs://reset-password?token=abc",
		Body:            "Use the button below to choose a new password.",
		ButtonLabel:     "Reset password",
		MarketingURL:    "https://yummyrecs.com",
		Preheader:       "Choose a new password.",
		SafetyNote:      "Ignore this email if you did not request it.",
		SecondaryPrompt: "Already have the app installed?",
		SecondaryLabel:  "Open this in Yummy Recs.",
		Title:           "Reset your password",
		WebURL:          "https://app.yummyrecs.com/reset-password?token=abc",
	})

	for _, expected := range []string{
		"Yummy Recs",
		"Reset your password",
		`href="https://app.yummyrecs.com/reset-password?token=abc"`,
		"Reset password",
		`href="yummyrecs://reset-password?token=abc"`,
		"Open this in Yummy Recs.",
		`href="https://yummyrecs.com"`,
	} {
		if !strings.Contains(html, expected) {
			t.Fatalf("expected rendered email HTML to contain %q, got %s", expected, html)
		}
	}
}

func TestBuildTransactionalEmailHTMLEscapesInput(t *testing.T) {
	renderedHTML := BuildTransactionalEmailHTML(TransactionalEmailInput{
		AppURL:          `yummyrecs://signup?email="><script>alert(1)</script>`,
		Body:            `Create an account for <script>alert("body")</script>.`,
		ButtonLabel:     `<script>Click</script>`,
		MarketingURL:    `https://yummyrecs.com?next="><script>alert(2)</script>`,
		Preheader:       `<script>preheader</script>`,
		SafetyNote:      `<script>safety</script>`,
		SecondaryPrompt: `<script>prompt</script>`,
		SecondaryLabel:  `<script>secondary</script>`,
		Title:           `<script>title</script>`,
		WebURL:          `https://app.yummyrecs.com/signup?email="><script>alert(3)</script>`,
	})

	if strings.Contains(renderedHTML, "<script>") || strings.Contains(renderedHTML, `email=">`) {
		t.Fatalf("expected unsafe input to be escaped, got %s", renderedHTML)
	}

	for _, expected := range []string{
		"&lt;script&gt;title&lt;/script&gt;",
		"Create an account for &lt;script&gt;alert(&#34;body&#34;)&lt;/script&gt;.",
		"&lt;script&gt;Click&lt;/script&gt;",
		"email=&#34;&gt;&lt;script&gt;alert(3)&lt;/script&gt;",
	} {
		if !strings.Contains(renderedHTML, expected) {
			t.Fatalf("expected escaped email HTML to contain %q, got %s", expected, renderedHTML)
		}
	}
}
