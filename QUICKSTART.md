# Zyphora Browser - Quick Start Guide

## 🚀 Getting Started

### Prerequisites
- Node.js v22+
- Backend API running at `http://localhost:8080`
- OAuth providers configured (Google, GitHub, Microsoft)

### Installation

```bash
# Install dependencies
npm install

# Build
npm run build

# Run development
npm run dev

# Run production build
npm run dist
```

## 📖 Key Services Reference

### 1. OAuth Service
**File**: `src/renderer/lib/oauthService.ts`

```typescript
import { executeOAuthFlow } from './lib/oauthService';

// Execute full OAuth flow (initiate + popup + callback)
const payload = await executeOAuthFlow('google');
// Returns: { tokens, user, provider }
```

### 2. Token Manager
**File**: `src/renderer/lib/tokenManager.ts`

```typescript
import { 
  ensureValidToken, 
  saveTokens, 
  getAccessToken, 
  clearTokens,
  needsTokenRefresh 
} from './lib/tokenManager';

// Get valid token (auto-refreshes if expired)
const token = await ensureValidToken();

// Save tokens after auth
saveTokens({
  access_token: 'jwt...',
  refresh_token: 'jwt...',
  token_type: 'Bearer',
  expires_in: 900
});

// Check token status
if (needsTokenRefresh()) {
  // Token will expire soon, refresh it
}

// Logout
clearTokens();
```

### 3. API Client
**File**: `src/renderer/lib/apiClient.ts`

```typescript
import { apiClient } from './lib/apiClient';

// All methods automatically refresh token if needed
const response = await apiClient.get('/api/v1/me');
const result = await apiClient.post('/api/v1/devices', data);
const updated = await apiClient.put('/api/v1/sync/settings', settings);
await apiClient.delete('/api/v1/devices/123');

// Check response
if (response.ok) {
  console.log(response.data);
} else {
  console.error(response.error);
}
```

### 4. History Sync
**File**: `src/renderer/lib/historySync.ts`
**Hook**: `src/renderer/hooks/useHistoryWithSync.ts`

```typescript
import { useHistoryWithSync } from './hooks/useHistoryWithSync';

function HistoryPage() {
  const {
    entries,           // Array of history entries
    loading,           // Loading state
    syncing,           // Sync in progress
    syncError,         // Sync error message
    query,             // Search query
    setQuery,          // Set search
    reload,            // Reload from local DB
    syncToBackend,     // Manually sync
    loadFromBackend,   // Load from server
    lastSyncTime,      // Last sync timestamp
  } = useHistoryWithSync();

  return (
    <div>
      {entries.map(entry => (
        <HistoryItem key={entry.id} entry={entry} />
      ))}
    </div>
  );
}
```

### 5. Bookmarks Sync
**Hook**: `src/renderer/hooks/useBookmarksWithSync.ts`

```typescript
import { useBookmarksWithSync } from './hooks/useBookmarksWithSync';

function BookmarksPage() {
  const {
    bookmarks,
    loading,
    syncing,
    syncError,
    searchQuery,
    setSearchQuery,
    addBookmark,
    removeBookmark,
    syncToBackend,
    loadFromBackend,
  } = useBookmarksWithSync();

  return (
    <div>
      {bookmarks.map(bm => (
        <BookmarkItem key={bm.url} bookmark={bm} />
      ))}
    </div>
  );
}
```

### 6. Settings Sync
**File**: `src/renderer/lib/settingsSync.ts`

```typescript
import { 
  saveSettingsToBackend,
  loadSettingsFromBackend,
  filterSettingsForSync 
} from './lib/settingsSync';

// Save settings to backend
await saveSettingsToBackend({
  theme: 'dark',
  fontSize: 14,
  searchEngine: 'google'
});

// Load settings from backend
const settings = await loadSettingsFromBackend();

// Filter out device-specific settings
const syncSettings = filterSettingsForSync(fullSettings);
```

### 7. Offline Operations
**File**: `src/renderer/lib/offlineQueue.ts`

```typescript
import { offlineQueue, onSyncQueue } from './lib/offlineQueue';

// Queue operation when offline
offlineQueue.addOperation('history', 'sync', historyData);

// Listen for sync when back online
const unsubscribe = offlineQueue.onStatusChange((isOnline) => {
  if (isOnline) {
    console.log('Back online - syncing');
  }
});

// Get queue stats
const stats = offlineQueue.getStats();
console.log(`Queue: ${stats.total} operations`);

// Listen for sync events
const unsubscribeSyncQueue = onSyncQueue(async (operations) => {
  for (const op of operations) {
    // Process queued operations
  }
});

// Cleanup
unsubscribe();
unsubscribeSyncQueue();
```

### 8. Error Handling
**File**: `src/renderer/lib/errorHandling.ts`

```typescript
import { 
  withRetry,
  retryWithBackoff,
  parseApiError,
  isRetryable 
} from './lib/errorHandling';

// Simple retry
try {
  await withRetry(
    () => apiClient.get('/api/v1/me'),
    3,  // maxAttempts
    1000  // baseDelayMs
  );
} catch (error) {
  console.error('Failed after retries');
}

// Advanced retry
await retryWithBackoff(
  () => syncHistoryWithDevice(),
  {
    maxAttempts: 5,
    baseDelay: 1000,
    shouldRetry: (error) => isRetryable(error),
    onRetry: (attempt, error) => {
      console.log(`Attempt ${attempt}: ${error.message}`);
    }
  }
);
```

## 🔌 Integration with Components

### In AuthPortal Component
```typescript
import { executeOAuthFlow } from '../lib/oauthService';
import { saveTokens } from '../lib/tokenManager';

const handleSocialClick = async (provider: 'google' | 'github') => {
  const payload = await executeOAuthFlow(provider);
  await useSettingsStore.getState().applyAuthSession(payload);
};
```

### In HistoryPanel Component
```typescript
import { useHistoryWithSync } from '../hooks/useHistoryWithSync';

export const HistoryPanel: React.FC = () => {
  const { entries, loading, syncError } = useHistoryWithSync();
  
  return (
    <div>
      {loading && <Spinner />}
      {syncError && <ErrorMessage error={syncError} />}
      {entries.map(entry => <Entry key={entry.id} {...entry} />)}
    </div>
  );
};
```

### In Settings Page
```typescript
import { saveSettingsToBackend } from '../lib/settingsSync';

const handleThemeChange = async (theme: string) => {
  setTheme(theme);
  await saveSettingsToBackend({ theme });
};
```

## 🔐 Security Best Practices

1. **Never expose secrets**
   - Keep refresh tokens in localStorage only
   - Never log access tokens
   - Don't pass secrets in URLs

2. **Validate on client**
   - Check origin on postMessage
   - Validate token expiry before use
   - Clean up sensitive data on logout

3. **Use HTTPS in production**
   - Set API_BASE_URL to https in production
   - Enable certificate validation
   - Use secure cookies for refresh tokens

## 🧪 Development Workflow

```bash
# 1. Start dev server
npm run dev

# 2. Make changes to services/components

# 3. Test in app (DevTools: F12)
# - Check Network tab for API calls
# - Check Console for logs
# - Check localStorage for tokens

# 4. Run tests
npm test

# 5. Build for release
npm run dist
```

## 📊 Monitoring

### Check Auth Status
```javascript
// Browser console
JSON.parse(localStorage.getItem('zyphora_tokens_v2'));
JSON.parse(localStorage.getItem('zyphora_user'));
localStorage.getItem('zyphora_device_key');
```

### Monitor Sync
```javascript
// Browser console
JSON.parse(localStorage.getItem('zyphora_sync_queue'));
// Check length and operation types
```

### Network Monitoring
- Open DevTools (F12)
- Go to Network tab
- Make API calls
- Watch requests/responses
- Check Bearer token in headers

## 🆘 Common Issues

| Issue | Solution |
|-------|----------|
| "Popup blocked" | Allow popups in browser settings |
| "Token not refreshing" | Check refresh endpoint exists and works |
| "Sync not happening" | Verify device registered, check offline queue |
| "API 401 error" | Token expired, logout and login again |
| "Offline not detected" | Check Network.onLine API support |

## 📚 Additional Resources

- [IMPLEMENTATION_GUIDE.md](./IMPLEMENTATION_GUIDE.md) - Detailed implementation overview
- [TESTING_GUIDE.md](./TESTING_GUIDE.md) - Comprehensive testing guide
- [BACKEND_OAUTH_AGENT_PROMPT.md](./BACKEND_OAUTH_AGENT_PROMPT.md) - Backend OAuth requirements
- [src/renderer/lib/](./src/renderer/lib/) - Service implementations

## 🎯 Next Steps

1. **Review** implementation against specification
2. **Test** OAuth flows with real providers
3. **Deploy** to staging environment
4. **Verify** multi-device sync
5. **Release** to production

---

**Last Updated**: 2026-08-31
**Status**: Ready for Integration ✅
