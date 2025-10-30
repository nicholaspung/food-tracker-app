# Progressive Web App (PWA) Deployment Guide

This guide explains the PWA setup for the food tracker app and deployment considerations.

## Overview

The app now supports Progressive Web App (PWA) functionality, allowing users to:
- Install the app on their mobile home screen (Android & iOS)
- Use the app offline (with cached data)
- Receive automatic updates when new versions are deployed
- Experience app-like navigation and feel

## Platform Support

### Android
✅ **Full PWA Support**
- Install to home screen
- Standalone app mode
- Push notifications (if implemented)
- Background sync
- Offline functionality
- Auto-updates

### iOS (Safari)
✅ **Good PWA Support** (with limitations)
- Add to home screen
- Standalone app mode
- Offline functionality
- Auto-updates
- ⚠️ **Limitations:**
  - No push notifications
  - Limited background sync
  - Some storage limitations
  - Requires iOS 11.3+ (best on iOS 16.4+)

## What Was Implemented

### 1. PWA Plugin Configuration
**File:** `frontend/vite.config.ts`

- **Auto-update strategy**: Service worker automatically updates when new version is deployed
- **Static asset caching**: All JS, CSS, HTML, images cached for offline use
- **API caching**: Network-first strategy for API calls with 1-hour cache fallback
- **Dev mode enabled**: Test PWA features during development

### 2. Web App Manifest
**Generated at:** `dist/manifest.webmanifest`

Contains:
- App name: "TrackYourFoods"
- Display mode: standalone (fullscreen app feel)
- Icons: 64x64, 192x192, 512x512 (regular + maskable)
- Theme colors: white background/theme
- Start URL: `/`

### 3. PWA Assets
**Location:** `frontend/public/`

Generated icons:
- `pwa-64x64.png` - Small icon
- `pwa-192x192.png` - Standard mobile icon
- `pwa-512x512.png` - Large display icon
- `maskable-icon-512x512.png` - Adaptive icon for Android
- `apple-touch-icon-180x180.png` - iOS home screen icon
- `favicon.ico` - Browser favicon

### 4. Service Worker Registration
**File:** `frontend/src/main.tsx`

- Auto-registers on app load
- Prompts user when updates are available
- Logs when offline mode is ready
- Handles automatic reload on update

### 5. HTML Meta Tags
**File:** `frontend/index.html`

- PWA icons linked
- Theme color meta tag
- App description for app stores
- Viewport configured for mobile

## Architecture Considerations

### Dual Distribution Strategy

Your app now supports **two distribution methods** from the same codebase:

1. **Native App (Tauri)**
   - Desktop/mobile native wrapper
   - Full system access
   - Distributed via app stores or direct download
   - Uses localhost:8090 for PocketBase

2. **Web App (PWA)**
   - Browser-based installation
   - Distributed via web (trackyourfoods.com)
   - Works on any device with a modern browser
   - Requires deployed PocketBase backend

### Backend Requirements for PWA

⚠️ **IMPORTANT**: The PWA requires a publicly accessible backend.

**Current Setup:**
- **Dev**: PocketBase runs on `localhost:8090` (works for Tauri, NOT for PWA)
- **Production**: Must deploy PocketBase to `https://beta.trackyourfoods.com` or `https://trackyourfoods.com`

**Your `pb.ts` file** (`frontend/src/lib/pocketbase.ts`) must handle this:

```typescript
// Example configuration
const baseUrl = import.meta.env.PROD
  ? 'https://beta.trackyourfoods.com'  // Production PWA
  : 'http://127.0.0.1:8090';            // Local dev

export const pb = new PocketBase(baseUrl);
```

## Deployment Steps

### 1. Backend Deployment (PocketBase)

**Option A: VPS/Cloud Server**
- Deploy PocketBase to your server (DigitalOcean, AWS, etc.)
- Configure domain: `beta.trackyourfoods.com` or `trackyourfoods.com`
- Set up HTTPS (required for PWA)
- Configure CORS to allow your frontend domain

**Option B: PocketBase Cloud** (when available)
- Use official PocketBase hosting
- Connect your domain
- Deploy migrations

**Your existing deployment scripts** in `scripts/` may need updates to handle PWA deployment separately from Tauri builds.

### 2. Frontend Deployment (PWA)

**Build the app:**
```bash
cd frontend
npm run build
```

This creates `dist/` folder with:
- All static assets
- Service worker (`sw.js`)
- Web manifest (`manifest.webmanifest`)
- PWA icons

**Deploy to static hosting:**
- **Vercel**: `vercel --prod`
- **Netlify**: `netlify deploy --prod`
- **GitHub Pages**: Push `dist/` to gh-pages branch
- **Cloudflare Pages**: Connect repo and auto-deploy
- **Your VPS**: Copy `dist/` to web server (Caddy/Nginx)

**Your Caddyfile** likely needs a new block for PWA deployment:
```caddyfile
trackyourfoods.com {
    root * /path/to/dist
    file_server
    try_files {path} /index.html  # SPA routing
}
```

### 3. Environment Configuration

Create `.env.production` in `frontend/`:
```bash
VITE_POCKETBASE_URL=https://beta.trackyourfoods.com
```

Update `pb.ts` to use this:
```typescript
const baseUrl = import.meta.env.VITE_POCKETBASE_URL || 'http://127.0.0.1:8090';
```

### 4. HTTPS Requirement

PWAs **require HTTPS** (except localhost). Ensure:
- ✅ Backend: `https://beta.trackyourfoods.com`
- ✅ Frontend: `https://trackyourfoods.com`
- ✅ Valid SSL certificate (Let's Encrypt is free)

## Testing PWA

### Local Testing
```bash
cd frontend
npm run dev
```

1. Open Chrome DevTools
2. Go to **Application** tab
3. Check **Service Workers** section
4. Check **Manifest** section
5. Verify icons and theme colors

### Production Testing

**On Android Chrome:**
1. Visit `https://trackyourfoods.com`
2. Chrome will show "Add to Home Screen" prompt
3. Or tap Menu → "Add to Home Screen"
4. App installs as standalone app

**On iOS Safari:**
1. Visit `https://trackyourfoods.com`
2. Tap Share button
3. Select "Add to Home Screen"
4. App installs with custom icon

### Lighthouse Audit
Run PWA audit:
```bash
npm install -g lighthouse
lighthouse https://trackyourfoods.com --view
```

Should score 90+ on PWA criteria.

## Offline Functionality

### What Works Offline
✅ Previously visited pages
✅ Static assets (JS, CSS, images)
✅ Cached API responses (1 hour)
✅ UI navigation
✅ Form interactions (data stored locally)

### What Requires Connection
❌ New API requests
❌ Real-time updates
❌ Image uploads
❌ User authentication (initial login)

### Improving Offline Experience

**Add offline page:**
Create `frontend/public/offline.html` and configure in `vite.config.ts`:
```typescript
workbox: {
  navigateFallback: '/offline.html',
  navigateFallbackDenylist: [/^\/api/],
}
```

**Background sync** (for queuing offline actions):
```typescript
// Future enhancement
workbox: {
  runtimeCaching: [{
    urlPattern: /^https:\/\/.*\.trackyourfoods\.com\/api\/.*/i,
    handler: 'NetworkFirst',
    options: {
      plugins: [
        { backgroundSync: { name: 'api-queue', maxRetentionTime: 24 * 60 } }
      ]
    }
  }]
}
```

## Updating the PWA

### Automatic Updates
- Users automatically receive updates when you deploy
- Service worker checks for updates on page load
- If update found, prompts: "New content available. Reload?"
- User confirms → app updates immediately

### Force Update
To force all users to update:
1. Increment version in `package.json`
2. Clear service worker cache in deployment script
3. Deploy new version

### Update Strategy Options

**Current:** `registerType: 'autoUpdate'`
- Best for most apps
- Automatic background updates
- Minimal user friction

**Alternative:** `registerType: 'prompt'`
- Shows banner when update is available
- User controls when to update
- Better for apps with unsaved data

## Monitoring PWA Usage

### Analytics
Track PWA metrics:
- **Install rate**: Users who installed PWA
- **Standalone usage**: % using PWA vs browser
- **Offline usage**: Sessions without network

**Add to analytics:**
```javascript
if (window.matchMedia('(display-mode: standalone)').matches) {
  // User is in PWA mode
  analytics.track('pwa_mode', { installed: true });
}
```

### Service Worker Logs
Monitor service worker in production:
```typescript
// In main.tsx
const updateSW = registerSW({
  onNeedRefresh() {
    console.log('New version available');
  },
  onOfflineReady() {
    console.log('App ready offline');
  },
  onRegistered(r) {
    console.log('SW registered:', r);
  },
});
```

## Common Issues

### Issue: PWA not installable
**Causes:**
- Not served over HTTPS
- Missing manifest or icons
- Start URL not loading
- Service worker not registered

**Debug:** Chrome DevTools → Application → Manifest

### Issue: Updates not appearing
**Causes:**
- Browser cache
- Service worker not updating
- Old service worker stuck

**Fix:**
```javascript
// Add to deployment script
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(registrations => {
    registrations.forEach(reg => reg.unregister());
  });
}
```

### Issue: iOS not showing install prompt
**Solution:**
- iOS doesn't auto-prompt
- Users must manually "Add to Home Screen"
- Show instructions in your UI

## Next Steps

### Recommended Enhancements

1. **Push Notifications** (Android only)
   - Notify users of friend visits
   - Restaurant recommendations
   - Requires backend integration

2. **Background Sync**
   - Queue offline actions
   - Sync when connection restored

3. **Install Prompt**
   - Custom "Add to Home Screen" button
   - Show on first visit or after 2-3 visits

4. **Offline Indicator**
   - Show banner when offline
   - Disable features that require network

5. **App Shortcuts**
   - Quick actions from home screen icon
   - "Add Visit", "View Feed", etc.

### Resources

- [vite-plugin-pwa docs](https://vite-pwa-org.netlify.app/)
- [Web.dev PWA guide](https://web.dev/progressive-web-apps/)
- [MDN PWA docs](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps)
- [Workbox documentation](https://developers.google.com/web/tools/workbox)

## Summary

✅ PWA setup complete
✅ Icons and manifest configured
✅ Service worker auto-updating
✅ Offline caching enabled
✅ Works on Android & iOS

**To deploy PWA:**
1. Deploy PocketBase backend with public URL
2. Update `pb.ts` with production URL
3. Build frontend: `npm run build`
4. Deploy `dist/` to static hosting with HTTPS
5. Test installation on mobile devices

Your app now supports both **native distribution (Tauri)** and **web distribution (PWA)** from a single codebase!
