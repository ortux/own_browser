# Zyphora application review

**Review date:** 2026-08-26  
**Reviewed commit:** `4fbb93b` (`Fix black webview navigation failures`)  
**Scope:** Electron main process, preload bridge, React renderer, webview navigation, persistence, downloads, proxy, DNS, ad blocking, packaging, and available tests.

## Executive overview

The application is structurally understandable and the basic Electron security defaults are good: `nodeIntegration: false`, `contextIsolation: true`, and `sandbox: true`. The black-webview mitigation from the previous change is also present.

The project is **not yet production-ready as a privacy-focused browser**. The largest risks are:

1. Several visible security/privacy settings do not currently change browser behavior.
2. Only the main browser-message IPC channel validates its sender and payload. The other IPC handlers accept calls and arguments without equivalent validation.
3. A database, download-path, or renderer-startup failure can prevent the application from starting or can write to an unintended local path.
4. The app has no Electron UI/integration test suite, so webview, popup, proxy, DNS, download, crash, and packaged-build behavior are not verified automatically.
5. The project is reproducible only by dependency luck because lockfiles are ignored.

## Verification performed

| Check | Result |
|---|---|
| `npm test` | Pass: 9/9 tests |
| `npm run build` | Pass: TypeScript and Electron/Vite bundles build |
| `npm run lint` | Pass: no errors or warnings |
| `npm audit --omit=dev` | Pass: 0 production vulnerabilities reported |
| Full `npm audit` | 3 development-tree vulnerabilities: 1 high, 2 moderate |
| Electron GUI launch | Not possible in this sandbox: the Electron runtime binary was not available after install |

The current tests are almost entirely ad-block parser tests plus URL-helper tests. A successful build does not prove that an Electron webview can navigate, paint, open popups, download, recover from DNS failure, or survive a renderer crash.

## Findings by priority

### High priority

#### H1. Security switches are UI-only and misleading

**References:** `src/renderer/components/SettingsPage.tsx:24-36`, `src/renderer/stores/settingsStore.ts:150-161`, `src/renderer/components/BrowserWindow.tsx:114-117`

The UI exposes **Force HTTPS**, **Send Do Not Track**, and **Private tabs by default**, but only `blockTrackers` is read by the browser shell. Toggling the other three values only changes persisted Zustand state.

Consequences:

- HTTP navigations are not upgraded by the setting.
- Requests do not receive a `DNT: 1` header.
- New tabs are not private, do not use isolated sessions, and still participate in persistent history.
- Users can reasonably believe protections are active when they are not.

**Recommendation:** either remove these switches until implemented or wire them into session/webview policy and add tests for each setting.

#### H2. Secondary IPC channels are not sender- or argument-validated

**References:** `src/main/index.ts:432-484`, `src/preload/index.ts:120-226`

The `browser:message` handler validates its payload and sender, but database, proxy, adblock, download, certificate, and Pexels handlers do not validate the calling `WebContents` or their arguments. Examples include:

- `db:bookmarks:add` accepts arbitrary URL/title/favicon values.
- `download:set-path` accepts an arbitrary string.
- `download:open` and `download:show` accept arbitrary IDs.
- `cert:get` accepts arbitrary hostnames.
- Proxy handlers accept renderer-supplied objects without runtime schema validation.

At present the top-level shell is intended to be trusted and remote pages do not receive this preload bridge, so this is not automatically a remote-code-execution bug. It is nevertheless a serious defense-in-depth gap: a shell XSS, future navigation mistake, or another renderer could invoke privileged operations.

**Recommendation:** centralize `isTrustedMainFrame(event)` and validate every IPC argument at runtime. Return typed errors rather than allowing exceptions to escape handlers.

#### H3. No Content Security Policy protects the application shell

**References:** `src/renderer/index.html`, `src/renderer/main.tsx`

The app renderer has no CSP meta tag or response header. React escaping helps, but it does not replace CSP. The shell loads remote Google fonts and remote favicons/images, increasing the allowed network surface.

**Recommendation:** add a restrictive shell CSP, for example with explicit `script-src`, `style-src`, `img-src`, `font-src`, and `connect-src` directives. Keep the remote web content inside the webview boundary and do not broaden the shell policy to accommodate it.

#### H4. Database initialization can prevent the browser from opening

**References:** `src/main/index.ts:390-410`, `src/main/db.ts:75-116`

The `ready` callback awaits `initDb()` without a recovery path. A corrupt `zyphora.db`, an unwritable user-data directory, a missing sql.js WASM file, or an unexpected schema error rejects startup before `createWindow()` runs.

**Recommendation:** catch initialization failures, log them, preserve/rename the corrupt database, create a clean database, and show a recoverable warning. Persistence writes should also be atomic: write a temporary file, fsync if appropriate, then rename.

#### H5. Download destination is not validated

**References:** `src/main/downloads.ts:152-154`, `src/main/downloads.ts:85-92`, `src/renderer/components/SettingsPage.tsx:555-565`

The folder picker returns a directory, but the editable text field can submit any path. `setDownloadPath` stores it without checking that it is an absolute directory inside an allowed location. A malformed path can make downloads fail; an intentionally chosen path can make the application write downloads anywhere the user has permission to write.

The filename itself is sanitized, which is good, but that does not secure the destination directory.

**Recommendation:** prefer the native folder picker, validate with `path.resolve`, require an existing directory or create it safely, reject files and unsafe/null-byte paths, and return an error to the UI instead of silently accepting invalid values.

#### H6. Proxy application can leave a failed proxy active

**References:** `src/main/proxy.ts:84-103`, `src/renderer/hooks/useProxy.ts:22-38`

If `applyProxy()` fails after setting `lastProxyRules` or after changing only some sessions, the hook's catch path disables the UI state but does not always call `proxy.clear()`. A partially applied or unreachable proxy can therefore continue routing browser traffic while the UI reports failure.

**Recommendation:** make proxy application transactional: remember the old configuration, apply all sessions, verify through the same session, and roll back on every failure. Always clear/restore direct mode in the hook's failure path.

### Medium priority

#### M1. History entries are commonly stored with the title `Loading...`

**References:** `src/main/index.ts:347-391`, `src/main/db.ts:151-179`

Navigation state is reported before the page title is necessarily available. `addHistory()` stores the current tab title, often `Loading...`. The later `webview-title-updated` handler updates the tab but does not update the corresponding history row.

**Recommendation:** record history on a confirmed finish event, or add an `updateHistoryMetadata(url, title, favicon)` operation when the title arrives.

#### M2. Privacy claims do not match storage behavior

**References:** `src/main/db.ts:87-124`, `src/main/index.ts:386-391`, `src/renderer/stores/settingsStore.ts`

History and bookmarks are persistent local data, settings are stored in renderer localStorage, and there is no private mode. History URLs can contain search terms, account identifiers, tokens, or other sensitive query parameters. The application documentation still makes broader privacy claims than the implementation supports.

**Recommendation:** update privacy documentation now, add clear retention controls, and implement private sessions before advertising private browsing. Consider stripping known tracking parameters only if this is explicitly designed and tested; do not silently alter user URLs.

#### M3. Tab state is not persisted despite the README claiming it is

**References:** `src/main/index.ts:125-243`, `src/renderer/stores/tabStore.ts`, `README.md:117-128`

Tabs live only in the main-process `Map`. Restarting the app loses all tabs and their navigation state. The settings store is persisted, but that is not tab-state persistence.

**Recommendation:** either remove the claim or implement an intentional session-restore feature with opt-in handling for private tabs and sensitive URLs.

#### M4. New-tab and popup behavior breaks common web flows

**References:** `src/main/index.ts:537-542`, `src/shared/navigation.ts:10-21`

Only HTTP and HTTPS popup URLs are opened in managed tabs. `window.open('', '_blank')` and `about:blank` popups are denied. Many authentication, payment, OAuth, editor, and document workflows open a blank window first and navigate it later.

**Recommendation:** create a managed, isolated popup/tab for safe blank windows, associate it with the opener, and allow only a validated subsequent navigation. Never create an unmanaged native window.

#### M5. All tabs mount webviews and inactive webviews use `display: none`

**References:** `src/renderer/components/BrowserWindow.tsx:181-187`

Every non-internal tab keeps a webview mounted, while inactive views are removed from layout with `display: none`. This increases memory/renderer-process usage and can produce resize/compositing issues when a view is shown again. It also prevents tab sleeping despite the performance goals in the README.

**Recommendation:** use a deliberate tab lifecycle: keep a small number of active views mounted, suspend or destroy inactive views, restore their URL/session state, and test switching after long pages and video playback.

#### M6. Download records and download toasts can grow or become stale

**References:** `src/main/downloads.ts:21`, `src/renderer/components/DownloadToast.tsx`

Completed download records are never bounded or persisted. A long-running browser session can accumulate unbounded metadata. If an in-progress download is removed, the toast's update handler does not remove the missing record, so a “downloading” toast can remain indefinitely.

Also, the canceled toast icon branch is unreachable because `canceled` is included in `failed` first.

**Recommendation:** cap or persist/prune download history, remove toasts when records disappear, and correct terminal-state rendering.

#### M7. Download progress state does not recover from interruption

**References:** `src/main/downloads.ts:112-120`

The `updated` handler changes a record to `interrupted`, but does not set it back to `progressing` if Electron later reports resumed progress. The UI can stop showing a live download while the item continues.

**Recommendation:** model Electron's states explicitly and update the record on both `progressing` and `interrupted` transitions.

#### M8. Search suggestions leak domains to Google and race each other

**References:** `src/renderer/components/NavBar.tsx:62-64`, `src/renderer/components/NavBar.tsx:118-134`, `src/renderer/components/SettingsPage.tsx:40-46`

When a history entry has no favicon, the shell requests a Google favicon URL containing the visited domain. This leaks browsing domains to Google and conflicts with the privacy positioning. Suggestions also issue one IPC/database query per keystroke without cancellation/debouncing, so an older response can overwrite a newer query's results.

**Recommendation:** use locally cached favicons or no fallback request, debounce input, and ignore stale request results.

#### M9. Ad-blocking is an incomplete filter-list implementation

**References:** `src/adblock/engine/RuleParser.ts`, `src/adblock/engine/UrlMatcher.ts`, `src/main/adblock.ts:14-25`

Known limitations include:

- Regex flags after the final `/` are not parsed correctly.
- ABP separator tokens such as `^` are treated as literal characters for non-domain URL rules.
- `$badfilter` is ignored rather than disabling its paired rule.
- Unsupported options are silently ignored, which can produce false positives or false negatives.
- `webSocket`, `object`, `ping`, and `cspReport` resource types are not fully mapped.
- Third-party classification is only a last-two-label approximation and is wrong for many public-suffix cases.
- The static list is loaded only from the packaged file and has no update mechanism.

The code now deliberately allows main-frame navigation, which avoids one class of black/blank tab failures but means the DNS and subresource layers are the actual blocking layers.

**Recommendation:** use a maintained compatible engine or explicitly scope/document the supported syntax and build a corpus of allow/block regression cases.

#### M10. Proxy session discovery is incomplete and creates sessions as a side effect

**References:** `src/main/proxy.ts:116-131`

`session.fromPartition()` does not merely discover partitions; it can create them. The code checks only `persist:default` and `webview`, so arbitrary future partitions are missed, and clear/apply calls can create unused sessions.

**Recommendation:** use one known explicit partition for all webviews or maintain a registry when sessions are created. Do not call `fromPartition` as a discovery mechanism.

#### M11. Proxy verification is weak and has timeout cleanup issues

**References:** `src/main/proxy.ts:134-150`

A successful `200` response from `api.ipify.org` proves only that that endpoint returned a response; it does not prove that all desired protocols/sites work through the proxy. The timeout is cleared only on success, leaving a timer pending after errors.

**Recommendation:** clear the timer in `finally`, validate the response shape, and expose a clear “proxy verified” state separate from “proxy configured”.

#### M12. Custom search-engine validation is too weak

**References:** `src/renderer/stores/settingsStore.ts:128-145`

Validation checks only `http(s)://` and the presence of `%s`. It does not parse the URL, ensure a host exists, prevent malformed control characters, or ensure the placeholder occurs in a sensible query position. Custom IDs use `Date.now()`, which can collide during same-millisecond additions.

**Recommendation:** parse with `URL`, validate the hostname and scheme, assign a collision-resistant ID, and use a clear placeholder contract.

#### M13. Background image cache is global across categories and has no request timeout

**References:** `src/renderer/lib/backgroundCache.ts:14-109`, `src/main/pexels.ts:68-105`

The cache pool is shared between all categories. Switching from nature to technology can display an already cached nature image. Pexels requests have no abort timeout, and concurrent `topUp()` calls can overfill the pool.

**Recommendation:** key the cache by category, cap concurrent requests, add timeouts, and make offline behavior explicit.

#### M14. Certificate status can be stale or misleading

**References:** `src/main/certificate.ts:24-80`, `src/renderer/components/NavBar.tsx:164-215`

Certificates are cached only by hostname, not by tab/session/connection. A later connection can overwrite an earlier result. Before the first asynchronous lookup completes, an HTTPS tab can briefly display “Invalid certificate” because `cert` is null and `certPending` has not yet been set.

**Recommendation:** represent `unknown`, `checking`, `valid`, and `invalid` separately; key certificate data appropriately; and use the webview's actual security state where possible.

### Low priority / maintainability

#### L1. Database queries should use prepared statements consistently

**References:** `src/main/db.ts:181-194`, `src/main/db.ts:208-217`, `src/main/db.ts:239-245`

Some queries interpolate escaped strings and numeric values instead of using prepared parameters. The current escaping reduces straightforward quote injection, but parameterized queries are safer, easier to audit, and handle edge cases more consistently.

#### L2. `initDb()` persistence is synchronous on the main process

**References:** `src/main/db.ts:119-124`, write paths throughout `db.ts`

Every history/bookmark write exports the complete sql.js database and performs a synchronous filesystem write. This can stall window interactions as the database grows.

#### L3. Pexels credentials are not truly secret in a desktop package

**References:** `src/main/pexels.ts:7-35`, `package.json:56-58`

The key is kept out of the renderer, which is good, but `.env*` files are explicitly copied into packaged resources. Anyone with the installed app can inspect those resources. The README should not imply that a desktop-shipped API key is confidential.

#### L4. `settingsStore` is persisted wholesale

**Reference:** `src/renderer/stores/settingsStore.ts:113-191`

The store persists account data, proxy metadata, search engines, paths, and all future fields under one localStorage key. Schema migrations, corrupted values, and sensitive-field filtering are not handled.

#### L5. There is no single source of truth for navigation parsing

**References:** `src/shared/navigation.ts`, `BrowserWindow.tsx`, `NavBar.tsx`, `AddressBar.tsx`

Three components contain similar `looksLikeUrl` functions with slightly different supported schemes. This creates drift: one input can be interpreted as a URL in one UI and as a search in another.

#### L6. Documentation is substantially stale

`README.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, and `docs/PRIVACY.md` still describe Phase 2 behavior, no web content, no storage, and future features that now partly exist. The documentation should distinguish implemented behavior, placeholders, and planned work.

## Black-window status after the previous fix

The current tree contains several useful protections:

- Linux hardware acceleration is disabled by default.
- DNS now defaults to fallback-capable automatic mode.
- Main-frame ad-block cancellation is disabled.
- `chrome-error://` URLs are not stored as tab URLs.
- Failed loads and guest renderer crashes have an error surface.
- Main browser IPC payloads and senders are validated.

The remaining black-window risk is not fully eliminated because the Electron UI was not runnable in this review environment and there is no automated webview smoke test. The first runtime tests should cover:

1. Open `https://example.com`.
2. Open a site whose first navigation fails DNS/TLS.
3. Click a same-tab link and a `target="_blank"` link.
4. Open an OAuth/payment flow using `window.open('', '_blank')`.
5. Switch among 10 tabs, including a video tab.
6. Toggle the ad blocker while a page is loading.
7. Enable, fail, and disable a proxy.
8. Download to the default folder and a custom folder.
9. Kill/reload the guest renderer and verify the retry UI.
10. Run the packaged AppImage/deb on a clean Linux machine.

## Dependency and release risks

The production dependency audit is clean with `npm audit --omit=dev`, but the full development tree currently reports:

- `vite` vulnerability: high severity, including the `server.fs.deny` bypass advisory for affected versions.
- `esbuild` vulnerability: moderate severity, development-server request exposure.
- `electron-vite` inherits vulnerable Vite/esbuild ranges.

`npm audit fix --force` proposes a breaking Vite 8 upgrade, so this should be handled as a tested dependency upgrade rather than blindly applied. Also, `package-lock.json` is ignored, which makes installs non-reproducible and makes it difficult to prove which transitive versions were audited.

## Recommended order of work

1. Add Electron smoke/integration tests and make the runtime binary available in CI.
2. Implement or remove the three nonfunctional security settings.
3. Validate every IPC sender and argument; add a shell CSP.
4. Make DB startup/recovery and download path handling robust.
5. Fix history metadata/privacy behavior and implement private sessions before marketing privacy claims.
6. Replace or formally scope the custom ad-block engine.
7. Fix popup/OAuth flows and define a tab lifecycle to control memory.
8. Add a tracked lockfile, upgrade dev dependencies, and refresh all documentation.

## Overall assessment

**Current rating: functional prototype / not production-ready browser.**

The core navigation architecture is serviceable and the previous black-webview fixes address several real failure modes. However, the combination of unimplemented security switches, broad privileged IPC surface, persistent sensitive browsing data, incomplete private mode, lack of CSP, and lack of Electron integration coverage makes a production privacy/security claim premature.
