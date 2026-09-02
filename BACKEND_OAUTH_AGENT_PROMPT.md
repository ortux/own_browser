# Zyphora OAuth Backend Prompt

Fix Google OAuth for our custom desktop browser app using a real OAuth 2.0 + PKCE implementation that keeps the user inside the app and never launches an external browser.

We have a desktop browser/application built with Electron + React. The app is expected to use backend social auth endpoints and a popup or embedded browser flow, not a browser spoof or unsupported workaround.

## Required backend API contract

The backend must support these endpoints and match the documented Zyphora API contract:

- `GET /health`
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/social/initiate`
- `GET /auth/social/{provider}` (legacy redirect flow, deprecated but acceptable as fallback)
- `GET /auth/social/{provider}/callback`
- `GET /api/v1/me`
- `POST /api/v1/devices`
- `GET /api/v1/devices`
- `POST /api/v1/sync/history`
- `GET /api/v1/sync/history`
- `POST /api/v1/sync/bookmarks`
- `GET /api/v1/sync/bookmarks`
- `PUT /api/v1/sync/settings`
- `GET /api/v1/sync/settings`

## OAuth requirements

The backend must implement the following OAuth 2.0 with PKCE flow:

1. A client calls `POST /auth/social/initiate` with a JSON body like `{ "provider": "google" }`
2. The backend generates a cryptographically secure `code_verifier` and computes `code_challenge = base64url(SHA256(code_verifier))`
3. The backend generates a secure random `state` value and stores it alongside the PKCE verifier, redirect URI, provider name, and expiration time
4. The backend returns a full authorization URL to the app with:
   - `client_id`
   - `redirect_uri`
   - `response_type=code`
   - `scope=email profile`
   - `access_type=offline`
   - `prompt=consent`
   - `state`
   - `code_challenge`
   - `code_challenge_method=S256`
5. The app opens the returned URL in an in-app popup or embedded browser flow
6. On callback, the backend validates the `state` parameter and retrieves the stored `code_verifier`
7. The backend exchanges `code + code_verifier` with Google’s token endpoint
8. The backend validates the `id_token` or fetches the user profile from the provider
9. The backend creates or links the user and issues Zyphora app JWT/session tokens
10. The backend returns the app tokens and user data to the frontend

## Required provider behavior

Supported providers:
- `google`
- `github`
- `microsoft`

For Google specifically, use:
- `https://accounts.google.com/o/oauth2/v2/auth`
- `https://oauth2.googleapis.com/token`
- `https://openidconnect.googleapis.com/v1/userinfo`

## Security requirements

- Use PKCE with S256; do not remove PKCE
- Use state validation to prevent CSRF attacks
- Use exact redirect URI matching configured in Google Cloud
- Keep any client secret on the backend only; never expose it to the frontend
- Never log secrets, tokens, PKCE values, Google cookies, passwords, or access tokens
- Reject invalid or expired state values
- Clean up stored OAuth state records after successful or failed callback handling
- Use HTTPS in production and localhost in development
- Do not spoof the User-Agent or pretend to be Chrome/Edge/Firefox to bypass Google checks
- Do not disable certificate validation or browser security

## Expected response contracts

### Initiate response

```json
{
  "ok": true,
  "auth_url": "https://accounts.google.com/o/oauth2/v2/auth?client_id=...&state=xyz&code_challenge=...",
  "state": "xyz123abc456...",
  "expires_in": 600
}
```

### Callback response

```json
{
  "ok": true,
  "user": {
    "id": 1,
    "email": "user@example.com",
    "role": "user"
  },
  "tokens": {
    "access_token": "eyJhbGciOiJIUzI1NiIs...",
    "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
    "token_type": "Bearer",
    "expires_in": 900
  },
  "provider": "google"
}
```

### Error responses

```json
{
  "error": "Invalid or expired OAuth state"
}
```

and

```json
{
  "error": "Provider not configured",
  "status": 503
}
```

## Required environment variables

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `GOOGLE_AUTHORIZATION_URL`
- `GOOGLE_TOKEN_URL`
- `GOOGLE_USERINFO_URL`
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `GITHUB_REDIRECT_URI`
- `MICROSOFT_CLIENT_ID`
- `MICROSOFT_CLIENT_SECRET`
- `MICROSOFT_REDIRECT_URI`
- `JWT_SECRET`
- `FRONTEND_BASE_URL`
- `APP_BASE_URL`
- `OAUTH_SSL_VERIFY=true`

## Storage pattern

Store OAuth state records with at least:

- `provider_name`
- `state`
- `code_verifier`
- `redirect_uri`
- `user_id` (nullable)
- `expires_at`
- `created_at`

These records must expire automatically and be deleted after successful or failed callback processing.

## Electron integration requirements

The frontend should do the following in the app:

- call `POST /auth/social/initiate` with provider = `google`
- receive `auth_url` and `state`
- open the auth URL in an app popup or embedded browser window
- capture the callback result in that popup
- send the final tokens or user payload back to the main Electron renderer
- save JWT/session data securely in app storage

No external browser or Chrome/Edge process should be launched.

## Required deliverables

1. Exact backend code changes for the social auth routes and PKCE flow
2. Secure state and PKCE storage with expiration and cleanup
3. Google token exchange with `code_verifier`
4. Callback validation and user creation/linking
5. Production-ready security and environment configuration
6. The exact API contract expected by the app
7. A concise explanation of why the previous approach failed and why this implementation is compliant with Google OAuth requirements

## Important constraints

- This is not a workaround for Google’s checks
- This is a real OAuth implementation using Google’s supported flow
- The frontend must remain inside the app; the backend should create and handle the Google auth URL and callback
- Preserve the existing app structure as much as possible, but replace the insecure or non-compliant flow with a proper OAuth implementation
- Do not bypass Google security checks or browser validation
- Do not launch external browsers or use browser spoofing
- Do not store secrets in client code
- Do not claim success without verifying the implementation against the documented API behavior

## Final task

Implement the backend OAuth flow that keeps the browser inside our app while using Google’s supported OAuth security model and PKCE. Preserve the existing frontend/backend architecture as much as possible, but replace the current insecure or non-compliant flow with a proper OAuth implementation that matches the documented Zyphora API contract.
