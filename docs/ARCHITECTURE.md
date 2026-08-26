# Architecture

## System Architecture Overview

Own Browser is structured as a **multi-tier, security-focused architecture** designed for privacy, performance, and future extensibility.

```
┌──────────────────────────────────────────────────┐
│              React UI (Sandbox)                  │
│  ├─ Components (React + Tailwind)               │
│  ├─ State (Zustand)                              │
│  └─ Hooks (useBrowser)                           │
│                                                   │
│ CONSTRAINT: No Node.js, No FS, No Shell         │
│ IPC-Only: Uses contextBridge API                 │
└────────────────┬─────────────────────────────────┘
                 │ Validated IPC (Type-safe)
                 │ Messages only
                 ▼
┌──────────────────────────────────────────────────┐
│         Preload Script (Isolation)               │
│                                                   │
│  - Validates all incoming messages               │
│  - Exposes browserAPI (whitelisted methods)       │
│  - Uses contextBridge                            │
│  - No direct Electron/Node access                │
└────────────────┬─────────────────────────────────┘
                 │ Raw IPC
                 │ (async/await with validation)
                 ▼
┌──────────────────────────────────────────────────┐
│      Electron Main Process                       │
│                                                   │
│  ├─ Window Management (BrowserWindow)            │
│  ├─ IPC Handler (ipcMain.handle)                 │
│  ├─ Tab Manager (create/close/activate)          │
│  ├─ URL Normalization                            │
│  └─ Go Process Supervisor (Phase 4+)             │
└────────────────┬─────────────────────────────────┘
                 │
                 ├──────────────────────────┐
                 │                          │
                 ▼                          ▼
        (Phase 3+)              (Phase 4+)
      Web Content             Go Core IPC
      Rendering               Process
```

## Phase 2 Components

### 1. React Renderer (`src/renderer/`)

**Purpose**: User interface and interaction

**Key Files**:
- `App.tsx` - Root component
- `components/BrowserWindow.tsx` - Main browser UI container
- `components/TabBar.tsx` - Tab management UI
- `components/ControlBar.tsx` - Navigation controls
- `components/AddressBar.tsx` - URL input
- `components/NewTabPage.tsx` - Home page
- `components/WebView.tsx` - Sandboxed web content area with navigation/error handling

**Constraints**:
- ✗ Cannot directly access Node.js
- ✗ Cannot read filesystem
- ✗ Cannot spawn processes
- ✗ Cannot directly call Electron APIs
- ✓ Only communication: `window.browserAPI.*()`

**State Management** (Zustand):
```typescript
{
  tabs: Tab[],
  activeTabId: string,
  updateState(): void,
  addTab(): void,
  removeTab(): void,
  updateTab(): void,
  setActiveTab(): void,
}
```

### 2. Preload Script (`src/preload/index.ts`)

**Purpose**: Secure bridge between renderer and main process

**Key Responsibilities**:
- ✓ Exposes `window.browserAPI` via `contextBridge`
- ✓ Validates message types
- ✓ Handles async IPC
- ✗ Never exposes raw `ipcRenderer`
- ✗ Never exposes raw Electron modules

**Exposed API** (browserAPI):
```typescript
interface BrowserAPI {
  navigate(tabId, url): Promise<{success}>
  createTab(): void
  closeTab(tabId): void
  activateTab(tabId): void
  duplicateTab(tabId): void
  goBack(tabId): void
  goForward(tabId): void
  reload(tabId): void
  stop(tabId): void
  getState(): Promise<BrowserState>
  onStateUpdated(callback): () => void  // returns unsubscribe
}
```

### 3. Main Process (`src/main/index.ts`)

**Purpose**: Application core, window management, IPC handling

**Key Responsibilities**:
- ✓ Create/manage BrowserWindow instances
- ✓ Handle IPC messages from renderer
- ✓ Manage tab state
- ✓ Normalize and validate URLs
- ✓ Enforce security policies
- ✓ Prevent dangerous navigation
- (Future) Supervise Go backend process

**Security Measures**:
```javascript
const browserWindow = new BrowserWindow({
  webPreferences: {
    nodeIntegration: false,        // ✓ Disable Node in renderer
    contextIsolation: true,        // ✓ Isolated preload context
    sandbox: true,                 // ✓ OS-level sandbox
    preload: path.join(__dirname, '../preload/index.js')
  }
})
```

**IPC Handlers**:
- `browser:message` - All browser commands (validated)

**Tab Structure**:
```typescript
interface Tab {
  id: string;                    // Unique identifier
  url: string;                   // Current URL
  title: string;                 // Page title
  favicon?: string;              // Icon URL
  loading: boolean;              // Is loading?
  canGoBack: boolean;            // History state
  canGoForward: boolean;         // History state
  privateMode: boolean;          // Private browsing?
  muted: boolean;                // Audio muted?
  pinned: boolean;               // Tab pinned?
}
```

### 4. Shared Types (`src/shared/types.ts`)

**Purpose**: Type safety for IPC communication

**Key Contracts**:
```typescript
// Types that BOTH renderer and main process understand
type RendererToMainMessage =
  | { type: 'navigate'; tabId: string; url: string }
  | { type: 'create-tab' }
  | { type: 'close-tab'; tabId: string }
  | ... etc

type MainToRendererMessage =
  | { type: 'state-updated'; state: BrowserState }
  | { type: 'tab-loading'; tabId: string; loading: boolean }
  | ... etc
```

## Data Flow

### User Opens Browser

```
1. Electron Main Process starts
2. Creates BrowserWindow
3. Loads React app from Vite dev server (or HTML file)
4. Preload script initializes window.browserAPI
5. React app renders BrowserWindow component
6. BrowserWindow sends "get-state" IPC message
7. Main process responds with initial state (1 empty tab)
8. React renders tabs and UI
9. User ready to interact
```

### User Navigates to URL

```
1. User types in address bar, presses Enter
2. React component calls: window.browserAPI.navigate(tabId, "github.com")
3. Preload validates and calls: ipcRenderer.invoke('browser:message', {...})
4. Main process receives message in ipcMain.handle('browser:message', ...)
5. Main process:
   - Validates sender (must be main window)
   - Looks up Tab by ID
   - Normalizes URL: "github.com" → "https://github.com"
   - Updates tab.url and tab.title = "Loading..."
   - Sends state update via mainWindow.webContents.send('state-updated', state)
6. React re-renders with new URL and loading state
7. Sandboxed web content loads in the per-tab webview
8. Main process updates tab.title from page title
9. Sends updated state to renderer
10. React reflects new title in tab bar
```

### User Creates New Tab

```
1. User clicks + button or presses Ctrl+T
2. React calls: window.browserAPI.createTab()
3. Preload forwards to main process
4. Main process:
   - Creates new Tab with unique ID
   - Sets url to "about:blank"
   - Adds to tabs map
   - Sets as active tab
   - Broadcasts updated state
5. React receives state update
6. New tab appears in tab bar
7. NewTabPage component displays
```

## URL Normalization

The renderer detects search text and the shared navigation helper validates URLs before the main process accepts them:

```typescript
const destination = looksLikeUrl(input)
  ? normalizeNavigationUrl(input)
  : buildSearchUrl(input);
// The main process accepts only http(s), file URLs, and approved internal URLs.
```

Examples:
- `google.com` → `https://google.com`
- `localhost:3000` → `https://localhost:3000`
- `how does encryption work` → selected search engine URL with an encoded query
- `https://github.com` → `https://github.com` (unchanged)

## Tab State Management

### Zustand Store (Client-side)
- Caches current state
- Provides React components access to state
- Updates when main process sends `state-updated`

### Main Process (Single Source of Truth)
- Owns actual tab storage
- Maintains Map<tabId, Tab>
- Broadcasts changes to renderer
- Validates all operations

### Separation of Concerns
```
Renderer:  Display state, handle clicks, show UI
IPC:       Communicate changes
Main:      Execute operations, own data, enforce rules
```

This prevents:
- ✓ Renderer corrupting main data
- ✓ Multiple renderers conflicting
- ✓ Desync between processes
- ✓ Unauthorized operations

## Phase 3+ Architecture (Planned)

### Web Content Rendering

```
Renderer (React)
    ├─ BrowserWindow (tabs, UI)
    └─ WebView Component
        ├─ Browser Engine (Chromium via Electron)
        │  └─ Page content rendering
        ├─ Form handling
        └─ Link interception
```

The WebView component will:
- Embed Electron's web content rendering
- Handle page navigation
- Track history (back/forward)
- Extract page title and favicon
- Report to main process

### Go Backend Integration (Phase 4+)

```
Main Process
    ├─ Spawn: subprocess("browser-core", [...])
    ├─ Communicate: stdin/stdout (structured JSON)
    ├─ Monitor: restart on crash
    └─ Shutdown: graceful termination
            ↓
        Go Core Process
        ├─ IPC Handler
        ├─ Privacy Engine
        ├─ Security Engine
        ├─ Encryption
        └─ SQLite Database
```

IPC Protocol (conceptual):
```json
→ {
  "version": 1,
  "id": "req-123",
  "method": "history.add",
  "params": { "url": "...", "title": "..." }
}

← {
  "version": 1,
  "id": "req-123",
  "result": { "success": true },
  "error": null
}
```

## Performance Considerations

### Phase 2
- ✓ Lightweight (React + Zustand only)
- ✓ No web rendering (yet)
- ✓ Single Electron process model
- ✓ IPC overhead minimal

### Phase 3+
- Implement tab suspension (free memory)
- Lazy-load filter lists
- Optimize Chromium startup
- Cache favicons aggressively

## Security Model

### Trust Boundaries

```
                   TRUST BOUNDARY 1
                        │
    Untrusted websites   │  Browser UI (React)
    (Phase 3+)           │  (Trusted, our code)
                         │
                    TRUST BOUNDARY 2
                        │
            Preload Script (Limited API)
                        │
                    TRUST BOUNDARY 3
                        │
            Main Process (Full privileges)
                        │
                    TRUST BOUNDARY 4
                        │
            Go Backend (Database, crypto)
```

Each boundary enforces:
1. Only allowed APIs exposed
2. Message validation
3. Type checking
4. Permission checks

## Future: Web3 Architecture

```
Renderer (React)
    └─ Web3 Components
        ├─ Wallet UI
        ├─ dApp Bridge
        └─ Transaction Confirmation

Main Process
    └─ Web3 IPC Handler

Go Core
    └─ Wallet Engine
        ├─ Key Management
        ├─ Signing
        ├─ dApp Communication
        └─ ENS/IPFS Integration
```

The wallet will be **completely isolated** from web content:
- Website cannot access private keys
- Wallet UI = secure trust boundary
- User controls every transaction
- Hardware wallet support (later)

---

For security details, see [SECURITY.md](./SECURITY.md)
For privacy details, see [PRIVACY.md](./PRIVACY.md)
