# Configuration

Compass uses `compass.yaml` for self-hosting and local development. The file is visible, diffable, and contains secrets, so keep it out of git and back it up with the Docker volumes.

Examples:

- local development: `compass.example.yaml`
- self-hosting: `self-host/compass.example.yaml`

## Runtime

| key | Required | Description |
|---|---|---|
| `runtime.version` | Self-host | Docker image tag used by the self-host compose stack. Defaults to `latest`. Pin this for reproducible installs. |
| `runtime.nodeEnv` | Yes | Runtime mode. Use `production` for self-hosted and staging; `development` for local dev. |
| `runtime.timezone` | Yes | Backend timezone. Only `Etc/UTC` and `UTC` are accepted. |
| `runtime.logLevel` | No | Winston log level. Defaults to `info`. Set to `debug` to include health-check requests (`GET /api/health`) in the logs, which are otherwise hidden. |

## Web

| key | Required | Description |
|---|---|---|
| `web.port` | `9080` | Host port bound to the web container on `127.0.0.1`. |
| `web.url` | Yes | Public frontend URL as seen by the backend. Example: `https://compass.example.com`. |

## Backend

| key | Required | Description |
|---|---|---|
| `backend.port` | `3000` | Host port bound to the backend container on `127.0.0.1`. |
| `backend.apiUrl` | Yes | Public API URL. Example: `https://compass.example.com/api`. This is baked into the web bundle when the web image is rebuilt. |
| `backend.originsAllowed` | Yes | YAML list of allowed CORS origins. Include `web.url`. |
| `backend.compassToken` | Yes | Bearer token protecting internal sync endpoints. |

## MongoDB

| key | Required | Description |
|---|---|---|
| `mongo.uri` | Yes | Backend MongoDB connection string. For self-hosted installs, must include `authSource=admin` and `replicaSet=rs0`. |
| `mongo.username` | Self-host | MongoDB root username created on first container startup. Must match the credentials in `mongo.uri`. |
| `mongo.password` | Self-host | MongoDB root password. Changing it after first startup requires a MongoDB user migration. |
| `mongo.replicaSetKey` | Self-host | Shared secret used for internal authentication between replica set members. |

## SuperTokens

SuperTokens handles user-sessions for us.

| key | Required | Description |
|---|---|---|
| `supertokens.uri` | Yes | SuperTokens Core URL as seen by the backend. Self-hosted Docker uses `http://supertokens:3567`. |
| `supertokens.key` | Yes | API key shared by backend and SuperTokens Core. |
| `supertokens.postgres.user` | Self-host | Postgres user for the SuperTokens database container. |
| `supertokens.postgres.password` | Self-host | Postgres password for the SuperTokens database container. |
| `supertokens.postgres.database` | Self-host | Postgres database name for SuperTokens. |

## Google

These values are only necessary if you want to enable Google Oauth and/or 2-way sync between Compass and Google Calendar

Both `google.clientId` and `google.clientSecret` must be real values for Google features to activate. Setting only one causes backend startup to fail.

| key | Required | Description |
|---|---|---|
| `google.clientId` | No | Google OAuth client ID. Rebuild the web image after changing it. |
| `google.clientSecret` | No | Google OAuth client secret. Backend-only. |

See [Google Calendar](../self-hosting/google-calendar.md) for full setup instructions.

## Microsoft

Both `microsoft.clientId` and `microsoft.clientSecret` must be set together. Setting only one causes startup to fail. See [Microsoft Calendar](../self-hosting/microsoft-calendar.md).

| key | Required | Description |
|---|---|---|
| `microsoft.clientId` | No | Entra app client ID (`/common`). Rebuild the web image after changing it. |
| `microsoft.clientSecret` | No | Entra app client secret. Backend-only. |

## Apple

Sign in with Apple is all-four-or-none. iCloud calendar connect is separate and needs `sync.credentialEncryptionKey`. See [iCloud Calendar](../self-hosting/apple-calendar.md).

| key | Required | Description |
|---|---|---|
| `apple.signIn.servicesId` | No | Sign in with Apple Services ID. Baked into the web bundle. |
| `apple.signIn.teamId` | No | Apple Developer team ID. |
| `apple.signIn.keyId` | No | Sign in with Apple key ID. |
| `apple.signIn.privateKey` | No | `.p8` private key contents. |

## Sync Service

Standalone service (`packages/sync`) that owns Google Calendar sync end to
end. Every deployment runs it — the backend exits at startup without
`sync.serviceUrl`/`sync.internalAuthToken` configured, and the self-host
installer writes the `sync:` block by default (see
[Self-Hosting](../self-hosting/README.md)). Sync uses an **isolated** Mongo
database and must not share the backend's database user/data.

| key | Required | Description |
|---|---|---|
| `sync.port` | No | Sync HTTP port. Defaults to `3010` in examples. |
| `sync.mongoUri` | Yes | Isolated Sync Mongo URI. Never point this at the API database. |
| `sync.internalAuthToken` | Yes | Shared secret for Sync internal routes. Must match what the API uses. |
| `sync.callbackBaseUrl` | Yes | Public base URL for provider OAuth/webhook callbacks (proxied as `/sync/*`). |
| `sync.postConnectRedirectUrl` | No | Browser redirect after OAuth connect. **Set this to `web.url`** — an unset value falls back to `callbackBaseUrl` (Sync's own API host), which strands the user there instead of back on the calendar. |
| `sync.serviceUrl` | Yes | Base URL the **backend** uses to reach Sync (e.g. `http://localhost:3010`). The backend refuses to start without this and `internalAuthToken` set. |
| `sync.cloudMutationMode` | No | `enabled` (default) or `maintenance`. Maintenance rejects cloud edits/connect with typed `MAINTENANCE` (`503`). |
| `sync.execution` | No | `passive` (default) or `active`. Active is required for OAuth begin and provider import/jobs. |
| `sync.maxConcurrency` | No | Job concurrency hint for Sync workers. |
| `sync.enforceLeastPrivilege` | No | When `true`, Sync verifies its Mongo user cannot read the API database. |
| `sync.compassApiDatabase` | No | API database name the least-privilege check must be denied access to. |
| `sync.credentialEncryptionKey` | Yes when any provider is configured | 32-byte base64 key that encrypts password and OAuth refresh credentials at rest. Required when Google, Microsoft, or Apple calendar is configured (32 bytes of base64; generate with `openssl rand -base64 32`). |

## Optional Integrations

| key | Required | Description |
|---|---|---|
| `posthog.key` | No | PostHog project key injected into the web bundle. |
| `posthog.host` | No | PostHog host injected into the web bundle. |
| `stripe.secretKey` | No | Stripe secret (`sk_test_...` is fine on staging). All four Stripe keys are required together; omit the whole `stripe:` block on self-host. Hosted deploys set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`, and `STRIPE_PUBLISHABLE_KEY` on the GitHub Environment; missing any one omits the block. |
| `stripe.webhookSecret` | No | Stripe webhook signing secret. |
| `stripe.priceId` | No | Stripe Price id for the hosted subscription. The amount lives on that Price in Stripe. |
| `stripe.publishableKey` | No | Stripe publishable key (`pk_test_...` is fine on staging). Served to the web as `billing.publishableKey` on `/api/config` so Stripe.js can load on the first checkout surface without a rebuild. |
| `email.provider` | No | `resend` or `log`. Omit the whole `email:` block to keep email off (no enrollment, poller, or send routes). Self-host defaults to off. |
| `email.apiKey` | Yes when `provider` is `resend` | Resend API key. Required together with `from`, `webhookSecret`, and `unsubscribeSecret` when using `resend`. |
| `email.from` | Yes when `provider` is `resend` | From address (for example `Compass <hello@mail.compasscalendar.com>`). |
| `email.webhookSecret` | Yes when `provider` is `resend` | Resend webhook signing secret (Svix). |
| `email.unsubscribeSecret` | Yes when `provider` is `resend` | HMAC key for one-click unsubscribe links (`openssl rand -base64 32`). Rotating this value invalidates outstanding unsubscribe links. |
| `email.scheduleProfile` | No | `real` (default) or `fast`. `fast` compresses step delays for staging; config refuses `fast` when `runtime.nodeEnv` is `production`. |
| `email.allowlist` | No | Optional send-time guard. Non-listed addresses still enroll but sends are skipped until the allowlist is cleared. Matched case-insensitively; empty when omitted. |
