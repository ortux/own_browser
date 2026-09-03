# Own Browser

A modern, privacy-focused desktop web browser built from scratch with Electron, React, and TypeScript.

## Overview

Own Browser prioritizes:
- **Privacy**: No telemetry, local-only data storage, tracker blocking
- **Security**: Secure Electron configuration, validated IPC, and sandboxed web content
- **Speed**: Minimal dependencies, optimized performance
- **Low Resource Usage**: Lazy loading and efficient filtering (tab sleeping is planned)
- **No Telemetry**: Browsing data stays local; explicitly enabled third-party services are documented

## Technology Stack

### Current
- **Desktop**: Electron 44+
- **UI**: React 18 + TypeScript 5 + Vite 6
- **Styling**: Tailwind CSS 4
- **Icons**: Lucide React
- **State**: Zustand
- **Build**: electron-vite

### Current
- **Database**: SQLite via sql.js, with OS-keychain encryption for saved passwords
- **IPC**: Structured, validated message protocol between renderer and main

### Planned
- Fingerprinting resistance
- Web3: EVM wallet, dApp support, ENS

## Project Structure

```
own-browser/
├── src/
│   ├── main/              # Electron main process
│   ├── preload/           # Secure IPC bridge (contextIsolation)
│   ├── renderer/          # React application
│   │   ├── components/    # React components
│   │   ├── hooks/         # Custom hooks
│   │   ├── stores/        # Zustand stores
│   │   └── styles/        # Tailwind CSS
│   └── shared/            # Shared types for IPC
├── public/                # Static assets
├── docs/                  # Documentation
└── package.json           # Dependencies
```

## Security Architecture

```
┌─────────────────────────────────────────────┐
│         React Renderer (Sandbox)            │
│   NO Node.js, NO fs, NO shell access       │
└────────────────────┬────────────────────────┘
                     │ (contextIsolation: true)
                     │ (Validated IPC only)
                     ▼
┌─────────────────────────────────────────────┐
│         Preload Script (Bridge)             │
│   Limited API, all messages validated       │
└────────────────────┬────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────┐
│      Electron Main Process                  │
│   Window management, IPC routing             │
│   Privacy, security, storage, encryption    │
└─────────────────────────────────────────────┘
```

### Security Defaults (Phase 2)
```javascript
{
  nodeIntegration: false,        // ✓ No Node.js in renderer
  contextIsolation: true,        // ✓ Separate preload context
  sandbox: true,                 // ✓ OS-level process sandbox
  preload: 'path/to/preload.js'  // ✓ Explicit preload script
}
```

## Development

### Prerequisites
- Node.js 22.12+
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Run production build
npm start

# Lint code
npm run lint

# Format code
npm run format

# Typecheck and run the unit suites
npm run typecheck
npm test
```

### Configuration

All environment variables are optional; the browser runs without them and the
relevant feature degrades gracefully. Copy `.env.example` to `.env` to set them.

| Variable | Purpose | Default |
| --- | --- | --- |
| `PEXELS_API_KEY` | New Tab background photos. Without it the New Tab page uses a plain themed background. | unset |
| `VITE_API_BASE_URL` / `API_BASE_URL` | Sync + account backend. The main process also uses it to allowlist OAuth redirects. | `https://api-zyphora.obliqllc.xyz` |
| `ZYPHORA_PROXY_LIST` | Comma-separated `ip:port:user:pass` proxy pool for the Settings proxy toggle. | unset |
| `ZYPHORA_DNS_MODE` | `secure` for fail-closed DNS-over-HTTPS; anything else is fail-open. Overrides the Settings → Privacy toggle. | `automatic` |

## Current Capabilities

✓ Browser window with Electron
✓ Address bar with URL/search detection
✓ Tab management (create, close, switch, duplicate)
✓ Navigation controls (back, forward, reload, stop)
✓ New tab page with quick links
✓ Keyboard shortcuts (Ctrl+T, Ctrl+W, Ctrl+R, etc.)
✓ Loading indicators
✓ Favicon support (when web content loads)
✓ Embedded web content with link navigation and managed target=_blank tabs
✓ Page-load and renderer-crash error surfaces instead of silent blank tabs
✓ Find in page, zoom, print, recently closed tabs, and download retry
✓ Per-site ad-blocker controls, blocked-request diagnostics, private sessions, and permissions
✓ Inspect element and detached developer tools
✓ Secure IPC communication
✓ TypeScript throughout

## Keyboard Shortcuts (Phase 2)

| Shortcut | Action |
|----------|--------|
| Ctrl+T | New tab |
| Ctrl+W | Close tab |
| Ctrl+R, F5 | Reload |
| Ctrl+F | Find in page |
| Ctrl+Shift+T | Reopen recently closed tab |
| Alt+← | Go back |
| Alt+→ | Go forward |
| Ctrl+D | Bookmark (future) |

## Planned Features

### Phase 3: Web Content Rendering
- WebView or similar for web content
- HTML/CSS/JS rendering
- Form handling
- Link clicking

### Next up
- Cross-device sync hardening
- SQLite initialization
- Configuration loading

### Phase 5: Storage
- History management
- Bookmark storage
- Settings persistence
- Download tracking

### Phase 6: Encryption
- Encrypted sensitive data
- Key management abstraction
- Secure credential storage

### Phase 7: Privacy Engine
- Tracker blocking
- Cookie restrictions
- Tracking parameter removal
- Filter lists

### Phase 8: Private Browsing
- Private windows/tabs
- Isolated session storage
- No history persistence

### Phase 9-10: Performance & Security
- Tab sleeping
- Memory optimization
- HTTPS status
- Certificate validation

### Phase 11-12: Web3
- Wallet infrastructure
- dApp support
- ENS resolution
- IPFS integration

## Architecture Notes

### URL Detection
The browser automatically converts user input:
- `google.com` → `https://google.com` (uses HTTPS by default)
- `192.168.1.1` → `http://192.168.1.1` (local IP uses HTTP)
- `how does encryption work` → DuckDuckGo search
- `github.com/user/repo` → `https://github.com/user/repo`

### IPC Security
All Electron-Renderer communication uses:
1. **Type-safe messages** (TypeScript interfaces)
2. **Schema validation** (main process validates every message)
3. **Whitelisting** (only known message types allowed)
4. **No raw access** (ipcRenderer never exposed)

### State Management
Uses Zustand for:
- Tab list and active tab
- Navigation state (back/forward buttons)
- Loading state
- Favicon cache

Main process owns:
- URL normalization
- Navigation logic
- Tab creation/destruction

## Known Limitations

- Private browsing uses temporary per-tab sessions but is not anonymous and does not encrypt traffic.
- Local history, bookmarks, and settings are not encrypted at rest.
- Ad blocking starts with Ghostery's ads-only network lists; cosmetic/scriptlet filtering is intentionally disabled for compatibility. See `docs/ADBLOCK.md`.
- Proxy pools must be supplied through `ZYPHORA_PROXY_LIST`; unreliable proxies are rejected before they can interrupt browsing.
- No fingerprinting resistance or Web3 support yet.

## Performance Targets

- Launch time: < 2 seconds
- New tab: < 100ms
- Page load: < 3 seconds (typical)
- Memory: < 200MB base + 50MB per tab
- CPU: < 5% idle

## Testing

```bash
# Run tests (Phase 5+)
npm test
```

Test coverage includes:
- URL parsing and normalization
- Search query detection
- IPC message validation
- Tab state management
- Navigation flow

## Contributing

This is a Phase 2 implementation. Contributions welcome for:
- UI/UX improvements
- Bug fixes
- Documentation
- Phase 3+ implementations

## License

MIT - Open source, privacy-first browser for everyone

## Support

For issues or questions, see the `/docs` folder for detailed architecture, security, and privacy documentation.

---

**Status**: Working browser core with embedded web content
**Next**: Private browsing, complete session policies, and deeper privacy-engine coverage
**Timeline**: Evolving with community input
