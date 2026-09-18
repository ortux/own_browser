# Zyphora Website Feature Brief

Use this document as the product and content brief for building a beautiful public website for Zyphora, a privacy-focused desktop web browser.

## Product Positioning

Zyphora is a fast, private desktop browser for people who want a calmer web without giving up useful browser features. It is built around local-first data, tracker protection, practical security controls, and a clean browsing experience.

Primary message:

> Browse freely. Keep more of your life yours.

The website should feel like the real product is ready to download, not like a generic startup landing page. Prioritize the download experience, the browser interface, and concrete product benefits.

## Core Features To Showcase

### Private, Focused Browsing

- Local-first browsing data.
- No telemetry as a product principle.
- Private tabs and private-by-default browsing option.
- History retention controls, including automatic cleanup.
- Do Not Track support.
- Tracking-parameter removal for common campaign and click identifiers.
- Secure DNS mode using encrypted DNS-over-HTTPS.

### Built-In Tracker Blocking

- Blocks trackers and unwanted network requests.
- Per-site controls and allowlists.
- Blocked-request diagnostics and counters.
- Protection can be enabled or adjusted from the browser settings.
- Explain that the user remains in control instead of hiding privacy behavior behind vague claims.

### Real Browser Workflow

- Tabs with create, close, switch, duplicate, pin, reorder, and mute controls.
- Back, forward, reload, stop, and address-bar navigation.
- Search-or-URL address bar that understands domains, URLs, and natural-language searches.
- Managed new tabs and links that open in new tabs.
- Session restore so users can return to their previous workspace.
- Recently closed tabs.
- Keyboard shortcuts for common browser actions.
- Find in page, zoom controls, print, and reader mode.

### Personal Organization

- Bookmarks with search and management.
- Browsing history with search, retention, and deletion controls.
- Password manager with saved credentials protected by the operating system keychain.
- Download manager with progress, pause, resume, retry, reveal, and folder controls.
- PDF viewing and download handling.

### Performance

- Lightweight startup path.
- Minimal background activity.
- Tab sleeping controls for inactive tabs.
- Efficient UI designed for long browsing sessions.
- Chromium-based rendering for modern websites and compatibility.

### Useful Power Features

- Proxy configuration and verification.
- Permission prompts for camera, microphone, notifications, and other site capabilities.
- Certificate information and HTTPS protection.
- Inspect element and developer tools for advanced users.
- Reading mode for distraction-free articles.
- Optional browser agent workspace for users who want assisted workflows and integrations.

### Account And Sync

Account features are optional and must never be presented as required for basic browsing.

- Google, GitHub, and Microsoft OAuth sign-in flows.
- Email and password authentication.
- Secure token lifecycle with refresh and logout cleanup.
- Device registration and device management.
- Optional sync for bookmarks, history, and settings.
- Offline queueing with synchronization when connectivity returns.

### Onboarding And Updates

- First-run setup that explains the browser's privacy and performance choices.
- Pointer-guided product tour for the address bar, tabs, privacy controls, downloads, and settings.
- Automatic update system for installed desktop builds.
- Release channels can support stable, beta, and development builds.
- Updates should be described as controlled and verifiable, not as a vague promise of silent changes.

## Recommended Website Sections

1. **Hero**: Zyphora name, a concise privacy-first promise, a primary Windows download button, and a real browser screenshot or product mockup.
2. **Browser in one glance**: Show the tab strip, address bar, sidebar, and content area as one coherent interface.
3. **Privacy that is visible**: Explain tracker blocking, private tabs, tracking-parameter removal, and secure DNS.
4. **Everything you expect**: Tabs, bookmarks, history, passwords, downloads, PDF viewing, reader mode, and keyboard controls.
5. **Made for long sessions**: Show lightweight startup, sleeping tabs, calm visual density, and local-first storage.
6. **Power without clutter**: Proxy settings, permissions, developer tools, and optional agent features.
7. **Your browser, your devices**: Explain optional sign-in and sync without making an account a prerequisite.
8. **Updates without babysitting**: Explain the installed-app update flow.
9. **Download**: Repeat the Windows download action with version, file size, and system requirements.
10. **Footer**: Privacy, security, documentation, GitHub, release notes, and support links.

## Product Rules For The Website

- Do not claim that Zyphora blocks every tracker or makes users completely anonymous.
- Do not imply that account sync is required.
- Do not invent iOS, Android, macOS, or Linux downloads unless those builds actually exist.
- Do not show fake awards, fake user counts, fake testimonials, or fake performance percentages.
- Use specific, honest language about local storage, optional sync, and browser permissions.
- Keep the primary call to action focused on downloading the desktop browser.
- Include a visible link to privacy and security details.
- The website must be responsive and accessible, with keyboard navigation and readable contrast.

## Suggested CTA Copy

Primary: `Download Zyphora for Windows`

Secondary: `Explore privacy controls`

Supporting line: `A focused desktop browser with tracker blocking, private tabs, built-in organization, and optional sync.`

## Deliverable Expected From Claude

Build a polished, responsive website with production-quality React components and CSS. Use real browser-oriented visual assets or a faithful browser UI mockup. Include hover, focus, loading, mobile navigation, and download states. The first viewport should communicate Zyphora as a browser product immediately, not as an abstract privacy brand.
