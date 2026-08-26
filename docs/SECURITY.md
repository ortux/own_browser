# Security Model

## Overview

Own Browser implements a **defense-in-depth** security model with multiple layers of protection between untrusted websites and privileged browser functionality.

## Core Principles

1. **Zero Trust**: Treat every website as potentially hostile
2. **Least Privilege**: Only expose absolutely necessary APIs
3. **Defense in Depth**: Multiple overlapping security layers
4. **Cryptographic Soundness**: Use battle-tested algorithms, never invent new ones
5. **Fail Secure**: Errors default to blocking, not allowing
6. **Security by Default**: Safe defaults, explicit opt-out only
7. **Auditability**: Clear code, explicit trust boundaries

## Electron Security Configuration (Phase 2)

### Window Creation

```javascript
const mainWindow = new BrowserWindow({
  webPreferences: {
    // ✓ REQUIRED: Disable Node.js in renderer process
    nodeIntegration: false,

    // ✓ REQUIRED: Separate preload script context
    contextIsolation: true,

    // ✓ REQUIRED: OS-level process sandboxing
    sandbox: true,

    // ✓ REQUIRED: Explicit preload script for IPC
    preload: path.join(__dirname, '../preload/index.js'),

    // ✓ RECOMMENDED: Restrict file access
    webSecurity: true,
  },
});
```

**What This Prevents**:
- ✗ `nodeIntegration: true` would expose `require()`, file operations
- ✗ `contextIsolation: false` would allow websites to access preload globals
- ✗ `sandbox: false` would allow breakout to OS
- ✗ No preload would require `ipcRenderer` in main thread

### Never Do This

```javascript
// ✗ NEVER expose raw modules
window.ipcRenderer = ipcRenderer;
window.fs = require('fs');
window.shell = require('electron').shell;
window.childProcess = require('child_process');

// ✗ NEVER enable dangerous options
{
  nodeIntegration: true,         // ✗ DANGEROUS
  contextIsolation: false,       // ✗ DANGEROUS
  sandbox: false,                // ✗ DANGEROUS
  enableRemoteModule: true,      // ✗ DANGEROUS (deprecated anyway)
}

// ✗ NEVER disable security in production
if (process.env.NODE_ENV === 'production') {
  // Some devs disable security here - DON'T DO THIS
}
```

## IPC Security (Phase 2)

### Message Validation

All IPC messages are validated in the main process:

```typescript
// ✓ GOOD: Type-safe, whitelisted messages
type RendererToMainMessage =
  | { type: 'navigate'; tabId: string; url: string }
  | { type: 'create-tab' }
  | { type: 'close-tab'; tabId: string }
  | ... more validated message types

ipcMain.handle('browser:message', async (event, message: RendererToMainMessage) => {
  // ✓ Verify sender
  if (event.senderFrame.parent === null) {
    // Process only top-level frames
    switch (message.type) {
      case 'navigate':
        // Validate tabId exists before using it
        const tab = tabs.get(message.tabId);
        if (!tab) return { error: 'Tab not found' };
        // Process...
        break;
    }
  }
});
```

### Never Do This

```typescript
// ✗ NEVER parse arbitrary commands
ipcMain.handle('execute', async (event, command: string) => {
  eval(command);  // ✗ CATASTROPHIC
});

// ✗ NEVER expose internal state
ipcMain.handle('get-all-data', async (event) => {
  return tabs;  // Website learns all internal state
});

// ✗ NEVER skip validation
ipcMain.handle('navigate', async (event, message: any) => {
  // Assumes message.url is safe - what if it's not?
  window.loadURL(message.url);
});

// ✗ NEVER allow shell execution from website
ipcMain.handle('run-command', async (event, cmd: string) => {
  const { execSync } = require('child_process');
  execSync(cmd);  // Website can: rm -rf /, steal files, install malware
});
```

## Preload Script Security (Phase 2)

### Secure Preload Pattern

```typescript
// ✓ GOOD: Limited, validated API via contextBridge
const browserAPI = {
  navigate: (tabId: string, url: string) => {
    // Validate inputs
    if (typeof tabId !== 'string' || typeof url !== 'string') return;
    if (tabId.length === 0 || url.length === 0) return;

    // Only allow this specific message type
    return ipcRenderer.invoke('browser:message', {
      type: 'navigate',
      tabId,
      url,
    });
  },
  // ... more explicitly defined methods
};

contextBridge.exposeInMainWorld('browserAPI', browserAPI);
```

### Never Do This

```typescript
// ✗ NEVER expose ipcRenderer directly
contextBridge.exposeInMainWorld('ipc', ipcRenderer);
// Website can now: ipc.invoke('any-command', ...)

// ✗ NEVER expose require() or fs
contextBridge.exposeInMainWorld('require', require);
contextBridge.exposeInMainWorld('fs', require('fs'));

// ✗ NEVER expose process information
contextBridge.exposeInMainWorld('process', process);

// ✗ NEVER use eval or Function()
const userInput = await ipcRenderer.invoke('get-user-code');
eval(userInput);  // ✗ CATASTROPHIC

// ✗ NEVER mix sandboxed and unsandboxed content
// This loads untrusted code without sandbox
mainWindow.loadURL('https://untrusted-site.com');
```

## URL Security

### Safe URL Handling

The shared `src/shared/navigation.ts` helper validates and normalizes address-bar values. Search text is encoded through the selected search engine. Main-frame IPC rejects unsupported protocols such as `javascript:`, `data:`, and `chrome-error:`.

### Protocol Whitelisting

```typescript
// Approved browser-shell protocols.
const ALLOWED_PROTOCOLS = ['https:', 'http:', 'file:'];

function isValidProtocol(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_PROTOCOLS.includes(parsed.protocol);
  } catch {
    return false;
  }
}
```

### Dangerous Protocols to Block

```typescript
// ✗ DANGEROUS: javascript: protocol (XSS)
<a href="javascript:alert('XSS')">Click me</a>

// ✗ DANGEROUS: data: with scripts
<iframe src="data:text/html,<script>alert('XSS')</script>"></iframe>

// ✗ DANGEROUS: file: protocol (local file access)
file:///etc/passwd

// ✗ DANGEROUS: Custom protocols
chrome-extension://
ms-local-stream://
```

## Content Security

### Content Security Policy (CSP)

For browser UI (React components):

```html
<!-- ✓ GOOD: Strict CSP for UI -->
<meta
  http-equiv="Content-Security-Policy"
  content="
    default-src 'self';
    script-src 'self';
    style-src 'self' 'unsafe-inline';
    img-src 'self' data: https:;
    font-src 'self';
  "
/>
```

### Website Content (Phase 3+)

Websites get their own CSP enforced by browser. We won't allow:
- `<script>` injection
- `eval()` execution
- Excessive inline styles
- Unrestricted external resources

## Cryptography (Phase 6+)

### DO

✓ Use established libraries:
- OpenSSL / Go crypto packages
- libsodium (for secretbox)
- HMAC-SHA256 for authentication

✓ Use authenticated encryption:
- AES-256-GCM
- ChaCha20-Poly1305
- NaCl secretbox

✓ Key derivation:
- Argon2 (password-based)
- HKDF (key expansion)
- Never use MD5, SHA1, or simple hashing for passwords

### NEVER DO

✗ Invent cryptographic algorithms
✗ Use ECB mode
✗ Use unauthenticated encryption (without HMAC)
✗ Hardcode encryption keys in source code
✗ Use weak key derivation (iterations < 100k)
✗ Reuse IVs/nonces
✗ Use non-cryptographic PRNGs for security
✗ Put secrets in memory without clearing them
✗ Log secrets

## Secure Storage (Phase 5-6)

### Sensitive Data

The following must be encrypted at rest:
- Password hashes (salted, not directly stored)
- API tokens / session cookies
- Wallet private keys
- Seed phrases
- Site-specific passwords

### Less Sensitive Data

These can be unencrypted but shouldn't be exposed:
- Browsing history
- Bookmarks
- Settings
- Tracker statistics

### Implementation

```typescript
// Phase 5: SQLite setup
CREATE TABLE browser_history (
  id INTEGER PRIMARY KEY,
  url TEXT NOT NULL,
  title TEXT,
  timestamp INTEGER NOT NULL,
  favicon_url TEXT
);

// Phase 6: Encrypted table
CREATE TABLE browser_settings_encrypted (
  key TEXT PRIMARY KEY,
  value_encrypted BLOB NOT NULL,  -- AES-GCM encrypted
  nonce BLOB NOT NULL,
  created_at INTEGER,
  updated_at INTEGER
);
```

## Web3 Security (Phase 11-12)

### Wallet Isolation

The wallet MUST be completely isolated from website code:

```
Website JavaScript
    ↓ (CANNOT access)
    X
    ↓
Wallet Storage
Encryption Keys
Private Keys
Seed Phrases
```

### Transaction Confirmation

Every sensitive operation requires user confirmation in a **trusted UI**:
- Website cannot spoof transaction window
- User must see: recipient, amount, fees
- "Approve" button only in secure context
- Timeout after 5 minutes of inactivity

### Wallet IPC

```typescript
// ✗ WRONG: Website can call wallet directly
ipcRenderer.invoke('wallet:sign-transaction', tx)

// ✓ CORRECT: Show trusted UI, get user confirmation
ipcRenderer.invoke('wallet:request-signature', {
  message: tx.hash,
  displayData: { to, amount, fees }  // Website cannot fake this
})
```

## Audit & Review

Security is ongoing:

1. **Code Review**: All changes reviewed for security impact
2. **Automated Checks**: Linting, type checking, dependency scanning
3. **External Audit**: Professional security review before releases
4. **Responsible Disclosure**: security@ownbrowser.dev for vulnerability reports
5. **Regular Updates**: Keep Electron, Go, dependencies current

## Threat Model (Phase 2)

### In Scope (We Protect Against)

✓ Malicious websites trying to:
- Access browser data
- Access local files
- Execute arbitrary code
- Access wallet (Phase 11+)
- Track user behavior

✓ Browser bugs that could:
- Escape sandbox
- Break IPC validation
- Leak sensitive data

✓ Supply chain attacks:
- Compromised npm packages
- Compromised Go packages
- Build system compromise

### Out of Scope (Not Our Responsibility)

✗ Compromised OS
✗ Malware already running
✗ Physical hardware access
✗ User mistakes (entering password on phishing site)
✗ ISP/network operator snooping (use VPN/Tor)
✗ Quantum computing attacks

### Website Privacy (Not Security)

✓ We will implement tracker blocking (Phase 7)
✓ We will implement cookie restrictions
✓ We will offer private browsing (Phase 8)

✗ We cannot make users anonymous to websites
✗ We cannot prevent website fingerprinting (can only slow it down)
✗ We cannot hide your IP address (use Tor - Phase 12+)

## Known Limitations

- Web content is embedded in Electron webviews and has not had a full automated security review.
- Local history/bookmarks are not encrypted at rest.
- Private tabs isolate webview cookies/history but do not provide anonymity or malware scanning.
- The filter engine supports a documented subset of filter-list syntax.
- Fingerprinting resistance, Tor/VPN integration, wallet security, and encrypted credential storage are not implemented.

## Roadmap

- Encrypted storage with secure key management
- Stronger fingerprinting resistance
- Tor/VPN integration
- Wallet security and privacy tools
- **Phase 10**: Security engine (phishing, malware)
- **Phase 12**: Web3 security audit before wallet release

---

**If you find a security issue**: Please don't publicly disclose. Email security@ownbrowser.dev with details. We'll acknowledge within 48 hours and work on a fix.
