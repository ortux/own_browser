# Zyphora Update System Contract

Status: client proposal pending server-agent adoption.

## Ownership

The Zyphora client owns update checks, download staging, local signature/integrity validation, user controls, and restart. The server owns release publication, rollout policy, channels, artifact hosting, and update analytics.

## Transport

- Update metadata and artifacts are served over HTTPS.
- The client accepts only `https://` update feeds in packaged builds.
- Localhost feeds are permitted only in an unpackaged development build.
- The renderer cannot provide or change an update URL.
- The client is configured with `ZYPHORA_UPDATE_URL`, the base URL for the selected channel.
- `ZYPHORA_UPDATE_CHANNEL` is `stable`, `beta`, or `dev`; unknown values resolve to `stable`.

The current client uses `electron-updater` with electron-builder's generic provider. The server must publish the standard platform metadata file at the feed URL, for example:

- Windows: `latest.yml` plus the installer and optional `.blockmap`
- macOS: `latest-mac.yml` plus the signed package
- Linux: the platform metadata supported by the selected electron-builder target

The channel feed must be selected server-side or by a channel-specific base URL. The client never follows an artifact URL supplied by the renderer.

## Metadata and artifacts

The server must publish electron-builder-compatible metadata containing at least:

```json
{
  "version": "1.5.0",
  "files": [
    {
      "url": "Zyphora-1.5.0-win-x64.exe",
      "sha512": "base64-sha512",
      "size": 200000000
    }
  ],
  "path": "Zyphora-1.5.0-win-x64.exe",
  "sha512": "base64-sha512",
  "releaseDate": "2026-09-06T00:00:00Z"
}
```

Release notes are carried by the metadata supported by electron-builder/electron-updater. They are displayed as untrusted text only; they are never executed or interpreted as commands.

The server must ensure:

- The installer is code-signed by the Zyphora publisher certificate.
- The metadata and artifact checksum match the published artifact.
- HTTPS certificates are valid.
- Version numbers are valid semver and monotonically released within a channel.
- Rollout filtering happens before metadata is served, or through a compatible provider layer.
- A failed rollout can remove a release from the channel without deleting the currently installed version.

`electron-updater` verifies the artifact checksum and platform signature before emitting `update-downloaded`. Blockmaps are optional and may reduce downloads; they are not required for correctness.

## Client states

The renderer receives only this typed state:

```ts
type UpdateState =
  | 'idle' | 'checking' | 'available' | 'downloading'
  | 'downloaded' | 'installing' | 'up_to_date' | 'error';
```

Errors are reduced to stable codes such as `NETWORK_UNAVAILABLE`, `VERIFICATION_FAILED`, `INSUFFICIENT_DISK_SPACE`, and `UPDATE_FAILED`. Raw exceptions, paths, URLs, and installer details are not sent to React.

## Installation and rollback

The current installation is not removed by the client. `electron-updater` stages the verified package in its updater-managed temporary area and `quitAndInstall()` is only exposed after `update-downloaded`. If installation fails, the existing installation remains the recovery target. The installer and operating-system updater are responsible for atomic replacement and rollback behavior.

The client does not force installation during active browsing. It waits for the user to choose restart, and normal browsing continues after check, network, verification, or staging failures.

## Release channels and runtime updates

Stable, beta, and dev are independent feeds. Electron/Chromium runtime changes are ordinary application releases and may be substantially larger than differential application updates. A blockmap may reduce a compatible download, but the server must publish full installers for recovery.

## Required release environment

```text
ZYPHORA_UPDATE_URL=https://updates.example.com/zyphora/stable/
ZYPHORA_UPDATE_CHANNEL=stable
```

The server agent must replace the example host and publish configuration before production release. Code signing credentials must remain in CI or the release service and must never be shipped to the client.
