#!/usr/bin/env node

/**
 * Google OAuth2 Refresh Token Generator
 *
 * Usage:
 *   node scripts/get-google-refresh-token.js
 *
 * Prerequisites:
 *   - GOOGLE_ADS_CLIENT_ID and GOOGLE_ADS_CLIENT_SECRET in .env.local
 *   - OAuth consent screen published (not "Testing") in Google Cloud Console
 *
 * Steps:
 *   1. Run this script
 *   2. Open the URL it prints in your browser
 *   3. Sign in and authorize
 *   4. Copy the code from the redirect URL
 *   5. Paste it back into the terminal
 *   6. Script outputs the refresh token — paste into .env.local and Vercel
 */

const http = require('http')
const { URL } = require('url')
const fs = require('fs')
const path = require('path')
const readline = require('readline')

// Load .env.local
const envPath = path.resolve(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n')
  for (const line of lines) {
    const match = line.match(/^([^#=]+)=(.*)$/)
    if (match) process.env[match[1].trim()] = match[2].trim()
  }
}

const CLIENT_ID = process.env.GOOGLE_ADS_CLIENT_ID
const CLIENT_SECRET = process.env.GOOGLE_ADS_CLIENT_SECRET

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Missing GOOGLE_ADS_CLIENT_ID or GOOGLE_ADS_CLIENT_SECRET in .env.local')
  process.exit(1)
}

const REDIRECT_URI = 'http://localhost:9876/oauth-callback'
const SCOPES = 'https://www.googleapis.com/auth/adwords'

const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` + new URLSearchParams({
  client_id: CLIENT_ID,
  redirect_uri: REDIRECT_URI,
  response_type: 'code',
  scope: SCOPES,
  access_type: 'offline',
  prompt: 'consent', // Force new refresh token
}).toString()

console.log('\n=== Google OAuth2 Refresh Token Generator ===\n')
console.log('1. Open this URL in your browser:\n')
console.log(`   ${authUrl}\n`)
console.log('2. Sign in with the Google account that manages your Google Ads\n')
console.log('3. After authorizing, you\'ll be redirected. The token will be captured automatically.\n')
console.log('Starting local server on http://localhost:9876 ...\n')

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:9876`)

  if (url.pathname === '/oauth-callback') {
    const code = url.searchParams.get('code')
    const error = url.searchParams.get('error')

    if (error) {
      res.writeHead(400, { 'Content-Type': 'text/html' })
      res.end(`<h1>Error: ${error}</h1><p>Try again.</p>`)
      console.error('OAuth error:', error)
      server.close()
      process.exit(1)
    }

    if (!code) {
      res.writeHead(400, { 'Content-Type': 'text/html' })
      res.end('<h1>No code received</h1>')
      return
    }

    // Exchange code for tokens
    try {
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          code,
          grant_type: 'authorization_code',
          redirect_uri: REDIRECT_URI,
        }),
      })

      const tokenData = await tokenRes.json()

      if (tokenData.refresh_token) {
        console.log('\n✅ SUCCESS! Here is your refresh token:\n')
        console.log(`   ${tokenData.refresh_token}\n`)

        // Auto-seed to production DB if SEED_SECRET and APP_URL are set
        if (process.env.SEED_SECRET && process.env.APP_URL) {
          try {
            const seedRes = await fetch(`${process.env.APP_URL}/api/google-ads/seed`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                secret: process.env.SEED_SECRET,
                refresh_token: tokenData.refresh_token,
              }),
            })
            const seedData = await seedRes.json()
            if (seedData.success) {
              console.log('✅ Auto-seeded to production database (google_ads_tokens table)\n')
            } else {
              console.log('⚠️  Auto-seed failed:', seedData.error)
              console.log('   You can manually seed via POST /api/google-ads/seed\n')
            }
          } catch (e) {
            console.log('⚠️  Auto-seed error:', e.message, '\n')
          }
        } else {
          console.log('To seed to production, POST to /api/google-ads/seed:')
          console.log(`  curl -X POST $APP_URL/api/google-ads/seed \\`)
          console.log(`    -H "Content-Type: application/json" \\`)
          console.log(`    -d '{"secret":"<SEED_SECRET>","refresh_token":"${tokenData.refresh_token}"}'\n`)
        }

        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(`
          <html><body style="font-family: system-ui; max-width: 600px; margin: 40px auto; padding: 20px;">
            <h1 style="color: #34CC93;">✅ Refresh Token Generated!</h1>
            <p>Your refresh token has been printed in the terminal.</p>
            <p>Copy it and update:</p>
            <ol>
              <li><code>.env.local</code> → <code>GOOGLE_ADS_REFRESH_TOKEN</code></li>
              <li>Vercel → Settings → Environment Variables</li>
            </ol>
            <p style="color: #888;">You can close this tab.</p>
          </body></html>
        `)
      } else {
        console.error('\n❌ No refresh token in response:', JSON.stringify(tokenData, null, 2))
        console.log('\nThis usually means:')
        console.log('  - The OAuth consent screen is in "Testing" mode')
        console.log('  - Or the user already authorized and Google skipped the consent prompt')
        console.log('  - Try revoking access at https://myaccount.google.com/permissions then retry\n')

        res.writeHead(400, { 'Content-Type': 'text/html' })
        res.end(`<h1>No refresh token</h1><p>Check the terminal for details.</p>`)
      }
    } catch (err) {
      console.error('Token exchange error:', err)
      res.writeHead(500, { 'Content-Type': 'text/html' })
      res.end(`<h1>Error</h1><pre>${err.message}</pre>`)
    }

    server.close()
    setTimeout(() => process.exit(0), 1000)
    return
  }

  res.writeHead(404)
  res.end('Not found')
})

server.listen(9876, () => {
  console.log('Waiting for OAuth callback...\n')
})
