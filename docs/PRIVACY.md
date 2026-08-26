# Privacy Model

## Privacy Principles

Own Browser is built with privacy as a core principle:

1. **Local-First**: All data stays on your device by default
2. **No Telemetry**: No hidden analytics or crash reporting (unless explicitly enabled)
3. **User Control**: You decide what data is collected
4. **Transparency**: Clear documentation of data handling
5. **Minimalism**: Only collect what's necessary
6. **Open Source**: Auditable code, no black boxes

## Current data handling

The current implementation stores the following locally:

- Browsing history in `zyphora.db`: URL, title, timestamp, and favicon.
- Bookmarks in `zyphora.db`.
- Settings in renderer localStorage, including theme, search engines, download path, and proxy endpoint metadata.
- In-memory download records for the current app session.

This data is not encrypted at rest yet. History can include sensitive query strings, so users should clear it when appropriate. There is no account sync or remote browsing-history database.

The browser makes explicit third-party requests when enabled or configured:

- Search queries go directly to the selected search engine.
- DNS is configured to prefer AdGuard DNS-over-HTTPS; automatic mode can fall back to system DNS.
- A Pexels API key, when configured, is used to request new-tab images.
- YouTube video IDs are reduced to a four-character SHA-256 prefix for optional SponsorBlock lookups.
- Favicon URLs supplied by visited pages may be fetched by the shell; address-bar suggestions do not use a Google fallback request.

## Data we do not collect

The application has no analytics SDK, ad identifier, crash-reporting backend, account sync, or remote browsing-history database. It does not intentionally submit passwords, form contents, or full browsing history to the project.

## Private browsing

New tabs can be configured as private. Private tabs use temporary webview partitions and do not write navigation history. They are not anonymous: websites, networks, proxies, and the operating system may still observe activity, and private tabs do not encrypt traffic.

## Tracker Blocking (Phase 7)

### What We Block

- Google Analytics scripts
- Facebook tracking pixels
- Advertising networks (DoubleClick, etc.)
- Social media widgets that track
- Third-party cookie tracking

### How It Works

1. **Filter Lists**: Subscribe to community-maintained blocklists
2. **Local Processing**: All filtering happens on your device
3. **No External Calls**: We don't call external services to check URLs
4. **Privacy Stat Tracking**: Local-only counter of blocked trackers

### Example Blocklist Format

```
! Title: Own Browser Tracker Filters
! Homepage: https://github.com/own-browser/filters
! License: GPL-3.0

# Google Analytics
||google-analytics.com^
||googletagmanager.com^
||analytics.google.com^

# Facebook Tracking
||facebook.com/tr^
||connect.facebook.net^

# DoubleClick
||doubleclick.net^
||googlesyndication.com^
```

## Privacy Dashboard (Phase 7)

For each website, you'll see:

```
PRIVACY PROTECTION STATUS

Trackers blocked today:           12
Tracking requests prevented:      47
Tracking parameters removed:       8
Third-party cookies blocked:      15

Protection: [ON/OFF]
```

You can:
- See what trackers tried to track you
- Disable protection for specific sites
- View tracking attempts over time (local only)
- Export privacy report (never leaves device)

## DNS privacy

The application configures Chromium to prefer AdGuard DNS-over-HTTPS. Automatic mode falls back to system DNS if the endpoint is unavailable so a resolver outage does not stop navigation. `ZYPHORA_DNS_MODE=secure` opts into fail-closed behavior.

DoH can hide DNS contents from the local network, but the DoH provider can still observe DNS queries. It does not hide full page requests, cookies, search queries, or the user's IP address from websites. A proxy or VPN has separate trust and failure implications.

## Fingerprinting Resistance (Phase 11)

### What Is Fingerprinting?

Websites can identify you by:
- Browser version
- Screen resolution
- Timezone
- Installed fonts
- Hardware capabilities
- Canvas fingerprinting
- WebGL capabilities

### Our Approach

**Phase 11**: Conservative protections that don't break sites:

```typescript
// Spoof canvas to prevent fingerprinting
// BUT: Don't make it so random it increases entropy

// Block fingerprinting APIs:
// - AudioContext.getChannelData()
// - WebGL rendering information
// - Hardware concurrency

// Restrict but don't randomize:
// - User-Agent: Consistent per session
// - Timezone: Disabled
// - Screen resolution: Rounded to common values
```

**Trade-offs**:
- Too much protection → breaks websites
- Too little protection → you're still fingerprinted
- We aim for middle ground

## Wallet Privacy (Phase 11-12)

When wallet is implemented:

### What We Track
- ✓ Your transaction history (encrypted, local only)
- ✓ Connected dApps (for your record)

### What We DON'T Track
- ✗ Blockchain analysis (we don't correlate transactions)
- ✗ User behavior (no "user spent $X in dApps" stats)
- ✗ KYC data (we don't collect it)

### Wallet Privacy Tips
- Use privacy coins (Monero, Zcash) for sensitive transactions
- Use separate wallets for different activities
- Consider Tornado Cash for on-chain privacy (regulatory note: OFAC restrictions apply in some jurisdictions)
- Use Tor or VPN (but doesn't improve on-chain privacy)

## Third-Party Services (Phase 5+)

### Search Engine

You choose from:
- **DuckDuckGo** (default): Claims no tracking
- **Brave Search**: Privacy-first, no tracking
- **Google**: Will track via IP and queries (not recommended for privacy)
- **Custom URL**: Define your own search engine

### What Happens
1. You type: "how does encryption work"
2. Browser sends query to YOUR chosen search engine
3. Search engine receives your IP address (unavoidable unless you use VPN)
4. Search engine may return ads
5. Results shown in browser

**We don't proxy searches**: Your queries go directly to search engine (plus your IP)

### How to Improve Privacy
- Use DuckDuckGo or Brave Search
- Use with Tor (Phase 12+)
- Use with VPN

### How NOT to Improve Privacy
- We can't hide searches from search engine
- Search engine sees your IP no matter what
- Only VPN/Tor hides from search engine

## Update Checking (Phase 3+)

When you check for updates:

**We collect**:
- Your current version number
- Your OS (Windows, macOS, Linux)
- Update server timestamp

**We don't collect**:
- Your IP address (when possible)
- Browsing history
- Any personal data
- Hardware identifiers

## Crash Reporting (Phase 10+, Opt-In)

If enabled:
- Crash dumps are encrypted
- Sent to our server
- Analyzed for bugs
- Never shared with third parties
- Can be disabled in settings

## Data Retention (Phase 5+)

**Local Data** (you own it):
- Browsing history: Keep as long as you want
- Bookmarks: Keep forever
- Settings: Keep forever

**Server Logs** (if crash reporting enabled):
- Kept for 90 days
- Deleted automatically
- No personally identifying information

## Transparency & Auditing

### Open Source
- All code on GitHub
- Community can audit
- No black boxes

### Documentation
- This file explains data handling
- ARCHITECTURE.md shows how data flows
- SECURITY.md explains protections

### Regular Audits
- Third-party security reviews (planned Phase 5+)
- Community bug bounty program
- Responsible disclosure process

## GDPR & Privacy Laws (Phase 5+)

Own Browser respects:
- **GDPR** (EU): No personal data collected, so minimal obligations
- **CCPA** (California): Same - data is yours, encrypted local
- **Others**: Similar principles

If you delete the app:
- All data is on your device (you delete it)
- No data on our servers (except optional crash reports)
- 90 days to delete crash dumps

## Your Rights

✓ **Right to access**: All your data is on your device
✓ **Right to delete**: Delete app → all data gone
✓ **Right to portability**: Export bookmarks/history as JSON
✓ **Right to object**: Don't enable crash reporting
✓ **No profiling**: We don't build profiles of you
✓ **No automated decisions**: We don't decide anything about you

## Roadmap

### Current implementation
- Local browsing history and bookmarks
- Renderer settings persistence
- Temporary private webview partitions
- DNS-over-HTTPS preference with automatic fallback
- Local tracker blocking and blocked-request statistics
- No telemetry or account sync

### Planned
- Encrypted sensitive data and secure key management
- Stronger fingerprinting resistance
- Tor/VPN integration
- Wallet privacy tools

## Questions?

For privacy questions or concerns:
- Check the documentation
- Review the code
- Open a GitHub issue
- Email privacy@ownbrowser.dev

## Commitment

Own Browser is built with one principle:

> **Your data is yours. We collect only what's necessary, store only what you want, and never profit from your data.**

This is enforced through code, not just promises.

---

**Last Updated**: 2026-08-26
**Next Review**: After encrypted storage and complete private-session support are implemented
