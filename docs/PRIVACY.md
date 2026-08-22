# Privacy Model

## Privacy Principles

Own Browser is built with privacy as a core principle:

1. **Local-First**: All data stays on your device by default
2. **No Telemetry**: No hidden analytics or crash reporting (unless explicitly enabled)
3. **User Control**: You decide what data is collected
4. **Transparency**: Clear documentation of data handling
5. **Minimalism**: Only collect what's necessary
6. **Open Source**: Auditable code, no black boxes

## What We DON'T Collect (Phase 2)

✓ **Never collected by default**:
- Browsing history
- Searches you perform
- Pages you visit
- Passwords
- Login credentials
- Cookie data
- Form history
- Download links
- IP addresses (stay between you and websites)
- User behavior analytics
- Crash reports

✓ **Never collected ever**:
- Google Analytics
- Facebook Pixel
- Mixpanel or similar analytics
- Advertising identifiers
- Third-party tracking pixels
- Demographic profiling
- Location data
- Device identifiers (beyond process scope)

## Data Stored Locally (Phase 5+)

When implemented, the following will be stored on your device only:

**Browsing History** (optional, you can disable)
- URL visited
- Page title
- Timestamp
- Favicon
- Not shared with anyone

**Bookmarks** (you control)
- URL
- Title
- Tags
- Created date
- Local only

**Settings** (encrypted in Phase 6)
- Theme preference
- Font size
- Search engine
- Homepage
- Proxy settings
- Not shared

**Downloads** (metadata only)
- Filename
- Date
- Source URL
- Status
- Local only

## Private Browsing (Phase 8)

Private tabs/windows will NOT store:
- Browsing history
- Cookies (except session cookies from sites)
- Cache
- Form data
- Search history

**Important Disclaimers**:
- Private mode does NOT make you anonymous to websites (they still see your IP)
- Private mode does NOT hide activity from your ISP or employer
- Private mode does NOT encrypt your traffic (use HTTPS + VPN)
- Private mode does NOT prevent fingerprinting (coming Phase 11)

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

## DNS Privacy (Phase 12+)

Future support (do not implement in Phase 2-7):

**Option 1: DNS over HTTPS (DoH)**
- Your DNS queries encrypted from ISP
- Use Cloudflare, Quad9, or custom

**Option 2: DNS over TLS (DoT)**
- Alternative to DoH
- May have less app support

**Whirlpool Approach**: 
- We route DNS through safe provider
- Provider cannot see your IP (via proxy)
- Not enabled by default (it's optional)

**What This Prevents**:
- ISP learning which websites you visit
- Certain censorship attempts
- DNS hijacking

**What This Does NOT Prevent**:
- Your ISP seeing that you used a VPN/proxy
- Websites learning your activity (they see requests)
- Network administrators seeing something happened

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

### Phase 1-2 (Current)
- No data collected

### Phase 5
- Local browsing history
- Bookmarks storage
- Settings persistence
- No telemetry

### Phase 6
- Encrypted sensitive data
- Secure key management
- Password hashing (salted)

### Phase 7
- Tracker blocking
- Privacy dashboard
- Local tracking stats

### Phase 8
- Private browsing
- Isolated sessions
- No history writing

### Phase 11
- Fingerprinting resistance
- Browser spoofing
- Canvas protection

### Phase 12
- DNS over HTTPS
- Tor integration (optional)
- VPN support
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

**Last Updated**: Phase 2 (2024)
**Next Review**: Phase 5 (when storage implemented)
