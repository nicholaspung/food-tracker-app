# Yummy Recs Branding Integration

This document describes how the Yummy Recs logo and branding has been integrated into the application.

## Logo Integration Points

### 1. Onboarding Page (`/onboarding`)
**Location**: `src/components/OnboardingPage.tsx`

- Logo appears at the top of the first onboarding screen
- Size: 80x80 pixels (w-20 h-20)
- Position: Centered with padding
- Only shows on the first screen to avoid visual clutter

**Changes**:
- Updated first screen title from "Track Your Foods" to "Welcome to Yummy Recs"
- Logo creates strong first impression for new users

---

### 2. Login Page (`/`)
**Location**: `src/components/LoginPage.tsx`

- Logo appears in the card header above "Welcome back" title
- Size: 64x64 pixels (w-16 h-16)
- Position: Centered above title
- Provides consistent branding for returning users

---

### 3. Sign Up Page (`/signup`)
**Location**: `src/components/SignUpPage.tsx`

- Logo appears in the card header above "Create an account" title
- Size: 64x64 pixels (w-16 h-16)
- Position: Centered above title
- Reinforces brand identity during account creation

---

### 4. Profile Page (`/profile`)
**Location**: `src/components/ProfilePage.tsx`

- Logo and app name appear at the top of the header section
- Logo size: 40x40 pixels (w-10 h-10)
- Text: "Track Your Foods" in lg font, semibold
- Layout: Horizontal flex with 8px gap
- Position: Above "Profile" heading, aligned to the left
- Provides branding context within the app

---

## Browser/App Metadata Updates

### HTML Title & Meta Tags
**Location**: `index.html`

**Before**:
```html
<title>Track Your Foods</title>
<meta name="description" content="Track your food experiences and restaurant visits">
<meta name="theme-color" content="#ffffff">
```

**After**:
```html
<title>Yummy Recs - Your Food Recommendation Network</title>
<meta name="description" content="Your personal food recommendation network - track meals, rate dishes, and discover what your friends love">
<meta name="theme-color" content="#FF6B6B">
```

**Changes**:
- Updated page title to include "Yummy Recs" brand name
- Improved meta description to emphasize social/recommendation aspect
- Changed theme color to match logo gradient (coral red)

---

### Favicon
**Location**: `index.html`

**Before**:
```html
<link rel="icon" href="/tauri.svg" type="image/svg+xml">
```

**After**:
```html
<link rel="icon" href="/logo-speech-bubble-plate.svg" type="image/svg+xml">
```

The browser tab now displays the Yummy Recs logo instead of the generic Tauri icon.

---

### Package.json
**Location**: `package.json`

**Before**:
```json
"name": "food-tracker-app"
```

**After**:
```json
"name": "yummy-recs"
```

---

## Logo Asset Used

**Primary Logo**: `/public/logo-speech-bubble-plate.svg`

This logo was chosen because:
- Combines plate (food) with speech bubble (recommendations/social)
- Warm coral-to-orange gradient evokes appetite
- Works well at multiple sizes (64px, 80px, 200px)
- Clear and recognizable even at small sizes

---

## Consistency Guidelines

When adding the logo to new pages:

1. **Standard sizes**:
   - Card headers (login/signup): `w-16 h-16` (64px)
   - Page headers: `w-20 h-20` (80px)
   - Large displays: `w-24 h-24` or larger (96px+)

2. **Standard positioning**:
   ```jsx
   <div className="flex justify-center mb-4">
     <img
       src="/logo-speech-bubble-plate.svg"
       alt="Yummy Recs Logo"
       className="w-16 h-16"
     />
   </div>
   ```

3. **Always include alt text**: "Yummy Recs Logo"

4. **Spacing**: Use `mb-4` (16px) margin below logo in most cases

---

## Future Branding Opportunities

Consider adding the logo to:

1. **Loading states** - Show logo with a loading animation
2. **Empty states** - "No restaurants yet" pages could show logo
3. **Error pages** - 404 or error screens
4. **Email templates** - If adding email notifications
5. **PWA splash screen** - For mobile app installation
6. **Navigation header** - Small logo in top navigation bar
7. **Settings/Profile page** - Small logo in header

---

## Color Palette (from logo)

Use these colors to maintain brand consistency:

- **Primary Gradient**: `#FF6B6B` → `#FF8E53` (coral to orange)
- **Secondary Gradient**: `#FF8E53` → `#FFA726` (orange to amber)
- **Accent Gold**: `#FFD700`
- **Theme Color**: `#FF6B6B` (used in meta tag)

These colors can be used for:
- Call-to-action buttons
- Highlights and accents
- Loading indicators
- Success states
- Active navigation items

---

## Build Verification

The application has been successfully built with all branding changes:

```bash
npm run build
# ✓ built in 3.97s
# Package name: yummy-recs@0.2.3
```

All logo references are correctly resolved and bundled.
