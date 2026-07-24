# Instagram Conversations

The Mission **Conversations** tab is a real Instagram Direct inbox. It uses a separate connection from Meta Ads because Instagram messaging has its own account identity, OAuth permissions, reply policy, and webhook subscription.

## One-time Meta setup

1. In the Meta developer app, add the Instagram use case for managing Instagram messaging and content.
2. Add the app's production redirect URL exactly as:

   `https://app.conversionhero.co/api/instagram/oauth/callback`

3. Add the production webhook callback:

   `https://app.conversionhero.co/api/webhooks/meta/instagram`

   Configure the same value used for `META_INSTAGRAM_WEBHOOK_VERIFY_TOKEN` as Meta's verify token. Subscribe the app to Instagram message events in the Meta dashboard.
4. Add these production environment variables in Vercel, then redeploy:

   ```text
   META_INSTAGRAM_APP_ID=<Meta app ID>
   META_INSTAGRAM_APP_SECRET=<Meta app secret>
   META_INSTAGRAM_REDIRECT_URI=https://app.conversionhero.co/api/instagram/oauth/callback
   META_INSTAGRAM_WEBHOOK_VERIFY_TOKEN=<a new random secret>
   META_INSTAGRAM_OAUTH_STATE_SECRET=<a separate new random secret>
   META_INSTAGRAM_API_VERSION=v24.0
   ```

   `META_INSTAGRAM_OAUTH_STATE_SECRET` may be generated with `openssl rand -hex 32`. It protects the short-lived OAuth state value; it is never sent to the browser.

## Test connection

1. Use an Instagram **Business or Creator** account that you control. When the Meta app is still in development, make sure the person who authorizes it is assigned to an app role that can test the app.
2. Open Contour Scottsdale → Mission → Conversations and press **Connect Instagram**.
3. Complete the Meta/Instagram authorization window. ConversionHero exchanges the short-lived token for a server-side long-lived token, confirms the professional account, and subscribes that account to the configured webhook.
4. Send the connected account a Direct Message from a second Instagram account. The message should arrive in Conversations. A reply may only be sent during Meta's permitted messaging window.

No access token should be pasted into ConversionHero, chat, or a browser field. The `instagram_connections` table is service-role only, and its credentials are not browser-readable.
