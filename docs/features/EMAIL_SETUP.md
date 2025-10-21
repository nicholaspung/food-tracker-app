# Email Configuration Guide

Complete guide for setting up email sending in PocketBase for the Mobile Tracker App.

---

## Overview

PocketBase can send emails in two ways:
1. **SMTP** (recommended) - Use Gmail, Resend, SendGrid, or any SMTP provider
2. **Sendmail** - Use system's sendmail command (requires mail server setup)

**Quick Start**: If you want to get email working fast in production, jump to [Quick Start: Resend Setup](#quick-start-resend-setup) below.

---

## Quick Start: Resend Setup

**Recommended for production deployments** - This guide gets you up and running with Resend in ~15 minutes.

### Why Resend?

- ✅ **3,000 emails/month free** (plenty for most apps)
- ✅ Better deliverability than Gmail
- ✅ Modern dashboard with analytics
- ✅ Easy domain verification
- ✅ **SMTP password automatically encrypted** by PocketBase settings encryption

---

### Step 1: Create Resend Account (5 minutes)

1. **Sign up**: https://resend.com/signup

2. **Verify your email** (check inbox)

3. **Create an API Key**:
   - Dashboard → **API Keys** → **Create API Key**
   - Name: `PocketBase Production`
   - Permission: **Sending access**
   - Click **Create**
   - **Copy the API key** (starts with `re_...`)
   - ⚠️ Save it somewhere secure - you won't see it again!

---

### Step 2: Verify Your Domain (Recommended for Production)

**Option A: Testing Domain (Quick - 2 minutes)**
- Skip verification, use sender: `onboarding@resend.dev`
- Good for testing, not production-ready

**Option B: Verify Your Domain (Production - 10 minutes)**

1. In Resend dashboard → **Domains** → **Add Domain**

2. Enter your domain: `trackmyfoods.com`

3. **Add DNS Records** to your domain provider (DigitalOcean, Namecheap, Cloudflare, etc.):

   Resend will show you 3 records to add:

   ```dns
   # SPF Record
   Type: TXT
   Name: @
   Value: v=spf1 include:_spf.resend.com ~all

   # DKIM Record (exact values provided by Resend)
   Type: TXT
   Name: resend._domainkey
   Value: [copy from Resend dashboard]

   # DMARC Record (optional but recommended)
   Type: TXT
   Name: _dmarc
   Value: v=DMARC1; p=none; rua=mailto:your-email@gmail.com
   ```

4. **Wait 5-10 minutes** for DNS propagation

5. Click **"Verify"** in Resend dashboard

6. ✅ Status should show **"Verified"**

**Check DNS propagation**: https://dnschecker.org/

---

### Step 3: Configure PocketBase on VPS (5 minutes)

**SSH into your VPS:**

```bash
ssh deploy@your-vps-ip
cd /opt/mobile-tracker-app

# Make sure containers are running
docker compose ps
```

**Open PocketBase Admin UI:**

- **Production**: https://trackmyfoods.com/_/
- **Beta**: https://beta.trackmyfoods.com/_/

**Configure SMTP:**

1. **Login** with your admin credentials

2. Click **Settings** (gear icon) → **Mail settings**

3. **Fill in the form**:

   ```
   SMTP server host: smtp.resend.com
   SMTP server port: 587
   Username: resend
   Password: [paste your Resend API key: re_...]

   ☑ Use TLS (check this box)

   Sender name: Mobile Tracker App
   Sender address: noreply@trackmyfoods.com
   ```

   **Note**: If domain not verified yet, use `onboarding@resend.dev` as sender address

4. **Test the configuration**:
   - Scroll down to **"Test email template"**
   - Enter your email address
   - Click **"Send test email"**
   - ✅ Check your inbox (and spam folder!)
   - ✅ Check Resend dashboard → **Logs** to see delivery status

5. **Save changes** (blue button at bottom)

6. **Configure Application URL** (required for email links):
   - In the same Settings page, scroll to the top
   - Find **"Application URL"** field
   - Enter your domain URL:
     - **Production**: `https://trackmyfoods.com`
     - **Beta**: `https://beta.trackmyfoods.com`
   - Click **Save settings**

   **Why this matters**: This URL is used in verification emails, password reset emails, and any email template that uses the `{APP_URL}` placeholder. Without this, emails will contain incorrect links!

7. **Repeat for beta** environment at https://beta.trackmyfoods.com/_/ (optional)

---

### Step 4: Verify Encryption (2 minutes)

Your Resend API key is now **encrypted at rest** using the ENCRYPTION_KEY we set up!

**Verify encryption is active:**

```bash
# On your VPS
cd /opt/mobile-tracker-app

# Check encryption key is loaded
docker compose exec pocketbase sh -c 'echo $ENCRYPTION_KEY' | wc -c
# Should output: 33 (32 characters + newline)

# If empty, generate keys:
bash scripts/generate-encryption-keys.sh
docker compose restart pocketbase
```

---

### Step 5: Test Email Delivery

**Test 1: Password Reset Email**

1. Logout of your app
2. Click **"Forgot Password"**
3. Enter your email
4. Check inbox for password reset email

**Test 2: Monitor Resend Dashboard**

1. Go to Resend dashboard → **Logs**
2. See your test emails with delivery status
3. Check open rates and click tracking

---

### Configuration Summary

| Setting | Value |
|---------|-------|
| **Provider** | Resend |
| **SMTP Host** | `smtp.resend.com` |
| **SMTP Port** | `587` (TLS) |
| **Username** | `resend` |
| **Password** | Your API key (encrypted at rest!) |
| **Sender** | `noreply@trackmyfoods.com` |
| **Free Tier** | 3,000 emails/month |
| **Paid Tier** | $20/month for 50,000 emails |

✅ **Your SMTP password is automatically encrypted** by PocketBase using the ENCRYPTION_KEY environment variable!

---

### Troubleshooting Resend

**"Test email not received"**
1. Check spam folder
2. Check Resend dashboard → **Logs** for errors
3. Verify SMTP credentials are correct (username must be `resend`)
4. Ensure port 587 is accessible (usually is by default)

**"Authentication failed"**
- Double-check API key starts with `re_...`
- Username must be exactly `resend` (lowercase)
- Try regenerating API key in Resend dashboard

**"Emails go to spam"**
- Verify your domain in Resend dashboard
- Add SPF, DKIM, DMARC DNS records (shown in Step 2)
- Use `noreply@trackmyfoods.com` instead of test domain

**"Domain not verified"**
- Wait 10-15 minutes after adding DNS records
- Check DNS propagation: https://dnschecker.org/
- Verify all 3 DNS records were added correctly
- Click "Verify" button in Resend dashboard again

---

## Option 1: SMTP Configuration (Recommended)

### Step 1: Choose an Email Provider

#### A. Gmail (Free, Easy Setup)

**Best for**: Personal projects, testing

1. **Enable 2-Factor Authentication** on your Google account
   - Go to https://myaccount.google.com/security
   - Enable "2-Step Verification"

2. **Create an App Password**
   - Go to https://myaccount.google.com/apppasswords
   - Select "Mail" and your device
   - Copy the 16-character password

**SMTP Settings:**
```
Host: smtp.gmail.com
Port: 587 (TLS) or 465 (SSL)
Username: your-email@gmail.com
Password: [16-character app password]
```

**Limitations:**
- 500 emails per day
- May flag suspicious activity if sending too fast

---

#### B. Resend (Free Tier: 3,000/month, Modern)

**Best for**: Production apps, transactional emails

1. **Sign up**: https://resend.com/signup
2. **Verify your domain** (or use onboarding@resend.dev for testing)
3. **Create API key**:
   - Go to "API Keys" in dashboard
   - Create new key with "Sending access"

**SMTP Settings:**
```
Host: smtp.resend.com
Port: 587 (TLS) or 465 (SSL)
Username: resend
Password: [Your API key]
```

**Benefits:**
- ✅ 3,000 emails/month free
- ✅ Better deliverability than Gmail
- ✅ Email analytics
- ✅ Modern API

---

#### C. SendGrid (Free Tier: 100/day)

**Best for**: Higher volume

1. **Sign up**: https://signup.sendgrid.com/
2. **Verify sender identity** (email or domain)
3. **Create API key**:
   - Settings → API Keys → Create API Key
   - Select "Full Access"

**SMTP Settings:**
```
Host: smtp.sendgrid.net
Port: 587 (TLS) or 465 (SSL)
Username: apikey
Password: [Your API key]
```

---

#### D. Other Providers

| Provider | Free Tier | SMTP Host |
|----------|-----------|-----------|
| **Mailgun** | 5,000/month (first 3 months) | smtp.mailgun.org |
| **AWS SES** | 62,000/month (if in EC2) | email-smtp.us-east-1.amazonaws.com |
| **Postmark** | 100/month | smtp.postmarkapp.com |
| **Brevo (Sendinblue)** | 300/day | smtp-relay.brevo.com |

---

### Step 2: Configure PocketBase SMTP Settings

#### Via Admin Dashboard (Recommended for Production)

1. **Start PocketBase** (must be running):
   ```bash
   cd backend
   go run main.go serve
   ```

2. **Open Admin UI**: http://localhost:8090/_/

3. **Login** or create admin account (first time)

4. **Navigate to**: Settings → Mail settings

5. **Fill in SMTP settings**:
   ```
   Sender name: Mobile Tracker App
   Sender address: noreply@trackmyfoods.com

   SMTP server host: smtp.gmail.com (or other provider)
   Port: 587
   Username: your-email@gmail.com
   Password: [app password or API key]
   TLS: ✓ Enabled
   ```

6. **Test email**:
   - Scroll down to "Test email template"
   - Enter your email address
   - Click "Send test email"
   - Check inbox (and spam folder)

7. **Configure Application URL** (⚠️ Important!):
   - Scroll to the top of Settings page
   - Find **"Application URL"** field
   - Enter: `https://trackmyfoods.com` (or your domain)
   - This is used in verification emails, password reset links, etc.

8. **Save settings**

---

#### Via Environment Variables (Docker Deployment)

For production deployment, you can configure SMTP via environment variables.

**Update `docker-compose.yml`:**

```yaml
services:
  pocketbase:
    image: ghcr.io/pocketbase/pocketbase:latest
    container_name: pocketbase
    restart: unless-stopped

    environment:
      # SMTP Configuration
      - SMTP_HOST=smtp.gmail.com
      - SMTP_PORT=587
      - SMTP_USERNAME=your-email@gmail.com
      - SMTP_PASSWORD=${SMTP_PASSWORD}  # Set via .env file
      - SMTP_TLS_ENABLED=true

      # Email settings
      - MAIL_SENDER_NAME=Mobile Tracker App
      - MAIL_SENDER_ADDRESS=noreply@trackmyfoods.com

    ports:
      - "127.0.0.1:8090:8090"

    volumes:
      - ./pb_data:/pb/pb_data
      - ./pb_public:/pb/pb_public
```

**Update root `.env`:**

```bash
# SMTP Configuration
SMTP_PASSWORD=your-app-password-or-api-key
```

**Note**: PocketBase admin settings override environment variables. For production, configure via admin dashboard after deployment.

---

## Option 2: Domain Email Setup (Advanced)

To send emails from `noreply@trackmyfoods.com` instead of Gmail:

### Step 1: Add DNS Records

Add these records to your domain DNS (via your domain registrar):

```
Type: MX
Host: @
Value: mx1.forwardemail.net
Priority: 10

Type: MX
Host: @
Value: mx2.forwardemail.net
Priority: 20

Type: TXT
Host: @
Value: forward-email=admin:22228236+nicholaspung@users.noreply.github.com
```

This uses **ForwardEmail.net** (free) to forward emails to your Gmail.

### Step 2: Use SMTP Provider with Verified Domain

Most SMTP providers (Resend, SendGrid, etc.) require domain verification:

1. **Add TXT record** provided by your SMTP service
2. **Verify domain** in provider dashboard
3. **Set sender address** to `noreply@trackmyfoods.com`

---

## Programmatic Email Sending

### Basic Email Sending

Update `backend/main.go` to send custom emails:

```go
package main

import (
	"log"
	"net/mail"
	"os"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/mailer"
)

func main() {
	app := pocketbase.New()

	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		// Serve static files
		se.Router.GET("/{path...}", apis.Static(os.DirFS("./pb_public"), false))

		return se.Next()
	})

	// Example: Send welcome email after user registration
	app.OnRecordAfterCreateSuccess("users").BindFunc(func(e *core.RecordEvent) error {
		message := &mailer.Message{
			From: mail.Address{
				Address: e.App.Settings().Meta.SenderAddress,
				Name:    e.App.Settings().Meta.SenderName,
			},
			To:      []mail.Address{{Address: e.Record.Email()}},
			Subject: "Welcome to Mobile Tracker App!",
			HTML: `
				<h1>Welcome!</h1>
				<p>Thank you for signing up for Mobile Tracker App.</p>
				<p>Get started by logging in at <a href="https://trackmyfoods.com">trackmyfoods.com</a></p>
			`,
		}

		return e.App.NewMailClient().Send(message)
	})

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}
```

---

### Advanced: Custom Email Template

Create reusable email templates:

```go
// Helper function for sending emails
func sendEmail(app *pocketbase.PocketBase, to string, subject string, htmlBody string) error {
	message := &mailer.Message{
		From: mail.Address{
			Address: app.Settings().Meta.SenderAddress,
			Name:    app.Settings().Meta.SenderName,
		},
		To:      []mail.Address{{Address: to}},
		Subject: subject,
		HTML:    htmlBody,
	}

	return app.NewMailClient().Send(message)
}

// Usage in hooks
app.OnRecordAfterCreateSuccess("users").BindFunc(func(e *core.RecordEvent) error {
	htmlBody := `
		<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
			<h1 style="color: #333;">Welcome to Mobile Tracker App!</h1>
			<p>Hi ` + e.Record.GetString("name") + `,</p>
			<p>Thank you for signing up. We're excited to have you on board!</p>
			<a href="https://trackmyfoods.com" style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
				Get Started
			</a>
		</div>
	`

	return sendEmail(e.App, e.Record.Email(), "Welcome!", htmlBody)
})
```

---

### Common Email Use Cases

#### 1. Password Reset Email (Built-in)

PocketBase automatically sends password reset emails. Just configure SMTP and it works!

```javascript
// Frontend: Request password reset
import { pb } from '@/lib/pocketbase'

await pb.collection('users').requestPasswordReset('user@example.com')
```

---

#### 2. Email Verification (Built-in)

```javascript
// Frontend: Request verification email
await pb.collection('users').requestVerification('user@example.com')
```

PocketBase uses your SMTP settings automatically.

---

#### 3. Custom Notification Emails

```go
// Send notification when user creates a new tracking entry
app.OnRecordAfterCreateSuccess("tracking_entries").BindFunc(func(e *core.RecordEvent) error {
	// Get user who created the entry
	user, err := e.App.FindRecordById("users", e.Record.GetString("user_id"))
	if err != nil {
		return err
	}

	htmlBody := `
		<h2>New Tracking Entry Created</h2>
		<p>Your entry has been saved successfully.</p>
		<p>Entry details: ` + e.Record.GetString("details") + `</p>
	`

	return sendEmail(e.App, user.Email(), "Entry Created", htmlBody)
})
```

---

## Testing Email Configuration

### 1. Test via Admin UI

1. Go to http://localhost:8090/_/
2. Settings → Mail settings
3. Scroll to "Test email template"
4. Enter your email
5. Click "Send test email"

---

### 2. Test Programmatically

Create a test endpoint in `main.go`:

```go
app.OnServe().BindFunc(func(se *core.ServeEvent) error {
	// Test email endpoint (remove in production!)
	se.Router.GET("/test-email", func(e *core.RequestEvent) error {
		message := &mailer.Message{
			From: mail.Address{
				Address: e.App.Settings().Meta.SenderAddress,
				Name:    e.App.Settings().Meta.SenderName,
			},
			To:      []mail.Address{{Address: "22228236+nicholaspung@users.noreply.github.com"}},
			Subject: "Test Email",
			HTML:    "<h1>Email configuration working!</h1>",
		}

		err := e.App.NewMailClient().Send(message)
		if err != nil {
			return e.JSON(500, map[string]string{"error": err.Error()})
		}

		return e.JSON(200, map[string]string{"status": "Email sent!"})
	})

	return se.Next()
})
```

Test it:
```bash
curl http://localhost:8090/test-email
```

---

## Production Checklist

- [ ] SMTP provider chosen (Resend, SendGrid, Gmail)
- [ ] SMTP credentials configured in PocketBase admin UI
- [ ] **Application URL configured** (Settings → Application URL)
- [ ] Test email sent successfully
- [ ] Sender address set to your domain (optional)
- [ ] DNS records configured (if using custom domain email)
- [ ] Welcome email hook implemented (optional)
- [ ] Remove test endpoints before deploying

---

## Troubleshooting

### "Failed to send email"

1. **Check SMTP credentials**:
   - Admin UI → Settings → Mail settings
   - Click "Send test email"

2. **Check SMTP port**:
   - Port 587 (TLS) - Most common
   - Port 465 (SSL) - Alternative
   - Port 25 - Often blocked by VPS providers

3. **Check firewall**:
   ```bash
   # Allow SMTP ports
   sudo ufw allow out 587/tcp
   sudo ufw allow out 465/tcp
   ```

4. **Check provider logs**:
   - Gmail: https://myaccount.google.com/security
   - Resend: Dashboard → Logs
   - SendGrid: Dashboard → Activity

---

### "Email goes to spam"

1. **Use verified domain email** (not Gmail)
2. **Add SPF record**:
   ```
   Type: TXT
   Host: @
   Value: v=spf1 include:_spf.google.com ~all
   ```
   (Replace `google.com` with your SMTP provider)

3. **Add DKIM record** (provided by your SMTP service)

4. **Add DMARC record**:
   ```
   Type: TXT
   Host: _dmarc
   Value: v=DMARC1; p=none; rua=mailto:22228236+nicholaspung@users.noreply.github.com
   ```

---

### "Gmail blocks login"

1. Enable "Less secure app access" (not recommended)
2. **Use App Password instead** (recommended):
   - https://myaccount.google.com/apppasswords
   - Create new app password
   - Use that instead of your regular password

---

## Recommended Setup for Production

**For trackmyfoods.com:**

1. **Use Resend** (best deliverability + free tier):
   - Sign up: https://resend.com
   - Verify domain `trackmyfoods.com`
   - Create API key
   - Configure in PocketBase:
     ```
     Host: smtp.resend.com
     Port: 587
     Username: resend
     Password: [API key]
     Sender: noreply@trackmyfoods.com
     ```

2. **Add DNS records** (in your domain registrar):
   ```
   # SPF (provided by Resend)
   Type: TXT
   Host: @
   Value: v=spf1 include:_spf.resend.com ~all

   # DKIM (provided by Resend after domain verification)
   Type: TXT
   Host: resend._domainkey
   Value: [provided by Resend]
   ```

3. **Test thoroughly** before production
4. **Monitor email delivery** via Resend dashboard

---

## Cost Comparison

| Provider | Free Tier | Cost After |
|----------|-----------|------------|
| **Gmail** | 500/day | N/A (personal use) |
| **Resend** | 3,000/month | $20/month (50k emails) |
| **SendGrid** | 100/day | $15/month (40k emails) |
| **Mailgun** | 5,000/month (3 months) | $35/month (50k emails) |
| **AWS SES** | 62,000/month (in EC2) | $0.10 per 1,000 emails |
| **Postmark** | 100/month | $15/month (10k emails) |

**Recommendation**: Start with **Resend** (3,000/month free) or **Gmail** (500/day free).

---

## Next Steps

1. Choose SMTP provider (Resend recommended)
2. Configure SMTP in PocketBase admin UI
3. Test email sending
4. Implement welcome email hook (optional)
5. Add to ENV_GUIDE.md if using environment variables

---

## Questions?

See [DISASTER_RECOVERY.md](DISASTER_RECOVERY.md) or create an issue.
