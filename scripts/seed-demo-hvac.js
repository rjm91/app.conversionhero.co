/**
 * Seed a demo HVAC client account (ch1000) with realistic data.
 * Run: node scripts/seed-demo-hvac.js
 */

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

const CLIENT_ID = 'ch1000'
const CLIENT_NAME = 'Comfort Pro HVAC'
const NOW = new Date()

function daysAgo(n) {
  const d = new Date(NOW)
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

function dateStr(d) { return d.toISOString().split('T')[0] }
function ts(daysBack) {
  const d = new Date(NOW)
  d.setDate(d.getDate() - daysBack)
  return d.toISOString()
}

// Random helpers
function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)] }

async function main() {
  console.log('🔧 Seeding demo HVAC account:', CLIENT_ID)

  // ── 1. Create client ──
  const { error: clientErr } = await supabase.from('client').upsert({
    client_id: CLIENT_ID,
    client_name: CLIENT_NAME,
    industry: 'HVAC',
    city: 'Nashville',
    state: 'TN',
    status: 'Active',
  }, { onConflict: 'client_id' })
  if (clientErr) console.error('Client insert error:', clientErr)
  else console.log('✓ Client created:', CLIENT_NAME)

  // ── 2. Create leads ──
  const firstNames = ['James', 'Sarah', 'Michael', 'Jennifer', 'Robert', 'Amanda', 'David', 'Emily', 'Chris', 'Jessica', 'Brian', 'Ashley', 'Kevin', 'Megan', 'Jason', 'Nicole', 'Mark', 'Stephanie', 'Brandon', 'Lauren']
  const lastNames = ['Thompson', 'Garcia', 'Williams', 'Johnson', 'Brown', 'Davis', 'Wilson', 'Martinez', 'Anderson', 'Taylor', 'Moore', 'Jackson', 'White', 'Harris', 'Martin', 'Lee', 'Walker', 'Hall', 'Allen', 'Young']
  const cities = ['Nashville', 'Franklin', 'Murfreesboro', 'Brentwood', 'Hendersonville', 'Mount Juliet', 'Gallatin', 'Lebanon', 'Smyrna', 'Spring Hill']
  const streets = ['Oak St', 'Maple Dr', 'Cedar Ln', 'Pine Ave', 'Elm Blvd', 'Hickory Ct', 'Walnut Way', 'Birch Rd', 'Willow Creek Dr', 'Magnolia Pl']

  const leadConfigs = [
    // Sold customers (8) — spread across 60 days
    { daysBack: 58, status: 'Contacted / Working', appt: 'Appt Complete', sale: 'Sold', amount: 8500, camp: '90001' },
    { daysBack: 55, status: 'Contacted / Working', appt: 'Appt Complete', sale: 'Sold', amount: 12000, camp: '90002' },
    { daysBack: 48, status: 'Contacted / Working', appt: 'Appt Complete', sale: 'Sold', amount: 6800, camp: '90001' },
    { daysBack: 42, status: 'Contacted / Working', appt: 'Appt Complete', sale: 'Sold', amount: 15500, camp: '90003' },
    { daysBack: 35, status: 'Contacted / Working', appt: 'Appt Complete', sale: 'Sold', amount: 9200, camp: '90002' },
    { daysBack: 22, status: 'Contacted / Working', appt: 'Appt Complete', sale: 'Sold', amount: 7400, camp: '90002' },
    { daysBack: 14, status: 'Contacted / Working', appt: 'Appt Complete', sale: 'Sold', amount: 11000, camp: '90001' },
    { daysBack: 10, status: 'Contacted / Working', appt: 'Appt Complete', sale: 'Sold', amount: 8900, camp: '90003' },
    // Appt complete but not sold yet (4)
    { daysBack: 30, status: 'Contacted / Working', appt: 'Appt Complete', sale: 'NA', amount: null, camp: '90001' },
    { daysBack: 20, status: 'Contacted / Working', appt: 'Appt Complete', sale: 'NA', amount: null, camp: '90002' },
    { daysBack: 16, status: 'Contacted / Working', appt: 'Appt Complete', sale: 'NA', amount: null, camp: '90003' },
    { daysBack: 8, status: 'Contacted / Working', appt: 'Appt Complete', sale: 'NA', amount: null, camp: '90005' },
    // Appt set / confirmed (5)
    { daysBack: 9, status: 'Appt Set', appt: 'Appt Confirmed', sale: 'NA', amount: null, camp: '90001' },
    { daysBack: 7, status: 'Appt Set', appt: 'Appt Confirmed', sale: 'NA', amount: null, camp: '90002' },
    { daysBack: 5, status: 'Appt Set', appt: 'Appt Confirmed', sale: 'NA', amount: null, camp: '90003' },
    { daysBack: 4, status: 'Appt Set', appt: 'Appt Confirmed', sale: 'NA', amount: null, camp: '90005' },
    { daysBack: 3, status: 'Appt Set', appt: 'Appt Confirmed', sale: 'NA', amount: null, camp: '90001' },
    // Contacted / Working (6)
    { daysBack: 12, status: 'Contacted / Working', appt: 'NA', sale: 'NA', amount: null, camp: '90002' },
    { daysBack: 11, status: 'Contacted / Working', appt: 'NA', sale: 'NA', amount: null, camp: '90001' },
    { daysBack: 7, status: 'Contacted / Working', appt: 'NA', sale: 'NA', amount: null, camp: '90003' },
    { daysBack: 6, status: 'Contacted / Working', appt: 'NA', sale: 'NA', amount: null, camp: '90005' },
    { daysBack: 4, status: 'Contacted / Working', appt: 'NA', sale: 'NA', amount: null, camp: '90002' },
    { daysBack: 2, status: 'Contacted / Working', appt: 'NA', sale: 'NA', amount: null, camp: '90001' },
    // New leads (7)
    { daysBack: 5, status: 'New / Not Yet Contacted', appt: 'NA', sale: 'NA', amount: null, camp: '90002' },
    { daysBack: 4, status: 'New / Not Yet Contacted', appt: 'NA', sale: 'NA', amount: null, camp: '90001' },
    { daysBack: 3, status: 'New / Not Yet Contacted', appt: 'NA', sale: 'NA', amount: null, camp: '90003' },
    { daysBack: 2, status: 'New / Not Yet Contacted', appt: 'NA', sale: 'NA', amount: null, camp: '90005' },
    { daysBack: 1, status: 'New / Not Yet Contacted', appt: 'NA', sale: 'NA', amount: null, camp: '90001' },
    { daysBack: 1, status: 'New / Not Yet Contacted', appt: 'NA', sale: 'NA', amount: null, camp: '90002' },
    { daysBack: 0, status: 'New / Not Yet Contacted', appt: 'NA', sale: 'NA', amount: null, camp: '90003' },
    // Lost / disqualified (3)
    { daysBack: 40, status: 'Lost', appt: 'NA', sale: 'NA', amount: null, camp: '90001' },
    { daysBack: 25, status: 'Disqualified', appt: 'NA', sale: 'NA', amount: null, camp: '90002' },
    { daysBack: 15, status: 'Out of Area', appt: 'NA', sale: 'NA', amount: null, camp: '90003' },
  ]

  // Delete existing demo leads
  await supabase.from('client_lead').delete().eq('client_id', CLIENT_ID)

  const leads = []
  for (let i = 0; i < leadConfigs.length; i++) {
    const cfg = leadConfigs[i]
    const fn = firstNames[i % firstNames.length]
    const ln = lastNames[i % lastNames.length]
    const city = pick(cities)
    leads.push({
      client_id: CLIENT_ID,
      first_name: fn,
      last_name: ln,
      email: `${fn.toLowerCase()}.${ln.toLowerCase()}@example.com`,
      phone: `615-${rand(200,999)}-${rand(1000,9999)}`,
      address: `${rand(100,9999)} ${pick(streets)}`,
      city,
      state: 'TN',
      zip_code: `3${rand(7100,7999)}`,
      lead_status: cfg.status,
      appt_status: cfg.appt,
      sale_status: cfg.sale,
      sale_amount: cfg.amount,
      appt_date: cfg.appt !== 'NA' ? daysAgo(cfg.daysBack - 2) : null,
      utm_source: 'google',
      utm_medium: 'cpc',
      utm_campaign: cfg.camp,
      utm_adgroup: `${cfg.camp}0${rand(1, 2)}`,
      utm_content: `${cfg.camp}0${rand(1, 2)}0${rand(1, 2)}`,
      created_at: ts(cfg.daysBack),
    })
  }

  const { data: insertedLeads, error: leadsErr } = await supabase.from('client_lead').insert(leads).select('lead_id')
  if (leadsErr) console.error('Leads insert error:', leadsErr)
  else console.log(`✓ ${leads.length} leads created`)

  // ── 3. Create lead meta (survey responses) ──
  if (insertedLeads?.length) {
    const metaRows = []
    const intents = ['Replace', 'Fix (if possible)', 'Replace', 'New Installation', 'Fix (if possible)']
    const systemTypes = ['Central AC', 'Heat Pump', 'Furnace + AC', 'Ductless / Mini-Split', 'Not sure']
    const ages = ['Less than 3 years', '3-7 years', '7-12 years', '12+ years', "I don't know"]

    for (const lead of insertedLeads) {
      metaRows.push(
        { lead_id: lead.lead_id, meta_key: 'intent', meta_value: pick(intents) },
        { lead_id: lead.lead_id, meta_key: 'system_type', meta_value: pick(systemTypes) },
        { lead_id: lead.lead_id, meta_key: 'system_age', meta_value: pick(ages) },
      )
    }

    const { error: metaErr } = await supabase.from('client_lead_meta').insert(metaRows)
    if (metaErr) console.error('Lead meta insert error:', metaErr)
    else console.log(`✓ ${metaRows.length} lead meta rows created`)
  }

  // ── 4. Create YouTube Ads campaign data ──
  const CUSTOMER_ID = '9999999999' // fake Google Ads customer ID
  const START = daysAgo(60)
  const END = daysAgo(0)

  // Delete existing demo ad data
  await supabase.from('client_yt_campaigns').delete().eq('client_id', CLIENT_ID)
  await supabase.from('client_yt_ad_groups').delete().eq('client_id', CLIENT_ID)
  await supabase.from('client_yt_ads').delete().eq('client_id', CLIENT_ID)

  const campaigns = [
    { id: '90001', name: `${CLIENT_ID} | HVAC Repair | Nashville (25-54) | Video Ads | Launched 2026-03-15`, status: 'ENABLED', budget: 50, type: 'VIDEO', avgDaily: 42 },
    { id: '90002', name: `${CLIENT_ID} | AC Replacement | Middle TN (35-65+) | Video Ads | Launched 2026-04-01`, status: 'ENABLED', budget: 75, type: 'VIDEO', avgDaily: 68 },
    { id: '90003', name: `${CLIENT_ID} | Furnace Install | Nashville Metro | Demand Gen | Launched 2026-03-20`, status: 'ENABLED', budget: 40, type: 'DEMAND_GEN', avgDaily: 35 },
    { id: '90004', name: `${CLIENT_ID} - Broad - HVAC Emergency - Launched 2026-02-15`, status: 'PAUSED', budget: 30, type: 'VIDEO', avgDaily: 0 },
    { id: '90005', name: `${CLIENT_ID} - Ductless Mini Split - Nashville - Launched 2026-04-10`, status: 'ENABLED', budget: 25, type: 'VIDEO', avgDaily: 20 },
  ]

  const campaignRows = []
  const adGroupRows = []
  const adRows = []

  for (const camp of campaigns) {
    // Generate daily rows for 60 days
    for (let d = 0; d <= 60; d++) {
      const date = daysAgo(60 - d)
      const isActive = camp.status === 'ENABLED'
      // Paused campaigns: no spend
      const dailyCost = isActive ? Math.max(0, camp.avgDaily + (Math.random() * 20 - 10)) : 0
      const dailyClicks = isActive ? Math.round(dailyCost / (2.5 + Math.random())) : 0
      const dailyConv = isActive && dailyCost > 30 ? (Math.random() < 0.15 ? 1 : 0) : 0

      campaignRows.push({
        client_id: CLIENT_ID,
        customer_id: CUSTOMER_ID,
        campaign_id: camp.id,
        campaign_name: camp.name,
        status: camp.status,
        channel_type: camp.type,
        budget: camp.budget,
        cost: Math.round(dailyCost * 100) / 100,
        clicks: dailyClicks,
        cpc: dailyClicks > 0 ? Math.round((dailyCost / dailyClicks) * 100) / 100 : 0,
        conversions: dailyConv,
        cost_per_conversion: dailyConv > 0 ? Math.round((dailyCost / dailyConv) * 100) / 100 : 0,
        date,
        date_range_start: START,
        date_range_end: END,
        synced_at: new Date().toISOString(),
      })
    }

    // Ad groups (2-3 per campaign)
    const agNames = camp.type === 'DEMAND_GEN'
      ? ['Discovery Feed', 'Gmail Placements']
      : ['In-Stream Skippable', 'In-Stream Non-Skip', 'Bumper 6s']

    for (let ag = 0; ag < agNames.length; ag++) {
      const agId = `${camp.id}0${ag + 1}`
      for (let d = 0; d <= 60; d++) {
        const date = daysAgo(60 - d)
        const isActive = camp.status === 'ENABLED'
        const cost = isActive ? Math.max(0, (camp.avgDaily / agNames.length) + (Math.random() * 8 - 4)) : 0
        const clicks = isActive ? Math.round(cost / (2.8 + Math.random())) : 0
        const conv = isActive && cost > 15 ? (Math.random() < 0.1 ? 1 : 0) : 0

        adGroupRows.push({
          client_id: CLIENT_ID,
          customer_id: CUSTOMER_ID,
          campaign_id: camp.id,
          ad_group_id: agId,
          ad_group_name: agNames[ag],
          status: camp.status,
          cost: Math.round(cost * 100) / 100,
          clicks,
          cpc: clicks > 0 ? Math.round((cost / clicks) * 100) / 100 : 0,
          conversions: conv,
          cost_per_conversion: conv > 0 ? Math.round((cost / conv) * 100) / 100 : 0,
          date,
          date_range_start: START,
          date_range_end: END,
          synced_at: new Date().toISOString(),
        })
      }

      // Ads (1-2 per ad group)
      const adNames = ['HVAC Hero – 30s Testimonial', 'Comfort Guaranteed – 15s CTA']
      for (let a = 0; a < Math.min(2, adNames.length); a++) {
        const adId = `${agId}0${a + 1}`
        for (let d = 0; d <= 60; d++) {
          const date = daysAgo(60 - d)
          const isActive = camp.status === 'ENABLED'
          const cost = isActive ? Math.max(0, (camp.avgDaily / (agNames.length * 2)) + (Math.random() * 4 - 2)) : 0
          const clicks = isActive ? Math.round(cost / (3 + Math.random())) : 0
          const conv = isActive && cost > 10 ? (Math.random() < 0.08 ? 1 : 0) : 0

          adRows.push({
            client_id: CLIENT_ID,
            customer_id: CUSTOMER_ID,
            campaign_id: camp.id,
            ad_group_id: agId,
            ad_id: adId,
            ad_name: adNames[a],
            ad_type: 'VIDEO',
            status: camp.status,
            youtube_video_id: null,
            cost: Math.round(cost * 100) / 100,
            clicks,
            cpc: clicks > 0 ? Math.round((cost / clicks) * 100) / 100 : 0,
            conversions: conv,
            cost_per_conversion: conv > 0 ? Math.round((cost / conv) * 100) / 100 : 0,
            date,
            date_range_start: START,
            date_range_end: END,
            synced_at: new Date().toISOString(),
          })
        }
      }
    }
  }

  // Insert in batches (Supabase has row limits)
  for (let i = 0; i < campaignRows.length; i += 500) {
    const { error } = await supabase.from('client_yt_campaigns').insert(campaignRows.slice(i, i + 500))
    if (error) { console.error('Campaign insert error:', error); break }
  }
  console.log(`✓ ${campaignRows.length} campaign daily rows created (${campaigns.length} campaigns)`)

  for (let i = 0; i < adGroupRows.length; i += 500) {
    const { error } = await supabase.from('client_yt_ad_groups').insert(adGroupRows.slice(i, i + 500))
    if (error) { console.error('Ad group insert error:', error); break }
  }
  console.log(`✓ ${adGroupRows.length} ad group daily rows created`)

  for (let i = 0; i < adRows.length; i += 500) {
    const { error } = await supabase.from('client_yt_ads').insert(adRows.slice(i, i + 500))
    if (error) { console.error('Ad insert error:', error); break }
  }
  console.log(`✓ ${adRows.length} ad daily rows created`)

  // ── 5. Summary ──
  const totalSpend = campaignRows.reduce((s, r) => s + r.cost, 0)
  const totalConv = campaignRows.reduce((s, r) => s + r.conversions, 0)
  const soldCount = leadConfigs.filter(l => l.sale === 'Sold').length
  const revenue = leadConfigs.filter(l => l.sale === 'Sold').reduce((s, l) => s + l.amount, 0)

  console.log('\n📊 Demo Account Summary:')
  console.log(`   Client: ${CLIENT_NAME} (${CLIENT_ID})`)
  console.log(`   URL: /control/${CLIENT_ID}/dashboard`)
  console.log(`   Leads: ${leads.length} (${soldCount} sold, $${revenue.toLocaleString()} revenue)`)
  console.log(`   Ad Spend: $${Math.round(totalSpend).toLocaleString()} over 60 days`)
  console.log(`   Conversions: ${totalConv}`)
  console.log(`   Campaigns: ${campaigns.length} (${campaigns.filter(c => c.status === 'ENABLED').length} active, ${campaigns.filter(c => c.status === 'PAUSED').length} paused)`)
  console.log('\n✅ Done! Visit /control/ch1000/dashboard to see the demo.')
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
