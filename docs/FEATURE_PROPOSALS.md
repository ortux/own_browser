# Feature proposals

Written after reading the current `src/` tree. Everything below is anchored to
something that is actually missing, half-wired, or inconsistent in the code as
it stands — not a generic browser wishlist.

Ordered by (user impact ÷ effort). The first section is the one worth doing
first, and it is mostly bug-fixing rather than feature work.

---

## Tier 0 — Finish what the UI already promises

These are not new features. The app currently tells the user these things
exist. Shipping anything else before closing them means the product lies to
the person using it.

### 0.1 Password sync, or corrected copy — *small*

`SettingsPage.tsx` says, under the password manager toggle:

> "Save locally and sync browser passwords with your account."

There is no password sync. `src/renderer/lib/` has `historySync.ts`,
`bookmarksSync.ts` and `settingsSync.ts` — and no passwords equivalent. Grep
for `password` across all three sync modules returns zero hits.

Two honest options:

- **Cheap:** change the copy to "Save logins locally on this device." One line.
- **Real:** add `passwordsSync.ts`. This is *not* symmetric with the other sync
  modules — history and bookmarks are non-sensitive, whereas passwords must be
  end-to-end encrypted so the backend never sees plaintext. That means a
  key-derivation story (a passphrase the server never receives), which is a
  genuine design task, not a port of `bookmarksSync.ts`.

Do the cheap fix now regardless; the real one is Tier 2 below.

### 0.2 "Tab Groups" button does nothing — *small*

`SidebarTabs.tsx:128` renders a Layers icon labelled *Tab Groups* with no
handler, and again at line 189 with `onClick: undefined`. It is in both the
collapsed and expanded sidebar, so it is highly visible and completely inert.

Either implement grouping (Tier 2) or remove the button. A dead control in the
primary navigation is worse than no control.

---

## Tier 1 — High impact, contained scope

### 1.1 Session restore — *medium*

**The single biggest functional gap.** `app.on('window-all-closed')` calls
`app.quit()`, and `will-quit` only unregisters shortcuts and closes the DB. Open
tabs are never written anywhere. Quitting the browser silently destroys the
user's entire working set.

`closedTabs` already exists in memory for Ctrl+Shift+T, so the tab-restore
plumbing is half-built — it just does not survive a restart.

Scope:

- Persist `tabs[]` + `activeTabId` on `will-quit` (and on a debounced timer, so
  a crash does not lose everything).
- Restore on launch, behind a Settings choice: *New tab* / *Continue where I
  left off*. Chrome and Firefox both offer this; defaulting to restore without
  asking surprises people.
- Never persist private tabs — they already carry `privateMode`, so the filter
  is trivial, but it must not be forgotten.

### 1.2 Window bounds persistence — *small*

`createWindow()` hardcodes `width: 1200, height: 800` every launch. Resize and
maximise state are discarded. Users on ultrawide or small laptop screens
re-resize the window on every start.

Store bounds + maximised flag; validate on restore that the saved rectangle
still intersects a currently-connected display, or a window from an
unplugged second monitor becomes unreachable.

### 1.3 Per-site zoom that persists — *small*

`useBrowser.ts` `zoom()` calls `wv.setZoomFactor()` on the live webview only.
The value is lost on navigation and on restart. Anyone who zooms because a site
has small text has to redo it on every page load.

Persist zoom keyed by origin and re-apply on `did-navigate`. The passwords work
already established the origin-normalisation helper (`normalizeOrigin` in
`db.ts`) — reuse it so `https://x.com/a` and `https://x.com/b` share a level.

### 1.4 History retention policy — *small*

`addHistory` has no cap and no pruning. `db.ts` grows forever, and because
persistence is sql.js the **entire database is serialised and rewritten to disk
on every single write** (`persist()` calls `db.export()` + `writeFileSync`).

This is a performance cliff, not just a disk-space concern: a year of heavy
browsing makes every page visit progressively slower. Add a retention setting
(30 / 90 / 365 days / forever) plus a row cap, and prune on startup.

> Worth flagging: the sql.js full-rewrite-per-write model will become the
> app's main performance bottleneck as data grows. Retention buys time;
> migrating to `better-sqlite3` is the real fix, but that is a build-system
> change (native module, rebuild step) and out of scope for a feature list.

### 1.5 Tracking-parameter stripping — *small*

The README sells "Privacy: tracker blocking", and `adblock.ts` does block
network requests via Ghostery. But nothing strips `utm_*`, `fbclid`, `gclid`,
`igshid` from URLs — grep for `utm` in `src/main/` is empty. Those parameters
still land in history, in copied links, and in synced bookmarks.

This is a natural fit next to the existing `forceHttps` logic in the navigation
path, and it is maybe 30 lines plus a list. High privacy value per line of code.

### 1.6 Tab audio: indicator and mute — *small*

No `setAudioMuted` / `audioMuted` anywhere. A background tab that starts playing
audio cannot be found or silenced without closing tabs one at a time. Electron
exposes `audio-state-changed` on webContents, so the indicator is cheap, and
the sidebar already renders per-tab affordances to hang it off.

---

## Tier 2 — Larger, still clearly worthwhile

### 2.1 Tab sleeping — *medium*

Named in the README's own "Low Resource Usage" bullet as planned, and currently
unimplemented (zero hits for sleep/discard/hibernate). `BrowserWindow.tsx`
mounts **every** tab's `<webview>` simultaneously and toggles visibility with
`display: none`. Thirty tabs means thirty live renderer processes.

This is the difference between the browser being usable with many tabs and not.
Suspend after N minutes idle, skipping tabs playing audio (needs 1.6 first).

### 2.2 Pinned tabs — *small-medium*

`pinned` appears twice in the tree but is not a real feature. The sidebar
already supports drag-reorder (`onTabReorder`), so the model change is small:
a `pinned` flag, pinned tabs sort first, and they resist Ctrl+W.

### 2.3 Tab groups — *medium*

Only worth doing if 0.2 is resolved by building rather than deleting.

### 2.4 End-to-end encrypted password sync — *large*

The real version of 0.1. Requires a passphrase-derived key held only on the
client, encrypted blobs on the server, and a recovery story for a forgotten
passphrase. Do not start this until 0.1's copy fix has shipped.

### 2.5 Reader mode — *medium*

No `readerMode`/`readability` code. Strong fit for a privacy browser: it strips
page chrome and trackers as a side effect. Mozilla's Readability library is the
standard approach and runs comfortably in the guest context.

---

## Tier 3 — Valuable but expensive

- **Extension support** (`loadExtension`) — very large; Chrome Web Store
  compatibility is a project in itself, not a feature.
- **Cookie controls** — currently only all-or-nothing "clear everything".
  Per-site cookie policy and a third-party cookie block would suit the
  product's positioning.
- **Picture-in-picture**, **PDF viewer improvements**, **Web3/ENS** (the
  README's Phase 11–12) — all real, none urgent.

---

## Suggested order

1. **0.1 + 0.2** — stop the UI making false promises. Under an hour.
2. **1.1 session restore** — the one gap most likely to make someone stop using
   the browser.
3. **1.2, 1.3, 1.4, 1.5** — small, independent, each individually noticeable.
4. **1.6 → 2.1** — audio state first, then sleeping, since sleeping must not
   silence a playing tab.
5. Reassess. By then the sql.js write-amplification question in 1.4 probably
   needs a real answer.
