# Bill Splitting Feature - Implementation Workplan

## 📋 Overview

**Feature Type:** Standalone Bill Splitter (Option B)

**Purpose:** Allow users to split bills with friends and track payments, independent of visit tracking.

**Key Use Cases:**
1. **Itemized Split**: Friends order different items, need to calculate individual amounts
2. **Even Split**: Everyone pays the same (buffet, equal sharing)
3. **Payment Tracking**: Track who has paid and who still owes

---

## 🎯 Design Philosophy

### Core Principles
- **Standalone**: Completely separate from visit tracking
- **Simple**: Quick to use, minimal data entry
- **Flexible**: Works with app users and non-users
- **Universal**: Can split ANY bill (restaurants, groceries, rides, etc.)

### Advantages
- ✅ Works for any expense, not just tracked meals
- ✅ Non-users can participate via links/codes
- ✅ Faster to use - no food logging required
- ✅ Clear separation: Bills tab = money, Home = food memories
- ✅ Can be used without convincing everyone to track food

---

## 🏗️ App Structure

### New Navigation Tab

**Bottom Navigation (4 tabs):**
```
[🏠 Home] [👥 Friends] [💰 Bills] [👤 Profile]
                        ↑
                    NEW TAB
```

### Bills Tab Sections
1. **Primary Action**: `[+ New Bill]` button
2. **Active Bills**: Bills with pending payments
3. **Past Bills**: Fully settled bills
4. **Filters**: All / You're owed / You owe / Settled

---

## 📊 User Flows

### Flow 1: Itemized Split (Different Items)

**Steps:**
1. **Create Bill**
   - Name the bill
   - Select "I paid" or "Someone else paid"
   - Choose "Itemized" split type

2. **Add Participants**
   - Select from friends list
   - Add by name (for non-users)
   - Generate join code for others to add themselves

3. **Add Items**
   - List each item with name and price
   - Assign who ordered each item
   - Items can be shared (multiple people)

4. **Add Fees**
   - Enter tax, tip, service fees
   - Choose split method: Proportional or Equal
   - Calculate total

5. **Review Breakdown**
   - See who owes what
   - Send payment requests
   - Share bill summary

6. **Track Payments**
   - Mark payments as received
   - Send reminders
   - Mark bill as settled when complete

### Flow 2: Even Split (Same Amount)

**Simplified Steps:**
1. **Create Bill**
   - Name the bill
   - Select "I paid"
   - Choose "Even" split type

2. **Enter Details**
   - Total bill amount
   - Number of people
   - Select/add participants

3. **Calculate**
   - Auto-calculate equal split
   - Show per-person amount

4. **Track Payments**
   - Send requests
   - Mark as paid
   - Monitor status

---

## 🎨 Screen Designs

### 1. Bills Home Screen

**Empty State:**
```
┌─────────────────────────┐
│ Bills                   │
├─────────────────────────┤
│      💸                 │
│ No bills yet            │
│ Split bills with friends│
│ and track payments      │
│ [Create Your First Bill]│
└─────────────────────────┘
```

**With Bills:**
```
┌─────────────────────────┐
│ Bills                   │
│ [+ New Bill]            │
├─────────────────────────┤
│ Filters: [All ▼]        │
├─────────────────────────┤
│ Active Bills            │
├─────────────────────────┤
│ 🍕 Pizza Night          │
│ You're owed $45.50      │
│ 2 of 4 paid • 2d ago    │
├─────────────────────────┤
│ 🍜 Ramen Dinner         │
│ You owe Sarah $18.00    │
│ Pending • 1w ago        │
│ [Mark as Paid]          │
├─────────────────────────┤
│ Past Bills (12)         │
│ [Show All]              │
└─────────────────────────┘
```

### 2. Create Bill Flow

**Step 1: Basic Info**
```
┌─────────────────────────┐
│ New Bill                │
├─────────────────────────┤
│ Bill Name *             │
│ [Dinner at Joe's Diner] │
│                         │
│ Who paid?               │
│ ● I paid                │
│ ○ Someone else paid     │
│                         │
│ Split Type              │
│ ● Itemized (different)  │
│ ○ Even (same amount)    │
│ ○ Custom amounts        │
│                         │
│ [Next]                  │
└─────────────────────────┘
```

**Step 2: Add Participants**
```
┌─────────────────────────┐
│ Who was there?          │
├─────────────────────────┤
│ From Friends:           │
│ ☑ Sarah (@sarah_123)    │
│ ☑ Mike (@mike_xyz)      │
│ ☐ Jenny (@jenny_food)   │
│                         │
│ Add Others:             │
│ [+ Add by Name]         │
│                         │
│ Or Share Join Code:     │
│ [Generate Code]         │
│                         │
│ Selected: 2 people      │
│ [Next]                  │
└─────────────────────────┘
```

**Step 3: Add Items (Itemized Only)**
```
┌─────────────────────────┐
│ Add Items               │
├─────────────────────────┤
│ Item 1                  │
│ Name: [Burger]          │
│ Price: [$15.00]         │
│ Who: [Sarah ▼]          │
│ [Remove]                │
├─────────────────────────┤
│ Item 2                  │
│ Name: [Pasta]           │
│ Price: [$18.00]         │
│ Who: [Mike ▼]           │
│ [Remove]                │
├─────────────────────────┤
│ [+ Add Item]            │
│                         │
│ Subtotal: $33.00        │
│ [Next]                  │
└─────────────────────────┘
```

**Step 4: Add Fees**
```
┌─────────────────────────┐
│ Additional Costs        │
├─────────────────────────┤
│ Subtotal:      $33.00   │
│                         │
│ Tax:           [$2.97]  │
│ Tip:           [$6.00]  │
│ Service Fee:   [$0.00]  │
│ ─────────────────────   │
│ Total:         $41.97   │
│                         │
│ How to split extras?    │
│ ● Proportional          │
│ ○ Equal split           │
│                         │
│ [Calculate]             │
└─────────────────────────┘
```

**Step 5: Review**
```
┌─────────────────────────┐
│ Bill Breakdown          │
├─────────────────────────┤
│ Total: $41.97           │
│                         │
│ You (paid):    $41.97   │
│ ✓ Paid                  │
│                         │
│ Sarah owes:    $19.51   │
│ • Burger ($15)          │
│ • Tax/tip ($4.51)       │
│ ☐ Pending               │
│ [Send Request]          │
│                         │
│ Mike owes:     $22.46   │
│ • Pasta ($18)           │
│ • Tax/tip ($4.46)       │
│ ☐ Pending               │
│ [Send Request]          │
│                         │
│ [Share Bill] [Done]     │
└─────────────────────────┘
```

### 3. Bill Detail Screen

```
┌─────────────────────────┐
│ ← Bills                 │
├─────────────────────────┤
│ 🍕 Pizza Night          │
│ Created by You          │
│ Oct 31, 2025            │
├─────────────────────────┤
│ Summary                 │
│ Total: $57.05           │
│ You're owed: $45.50     │
│ Status: 2 of 4 paid     │
├─────────────────────────┤
│ Breakdown               │
│                         │
│ You (paid):    $57.05   │
│ ✅ Paid                 │
│                         │
│ Sarah:         $24.27   │
│ ✅ Paid Oct 31          │
│                         │
│ Mike:          $21.23   │
│ ⏳ Pending              │
│ [Send Reminder]         │
│ Last reminded: 2d ago   │
│                         │
│ Jenny:         $11.55   │
│ ⏳ Pending              │
│ [Send Reminder]         │
│ Never reminded          │
├─────────────────────────┤
│ Items                   │
│ • Pizza Large: $28      │
│   (You, Sarah, Mike)    │
│ • Wings: $15            │
│   (Sarah, Jenny)        │
│ • Tax: $4.77            │
│ • Tip: $10.28           │
├─────────────────────────┤
│ Actions                 │
│ [Share Bill]            │
│ [Send All Reminders]    │
│ [Edit Bill]             │
│ [Mark as Settled]       │
│ [Delete Bill]           │
└─────────────────────────┘
```

### 4. Quick Actions

**Mark as Paid Dialog:**
```
┌─────────────────────────┐
│ Mark Payment Received?  │
├─────────────────────────┤
│ Sarah paid you $24.27   │
│                         │
│ Payment method:         │
│ ○ Cash                  │
│ ○ Venmo                 │
│ ○ CashApp               │
│ ○ Zelle                 │
│ ● Other                 │
│                         │
│ Date: [Oct 31, 2025]    │
│                         │
│ [Cancel]    [Confirm]   │
└─────────────────────────┘
```

**Send Reminder Dialog:**
```
┌─────────────────────────┐
│ Send Payment Reminder   │
├─────────────────────────┤
│ To: Mike                │
│ Amount: $21.23          │
│                         │
│ Mike will receive:      │
│ • App notification      │
│ • Payment link          │
│                         │
│ Message (optional):     │
│ [Hey! Just a reminder   │
│  about the pizza 🍕]    │
│                         │
│ [Cancel]    [Send]      │
└─────────────────────────┘
```

---

## 🗄️ Data Structure

### Database Collections

#### 1. `bills`
```typescript
{
  id: string
  creator_user_id: string  // Person who paid
  bill_name: string
  total_amount: number
  tax: number
  tip: number
  fees: number
  split_mode: 'even' | 'itemized' | 'custom'
  extras_split_mode: 'proportional' | 'equal'  // How to split tax/tip
  status: 'active' | 'settled' | 'cancelled'
  created: string
  updated: string
}
```

#### 2. `bill_participants`
```typescript
{
  id: string
  bill_id: string
  user_id: string | null  // Null if non-app user
  participant_name: string  // For non-app users
  amount_owed: number
  paid_status: 'pending' | 'paid'
  paid_date: string | null
  payment_method: string | null  // 'cash', 'venmo', 'cashapp', etc.
  created: string
  updated: string
}
```

#### 3. `bill_items` (for itemized splits)
```typescript
{
  id: string
  bill_id: string
  item_name: string
  price: number
  assigned_to: string[]  // Array of participant IDs
  created: string
}
```

#### 4. `bill_invites` (for join codes)
```typescript
{
  id: string
  bill_id: string
  code: string  // 6-character unique code
  created_by: string
  expires_at: string
  used_by: string | null
  created: string
}
```

#### 5. `bill_reminders` (tracking reminders sent)
```typescript
{
  id: string
  bill_id: string
  participant_id: string
  sent_at: string
  sent_by: string
}
```

---

## 🔔 Notifications

### Received Notifications
1. **Bill Created**: "Sarah added you to a bill. You owe $24.27"
2. **Payment Received**: "Mike marked your payment as received ($21.23)"
3. **Payment Reminder**: "Reminder: You owe Sarah $18 for Ramen Dinner"
4. **Bill Settled**: "Pizza Night bill is fully paid!"

### Badges
- Bills tab shows count of unpaid bills
- Profile tab shows notification badge
- Summary notification: "You're owed $89 total from 3 bills"

### Reminder Logic
- Allow manual reminders anytime
- Optional: Auto-remind after 3 days, 1 week, 2 weeks
- Track last reminder sent to avoid spam
- Max 1 reminder per participant per day

---

## 💡 Feature Breakdown

### Phase 1: MVP (Must Have)
1. ✅ Create bill (even split)
2. ✅ Create bill (itemized split)
3. ✅ Add friends as participants
4. ✅ Calculate splits with tax/tip
5. ✅ View bill breakdown
6. ✅ Mark payments as received
7. ✅ View bill history
8. ✅ Send payment reminders (notifications)
9. ✅ Filter bills (All / You're owed / You owe / Settled)
10. ✅ Delete bills

### Phase 2: Enhanced (Nice to Have)
1. ⭐ Add non-app users by name
2. ⭐ Join codes for participants to add themselves
3. ⭐ Share bill summary (link/image)
4. ⭐ Payment app deep links (Venmo, CashApp, Zelle)
5. ⭐ Edit existing bills
6. ⭐ Custom split amounts
7. ⭐ Bill search/filtering
8. ⭐ Export to PDF/image

### Phase 3: Future (Advanced)
1. 🚀 Bill templates (save common splits)
2. 🚀 Receipt photo upload with OCR
3. 🚀 Recurring bills (weekly dinners)
4. 🚀 Multi-currency support
5. 🚀 Group analytics (who pays most often)
6. 🚀 Optional link to visits (bridge to food tracking)
7. 🚀 Split by percentage instead of amount
8. 🚀 Partial payments (pay in installments)

---

## 🎯 Implementation Steps

### Step 1: Database Setup
- [ ] Create `bills` collection with schema
- [ ] Create `bill_participants` collection
- [ ] Create `bill_items` collection
- [ ] Create `bill_invites` collection
- [ ] Create `bill_reminders` collection
- [ ] Set up collection rules and permissions
- [ ] Create database indexes for performance

### Step 2: Backend/API
- [ ] Create bill endpoint (POST)
- [ ] Update bill endpoint (PUT)
- [ ] Delete bill endpoint (DELETE)
- [ ] Get bill details endpoint (GET)
- [ ] List bills endpoint (GET with filters)
- [ ] Mark payment endpoint (POST)
- [ ] Send reminder endpoint (POST)
- [ ] Generate join code endpoint (POST)
- [ ] Join via code endpoint (POST)

### Step 3: Core Components
- [ ] `BillsPage.tsx` - Main bills list screen
- [ ] `CreateBillPage.tsx` - Multi-step bill creation wizard
- [ ] `BillDetailPage.tsx` - Individual bill view
- [ ] `BillBreakdownCard.tsx` - Display split calculations
- [ ] `ParticipantsList.tsx` - Show participants and payment status
- [ ] `MarkPaidDialog.tsx` - Mark payment received
- [ ] `SendReminderDialog.tsx` - Send payment reminder
- [ ] `BillFilters.tsx` - Filter active/settled/owed bills

### Step 4: Utility Functions
- [ ] `billCalculations.ts` - Split calculation logic
  - Even split calculator
  - Itemized split calculator
  - Proportional tax/tip split
  - Equal tax/tip split
- [ ] `billService.ts` - Bill CRUD operations
- [ ] `billValidation.ts` - Validation logic

### Step 5: Routes
- [ ] `/bills` - Main bills list
- [ ] `/bills/new` - Create new bill wizard
- [ ] `/bills/:billId` - Bill detail view
- [ ] `/bills/:billId/edit` - Edit bill
- [ ] `/bills/join/:code` - Join bill via code

### Step 6: Navigation
- [ ] Add "Bills" tab to bottom navigation
- [ ] Add notification badge for unpaid bills
- [ ] Update `__root.tsx` with bills routes

### Step 7: Notifications
- [ ] Implement bill creation notifications
- [ ] Implement payment received notifications
- [ ] Implement payment reminder notifications
- [ ] Add bills badge count logic
- [ ] Set up real-time updates (PocketBase subscriptions)

### Step 8: Polish & Testing
- [ ] Add loading states
- [ ] Add error handling
- [ ] Add empty states
- [ ] Add confirmation dialogs
- [ ] Mobile responsiveness
- [ ] E2E tests for bill flows
- [ ] Edge case testing (0 amounts, negative numbers, etc.)

---

## 🧮 Calculation Logic

### Even Split
```
Total Bill: $80
Number of People: 4
Per Person: $80 / 4 = $20
```

### Itemized Split - Proportional Tax/Tip
```
Items:
- Person A: $15
- Person B: $18
- Person C: $12
Subtotal: $45

Tax: $4.05
Tip: $8.00
Total Extras: $12.05

Person A proportion: $15 / $45 = 0.333
Person A extras: $12.05 × 0.333 = $4.01
Person A total: $15 + $4.01 = $19.01

Person B proportion: $18 / $45 = 0.400
Person B extras: $12.05 × 0.400 = $4.82
Person B total: $18 + $4.82 = $22.82

Person C proportion: $12 / $45 = 0.267
Person C extras: $12.05 × 0.267 = $3.22
Person C total: $12 + $3.22 = $15.22
```

### Itemized Split - Equal Tax/Tip
```
Items:
- Person A: $15
- Person B: $18
- Person C: $12
Subtotal: $45

Tax: $4.05
Tip: $8.00
Total Extras: $12.05

Per Person Extras: $12.05 / 3 = $4.02

Person A total: $15 + $4.02 = $19.02
Person B total: $18 + $4.02 = $22.02
Person C total: $12 + $4.02 = $16.02
```

### Shared Items
```
Items:
- Pizza ($24) shared by A, B, C
- Wings ($15) shared by B, C
- Soda ($3) for A

Person A: ($24 / 3) + $3 = $11
Person B: ($24 / 3) + ($15 / 2) = $15.50
Person C: ($24 / 3) + ($15 / 2) = $15.50
```

---

## 🔐 Permissions & Privacy

### Access Rules
- **Bill Creator**: Full access (view, edit, delete, mark payments)
- **Participants**: View-only, can mark own payment as sent
- **Non-participants**: No access

### Data Privacy
- Bills are private by default
- Only creator and participants can see bill details
- Non-app users (added by name) receive no notifications
- App users receive notifications based on preferences

---

## 🎨 Design Tokens

### Colors
- **You're Owed**: Green (#10B981)
- **You Owe**: Orange (#F59E0B)
- **Paid**: Blue (#3B82F6)
- **Pending**: Gray (#6B7280)
- **Overdue**: Red (#EF4444)

### Icons
- Bill: 💰 or 📋
- Even split: ⚖️
- Itemized: 📝
- Payment received: ✅
- Payment pending: ⏳
- Send reminder: 🔔

---

## ✅ Testing Checklist

### Functionality Tests
- [ ] Create even split bill
- [ ] Create itemized split bill
- [ ] Add app users as participants
- [ ] Add non-app users by name
- [ ] Calculate proportional tax/tip
- [ ] Calculate equal tax/tip
- [ ] Mark payment as received
- [ ] Send payment reminder
- [ ] Edit existing bill
- [ ] Delete bill
- [ ] Filter bills by status
- [ ] Join bill via code
- [ ] Share bill summary

### Edge Cases
- [ ] Bill with $0 amount
- [ ] Bill with 1 person
- [ ] Bill with 10+ people
- [ ] Items with $0 price
- [ ] Negative amounts (refunds)
- [ ] Very large amounts ($10,000+)
- [ ] Decimal precision (round to 2 places)
- [ ] Delete participant with pending payment
- [ ] User leaves app (non-app user)
- [ ] Expired join codes

### UX Tests
- [ ] Loading states show spinners
- [ ] Error messages are clear
- [ ] Empty states are helpful
- [ ] Confirmation dialogs prevent accidents
- [ ] Back button works correctly
- [ ] Mobile keyboard doesn't hide inputs
- [ ] Long names/amounts don't break layout

---

## 📱 Mobile Considerations

### Keyboard Handling
- Auto-focus on amount inputs
- Number keyboard for price inputs
- Dismiss keyboard on scroll
- "Next" button moves between inputs

### Touch Targets
- Minimum 44×44 tap targets
- Spacing between buttons
- Swipe to delete items
- Pull to refresh bills list

### Performance
- Lazy load past bills
- Optimize calculation reruns
- Cache bill list
- Real-time updates via websocket

---

## 🚀 Launch Plan

### Pre-Launch
1. Build Phase 1 (MVP)
2. Internal testing with team
3. Beta test with 5-10 users
4. Fix critical bugs
5. Update changelog

### Launch
1. Release as v0.3.0
2. Announce in What's New dialog
3. Add tutorial/onboarding
4. Monitor for bugs
5. Collect user feedback

### Post-Launch
1. Gather usage analytics
2. Identify pain points
3. Plan Phase 2 features
4. Iterate based on feedback

---

## 📊 Success Metrics

### Usage Metrics
- Number of bills created per week
- Average bill size (amount & participants)
- Even vs Itemized split ratio
- Payment completion rate
- Time to mark all payments
- Reminder effectiveness

### User Engagement
- % of users who create at least 1 bill
- Bills per active user
- Return rate (create 2nd bill)
- Feature adoption rate

---

## 🎓 User Education

### Onboarding
- Quick tutorial on first bill creation
- Sample bill with dummy data
- Tips on best practices

### Help Content
- "How to split a bill" guide
- "Understanding calculations" explainer
- FAQ section
- Video tutorial (future)

---

## 🔗 Integration Points

### With Existing Features
- **Friends**: Populate participant list from friends
- **Notifications**: Use existing notification system
- **Profile**: Link bills in user profile
- **Settings**: Add bills preferences

### Future Integrations (Optional)
- **Visits**: Optionally link bill to visit
- **Restaurants**: Pre-fill restaurant name
- **Food Items**: Pre-fill items from visit

---

## 📝 Notes & Considerations

### Rounding
- Always round to 2 decimal places
- Handle rounding errors (total may be off by 1 cent)
- Adjust last person's amount to match total exactly

### Currency
- Phase 1: USD only
- Phase 2+: Support multiple currencies
- Display currency symbol based on user locale

### Time Zones
- Store all dates in UTC
- Display in user's local timezone
- Use same date utilities as visits

### Localization
- Phase 1: English only
- Future: Support i18n
- Date formats based on locale

---

## 🎯 Next Steps When Ready to Implement

When you're ready to start building this feature, we'll follow this sequence:

1. **Database First**: Create PocketBase collections and migrations
2. **Core Logic**: Build calculation utilities and validation
3. **Basic UI**: Bills list and detail views
4. **Creation Flow**: Multi-step bill creation wizard
5. **Actions**: Mark paid, send reminders
6. **Polish**: Loading states, errors, notifications
7. **Testing**: E2E tests and edge cases
8. **Launch**: Update changelog and deploy

---

## 📚 Reference

This workplan is based on the conversation from 2025-10-31 where we designed a standalone bill splitting feature for the Yummy Recs app.

**Key Design Decision**: Standalone feature (Option B) rather than integrated with visits, to maximize flexibility and reach.
