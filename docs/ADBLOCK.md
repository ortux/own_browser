# Ad blocking

Zyphora uses `@ghostery/adblocker-electron` instead of a home-grown filter parser. Ghostery is compatible with EasyList/uBlock-style network filters and is attached to every normal and temporary private Electron session.

## Stability-first configuration

The current configuration intentionally:

- Loads the maintained ads-only subscriptions through `ElectronBlocker.fromLists`.
- Enables network filtering only.
- Disables cosmetic filters, scriptlets, extended selectors, and filter-provided CSP changes.
- Always allows main-frame navigation.
- Allows all requests associated with YouTube and its video/API/CDN hosts.
- Fails open if the cache and list update are unavailable.
- Keeps blocked-request statistics in memory only.

This avoids broad custom selectors and prevents an ad rule from stopping a whole page, login flow, or video player.

## YouTube compatibility

The following hosts are exempt from network filtering:

- `youtube.com`
- `youtube-nocookie.com`
- `youtu.be`
- `googlevideo.com`
- `ytimg.com`
- `youtubei.googleapis.com`

YouTube frequently uses first-party APIs, WebSockets, media requests, and Google video/CDN hosts for playback, comments, recommendations, and controls. Blocking those requests can make videos or page details disappear. The trade-off is that the current stable configuration does not aggressively block YouTube's own ad delivery.

## Cache and updates

The compiled engine is cached as `ghostery-ads-only.bin` under Electron's user-data directory. A cache newer than seven days is used immediately. A stale cache triggers a background refresh; if refresh fails, the stale cache is retained. If no cache exists and the network is unavailable, the browser runs without blocking instead of making navigation fail.

Cache writes use a temporary file followed by rename so an interrupted write does not replace a working cache.

## Session coverage

`attachAdblockToSession(session)` is called for the default session and for each temporary private webview session when its web contents is created. The same session also receives the download and Do Not Track policies.

Electron only supports one `webRequest` listener per event/session. Zyphora therefore lets Ghostery own `onBeforeRequest` and keeps other network behavior separate:

- Force HTTPS is handled at the webview navigation boundary and for shell address-bar navigations.
- Do Not Track uses `onBeforeSendHeaders`.
- Download tracking uses the session `will-download` event.

## Per-site breakage policy

If a site breaks, the recommended debugging sequence is:

1. Turn off the ad blocker from the shield menu.
2. Reload the page.
3. Compare with the blocker enabled.
4. Add a narrow host exception only after confirming the filter decision.

Do not reintroduce selectors such as `[class*="ad"]`, `[class*="banner"]`, `[class*="popup"]`, or `[class*="recommended"]`; those names are common in legitimate UI.

## Privacy and trade-offs

Filter list updates fetch maintained list assets from Ghostery's upstream sources. Normal page requests are evaluated locally after the lists are loaded. Ad blocking does not make the browser anonymous. DNS, the selected search engine, websites, and any configured proxy have separate privacy policies.

Ghostery's Electron package is distributed under the MPL-2.0 license. Review the license and upstream list terms before redistributing a packaged application.

## Validation

Run:

```text
npm test
npm run build
npm run lint
```

The automated tests cover Ghostery network matching, exceptions, ordinary content, navigation protocol handling, and YouTube-related stability rules. A real Electron smoke test is still required for playback, popups, downloads, private sessions, and GPU/driver combinations.
