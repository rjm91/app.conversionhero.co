// Marketing-source attribution — plain module usable from BOTH client
// components and server routes (the cron watcher). Canonical copy of the
// logic in components/EcomControlCenter.js; keep the two in sync until the
// component is migrated to import from here.

// Shopify sales-channel ids confirmed via channelInformation:
//   2329312 = Facebook & Instagram channel, 3890849 = Shop app.
export const CHANNEL_BY_SOURCENAME = {
  '2329312': 'Meta',
  '3890849': 'Shop',
}

// Detect an ad platform in a single attribution string (source/medium/campaign).
export function platformOf(str) {
  const s = (str || '').toLowerCase()
  if (/facebook|meta|instagram|\bfb\b|\big\b/.test(s)) return 'Meta'
  if (/google|adwords|gads|youtube/.test(s))    return 'Google'
  return null
}

const prettySource = (source) => String(source).replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

// Classify ONE attribution touch. The explicit source is authoritative: a
// Klaviyo source stays Klaviyo even if its campaign name mentions Google or
// Meta. Campaign/content are only fallbacks when source and medium are absent.
function touchChannel(source, medium, campaign, content) {
  const src = String(source || '').trim()
  const srcLower = src.toLowerCase()
  if (src) {
    if (/klaviyo|mailchimp|sendgrid|newsletter|email/.test(srcLower)) return 'Klaviyo'
    const paid = platformOf(src)
    if (paid) return paid
    if (/shop_app|shopapp|\bshop\b/.test(srcLower)) return 'Shop'
    return prettySource(src)
  }

  const med = String(medium || '').trim().toLowerCase()
  if (/klaviyo|mailchimp|sendgrid|newsletter|email/.test(med)) return 'Klaviyo'
  const paidMedium = platformOf(med)
  if (paidMedium) return paidMedium
  const paidFallback = platformOf([campaign, content].filter(Boolean).join(' '))
  return paidFallback || null
}

// LAST-TOUCH RULE. Shopify's merged top-level UTM is already last-visit first
// (then first-visit fallback), so it wins. Explicit last and first fields cover
// older rows and make the precedence auditable. An owned/organic last touch can
// never be pulled into Google/Meta merely because an earlier paid touch exists.
export function deriveChannel(o) {
  const merged = touchChannel(o.utm_source, o.utm_medium, o.utm_campaign, o.utm_content)
  if (merged) return merged
  const last = touchChannel(o.last_utm_source, o.last_utm_medium, o.last_utm_campaign, o.last_utm_content)
  if (last) return last
  const first = touchChannel(o.first_utm_source, o.first_utm_medium, o.first_utm_campaign, o.first_utm_content)
  if (first) return first
  const ch = o.shopify_channel
  if (ch && CHANNEL_BY_SOURCENAME[ch]) return CHANNEL_BY_SOURCENAME[ch]
  if (ch === 'Online Store') return 'Direct'
  return ch || 'Other'
}

const PAID_CHANNELS = new Set(['Google', 'Meta', 'TikTok'])
export function isPaidOrder(o) { return PAID_CHANNELS.has(deriveChannel(o)) }
