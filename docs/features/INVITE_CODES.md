# Invite Code System

This application uses an invite code system to control user registration. Users must provide a valid, unused invite code to create an account.

## Backend Implementation

The backend validates invite codes using PocketBase event hooks:

1. **OnRecordCreateRequest("users")**: Validates the invite code before user creation
   - Checks if invite code is provided
   - Verifies the code exists in the database
   - Ensures the code hasn't been used already

2. **OnRecordAfterCreateRequest("users")**: Marks the invite code as used after successful registration
   - Updates the `used` field to `true`
   - Records which user used the code in the `usedBy` field

## Setting Up the Invite Codes Collection

The `invite_codes` collection is automatically created when you start the backend server for the first time. The collection includes:

**Collection: invite_codes**
- Type: Base
- API Rules: Admin-only access (all rules set to `null`)

**Fields:**
- `code` (Text): Required, minimum 6 characters, maximum 50 characters, no whitespace allowed
- `used` (Bool): Required, tracks whether the code has been used
- `usedBy` (Relation): Links to the user who used this code (single relation to users collection)

### Manual Setup (if needed)

If you need to recreate the collection manually:

1. Start the backend server and open http://localhost:8090/_/
2. Create collection named `invite_codes` with the fields listed above
3. Set all API rules to `null` for admin-only access

## Creating Invite Codes

### Via Admin UI

1. Go to http://localhost:8090/_/
2. Select the `invite_codes` collection
3. Click "New Record"
4. Enter a code (e.g., "WELCOME2024")
5. Set `used` to `false`
6. Save

### Via API (if you create a custom admin endpoint)

```bash
curl -X POST http://localhost:8090/api/collections/invite_codes/records \
  -H "Content-Type: application/json" \
  -H "Authorization: YOUR_ADMIN_TOKEN" \
  -d '{
    "code": "WELCOME2024",
    "used": false
  }'
```

## Frontend Implementation

The signup form (`frontend/src/components/SignUpPage.tsx`) includes an invite code field:

- Field is required
- Validated on the client before submission
- Sent to the backend along with email and password
- Backend returns appropriate error messages for invalid/used codes

## Testing the Flow

1. Create an invite code in the admin UI
2. Navigate to the signup page
3. Try to sign up without an invite code → Should show error
4. Try to sign up with an invalid code → Should show error
5. Try to sign up with a valid code → Should succeed
6. Try to reuse the same code → Should show error (code already used)

## Error Messages

The system provides specific error messages:
- "Invite code is required" - No code provided
- "Invalid or already used invite code" - Code doesn't exist or has been used
- Other standard PocketBase validation errors for email/password

## Code Flow

1. User submits signup form with invite code
2. Frontend sends POST request to `/api/collections/users/records` with `inviteCode` in form data
3. Backend `OnRecordCreateRequest` hook validates the invite code
4. If valid, user creation proceeds
5. Backend `OnRecordAfterCreateRequest` hook marks code as used
6. User is automatically logged in
7. User redirected to home page
