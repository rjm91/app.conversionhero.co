# Instagram Conversations — Claude Code Handoff

## Goal

ConversionHero has a real Instagram Direct-message inbox in the Mission UI for **Contour Scottsdale** (`client_id: ch1001`). The goal is to connect one test Instagram professional account, receive its DMs in Mission, and reply from Mission without exposing credentials to the browser.

The UI is at:

```text
https://app.conversionhero.co/control/ch1001/mission?tab=conversations
```

## Current live state

- The Instagram Conversations inbox and self-service OAuth connection flow were deployed to `main` in commit `f72ad54` (`Add Instagram Messaging connection flow`).
- Vercel completed that deployment successfully.
- Contour's client setting `instagram_conversations_enabled` is already `true`.
- The Instagram database tables already exist in Supabase.
- There is currently **no Instagram connection row for `ch1001`**, so the Mission tab correctly shows **Connect Instagram Messaging**.
- The existing Meta Ads connector (`meta_connections`) is separate. Do not merge it with Instagram messaging credentials or expand the Ads OAuth scopes to access DMs.

## What is implemented

### User flow

1. In Mission → Conversations, click **Connect Instagram**.
2. `GET /api/instagram/oauth/start?client_id=ch1001` checks the signed-in user can access this client, creates a signed 10-minute OAuth state, and redirects to Instagram Login.
3. Meta redirects to `/api/instagram/oauth/callback`.
4. The callback verifies the signed state and the same signed-in user, exchanges the authorization code, exchanges for a long-lived token, identifies the professional account, subscribes it to the configured webhook, and saves the credential server-side.
5. The browser returns to Mission → Conversations. New incoming DMs arrive through the webhook and display in the inbox.

### Important files

```text
components/InstagramConversations.js
  Mission two-pane inbox; Connect/Reconnect button and connection outcome UI.

app/api/instagram/oauth/start/route.js
app/api/instagram/oauth/callback/route.js
  Secure Instagram Login start/callback routes.

lib/instagram-oauth-core.mjs
  HMAC-signed, tenant- and user-scoped OAuth state plus authorization URL builder.

lib/instagram-oauth.js
  Token exchange, long-lived token exchange, professional-account lookup,
  webhook subscription, and server-side connection persistence.

app/api/instagram/conversations/route.js
app/api/instagram/conversations/[conversationId]/route.js
app/api/instagram/messages/route.js
  Authorized conversation read, thread read/mark-read, and outbound reply APIs.

app/api/webhooks/meta/instagram/route.js
  Meta webhook verification and signed event ingestion.

lib/instagram-messaging.js
lib/instagram-messaging-core.mjs
  Webhook/event normalization, attribution sanitization, reply policy, and Graph API send.

lib/instagram-api-auth.js
  Current-user + tenant-access gate for all inbox routes.

sql/2026-07-23_instagram_conversations.sql
  `instagram_connections`, `instagram_conversations`, `instagram_messages`, RLS,
  and the idempotent `ingest_instagram_message` RPC.

tests/instagram-messaging.test.mjs
tests/instagram-oauth.test.mjs
  Security/OAuth regression tests. Run with `npm run test:instagram`.
```

## Required Vercel environment variables

The Connect button is live, but it will show a configuration message until these values are configured in Vercel **Production** and the app is redeployed:

```text
META_INSTAGRAM_APP_ID=<Meta app ID>
META_INSTAGRAM_APP_SECRET=<Meta app secret>
META_INSTAGRAM_REDIRECT_URI=https://app.conversionhero.co/api/instagram/oauth/callback
META_INSTAGRAM_WEBHOOK_VERIFY_TOKEN=<new random secret>
META_INSTAGRAM_OAUTH_STATE_SECRET=<different new random secret>
META_INSTAGRAM_API_VERSION=v24.0
```

Generate the two random secrets locally; for example:

```bash
openssl rand -hex 32
```

Never paste a token, app secret, or generated secret into source code, chat, a browser field, or a committed `.env` file.

`META_INSTAGRAM_OAUTH_STATE_SECRET` protects the OAuth round-trip. It can fall back to the app secret in code, but use a separate value in production.

## Required Meta developer configuration

The same Meta developer app used for Ads can be used, but it must have an Instagram messaging use case/product configured. The app needs to request the professional-account scopes used by the code:

```text
instagram_business_basic
instagram_business_manage_messages
```

Configure these exact URLs in Meta:

```text
OAuth redirect URL
https://app.conversionhero.co/api/instagram/oauth/callback

Webhook callback URL
https://app.conversionhero.co/api/webhooks/meta/instagram
```

Use the exact `META_INSTAGRAM_WEBHOOK_VERIFY_TOKEN` value as Meta's webhook verify token. Subscribe the Instagram webhook to message-related fields, including:

```text
messages
messaging_seen
messaging_referral
```

For an app still in development, the person connecting the test account must be assigned an eligible role in the Meta app. The test account must be an Instagram **Business or Creator** account, not a personal account.

## Test procedure

1. Add the Vercel variables and redeploy.
2. Configure the Meta redirect URL, webhook URL, verify token, scopes, and webhook fields above.
3. Open Contour → Mission → Conversations.
4. Click **Connect Instagram** and log into a test Business/Creator Instagram account.
5. Confirm the tab changes from the empty state to the two-pane inbox and shows the connected username.
6. From a separate Instagram account, send a new DM to the connected test account.
7. Confirm the thread appears in Mission. Reply from Mission and confirm the reply arrives in Instagram.
8. Optional: test an ad/referral entry and confirm the thread's attribution badge is shown.

## Security and data rules — do not weaken

- `instagram_connections.access_token` is service-role only. Browser users must never select or receive it.
- OAuth state is HMAC-signed, user-scoped, client-scoped, and expires after 10 minutes.
- The callback re-checks that the same signed-in user can access the requested client before persisting anything.
- The webhook validates Meta's exact `X-Hub-Signature-256` against `META_INSTAGRAM_APP_SECRET` before parsing the payload.
- Incoming message persistence is idempotent by Meta message ID.
- Attachment URLs are HTTPS-only and capped; referral metadata is sanitized before storage.
- Standard replies are restricted to Meta's 24-hour messaging window. The Human Agent window remains disabled unless Meta permission is approved and `human_agent_enabled` is intentionally enabled.
- Keep Instagram credentials separate from `meta_connections`, which belongs to Meta Ads sync.

## Current limitations / likely next work

- The inbox starts receiving new webhook events after connection. It does **not** backfill historical Instagram threads.
- Tokens should be refreshed before `token_expires_at`; there is not yet a scheduled token-refresh job.
- Media sending, assignment, tags, automation, and historical conversation sync are not implemented.
- If a webhook subscription fails, the connection is saved with `status = 'error'` and the UI offers **Reconnect Instagram**. Do not mark it `connected` manually just to bypass this.
- A professional account can only be connected to one client because `instagram_connections.instagram_account_id` is unique.

## Ready-to-paste task for Claude Code

```text
Read docs/instagram-conversations-handoff.md first. Do not alter the existing
Meta Ads connector or expose Instagram tokens client-side. Help me configure and
test the deployed Instagram Login + Mission Conversations implementation for
Contour Scottsdale (ch1001). First inspect the Vercel environment-variable
status without revealing secrets, then guide me through the Meta app redirect,
webhook, permissions, and test-account setup. After configuration, test the
Connect Instagram flow and report the exact failure stage if it does not
complete. Preserve the security invariants and run npm run test:instagram for
any code changes.
```

---

## Setup progress (2026-07-24, Claude Code)

- All **6 Vercel production env vars are set**: `META_INSTAGRAM_APP_ID`
  (1396148525729490 = "CH App"), `META_INSTAGRAM_APP_SECRET` (user-added),
  `META_INSTAGRAM_REDIRECT_URI`, `META_INSTAGRAM_WEBHOOK_VERIFY_TOKEN`,
  `META_INSTAGRAM_OAUTH_STATE_SECRET`, `META_INSTAGRAM_API_VERSION` (v24.0).
  (`META_INSTAGRAM_GRAPH_URL` intentionally unset — code defaults it to
  graph.instagram.com.)
- Redeployed; production is Ready.
- **Webhook verify endpoint tested live and PASSES**: correct token →
  HTTP 200 echoing the challenge; wrong token → HTTP 403. So Meta's webhook
  subscription handshake will succeed.
- Meta app "CH App" has the **Manage messaging & content on Instagram** use case
  added, owned by ConversionHero 2; connecting user (Ryan) has Full access
  (app admin) — required while the app is Unpublished.
- REMAINING (Meta dashboard, user): finish the IG use-case Customize —
  Webhooks (callback + verify token + subscribe messages/messaging_seen/
  messaging_referral), Permissions (instagram_business_basic +
  instagram_business_manage_messages), Instagram business login redirect URI.
  Then connect a Business/Creator test IG account at
  /control/ch1001/mission?tab=conversations and confirm DMs flow.
- Also fixed a local-only package.json stash-pop conflict; main was already
  correct (`test:instagram` runs both test files). All 7 instagram tests pass.
