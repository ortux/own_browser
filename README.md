# Own Browser

A modern, privacy-focused desktop web browser built from scratch with Electron, React, TypeScript, and Go.

## Overview

Own Browser prioritizes:
- **Privacy**: No telemetry, local-only data storage, tracker blocking
- **Security**: Secure Electron configuration, validated IPC, encrypted storage
- **Speed**: Minimal dependencies, optimized performance
- **Low Resource Usage**: Tab sleeping, lazy loading, efficient filtering
- **No Third-party Tracking**: Fully local operation with future Web3 support

## Technology Stack

### Current (Phase 1-2)
- **Desktop**: Electron 43+
- **UI**: React 18 + TypeScript 5 + Vite 5
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

## Current Capabilities (Phase 2)

✓ Browser window with Electron
✓ Address bar with URL/search detection
✓ Tab management (create, close, switch, duplicate)
✓ Navigation controls (back, forward, reload, stop)
✓ New tab page with quick links
✓ Keyboard shortcuts (Ctrl+T, Ctrl+W, Ctrl+R, etc.)
✓ Tab state persistence
✓ Loading indicators
✓ Favicon support (when web content loads)
✓ Secure IPC communication
✓ TypeScript throughout

## Keyboard Shortcuts (Phase 2)

| Shortcut | Action |
|----------|--------|
| Ctrl+T | New tab |
| Ctrl+W | Close tab |
| Ctrl+R, F5 | Reload |
| Ctrl+Shift+T | Duplicate tab |
| Alt+← | Go back |
| Alt+→ | Go forward |
| Ctrl+D | Bookmark (future) |

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

## Known Limitations (Phase 2)

- Web content not rendering yet (Phase 3)
- No actual navigation or page loading
- No history storage (Phase 5)
- No bookmarks (Phase 5)
- No downloads (Phase 5)
- No private browsing (Phase 8)
- No tracker blocking (Phase 7)
- No encryption (Phase 6)
- No Go integration (Phase 4+)
- No Web3 (Phase 11+)

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

**Status**: Phase 2 (Working browser core)
**Next**: Phase 3 (Web content rendering)
**Timeline**: Evolving with community input
