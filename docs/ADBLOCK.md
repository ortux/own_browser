# Local Ad Blocking

Zyphora uses two layers. Chromium uses AdGuard DNS over HTTPS as the primary domain-level blocker, and the local engine evaluates allowed requests for URL, resource-type, exception, and third-party rules. The renderer never reads filter lists.

## Runtime flow

1. `src/main/dns.ts` configures Chromium to prefer AdGuard DNS-over-HTTPS with `https://dns.adguard-dns.com/dns-query` before app readiness. It falls back to system DNS when the endpoint is unreachable; `ZYPHORA_DNS_MODE=secure` opts into fail-closed DNS.
2. AdGuard DNS blocks domains before a connection is made.
3. `src/main/adblock.ts` loads `filter.txt` from the packaged application.
4. `src/adblock/engine/RuleParser.ts` parses supported rules.
5. `src/adblock/engine/AdBlockEngine.ts` indexes domain suffixes and URL tokens.
6. `session.defaultSession.webRequest.onBeforeRequest` receives the local decision and cancels blocked requests.

All current webviews use the default session. A future named or private session must be registered explicitly before it can be filtered.

## Supported syntax

| Syntax | Support |
| --- | --- |
| `||example.com^` | Supported |
| `example.com` | Supported as a hostname rule |
| URL substring and `*` wildcard rules | Supported |
| `@@` exceptions | Supported |
| `$script`, `$image`, `$stylesheet`, and other normalized resource types | Supported |
| `$third-party` and `~third-party` | Supported |
| `$domain=example.com|~excluded.com` | Supported |
| `$important` | Supported |
| bounded regular-expression rules | Supported with safety limits |
| `##` cosmetic rules | Not implemented |
| redirects | Not implemented |
| scriptlets | Not implemented |
| platform directives | Ignored |
| `$badfilter` rule disabling | Ignored safely; it does not disable another rule |

This is a deliberately limited compatible subset, not a claim of complete uBlock Origin or AdGuard compatibility.

## Filter source

`filter.txt` is treated as untrusted input. Its header identifies the AdGuard DNS filter and its license. Before redistributing a production build, verify that the selected version and packaging method comply with that license and upstream update requirements.

The application does not download a filter list during page requests. AdGuard DNS receives DNS queries needed for name resolution; it does not receive complete page URLs. Updating `filter.txt` requires replacing the local asset through a trusted release/update process, followed by a build and review.

## SponsorBlock

YouTube pages optionally use the public SponsorBlock API for community-submitted sponsor, intro, outro, and similar segment timestamps. Zyphora sends only a four-character SHA-256 prefix of the video ID, validates the response, and injects a fixed local time skipper. It does not submit segments, vote, send the video ID, or execute code from the API response.

SponsorBlock skips marked segments; it does not reliably remove YouTube in-stream advertisements. YouTube ads are often delivered from the same first-party systems as the video and cannot be safely cancelled by DNS or `onBeforeRequest` without risking playback.

## Security boundaries

- No `eval`, `new Function`, native code, or filter-provided JavaScript is executed.
- Regular expressions are length-limited, compiled once per rule, and reject common nested-quantifier forms.
- Cosmetic selectors and scriptlets are not executed.
- The renderer accesses only validated adblock IPC operations already exposed by preload.
- Main-frame navigation is deliberately allowed so a filter-list match cannot prevent a user from opening a site; only webview subresources are cancelled.
- Automatic DoH prefers the configured AdGuard endpoint and falls back to system DNS if it is unavailable, so a resolver outage does not make every tab blank. `ZYPHORA_DNS_MODE=secure` intentionally restores fail-closed behavior for deployments that require it.
- Third-party classification currently uses a small registrable-domain approximation. It is not a complete Public Suffix List implementation and should be replaced with a maintained PSL-compatible library before relying on country-code edge cases.

## Validation

Run:

```text
npm run test:adblock
npm run build
```

The tests cover domain rules, exceptions, resource types, third-party matching, allowlisting, regular-expression safety, and loading the supplied filter list.
