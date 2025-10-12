# Invite Code System - Viral Network

This application uses a viral invite code system where users can only sign up with an invite code, and each new user receives 5 invite codes to share with others.

## How It Works

1. **Private Network**: Sign-up requires a valid invite code
2. **One-Time Use**: Each code can only be used once
3. **Auto-Generation**: New users automatically receive 5 invite codes
4. **Viral Growth**: Each invited user can invite 5 more people, creating exponential network growth
5. **Code Ownership**: Users can view and manage their own codes

## Backend Implementation

The backend uses PocketBase event hooks to manage the invite system:

### 1. Validation Hook (`OnRecordCreateRequest`)
- Validates invite code from JSON request body
- Checks if code exists and hasn't been used
- Blocks registration if code is invalid or already used

### 2. Post-Creation Hook (`OnRecordAfterCreateSuccess`)
- Marks the used invite code as consumed
- Records which user used the code (`usedBy` field)
- **Auto-generates 5 new invite codes** for the new user
- Links codes to user via `createdBy` field

### 3. Code Generation
- Generates cryptographically random 12-character codes
- Uses base32 encoding for URL-safe, unambiguous characters
- Format: lowercase alphanumeric (e.g., `a3b4c5d6e7f8`)

## Database Schema

The `invite_codes` collection is automatically created via migrations. It includes:

**Collection: invite_codes**

**Fields:**
- `code` (Text): The invite code (6-50 characters, no whitespace)
- `used` (Bool): Whether the code has been used (default: false)
- `usedBy` (Relation): User who used this code
- `createdBy` (Relation): User who owns this code

**API Rules:**
- `ListRule`: `"createdBy = @request.auth.id"` - Users can list their own codes
- `ViewRule`: `"createdBy = @request.auth.id"` - Users can view their own codes
- `CreateRule`: `null` - Only server can create (via hooks)
- `UpdateRule`: `null` - Only server can update
- `DeleteRule`: `null` - Only admins can delete

## Bootstrap: Creating the First Invite Code

To bootstrap your network, manually create the first invite code as an admin:

### Via Admin UI

1. Go to http://localhost:8090/_/
2. Select the `invite_codes` collection
3. Click "New Record"
4. Enter fields:
   - `code`: "WELCOME2024" (or any code you want)
   - `used`: unchecked (false)
   - `createdBy`: leave empty (admin-created)
5. Save

### Via Go Migration (Recommended)

Create a migration to insert initial invite codes:

```go
// migrations/XXXXX_seed_initial_codes.go
func init() {
    m.Register(func(app core.App) error {
        collection, _ := app.FindCollectionByNameOrId("invite_codes")

        codes := []string{"WELCOME2024", "BETA2024", "LAUNCH2024"}
        for _, code := range codes {
            record := core.NewRecord(collection)
            record.Set("code", code)
            record.Set("used", false)
            app.Save(record)
        }
        return nil
    }, func(app core.App) error { return nil })
}
```

## Frontend Implementation

### Signup Flow (`SignUpPage.tsx`)
- Includes required invite code field
- Validates code on client before submission
- Sends code to backend via JSON payload
- Displays appropriate error messages

### Profile Page (`ProfilePage.tsx`)
- Displays user's 5 invite codes
- Shows status: "Available" or "Used"
- **Smart Copy**: Copies a personalized invitation message with pre-populated signup link
- Invitation message includes:
  - Friendly greeting
  - Direct signup link with code parameter
  - Plain text invite code as backup
- Real-time updates via PocketBase API

## User Experience Flow

### For New Users (Invited):
1. Receive invitation message from existing user via copy/paste
2. **Click the pre-populated signup link** (e.g., `/signup?code=abc123xyz456`)
3. Signup page displays:
   - 🎉 Welcome message: "You've been invited!"
   - Pre-filled invite code in green banner
   - Invite code field auto-populated
4. Enter only email and password
5. Upon successful signup:
   - Automatically logged in
   - **Receive 5 new invite codes** automatically
   - Redirected to profile page to view codes

### For Existing Users (Inviters):
1. Navigate to profile page
2. View list of 5 invite codes with status
3. Click **"Copy Invite"** button on any available code
4. **Personalized invitation message copied to clipboard**:
   ```
   Hey! You're invited to join our app! 🎉

   Use this link to sign up:
   http://yourapp.com/signup?code=abc123xyz456

   Your invite code: abc123xyz456

   Looking forward to seeing you there!
   ```
5. Share message via any platform (SMS, email, WhatsApp, etc.)
6. Track which codes have been used (shown with strikethrough)

## Testing the Viral Network

### Test Scenario 1: Bootstrap & First User
1. Create admin invite code "BOOTSTRAP" in admin UI
2. Sign up User A with "BOOTSTRAP"
3. Verify User A receives 5 codes automatically
4. Check profile page shows 5 available codes

### Test Scenario 2: Viral Growth with Smart Invite
1. User A clicks "Copy Invite" on one of their codes
2. Verify clipboard contains personalized message with signup link
3. Open the signup link (e.g., `http://localhost:1420/signup?code=abc123xyz456`)
4. Verify signup page shows:
   - "🎉 You've been invited!" message
   - Green banner with pre-populated code
   - Invite code field auto-filled
5. Sign up User B with just email and password
6. Verify User B receives 5 new codes automatically
7. Check User A's profile shows "abc123xyz456" as "Used"
8. User B can now invite 5 more users with their codes

### Test Scenario 3: Code Validation
1. Try signup without code → Error: "Invite code is required"
2. Try invalid code → Error: "Invalid or already used invite code"
3. Try already-used code → Error: "Invalid or already used invite code"
4. Try valid code → Success, 5 new codes generated

## Growth Analytics

To track your invite network growth:

```bash
# Count total users
curl http://localhost:8090/api/collections/users/records | jq '.totalItems'

# Count used vs. available codes
curl http://localhost:8090/api/collections/invite_codes/records | jq '[.items[] | .used] | group_by(.) | map({used: .[0], count: length})'
```

## Scalability

This system scales to **unlimited network size**:

- **Generation 1**: 1 user → 5 codes
- **Generation 2**: 5 users → 25 codes
- **Generation 3**: 25 users → 125 codes
- **Generation 4**: 125 users → 625 codes
- **Generation 5**: 625 users → 3,125 codes

Each generation multiplies by 5x, enabling exponential viral growth.
