# Own Browser

A modern, privacy-focused desktop web browser built from scratch with Electron, React, TypeScript, and Go.

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

### Planned (Phase 4+)
- **Core Backend**: Go (privacy engine, security, storage)
- **Database**: SQLite3 with encryption
- **IPC**: Structured message protocol
- **Web3**: EVM wallet, dApp support, ENS

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
├── core/                  # Go backend (future)
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
│   Go backend supervision                    │
└────────────────────┬────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────┐
│   Go Core (Phase 4+)                        │
│   Privacy, Security, Storage, Encryption    │
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
- (Optional) Go 1.21+ for Phase 4+

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
```

## Current Capabilities

✓ Multi-tab browsing with an Arc-style sidebar (create, close, switch, duplicate, drag-reorder)
✓ Address bar with URL/search detection, engine keyword shortcuts (`g cats`), history + bookmark suggestions
✓ Navigation controls (back, forward, reload, stop), find in page, per-site zoom, print
✓ Tab pinning, per-tab mute with audio indicator, tab sleeping after idle, Ctrl+Tab cycling
✓ Session restore ("Continue where you left off"), recently-closed tabs
✓ New tab page with clock, quotes, Pexels backgrounds and an editable quick-links grid
✓ History page (day grouping, search, per-entry delete) and Clear Browsing Data dialog (targets + time range)
✓ Bookmarks with import/export (Netscape HTML — compatible with Chrome/Firefox/Edge exports)
✓ Download manager: progress, pause/resume, retry, speed/ETA, persisted history with retention
✓ Per-site ad-blocker controls, blocked-request diagnostics, allowlist, private sessions
✓ Privacy: Force HTTPS, Do Not Track, Global Privacy Control, WebRTC IP-leak protection,
  third-party-cookie blocking, opt-in tracking-parameter stripping + "Copy clean link"
✓ AdGuard DNS-over-HTTPS, proxy support (HTTP/SOCKS) with verification + exit-IP display
✓ Certificate viewer, permission prompts, inspect element, detached developer tools
✓ Command palette (Ctrl+K), keyboard shortcut cheat sheet (Ctrl+/)
✓ Local diagnostics page (zyphora://diagnostics) — versions, filter lists, storage, proxy state
✓ Encrypted local database (AES-256-GCM via the OS keychain) when safeStorage is available
✓ Auto-updates through GitHub Releases (Settings → About)
✓ Secure IPC communication with sender + payload validation on every channel
✓ TypeScript throughout, unit tests (vitest) + Electron smoke tests (Playwright) in CI

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl+T | New tab |
| Ctrl+W | Close tab |
| Ctrl+Shift+T | Reopen recently closed tab |
| Ctrl+Tab / Ctrl+Shift+Tab | Next / previous tab |
| Ctrl+1 … Ctrl+8, Ctrl+9 | Jump to tab N / last tab |
| Ctrl+R, F5 | Reload |
| Alt+← / Alt+→ | Back / forward |
| Ctrl+F | Find in page |
| Ctrl+D | Bookmark page |
| Ctrl+L | Focus address bar |
| Ctrl+K | Command palette |
| Ctrl+J | Downloads page |
| Ctrl+P | Print |
| Ctrl+, | Settings |
| Ctrl+/, F11, Ctrl +/−/0 | Cheat sheet, fullscreen, zoom |
| `ddg cats`, `g cats`, … | Search with a specific engine keyword |

## Planned Features

### Phase 3: Web Content Rendering
- WebView or similar for web content
- HTML/CSS/JS rendering
- Form handling
- Link clicking

### Phase 4: Go Integration
- IPC to Go backend
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
- The local database is encrypted with the OS keychain when safeStorage is available; on systems
  without it, data falls back to plaintext storage (diagnostics shows which mode is active).
- Ad blocking uses Ghostery's ads-only network lists with YouTube host exemptions for playback
  stability; cosmetic/scriptlet filtering is intentionally disabled (see `docs/ADBLOCK.md`).
- WebRTC IP handling and third-party-cookie blocking are Chromium startup policies — changing
  them in Settings applies on the next launch.
- Proxy pools are supplied through `ZYPHORA_PROXY_LIST` (`ip:port:user:pass[:type]`, type
  http/https/socks4/socks5); unreliable proxies are rejected before they can interrupt browsing.
- Single-window only for now (no Ctrl+N / move-tab-to-new-window), and no fingerprinting
  resistance, Go backend, or Web3 support yet.

## Performance Targets

- Launch time: < 2 seconds
- New tab: < 100ms
- Page load: < 3 seconds (typical)
- Memory: < 200MB base + 50MB per tab
- CPU: < 5% idle

## Testing

```bash
# Unit tests (navigation, URL cleaning, bookmarks import/export, crypto, filters)
npm test

# Typecheck and lint
npm run typecheck
npm run lint

# Electron smoke tests (Linux: runs under xvfb; requires a built app)
npm run build
npm run test:e2e
```

CI (`.github/workflows/ci.yml`) runs lint, typecheck, unit tests, a production build and the
Electron smoke suite on every push and pull request.

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

**Status**: Feature-complete daily-driver core — tests, CI, packaging, encryption at rest
**Next**: Multi-window support, per-site settings UI, reader mode, cosmetic filtering rollout
**Timeline**: Evolving with community input
