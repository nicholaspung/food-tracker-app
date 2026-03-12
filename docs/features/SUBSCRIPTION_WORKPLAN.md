# Subscription & Monetization Workplan

## Executive Summary

This document outlines the implementation plan for adding a subscription-based monetization model to the Yummy Recs app. The model balances user retention with revenue generation through a generous 6-month trial and thoughtful feature limitations for free users.

**Subscription Model:**
- **Trial Period**: 6 months full access for all new users
- **Free Tier (post-trial)**: Full access to own data, limited friend data visibility
- **Paid Tier**: Unlimited access to all features

---

## Current Requirements

### Free Tier Limitations (After 6-Month Trial)
1. **Friends' Visits**: Only view last 6 months of friends' visit data
2. **Bill Pay Feature**: Limited to 5 bills per month (when implemented)
3. **Own Data**: Full unlimited access to all personal visits/ratings

### Paid Tier Benefits
1. **Unlimited Friends' Visit History**: View all historical friend data
2. **Unlimited Bill Pay**: No restrictions on bill splitting feature
3. **Future Premium Features**: Early access to new features

---

## Architecture Overview

### Data Model

**New Fields on `users` Collection:**
```go
// Subscription status tracking
subscriptionStatus (select)
  - "trial" (default for new users)
  - "active" (paid subscription active)
  - "expired" (trial ended, no subscription)
  - "canceled" (was subscribed, now canceled)
  - "lifetime" (special tier for early adopters/admins)

trialStartDate (date)
  - Set on account creation
  - Used to calculate trial expiration

trialEndDate (date)
  - Auto-calculated: trialStartDate + 6 months
  - Denormalized for performance (avoid calculating repeatedly)

subscriptionProvider (select, optional)
  - "stripe" (for web payments)
  - "apple" (for iOS in-app purchase)
  - "google" (for Android in-app purchase)
  - null for non-subscribers

subscriptionId (text, optional)
  - External subscription ID from payment provider
  - Used for webhooks and subscription management

subscriptionCurrentPeriodEnd (date, optional)
  - When current billing period ends
  - Used to show "renews on" date

subscriptionCanceledAt (date, optional)
  - When user canceled subscription
  - If set and < currentPeriodEnd, subscription still active until period end

monthlyBillPayCount (number, default: 0)
  - Tracks bill splits created this month
  - Reset to 0 on 1st of each month via cron job
  - Only enforced for free tier users
```

**New Collection: `subscription_events`** (Audit Log)
```go
collection: "subscription_events"

Fields:
- user (relation to users, required)
- eventType (select, required)
  - "trial_started"
  - "trial_ending_soon" (7 days before)
  - "trial_expired"
  - "subscription_created"
  - "subscription_renewed"
  - "subscription_canceled"
  - "subscription_expired"
  - "payment_failed"
  - "refund_issued"
- provider (select, optional): "stripe", "apple", "google"
- externalEventId (text, optional) - ID from payment provider
- metadata (json, optional) - Additional event data
- created (autodate)

Rules:
- Only admins can view/create (system-generated)
```

**New Collection: `feature_usage`** (Optional - Analytics)
```go
collection: "feature_usage"

Fields:
- user (relation to users, required)
- featureName (select, required)
  - "bill_pay"
  - "friends_visit_view"
  - "export_data" (future)
- usageCount (number, default: 0)
- lastUsed (date)
- periodStart (date) - For monthly resets
- created (autodate)

Rules:
- User can only view their own
- System updates
```

---

## Phase 1: Core Subscription Infrastructure

### 1.1 Database Schema & Migrations

**Migration 1: `add_subscription_fields_to_users`**
- Add all subscription-related fields to users collection
- Default `subscriptionStatus = "trial"` for new users
- Set `trialStartDate = created` (account creation date)
- Set `trialEndDate = created + 6 months`

**Migration 2: `backfill_subscription_status_for_existing_users`**
- For all existing users:
  - Calculate trial status based on account age
  - If account > 6 months old: `subscriptionStatus = "expired"`
  - If account < 6 months old: `subscriptionStatus = "trial"`, calculate remaining trial

**Important Decision**: How to handle existing users?
- **Option A (Generous)**: Grant all existing users lifetime free access (`subscriptionStatus = "lifetime"`)
- **Option B (Phased)**: Give existing users extended 12-month trial from rollout date
- **Option C (Standard)**: Apply 6-month trial retroactively based on account age
- **Recommendation**: Option B - reward early adopters without giving up future revenue

**Migration 3: `create_subscription_events_collection`**
- Create audit log for subscription lifecycle events
- Backfill `trial_started` events for existing users

**Migration 4: `create_feature_usage_collection`**
- Create usage tracking for rate-limited features

### 1.2 Backend Subscription Helper Functions

**New File: `backend/subscription/status.go`**

```go
package subscription

import (
  "time"
  "github.com/pocketbase/pocketbase/core"
)

// SubscriptionStatus represents user's subscription state
type SubscriptionStatus string

const (
  StatusTrial    SubscriptionStatus = "trial"
  StatusActive   SubscriptionStatus = "active"
  StatusExpired  SubscriptionStatus = "expired"
  StatusCanceled SubscriptionStatus = "canceled"
  StatusLifetime SubscriptionStatus = "lifetime"
)

// IsSubscriptionActive returns true if user has access to premium features
func IsSubscriptionActive(user *core.Record) bool {
  status := user.GetString("subscriptionStatus")

  switch status {
  case string(StatusActive), string(StatusLifetime), string(StatusTrial):
    return true
  case string(StatusCanceled):
    // Check if still in grace period
    periodEnd := user.GetDateTime("subscriptionCurrentPeriodEnd")
    return periodEnd.Time().After(time.Now())
  default:
    return false
  }
}

// GetTrialDaysRemaining calculates days left in trial
func GetTrialDaysRemaining(user *core.Record) int {
  if user.GetString("subscriptionStatus") != string(StatusTrial) {
    return 0
  }

  trialEnd := user.GetDateTime("trialEndDate")
  if trialEnd.IsZero() {
    return 0
  }

  duration := time.Until(trialEnd.Time())
  days := int(duration.Hours() / 24)

  if days < 0 {
    return 0
  }
  return days
}

// CanAccessFriendsHistory checks if user can view friend visits older than 6 months
func CanAccessFriendsHistory(user *core.Record) bool {
  return IsSubscriptionActive(user)
}

// CanCreateBillSplit checks if user has remaining bill splits this month
func CanCreateBillSplit(user *core.Record) (bool, int) {
  if IsSubscriptionActive(user) {
    return true, -1 // -1 means unlimited
  }

  monthlyCount := user.GetInt("monthlyBillPayCount")
  const freeLimit = 5

  remaining := freeLimit - monthlyCount
  if remaining < 0 {
    remaining = 0
  }

  return monthlyCount < freeLimit, remaining
}
```

### 1.3 Custom API Endpoints

**Endpoint 1: `GET /api/subscription/status`**

Returns current user's subscription information.

```go
// Response
{
  "subscriptionStatus": "trial",
  "isActive": true,
  "trialDaysRemaining": 145,
  "trialEndDate": "2025-04-30T00:00:00Z",
  "features": {
    "canAccessFriendsHistory": true,
    "billPayRemaining": -1, // -1 = unlimited, number = remaining
    "billPayLimit": null    // null if unlimited, number if limited
  },
  "subscription": null // or subscription object if exists
}

// When subscribed:
{
  "subscriptionStatus": "active",
  "isActive": true,
  "features": {
    "canAccessFriendsHistory": true,
    "billPayRemaining": -1,
    "billPayLimit": null
  },
  "subscription": {
    "provider": "stripe",
    "currentPeriodEnd": "2025-12-01T00:00:00Z",
    "canceledAt": null,
    "willRenew": true
  }
}
```

**Endpoint 2: `POST /api/subscription/create-checkout-session`**

Creates Stripe checkout session for subscription purchase.

```go
// Request
{
  "priceId": "price_xxx", // Stripe price ID
  "returnUrl": "https://app.yummyrecs.com/settings"
}

// Response
{
  "sessionId": "cs_test_xxx",
  "url": "https://checkout.stripe.com/pay/cs_test_xxx"
}
```

**Endpoint 3: `POST /api/subscription/create-portal-session`**

Creates Stripe customer portal session for managing subscription.

```go
// Response
{
  "url": "https://billing.stripe.com/p/session/test_xxx"
}
```

**Endpoint 4: `POST /api/webhooks/stripe`** (Unauthenticated)

Handles Stripe webhook events for subscription lifecycle.

Events to handle:
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_succeeded`
- `invoice.payment_failed`

**Endpoint 5: `GET /api/feature-usage/bill-pay`**

Returns bill pay usage for current month.

```go
// Response
{
  "used": 3,
  "limit": 5,
  "remaining": 2,
  "isUnlimited": false,
  "resetsOn": "2025-11-01T00:00:00Z"
}
```

### 1.4 PocketBase Hooks

**onCreate Hook - Users Collection:**
```go
// When new user is created, initialize trial
app.OnRecordCreate("users").Bind(&hook.Handler[*core.RecordEvent]{
  Func: func(e *core.RecordEvent) error {
    now := time.Now()
    trialEnd := now.AddDate(0, 6, 0) // 6 months from now

    e.Record.Set("subscriptionStatus", "trial")
    e.Record.Set("trialStartDate", now)
    e.Record.Set("trialEndDate", trialEnd)
    e.Record.Set("monthlyBillPayCount", 0)

    // Create audit log event
    createSubscriptionEvent(app, e.Record.Id, "trial_started", nil)

    return nil
  },
})
```

**Cron Job - Trial Expiration Check:**
```go
// Run daily at midnight
// Check for expired trials and send warnings

func checkExpiredTrials(app core.App) {
  now := time.Now()
  sevenDaysFromNow := now.AddDate(0, 0, 7)

  // Find trials expiring in 7 days (send warning email)
  expiringUsers := findUsersWhere(
    "subscriptionStatus = 'trial' AND trialEndDate >= ? AND trialEndDate <= ?",
    now, sevenDaysFromNow,
  )
  for _, user := range expiringUsers {
    sendTrialExpiringEmail(user)
    createSubscriptionEvent(app, user.Id, "trial_ending_soon", nil)
  }

  // Find trials that expired today
  expiredUsers := findUsersWhere(
    "subscriptionStatus = 'trial' AND trialEndDate <= ?",
    now,
  )
  for _, user := range expiredUsers {
    user.Set("subscriptionStatus", "expired")
    app.Save(user)
    createSubscriptionEvent(app, user.Id, "trial_expired", nil)
    sendTrialExpiredEmail(user)
  }
}
```

**Cron Job - Monthly Bill Pay Counter Reset:**
```go
// Run on 1st of each month at midnight
func resetMonthlyBillPayCounters(app core.App) {
  users := findAllUsers()
  for _, user := range users {
    user.Set("monthlyBillPayCount", 0)
    app.Save(user)
  }
}
```

---

## Phase 2: Payment Integration (Stripe)

### 2.1 Stripe Setup

**Stripe Products & Prices:**
```
Product: "Food Tracker Premium"

Price 1: Monthly ($4.99/month)
  - price_monthly_xxx
  - Recurring: every 1 month
  - Trial: none (app handles trial)

Price 2: Annual ($49.99/year) - 17% discount
  - price_annual_xxx
  - Recurring: every 12 months
  - Trial: none
```

**Stripe Customer Metadata:**
```
customer.metadata.pocketbase_user_id = "user_abc123"
```

**Stripe Subscription Metadata:**
```
subscription.metadata.pocketbase_user_id = "user_abc123"
subscription.metadata.app_version = "1.0.0"
```

### 2.2 Stripe Integration Code

**New File: `backend/payments/stripe.go`**

```go
package payments

import (
  "github.com/stripe/stripe-go/v78"
  "github.com/stripe/stripe-go/v78/checkout/session"
  "github.com/stripe/stripe-go/v78/customer"
  "github.com/stripe/stripe-go/v78/subscription"
)

func init() {
  stripe.Key = os.Getenv("STRIPE_SECRET_KEY")
}

// CreateCheckoutSession creates a Stripe checkout session
func CreateCheckoutSession(userID, email, priceID, returnURL string) (*stripe.CheckoutSession, error) {
  params := &stripe.CheckoutSessionParams{
    Mode: stripe.String(string(stripe.CheckoutSessionModeSubscription)),
    CustomerEmail: stripe.String(email),
    LineItems: []*stripe.CheckoutSessionLineItemParams{
      {
        Price: stripe.String(priceID),
        Quantity: stripe.Int64(1),
      },
    },
    SuccessURL: stripe.String(returnURL + "?session_id={CHECKOUT_SESSION_ID}"),
    CancelURL: stripe.String(returnURL),
    Metadata: map[string]string{
      "pocketbase_user_id": userID,
    },
  }

  return session.New(params)
}

// CreatePortalSession creates customer portal session
func CreatePortalSession(customerID, returnURL string) (*stripe.BillingPortalSession, error) {
  params := &stripe.BillingPortalSessionParams{
    Customer: stripe.String(customerID),
    ReturnURL: stripe.String(returnURL),
  }

  return portalsession.New(params)
}

// HandleWebhook processes Stripe webhook events
func HandleWebhook(payload []byte, signature string) error {
  webhookSecret := os.Getenv("STRIPE_WEBHOOK_SECRET")
  event, err := webhook.ConstructEvent(payload, signature, webhookSecret)
  if err != nil {
    return err
  }

  switch event.Type {
  case "customer.subscription.created":
    return handleSubscriptionCreated(event)
  case "customer.subscription.updated":
    return handleSubscriptionUpdated(event)
  case "customer.subscription.deleted":
    return handleSubscriptionDeleted(event)
  case "invoice.payment_failed":
    return handlePaymentFailed(event)
  }

  return nil
}
```

### 2.3 Webhook Event Handlers

**Subscription Created:**
```go
func handleSubscriptionCreated(event stripe.Event) error {
  var sub stripe.Subscription
  json.Unmarshal(event.Data.Raw, &sub)

  userID := sub.Metadata["pocketbase_user_id"]
  user := findUserById(userID)

  user.Set("subscriptionStatus", "active")
  user.Set("subscriptionProvider", "stripe")
  user.Set("subscriptionId", sub.ID)
  user.Set("subscriptionCurrentPeriodEnd", sub.CurrentPeriodEnd)
  app.Save(user)

  createSubscriptionEvent(app, userID, "subscription_created", map[string]any{
    "provider": "stripe",
    "subscriptionId": sub.ID,
  })

  sendWelcomeEmail(user)
  return nil
}
```

**Subscription Canceled:**
```go
func handleSubscriptionDeleted(event stripe.Event) error {
  var sub stripe.Subscription
  json.Unmarshal(event.Data.Raw, &sub)

  userID := sub.Metadata["pocketbase_user_id"]
  user := findUserById(userID)

  // Subscription already ended (no grace period)
  user.Set("subscriptionStatus", "canceled")
  user.Set("subscriptionCanceledAt", time.Now())
  user.Set("subscriptionCurrentPeriodEnd", nil)
  app.Save(user)

  createSubscriptionEvent(app, userID, "subscription_expired", nil)
  return nil
}
```

### 2.4 Environment Variables

```bash
# .env file
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_PUBLISHABLE_KEY=pk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_PRICE_MONTHLY=price_xxx
STRIPE_PRICE_ANNUAL=price_xxx
```

---

## Phase 3: Feature Gating & Access Control

### 3.1 Backend Access Control

**Update Visit List Rules:**

Current rule allows viewing friend visits based on friendship + visit visibility.
Add time-based restriction for free tier users.

```go
// New rule for visits collection ListRule
// Allow viewing if:
// 1. Own visit, OR
// 2. Friend's visit within 6 months (if free tier), OR
// 3. Friend's visit any time (if subscribed)

listRule := `
user = @request.auth.id ||
(
  visibility = 'friends' &&
  (
    (@collection.friendships.user.id ?= user &&
     @collection.friendships.friend.id ?= @request.auth.id &&
     @collection.friendships.status ?= 'accepted') ||
    (@collection.friendships.user.id ?= @request.auth.id &&
     @collection.friendships.friend.id ?= user &&
     @collection.friendships.status ?= 'accepted')
  ) &&
  (
    @request.auth.subscriptionStatus = 'trial' ||
    @request.auth.subscriptionStatus = 'active' ||
    @request.auth.subscriptionStatus = 'lifetime' ||
    visitDate >= @now('-6 months')
  )
)
`
```

**Note**: PocketBase rules don't support complex date arithmetic well. Better approach:

**Custom API Endpoint: `GET /api/visits/friends`**

Returns friend visits respecting subscription status.

```go
func GetFriendsVisits(user *core.Record, filters map[string]any) ([]*core.Record, error) {
  isSubscribed := IsSubscriptionActive(user)

  query := "visibility = 'friends' AND user IN (SELECT friend FROM friendships WHERE user = ? AND status = 'accepted')"
  params := []any{user.Id}

  // Add date filter for free tier users
  if !isSubscribed {
    sixMonthsAgo := time.Now().AddDate(0, -6, 0)
    query += " AND visitDate >= ?"
    params = append(params, sixMonthsAgo)
  }

  return app.FindRecordsByFilter("visits", query, params...)
}
```

### 3.2 Bill Pay Feature Gating

**Pre-Creation Check:**

Before allowing bill creation, check limit.

```go
// In bill creation endpoint
func CreateBillSplit(user *core.Record, billData map[string]any) error {
  canCreate, remaining := CanCreateBillSplit(user)

  if !canCreate {
    return errors.New("Monthly bill split limit reached. Upgrade to Premium for unlimited splits.")
  }

  // Create bill
  bill := createBill(billData)

  // Increment counter (only for free tier)
  if !IsSubscriptionActive(user) {
    count := user.GetInt("monthlyBillPayCount")
    user.Set("monthlyBillPayCount", count + 1)
    app.Save(user)
  }

  return nil
}
```

**Error Response:**
```json
{
  "code": 403,
  "message": "Monthly bill split limit reached (5/5 used). Upgrade to Premium for unlimited splits.",
  "data": {
    "feature": "bill_pay",
    "limit": 5,
    "used": 5,
    "upgradeUrl": "/settings/subscription"
  }
}
```

---

## Phase 4: Frontend Implementation

Note: the original `frontend/` web app referenced in this workplan has been removed. The target below now points to a proposed mobile-app provider file under `apps/mobile`.

### 4.1 Subscription Context Provider

**New File: `apps/mobile/src/providers/SubscriptionProvider.tsx`**

```tsx
interface SubscriptionStatus {
  subscriptionStatus: 'trial' | 'active' | 'expired' | 'canceled' | 'lifetime'
  isActive: boolean
  trialDaysRemaining: number | null
  trialEndDate: string | null
  features: {
    canAccessFriendsHistory: boolean
    billPayRemaining: number // -1 = unlimited
    billPayLimit: number | null
  }
  subscription: {
    provider: string
    currentPeriodEnd: string
    canceledAt: string | null
    willRenew: boolean
  } | null
}

export function SubscriptionProvider({ children }) {
  const [status, setStatus] = useState<SubscriptionStatus | null>(null)

  useEffect(() => {
    fetchSubscriptionStatus()
  }, [])

  async function fetchSubscriptionStatus() {
    const res = await pb.send('/api/subscription/status')
    setStatus(res)
  }

  return (
    <SubscriptionContext.Provider value={{ status, refresh: fetchSubscriptionStatus }}>
      {children}
    </SubscriptionContext.Provider>
  )
}

export function useSubscription() {
  return useContext(SubscriptionContext)
}
```

### 4.2 UI Components

**Component 1: Trial Banner** (`TrialBanner.tsx`)

Shows at top of app during trial period.

```tsx
function TrialBanner() {
  const { status } = useSubscription()

  if (!status || status.subscriptionStatus !== 'trial') return null

  const daysLeft = status.trialDaysRemaining
  const urgency = daysLeft <= 7 ? 'urgent' : daysLeft <= 30 ? 'warning' : 'info'

  return (
    <div className={`trial-banner ${urgency}`}>
      <span>{daysLeft} days left in your free trial</span>
      <Link to="/settings/subscription">Upgrade Now</Link>
    </div>
  )
}
```

**Component 2: Upgrade Prompt Modal** (`UpgradePromptModal.tsx`)

Shows when user hits feature limit.

```tsx
interface UpgradePromptProps {
  feature: 'bill_pay' | 'friends_history'
  onClose: () => void
}

function UpgradePromptModal({ feature, onClose }: UpgradePromptProps) {
  const messages = {
    bill_pay: {
      title: "Bill Split Limit Reached",
      description: "You've used all 5 free bill splits this month. Upgrade to Premium for unlimited splits!",
      benefits: ["Unlimited bill splits", "View all friend history", "Support development"]
    },
    friends_history: {
      title: "Unlock Full Friend History",
      description: "Upgrade to Premium to view your friends' visits from over 6 months ago.",
      benefits: ["See all friend visits (no time limit)", "Unlimited bill splits", "Early access to new features"]
    }
  }

  const content = messages[feature]

  return (
    <Modal onClose={onClose}>
      <h2>{content.title}</h2>
      <p>{content.description}</p>
      <ul>
        {content.benefits.map(b => <li key={b}>{b}</li>)}
      </ul>
      <Button onClick={() => navigate('/settings/subscription')}>
        Upgrade to Premium - $4.99/month
      </Button>
      <Button variant="ghost" onClick={onClose}>Maybe Later</Button>
    </Modal>
  )
}
```

**Component 3: Subscription Settings Page** (`SubscriptionSettingsPage.tsx`)

```tsx
function SubscriptionSettingsPage() {
  const { status } = useSubscription()

  if (status?.subscriptionStatus === 'trial') {
    return <TrialStatusView />
  } else if (status?.subscriptionStatus === 'active') {
    return <ActiveSubscriptionView />
  } else {
    return <ExpiredTrialView />
  }
}

function TrialStatusView() {
  const { status } = useSubscription()

  return (
    <div>
      <h1>Free Trial</h1>
      <p>{status.trialDaysRemaining} days remaining</p>
      <p>Trial ends on {formatDate(status.trialEndDate)}</p>

      <div className="pricing-cards">
        <PricingCard
          name="Monthly"
          price="$4.99"
          interval="month"
          priceId={STRIPE_PRICE_MONTHLY}
        />
        <PricingCard
          name="Annual"
          price="$49.99"
          interval="year"
          badge="Save 17%"
          priceId={STRIPE_PRICE_ANNUAL}
        />
      </div>
    </div>
  )
}

function PricingCard({ name, price, interval, priceId, badge }) {
  async function handleSubscribe() {
    const res = await pb.send('/api/subscription/create-checkout-session', {
      method: 'POST',
      body: { priceId, returnUrl: window.location.href }
    })
    window.location.href = res.url
  }

  return (
    <div className="pricing-card">
      {badge && <span className="badge">{badge}</span>}
      <h3>{name}</h3>
      <div className="price">{price}<span>/{interval}</span></div>
      <Button onClick={handleSubscribe}>Subscribe</Button>
    </div>
  )
}
```

**Component 4: Bill Pay Counter** (`BillPayCounter.tsx`)

Shows remaining bill splits for free tier users.

```tsx
function BillPayCounter() {
  const { status } = useSubscription()

  if (status?.features.billPayRemaining === -1) return null // Unlimited

  const { billPayRemaining, billPayLimit } = status.features
  const used = billPayLimit - billPayRemaining

  return (
    <div className="bill-pay-counter">
      <span>Bill splits this month: {used}/{billPayLimit}</span>
      {billPayRemaining === 0 && (
        <Link to="/settings/subscription">Upgrade for unlimited</Link>
      )}
    </div>
  )
}
```

### 4.3 Feature Gating in UI

**Friends Visit List:**

```tsx
function FriendsVisitsList() {
  const { status } = useSubscription()
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false)

  // Fetch visits (backend already filters by subscription)
  const { data: visits } = useQuery({
    queryKey: ['visits', 'friends'],
    queryFn: () => pb.collection('visits').getList(/* friends filter */)
  })

  // Show message if free tier
  const hasHistoryLimit = !status?.features.canAccessFriendsHistory

  return (
    <div>
      {hasHistoryLimit && (
        <div className="info-banner">
          <p>Viewing last 6 months of friend activity.</p>
          <button onClick={() => setShowUpgradePrompt(true)}>
            Upgrade to see all history
          </button>
        </div>
      )}

      {visits.map(visit => <VisitCard key={visit.id} visit={visit} />)}

      {showUpgradePrompt && (
        <UpgradePromptModal
          feature="friends_history"
          onClose={() => setShowUpgradePrompt(false)}
        />
      )}
    </div>
  )
}
```

**Bill Split Creation:**

```tsx
function CreateBillButton() {
  const { status } = useSubscription()
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false)

  async function handleCreate() {
    // Check limit
    if (status?.features.billPayRemaining === 0) {
      setShowUpgradePrompt(true)
      return
    }

    try {
      await createBillSplit(/* data */)
      // Refresh subscription status to update counter
      await refetchSubscriptionStatus()
    } catch (err) {
      if (err.code === 403) {
        setShowUpgradePrompt(true)
      }
    }
  }

  return (
    <>
      <Button onClick={handleCreate}>
        Create Bill Split
        {status?.features.billPayRemaining > 0 && status?.features.billPayRemaining < 5 && (
          <span className="counter">({status.features.billPayRemaining} left)</span>
        )}
      </Button>

      {showUpgradePrompt && (
        <UpgradePromptModal
          feature="bill_pay"
          onClose={() => setShowUpgradePrompt(false)}
        />
      )}
    </>
  )
}
```

---

## Phase 5: Additional Premium Features (Future)

These are suggestions for features to gate behind the premium tier to increase value.

### 5.1 Data Export
**Free Tier**: Export limited to last 100 visits
**Premium**: Unlimited export of all data (CSV, JSON)

### 5.2 Advanced Analytics
**Free Tier**: Basic stats (total visits, top restaurants)
**Premium**:
- Visit trends over time (charts)
- Spending analytics
- Restaurant recommendations based on preferences
- Comparison with friends' tastes

### 5.3 Photo Storage
**Free Tier**: 50 menu photos max
**Premium**: Unlimited menu photo uploads

### 5.4 AI Features
**Free Tier**: 5 AI-powered menu scans per month
**Premium**: Unlimited OCR menu scanning

### 5.5 Collaboration Features
**Free Tier**: 1 shared restaurant list
**Premium**:
- Unlimited shared lists
- Collaborative wishlists with friends
- Group visit planning

### 5.6 Custom Categories & Tags
**Free Tier**: Use predefined cuisine types only
**Premium**: Create custom tags, categories, and filters

### 5.7 Early Access
**Premium**: Beta access to new features before public release

### 5.8 Ad-Free Experience
**Free Tier**: Occasional promotional banners (if you add ads later)
**Premium**: Completely ad-free

---

## Phase 6: Mobile In-App Purchases (iOS/Android)

### 6.1 iOS (Apple StoreKit)

**Product IDs:**
```
com.yummyrecs.subscription.monthly
com.yummyrecs.subscription.annual
```

**Tauri Plugin:**
```rust
// Use tauri-plugin-purchases or implement custom StoreKit bridge
```

**Receipt Validation Endpoint:**
```
POST /api/subscription/apple/validate-receipt
Body: { receiptData: "base64..." }
```

### 6.2 Android (Google Play Billing)

**Product IDs:**
```
subscription_monthly
subscription_annual
```

**Implementation:**
- Use Tauri Android bridge to Google Play Billing Library
- Send purchase tokens to backend for validation

### 6.3 Cross-Platform Subscription Sync

**Challenge**: User subscribes on iOS, then logs in on web.

**Solution**: Store subscription provider in user record
- iOS purchases validated via Apple receipt validation
- Android purchases validated via Google Play verification
- Web purchases via Stripe webhooks
- All update same `subscriptionStatus` field

---

## Implementation Timeline

| Phase | Description | Backend | Frontend | Testing | Total |
|-------|-------------|---------|----------|---------|-------|
| Phase 1 | Core Infrastructure | 4 days | - | 1 day | 5 days |
| Phase 2 | Stripe Integration | 3 days | 2 days | 1 day | 6 days |
| Phase 3 | Feature Gating | 2 days | - | 1 day | 3 days |
| Phase 4 | Frontend UI | - | 5 days | 2 days | 7 days |
| Phase 5 | Additional Features | 2 days | 3 days | 1 day | 6 days |
| Phase 6 | Mobile IAP | 4 days | 3 days | 2 days | 9 days |
| **Total** | | **15 days** | **13 days** | **8 days** | **36 days** |

*Phases 1-4 are essential for MVP. Phases 5-6 are future enhancements.*

**MVP Timeline (Phases 1-4)**: ~21 days

---

## Pricing Strategy Recommendations

### Market Research
- **MyFitnessPal**: $19.99/month or $79.99/year
- **Untappd Insider**: $4.99/month or $39.99/year
- **Vivino Premium**: $8.99/month or $59.99/year

### Recommended Pricing
**Option 1 (Affordable):**
- Monthly: $3.99/month
- Annual: $39.99/year (17% savings)

**Option 2 (Moderate):**
- Monthly: $4.99/month
- Annual: $49.99/year (17% savings)

**Option 3 (Premium):**
- Monthly: $6.99/month
- Annual: $69.99/year (17% savings)

**Recommendation**: Start with Option 2 ($4.99/month). It's competitive, shows value, and leaves room to add a cheaper "Basic" tier later if needed.

---

## User Communication Strategy

### Launch Announcement

**Subject**: "Introducing Food Tracker Premium"

**Body**:
```
Hi [Name],

We're excited to announce Food Tracker Premium!

As a thank you for being an early user, we're giving you an extended
12-month trial with full access to all features.

After your trial, you can upgrade to Premium for:
- Unlimited access to friends' visit history
- Unlimited bill splitting
- Early access to new features
- Support indie development

We hope you'll consider supporting us, but you can continue using
Food Tracker for free with some limitations after your trial ends.

Thanks for being part of our community!

[CTA: Learn More] [CTA: Upgrade Early]
```

### Trial Expiring Email (7 days before)

**Subject**: "Your Food Tracker trial ends in 7 days"

**Body**:
```
Hi [Name],

Just a friendly heads up - your free trial ends in 7 days.

After [date], free accounts will have limited access to:
- Friends' visits (only last 6 months visible)
- Bill splits (5 per month)

Upgrade to Premium for just $4.99/month to keep unlimited access.

[CTA: Upgrade Now] [CTA: Compare Plans]
```

### Trial Expired Email

**Subject**: "Your trial has ended - Here's what's next"

**Body**:
```
Hi [Name],

Your free trial has ended. You can still use Food Tracker to:
- Track all your own visits and ratings (unlimited)
- View your friends' recent visits (last 6 months)
- Split bills (5 per month)

Ready for unlimited access? Upgrade to Premium for $4.99/month.

[CTA: Upgrade to Premium] [CTA: See What's Included]
```

---

## Testing Checklist

### Backend Tests
- [ ] Trial period correctly calculated on signup
- [ ] Subscription status updates on Stripe webhook
- [ ] Bill pay counter increments and resets monthly
- [ ] Cron jobs run on schedule (trial expiration, counter reset)
- [ ] Feature gating correctly blocks non-subscribed users
- [ ] Stripe webhook signature validation works
- [ ] Apple/Google receipt validation (if implementing mobile)

### Frontend Tests
- [ ] Trial banner shows correct days remaining
- [ ] Upgrade prompt appears when hitting feature limit
- [ ] Stripe checkout flow completes successfully
- [ ] Subscription status updates after successful payment
- [ ] Bill pay counter displays correctly
- [ ] Friends' visit list respects 6-month limit for free users
- [ ] Manage subscription link works (Stripe portal)

### E2E Tests
- [ ] New user signup starts 6-month trial
- [ ] User can complete subscription checkout
- [ ] Free tier user sees upgrade prompt when exceeding bill limit
- [ ] Free tier user cannot view friends' visits older than 6 months
- [ ] Premium user has unlimited access to all features
- [ ] User can cancel subscription via Stripe portal
- [ ] Canceled subscription maintains access until period end

### Edge Cases
- [ ] User with expired trial can still view own data
- [ ] User cancels during trial (should keep trial benefits until end)
- [ ] Payment fails during renewal (grace period handling)
- [ ] User subscribes on iOS, then logs in on web (sync status)
- [ ] Admin manually grants lifetime access
- [ ] User with multiple devices sees consistent subscription status

---

## Security Considerations

### 1. Webhook Verification
- Always verify Stripe webhook signatures
- Reject unsigned webhooks immediately
- Log suspicious webhook attempts

### 2. Subscription Status Tampering
- Never trust client-side subscription status
- Always check server-side before granting feature access
- Use PocketBase rules to enforce access control

### 3. Receipt Validation
- Validate iOS/Android receipts server-side
- Cache validation results to avoid excessive API calls
- Implement replay attack prevention

### 4. Rate Limiting
- Limit checkout session creation (prevent abuse)
- Limit subscription status checks
- Monitor for unusual patterns (multiple failed payments)

---

## Monitoring & Analytics

### Key Metrics to Track

**Trial Metrics:**
- Trial conversion rate (% who subscribe after trial)
- Average trial length before conversion
- Trial abandonment reasons (if surveyed)

**Subscription Metrics:**
- Monthly Recurring Revenue (MRR)
- Churn rate (% cancellations per month)
- Lifetime Value (LTV) per customer
- Average subscription length

**Feature Usage:**
- Bill pay usage by tier (free vs premium)
- Friends' history views by tier
- Most popular features among premium users

**User Behavior:**
- Feature limit hit rate (how often users hit limits)
- Upgrade prompt click-through rate
- Pricing page visits vs conversions

### Dashboard Tools
- Stripe Dashboard (revenue, subscriptions, churn)
- PocketBase admin (user subscription distribution)
- Custom analytics endpoint (feature usage)
- Google Analytics (user flows, upgrade funnel)

---

## Open Questions & Decisions

1. **Should we grandfather existing users?**
   - Free forever? (most generous)
   - Extended trial? (balanced)
   - Standard 6-month trial? (fair but might upset early adopters)

2. **What happens to user data after prolonged non-subscription?**
   - Keep forever? (storage costs)
   - Delete after 1 year of inactivity? (warn users first)
   - Archive and restore on resubscription?

3. **Should we offer refunds?**
   - No refunds (standard for digital subscriptions)
   - 7-day money-back guarantee (builds trust)
   - Pro-rated refunds for annual plans?

4. **Discounts and promotions?**
   - Annual discount (17% recommended)
   - Referral credits? ($5 off for each referral)
   - Student discounts? (50% off with verification)
   - Black Friday / holiday sales?

5. **Freemium vs Free Trial?**
   - Current plan: Generous trial + limited free tier (balanced)
   - Alternative: Fully paid with 14-day trial (higher barrier)
   - Alternative: Always free tier + premium tier (standard freemium)

6. **Should admins get free premium?**
   - Yes (`isAdmin = true` → `subscriptionStatus = 'lifetime'`)

7. **Business model for bill splitting?**
   - Premium users get unlimited (current plan)
   - Alternative: Charge per bill split ($0.99 each, no subscription)
   - Alternative: Free forever (build goodwill, monetize elsewhere)

---

## Legal & Compliance

### Terms of Service Updates
- Add subscription billing terms
- Clarify refund policy
- State trial period clearly
- Define what happens to data after cancellation

### Privacy Policy Updates
- Disclose payment data handling (Stripe processes, not stored)
- State subscription status tracking
- Explain usage analytics collection

### Required Disclaimers
- Auto-renewal notice (required in many jurisdictions)
- Cancellation instructions (must be easy to find)
- Data export option before account closure

### Tax Compliance
- Stripe handles sales tax calculation (Stripe Tax)
- Consider VAT for EU users
- Consult accountant for revenue reporting

---

## Appendix: Alternative Monetization Models

If subscription model doesn't work, consider these alternatives:

### 1. One-Time Purchase
- $29.99 for lifetime access
- No recurring revenue, but lower barrier

### 2. Freemium Forever
- Always free with ads
- Pay $4.99 to remove ads + unlock premium features
- Easier to grow user base

### 3. Pay-Per-Feature
- Free core app
- $0.99 per bill split
- $1.99 per month for friend history
- $2.99 per month for advanced analytics
- Users pay for what they use

### 4. Tip Jar / Donations
- Free forever
- Optional donations to support development
- Lower revenue but builds goodwill

### 5. Sponsorships / Partnerships
- Keep app free
- Partner with restaurants for featured listings
- Sponsored content in feed
- Risk: Compromises user trust

---

## Next Steps

When ready to implement:

1. **Review & Finalize Pricing**: Confirm monthly/annual pricing
2. **Decide on Existing User Plan**: Choose grandfathering approach
3. **Set Up Stripe Account**: Create products and prices
4. **Phase 1 Implementation**: Database schema + trial logic
5. **Phase 2 Implementation**: Stripe integration
6. **Phase 3 Implementation**: Feature gating
7. **Phase 4 Implementation**: Frontend UI
8. **Beta Testing**: Test with small group before public launch
9. **Launch Communication**: Email users about new premium tier
10. **Monitor & Iterate**: Track metrics and adjust based on data

---

**Last Updated**: 2025-10-31
**Document Owner**: Food Tracker App
**Status**: Planning / Not Yet Implemented
