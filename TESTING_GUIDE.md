# Zyphora Browser - Testing & Integration Guide

## Pre-Flight Checklist

Before running tests, ensure:
- [ ] Backend API running at `http://localhost:8080`
- [ ] Database configured and migrated
- [ ] OAuth providers (Google, GitHub) configured in backend
- [ ] Environment variables set
- [ ] Node.js v22+ installed

## Unit Tests

### Token Manager Tests
```bash
# Test token storage, refresh, and expiry logic
npm test -- tokenManager.test.ts
```

**Test Cases**:
- ✅ Save and retrieve tokens
- ✅ Detect expired tokens
- ✅ Refresh token when expired
- ✅ Clear tokens on logout
- ✅ Calculate token expiry time

### OAuth Service Tests
```bash
# Test OAuth flow
npm test -- oauthService.test.ts
```

**Test Cases**:
- ✅ Initiate OAuth with backend
- ✅ Open popup window
- ✅ Wait for callback message
- ✅ Validate message origin
- ✅ Handle timeout
- ✅ Close popup on completion

### API Client Tests
```bash
# Test API client with auth
npm test -- apiClient.test.ts
```

**Test Cases**:
- ✅ Add Bearer token to requests
- ✅ Handle 401 and refresh
- ✅ Retry with exponential backoff
- ✅ Parse error responses
- ✅ Handle network errors

### Offline Queue Tests
```bash
# Test offline operation queueing
npm test -- offlineQueue.test.ts
```

**Test Cases**:
- ✅ Add operation to queue
- ✅ Persist queue to storage
- ✅ Detect online/offline
- ✅ Auto-sync on reconnect
- ✅ Exponential retry
- ✅ Remove completed operations

## Integration Tests

### OAuth Login Flow
1. Start app
2. Click "Sign in with Google"
3. **Expected**: Popup opens with Google login
4. Complete Google authentication
5. **Expected**: Popup closes, tokens saved, device registration modal shows
6. Enter device name and confirm
7. **Expected**: Device registered, logged in to app

### Email/Password Authentication
1. Click "Create account"
2. Enter email, password (12+ chars), optional name
3. Click "Create my account"
4. **Expected**: Account created, logged in
5. Device registration modal shows
6. Enter device name
7. **Expected**: Device registered, logged in

### Token Refresh
1. Login to app
2. Get access token: `localStorage.getItem('zyphora_tokens_v2')`
3. Wait for token to expire (check `expires_at` field)
4. Make API call (e.g., navigate to settings)
5. **Expected**: Token automatically refreshed in background
6. API call succeeds
7. Check new token in storage

### History Sync
1. Login to app
2. Browse several pages
3. Go to History panel
4. **Expected**: Local history visible
5. Backend configured: Check `/api/v1/sync/history` returns entries
6. Navigate to another page
7. Wait 5+ minutes for auto-sync
8. **Expected**: New entry appears in backend history

### Bookmarks Sync
1. Login to app
2. Bookmark a page (Ctrl+D or menu)
3. Go to Bookmarks panel
4. **Expected**: Bookmark visible locally
5. Backend configured: Check `/api/v1/sync/bookmarks`
6. Add another bookmark
7. Wait for sync
8. **Expected**: Bookmark visible in backend

### Settings Sync
1. Login to app
2. Go to Settings > Appearance
3. Change theme to "Light"
4. **Expected**: Setting saved locally
5. Backend has `/PUT /api/v1/sync/settings`
6. Close app and reopen
7. **Expected**: Theme preference persists (loaded from backend)

### Device Management
1. Login on Device A
2. Go to Settings > Devices
3. **Expected**: Current device shown as "This device"
4. Login on Device B (or same computer, different instance)
5. On Device A: Refresh Devices page
6. **Expected**: Device B appears in list
7. Rename Device B
8. **Expected**: Rename successful
9. Unlink Device B
10. **Expected**: Device B removed from list

### Offline Operation Queuing
1. Login to app
2. Disable network (dev tools or disconnect WiFi)
3. Browse several pages
4. Add a bookmark
5. Change a setting
6. **Expected**: Status shows "Offline - changes will sync"
7. Check localStorage: `zyphora_sync_queue` has entries
8. Enable network
9. **Expected**: "Syncing..." appears, queue auto-syncs
10. Check backend: All operations received

### Error Handling
1. Set invalid API base URL in settings
2. Try to sync history
3. **Expected**: Error message shown, auto-retry in background
4. Fix API URL
5. **Expected**: Sync completes automatically

### Multi-Device Sync
1. Login on Device A
2. Browse history, add bookmarks, change settings
3. Login on Device B (different computer or browser)
4. **Expected**: History and bookmarks from Device A visible
5. Modify something on Device B
6. Go back to Device A
7. **Expected**: Changes from Device B visible

## End-to-End Test Scenario

### Complete User Journey

```
1. Fresh App Install
   ├─ Open app
   ├─ See welcome/onboarding
   ├─ Click "Sign in with Google"
   ├─ Complete Google auth
   ├─ Register device as "My Laptop"
   └─ ✅ Logged in

2. Browsing & Syncing
   ├─ Visit: google.com, github.com, stackoverflow.com
   ├─ Bookmark stackoverflow
   ├─ Go to Settings > Change theme to Dark
   ├─ Wait 5+ minutes
   ├─ History, bookmarks, settings synced to backend
   └─ ✅ All synced

3. Second Device Login
   ├─ Open app on Device B
   ├─ Click "Sign in with Google" (same account)
   ├─ Register device as "My Phone"
   ├─ Go to Devices page
   ├─ See "My Laptop" listed
   ├─ Go to History
   ├─ See history from Device A
   ├─ Go to Bookmarks
   ├─ See bookmarks from Device A
   ├─ Check Settings
   ├─ See theme is Dark (synced from Device A)
   └─ ✅ All data synced across devices

4. Offline Operations
   ├─ Disable network on Device B
   ├─ Browse pages, add bookmarks
   ├─ Status shows "Offline"
   ├─ Enable network
   ├─ Operations auto-sync
   ├─ Check Device A
   ├─ See new history and bookmarks
   └─ ✅ Offline operations synced

5. Device Management
   ├─ On Device A: Go to Settings > Devices
   ├─ See both devices listed
   ├─ Rename Device B to "Phone - iOS"
   ├─ Refresh on Device B
   ├─ Device name updated
   ├─ On Device A: Unlink Device B
   ├─ Device B lost connection to sync
   └─ ✅ Device management works

6. Token Refresh
   ├─ Monitor localStorage tokens
   ├─ Token expires (15 min by default)
   ├─ Make API call (sync history)
   ├─ See new token in localStorage
   ├─ API call succeeds
   └─ ✅ Token refresh transparent

7. Logout & Login
   ├─ Logout from app
   ├─ Check localStorage (tokens cleared)
   ├─ Login with different account
   ├─ See different user's data
   ├─ History/bookmarks/settings changed
   └─ ✅ Account switching works
```

## Performance Tests

### Sync Speed
```typescript
// Measure time to sync 1000 history entries
const start = performance.now();
await syncHistoryWithDevice({ batch: true });
const duration = performance.now() - start;
console.log(`Sync took ${duration}ms`); // Expected: < 2000ms
```

### Memory Usage
- App with 10K+ history entries: < 100MB
- With UI rendered: < 150MB
- Offline queue with 5K operations: < 50MB

### Network
- OAuth flow: 2-3 round trips
- Single sync: 1 HTTP request
- Average payload: 10-50KB per sync

## Debugging

### Enable Debug Logging
```typescript
// In browser console
localStorage.setItem('DEBUG', '*');
// Reload app
```

### Check Token Status
```javascript
// In browser console
JSON.parse(localStorage.getItem('zyphora_tokens_v2'))
// Should show: { access_token, refresh_token, token_type, expires_at }
```

### Check Queue Status
```javascript
// In browser console
const queue = JSON.parse(localStorage.getItem('zyphora_sync_queue') || '[]');
console.log(`Queue has ${queue.length} operations`);
```

### Monitor API Calls
- Open DevTools Network tab
- Filter to `localhost:8080` or API domain
- Watch requests during sync operations

### Test Token Expiry
```javascript
// Manually expire token
const tokens = JSON.parse(localStorage.getItem('zyphora_tokens_v2'));
tokens.expires_at = Date.now() - 1000; // Expire now
localStorage.setItem('zyphora_tokens_v2', JSON.stringify(tokens));

// Next API call should auto-refresh
```

## Common Issues & Fixes

### Issue: Popup blocked
**Cause**: Browser popup blocker
**Fix**: Allow popups for this site in browser settings

### Issue: Token not refreshing
**Cause**: Refresh token expired or invalid
**Fix**: Clear tokens and re-login
```javascript
localStorage.removeItem('zyphora_tokens_v2');
```

### Issue: Sync not happening
**Cause**: Not authenticated or no device key
**Fix**: Ensure logged in and device registered
```javascript
console.log(JSON.parse(localStorage.getItem('zyphora_device_key')));
```

### Issue: Offline queue not syncing
**Cause**: Still offline or sync disabled
**Fix**: Check network status and trigger sync manually
```javascript
import { offlineQueue } from './lib/offlineQueue';
console.log(offlineQueue.getStats());
```

## Regression Testing

Run after any changes:

```bash
# Run all tests
npm test

# Test specific feature
npm test -- --grep "oauth|token|sync"

# Test with coverage
npm test -- --coverage
```

## Sign-off Checklist

- [ ] All OAuth flows work (Google, GitHub, Microsoft)
- [ ] Email/password auth works
- [ ] Token refresh automatic and transparent
- [ ] History syncs to backend
- [ ] Bookmarks sync to backend
- [ ] Settings sync to backend
- [ ] Device registration works
- [ ] Device management UI responsive
- [ ] Offline operation queuing works
- [ ] Auto-sync on reconnect works
- [ ] Error handling shows helpful messages
- [ ] Multi-device sync verified
- [ ] Performance acceptable
- [ ] No console errors
- [ ] UI responsive and polished

---

**Test Status**: Ready for QA ✅
**Platform**: Windows, macOS, Linux
**Browsers**: Electron (Chromium-based)
