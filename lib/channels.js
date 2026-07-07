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
  if (/facebook|meta|instagram|\bfb\b/.test(s)) return 'Meta'
  if (/google|adwords|gads|youtube/.test(s))    return 'Google'
  return null
}

// RULE: if Google or Facebook appears ANYWHERE in the journey (first OR last
// visit, or the merged top-level UTM), attribute the order to that platform —
// even if the last click was email/Klaviyo.
export function deriveChannel(o) {
  const sd = o.shopify_data || {}
  const lastP   = platformOf([sd.last_utm?.source,  sd.last_utm?.medium,  sd.last_utm?.campaign].join(' '))
  const firstP  = platformOf([sd.first_utm?.source, sd.first_utm?.medium, sd.first_utm?.campaign].join(' '))
  const mergedP = platformOf([o.utm_source, o.utm_medium, o.utm_campaign, o.utm_content].join(' '))
  const platform = lastP || firstP || mergedP
  if (platform) return platform
  const blob = [o.utm_source, o.utm_medium, sd.first_utm?.source, sd.first_utm?.medium, sd.last_utm?.source, sd.last_utm?.medium]
    .filter(Boolean).join(' ').toLowerCase()
  if (/klaviyo|mailchimp|sendgrid|newsletter|email/.test(blob)) return 'Klaviyo'
  if (/shop_app|shopapp|\bshop\b/.test(blob)) return 'Shop'
  if (o.utm_source) return o.utm_source.replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  const ch = sd.channel
  if (ch && CHANNEL_BY_SOURCENAME[ch]) return CHANNEL_BY_SOURCENAME[ch]
  if (ch === 'Online Store') return 'Direct'
  return ch || 'Other'
}

const PAID_CHANNELS = new Set(['Google', 'Meta', 'TikTok'])
export function isPaidOrder(o) { return PAID_CHANNELS.has(deriveChannel(o)) }
