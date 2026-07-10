import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import { createClient } from '../../../../lib/supabase-server'
import { userCanAccessClient } from '../../../../lib/access'
import { userCanUseQueries } from '../../../../lib/mission/authority'
import { getAgentDb, runAgentQuery, agentSchemaPrompt } from '../../../../lib/mission/agent-db'
import { recallMemories, rememberMemory } from '../../../../lib/mission/memory'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MODEL = 'claude-opus-4-8'
const MAX_QUERIES_PER_ASK = 6   // per-turn budget (decision 2b) — runaway agents surface as errors
const MAX_TOOL_ROUNDS = 8

// UI-only tools. The dashboard executes these in front of the user — they
// move things around INSIDE the IDE (tabs, cards, local ledger). None of
// them can touch ad platforms, money, or the database.
const TOOLS = [
  {
    name: 'open_tab',
    description: 'Open a view tab in the IDE for the user. Use when they ask to see or go to a surface (campaigns, orders, ledger, manual…).',
    input_schema: {
      type: 'object',
      properties: { view: { type: 'string', enum: ['overview', 'google', 'meta', 'orders', 'klaviyo', 'manual', 'ledger', 'policies'] } },
      required: ['view'],
    },
  },
  {
    name: 'set_range',
    description: 'Change the date window the whole IDE is looking at. Use `days` for a rolling lookback, or `preset` for a calendar window.',
    input_schema: {
      type: 'object',
      properties: {
        days: { type: 'integer', enum: [7, 14, 30, 90] },
        preset: { type: 'string', enum: ['today', 'yesterday', 'this_month', 'last_month', 'this_year', 'last_year', 'all_time'] },
      },
    },
  },
  {
    name: 'reopen_decision',
    description: 'Local undo: move a previously approved decision from the Ledger back to PROBLEMS as an open card the user can approve or dismiss again. Nothing touches ad platforms. Use when the user asks to undo, revert, or reopen a decision.',
    input_schema: {
      type: 'object',
      properties: { match: { type: 'string', description: 'substring of the decision text to identify it; omit to reopen the most recent decision' } },
      required: [],
    },
  },
  {
    name: 'render_view',
    description: 'Render a chart or table NATIVELY in the terminal instead of describing numbers in prose. Use whenever the user asks to compare, chart, visualize, trend, or break down data. Every value must come from (or be arithmetic on) the provided data. Prefer this over long bullet lists of numbers.',
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['bar', 'line', 'table'] },
        title: { type: 'string' },
        bars: { type: 'array', description: 'for type=bar', items: { type: 'object', properties: { label: { type: 'string' }, value: { type: 'number' }, text: { type: 'string', description: 'formatted value shown at bar end, e.g. "$8,136" or "4.17x"' } }, required: ['label', 'value'] } },
        line: { type: 'object', description: 'for type=line', properties: { labels: { type: 'array', items: { type: 'string' } }, series: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, values: { type: 'array', items: { type: 'number' } } }, required: ['name', 'values'] } } }, required: ['labels', 'series'] },
        table: { type: 'object', description: 'for type=table', properties: { head: { type: 'array', items: { type: 'string' } }, rows: { type: 'array', items: { type: 'array', items: { type: 'string' } } } }, required: ['head', 'rows'] },
      },
      required: ['type', 'title'],
    },
  },
  {
    name: 'query_data',
    description: 'Query the client\'s live database (their tenant only — enforced by row-level security). Use when the provided context JSON cannot answer the question: individual orders, customer fields, zip codes, ad-group/ad level stats, date ranges outside the loaded window, etc. TWO MODES: raw rows (default, capped at 200 — good for "show me" / "top N by a column"), or aggregate (group_by + metrics — scans up to 10,000 rows server-side and returns compact groups; ALWAYS use this for counts/sums/averages over a period, never sample raw rows and extrapolate). Prefer the context JSON when it already has the answer.',
    input_schema: {
      type: 'object',
      properties: {
        table: { type: 'string', description: 'one of the tables in your SCHEMA' },
        select: { type: 'array', items: { type: 'string' }, description: 'columns to return; omit for all. Keep narrow — big rows waste your context.' },
        filters: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              column: { type: 'string' },
              op: { type: 'string', enum: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'in', 'is'] },
              value: { description: 'string/number; array for op=in; use ISO timestamps for created_at' },
            },
            required: ['column', 'op'],
          },
        },
        order: { type: 'object', properties: { column: { type: 'string' }, ascending: { type: 'boolean' } } },
        limit: { type: 'integer', description: 'max rows (server caps at 200; ignored in aggregate mode)' },
        aggregate: {
          type: 'object',
          description: 'group-by mode: returns {groups:[{<group_by>, count, sum_<col>, …}], rows_scanned}. Use for any count/sum/avg question.',
          properties: {
            group_by: { type: 'string', description: 'column to group on' },
            metrics: { type: 'array', items: { type: 'object', properties: { op: { type: 'string', enum: ['count', 'sum', 'avg', 'min', 'max'] }, column: { type: 'string', description: 'omit for count' } }, required: ['op'] } },
            top: { type: 'integer', description: 'return top N groups (max 50), sorted by the first non-count metric, else count' },
          },
          required: ['group_by'],
        },
      },
      required: ['table'],
    },
  },
  {
    name: 'build_campaign',
    description: "Draft one or more Google Ads Search campaigns into the terminal's Campaign Builder sheet. Use whenever the user asks to build, create, or add a campaign, ad group, keywords, or ads. Generate COMPLETE, ready-to-use structure: keywords with match types, and Responsive Search Ads with 10-15 distinct headlines (each ≤30 chars) and 3-4 descriptions (each ≤90 chars). Ground the targeting/copy in what you know about this client from the data and their funnels. This fills a sheet the user reviews, edits, and exports as a Google Ads Editor CSV — it does NOT publish to Google Ads. Each call ADDS campaigns to the sheet.",
    input_schema: {
      type: 'object',
      properties: {
        campaigns: {
          type: 'array',
          description: 'One or more campaigns to add to the sheet.',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Descriptive campaign name, e.g. NonBrand_Search_ShieldTech_US' },
              status: { type: 'string', enum: ['Paused', 'Enabled'], description: 'Defaults to Paused.' },
              bidStrategy: { type: 'string', description: 'e.g. Maximize clicks, Maximize conversions, Manual CPC' },
              adGroups: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    keywords: {
                      type: 'array',
                      items: { type: 'object', properties: { text: { type: 'string' }, matchType: { type: 'string', enum: ['Exact', 'Phrase', 'Broad'] } }, required: ['text'] },
                    },
                    ads: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          headlines: { type: 'array', items: { type: 'string' }, description: '10-15 headlines, each ≤30 chars' },
                          descriptions: { type: 'array', items: { type: 'string' }, description: '3-4 descriptions, each ≤90 chars' },
                          path1: { type: 'string', description: 'Display path 1, ≤15 chars (optional)' },
                          path2: { type: 'string', description: 'Display path 2, ≤15 chars (optional)' },
                          finalUrl: { type: 'string', description: "Landing page URL — the client's funnel if known, else blank." },
                        },
                      },
                    },
                  },
                  required: ['name'],
                },
              },
            },
            required: ['name', 'adGroups'],
          },
        },
      },
      required: ['campaigns'],
    },
  },
  {
    name: 'build_meta_campaign',
    description: "Draft one or more Meta (Facebook/Instagram) ad campaigns into the terminal's Campaign Builder. Meta is structured differently from Google — NO keywords. Structure: Campaign (objective) → Ad Set (audience + budget + optimization) → Ad (creative copy). Generate complete, ready-to-review structure grounded in this client's data, products, and funnels. You draft the targeting and copy; the user reviews and pushes it to Meta (all campaigns land Paused). You describe the creative (image/video) in creativeNote since you can't produce the asset. Each call ADDS campaigns to the Meta sheet.",
    input_schema: {
      type: 'object',
      properties: {
        campaigns: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'e.g. Prospecting_Sales_ShieldTech_US' },
              objective: { type: 'string', enum: ['OUTCOME_SALES', 'OUTCOME_LEADS', 'OUTCOME_TRAFFIC', 'OUTCOME_AWARENESS', 'OUTCOME_ENGAGEMENT'], description: 'campaign objective' },
              status: { type: 'string', enum: ['Paused', 'Active'], description: 'defaults to Paused' },
              dailyBudget: { type: 'number', description: 'daily budget in USD (whole dollars)' },
              adSets: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    optimizationGoal: { type: 'string', enum: ['OFFSITE_CONVERSIONS', 'LINK_CLICKS', 'LANDING_PAGE_VIEWS', 'REACH', 'IMPRESSIONS'], description: 'what the ad set optimizes for' },
                    audience: {
                      type: 'object',
                      properties: {
                        locations: { type: 'string', description: 'e.g. "United States" or specific states/DMAs' },
                        ageMin: { type: 'integer' }, ageMax: { type: 'integer' },
                        genders: { type: 'string', enum: ['All', 'Men', 'Women'] },
                        interests: { type: 'array', items: { type: 'string' }, description: 'interest/behavior targeting terms' },
                        note: { type: 'string', description: 'custom/lookalike audience notes if relevant' },
                      },
                    },
                    placements: { type: 'string', description: 'e.g. "Automatic" or "Feeds + Reels"' },
                    ads: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          name: { type: 'string' },
                          primaryText: { type: 'string', description: 'the main ad body copy' },
                          headline: { type: 'string', description: 'short headline (~40 chars)' },
                          description: { type: 'string', description: 'link description (~30 chars, optional)' },
                          finalUrl: { type: 'string', description: "landing page — the client's funnel if known" },
                          creativeNote: { type: 'string', description: 'describe the image/video the user should supply (you cannot create the asset)' },
                        },
                        required: ['primaryText', 'headline'],
                      },
                    },
                  },
                  required: ['name'],
                },
              },
            },
            required: ['name', 'objective', 'adSets'],
          },
        },
      },
      required: ['campaigns'],
    },
  },
  {
    name: 'remember',
    description: "Save a durable memory about this client for future sessions. Use ONLY for things the database can't answer: a stated preference (\"hates video ads\"), context (\"Q4 is their peak season\"), an external fact (\"supplier raised prices in June\"), or the reasoning behind a decision. NEVER memorize metrics, counts, or revenue — those are always queried fresh. Save when the user tells you something worth keeping, or explicitly asks you to remember. One clear fact per call.",
    input_schema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'the fact, self-contained (one sentence)' },
        kind: { type: 'string', enum: ['preference', 'context', 'external', 'decision', 'insight'] },
        source: { type: 'string', description: 'where it came from, e.g. "user told me 2026-07-08"' },
      },
      required: ['content'],
    },
  },
  {
    name: 'draft_finding',
    description: 'Draft a NEW action card into PROBLEMS for the user to approve or dismiss. Use when the user asks you to propose or queue something. You draft — the human decides. Base the title/why on real numbers from the data.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        why: { type: 'string', description: 'the evidence and math, from the provided data only' },
        severity: { type: 'string', enum: ['high', 'medium'] },
        impact_monthly: { type: 'number', description: 'estimated $/month impact; omit if unknown' },
      },
      required: ['title', 'why'],
    },
  },
]

// Mission Control ask bar: grounded Q&A over the exact metrics the page is
// showing. The client sends a compact JSON context (same numbers as the KPI
// strip) + the session history, so answers cite real rows and context carries
// across turns — no tools needed for v1.
export async function POST(request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { question, context, history } = await request.json()
  if (!question || !context) {
    return NextResponse.json({ error: 'question and context required' }, { status: 400 })
  }
  // The asking human must reach this client; queries then run as the CLIENT'S
  // agent identity (decision 1a/1b: agent scoped to the client, asker audited).
  const clientId = context.clientId || context.client_id
  if (!clientId || !(await userCanAccessClient(user.id, clientId))) {
    return NextResponse.json({ error: 'no access to this client' }, { status: 403 })
  }
  // Presentation-layer role gate (decision 1a): the agent identity can read
  // the whole tenant, so free-form querying is only exposed to users whose
  // role already sees everything — agency users and this client's admins.
  // client_standard users keep the context-grounded terminal, no query tool.
  const allowQueries = await userCanUseQueries(user.id, clientId)

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const system = [
    `You are the Mission Control analyst for ${context.client || 'this ecom client'} inside the ConversionHero dashboard.`,
    `Answer questions using ONLY the JSON data provided in the first user message. Never invent numbers, campaigns, or dates. If the data can't answer the question, say exactly what's missing.`,
    `Key definitions you must respect: True ROAS = (UTM-attributed revenue − real BOM COGS) ÷ ad spend, so breakeven is 1.00x. The top-level true_roas_paid_only divides PAID contribution by spend — organic revenue never inflates it. COGS comes from the client's bill of materials, not estimates.`,
    `Style: lead with the direct answer and the number. 2-5 short sentences, then bullet lines only when comparing items. No markdown emphasis (no asterisks). Round dollars to whole numbers. When you reference a figure, it must appear in (or be arithmetic on) the provided data.`,
    `If the user asks what to DO, give one concrete recommendation with the math behind it — and when appropriate, draft it as a card with the draft_finding tool so it lands in PROBLEMS for their approval.`,
    `TOOLS: open_tab, set_range, reopen_decision, draft_finding, render_view, build_campaign, build_meta_campaign (UI-only), plus remember (persists a memory). They are executed by the dashboard in front of the user, instantly. They move things around INSIDE the IDE only — they can never pause campaigns, change budgets, or publish to any ad platform, and you must never claim otherwise. Approving is always the human's move: you may draft cards and reopen decisions, never approve them. Use a tool when the user's request is an action ("reopen that", "show me orders", "draft a card for X", "build a campaign for Y"); answer in text when it's a question. After calling a tool, one short sentence confirming what you did is enough.`,
    `MEMORY: when the user says "remember…" or shares a durable fact the DATABASE can't answer (a preference, seasonality, an external event, decision rationale), you MUST call the remember tool — one call per distinct fact. A conversational "noted" does NOT persist anything; only the tool does, so never claim you'll remember something without calling it. NEVER save metrics/counts/revenue (those are always queried fresh). Relevant memories are surfaced above when they exist.`,
    `CAMPAIGNS: build_campaign drafts GOOGLE Search campaigns (keywords + RSAs; user exports a Google Ads Editor CSV and pushes manually). build_meta_campaign drafts META (Facebook/Instagram) campaigns — NO keywords; instead Campaign objective → Ad Set (audience + budget + optimization) → Ad (primary text, headline, creative note). Pick the tool matching the platform the user names; if they just say "a campaign", ask which platform or infer from context (search intent → Google, audience/awareness → Meta). Ground all copy and targeting in this client's real data and funnels. Nothing publishes — the user reviews and pushes.`,
    allowQueries
      ? `QUERYING: you also have query_data — live read access to this client's database, scoped to their tenant by row-level security. Use it when the context JSON can't answer (customer-level fields, zip codes, ad-group/ad stats, other date windows). You get at most ${MAX_QUERIES_PER_ASK} queries per question, so plan them; select only the columns you need. Numbers you cite may come from the context JSON OR from query results — never from anywhere else. SCHEMA (table(columns…)):\n${agentSchemaPrompt()}`
      : `Answer ONLY from the context JSON. This user's role does not include database querying — if the context can't answer, say what's missing and suggest they ask an admin.`,
  ].join(' ')
  const tools = allowQueries ? TOOLS : TOOLS.filter(t => t.name !== 'query_data')

  // Recall relevant long-term memories for this question (best-effort — never
  // blocks an answer). Injected as a labeled block the agent can lean on.
  const memories = await recallMemories(clientId, question).catch(() => [])
  const memoryBlock = memories.length
    ? `\n\nWHAT YOU REMEMBER ABOUT THIS CLIENT (durable memory — cite as "you told me…" / "from the June 12 call…", never as live data):\n${memories.map(m => `- [${m.kind}] ${m.content}${m.source ? ` (${m.source})` : ''}`).join('\n')}`
    : ''

  const messages = [
    { role: 'user', content: `DATA (range ${context.range?.start} → ${context.range?.end}):\n${JSON.stringify(context, null, 1)}${memoryBlock}` },
    { role: 'assistant', content: 'Understood. I have the data and my memory, and will answer only from them.' },
  ]
  for (const turn of (history || []).slice(-6)) {
    messages.push({ role: 'user', content: turn.q })
    messages.push({ role: 'assistant', content: turn.a })
  }
  messages.push({ role: 'user', content: question })

  // Tool loop: query_data executes server-side AS THE AGENT IDENTITY
  // (RLS-scoped session — a bad query reads at most this tenant); UI tools
  // are shipped to the dashboard to run client-side.
  const actions = []
  const texts = []
  let queriesUsed = 0
  let agentDb = null
  let response = null
  let loopError = null
  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      // Rounds exhausted with tools still pending → force a final text turn
      // so the user never gets an empty or mid-plan answer.
      const finalTurn = round === MAX_TOOL_ROUNDS - 1
      if (finalTurn) {
        messages.push({ role: 'user', content: 'Tool budget is exhausted. Give your final answer now from what you already have — no more tool calls.' })
      }
      response = await client.messages.create({
        model: MODEL,
        max_tokens: 16000,
        thinking: { type: 'adaptive' },
        system,
        tools,
        ...(finalTurn ? { tool_choice: { type: 'none' } } : {}),
        messages,
      })
      texts.push(...response.content.filter(b => b.type === 'text').map(b => b.text))
      const toolUses = response.content.filter(b => b.type === 'tool_use')
      if (!toolUses.length) break

      const results = []
      for (const tu of toolUses) {
        if (tu.name === 'query_data') {
          let result
          if (queriesUsed >= MAX_QUERIES_PER_ASK) {
            result = { error: `query budget exhausted (${MAX_QUERIES_PER_ASK}/question) — answer with what you have` }
          } else {
            queriesUsed++
            try {
              agentDb = agentDb || await getAgentDb(clientId)
              result = await runAgentQuery(agentDb, clientId, tu.input)
            } catch (e) {
              result = { error: e.message }
            }
          }
          results.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(result) })
        } else if (tu.name === 'remember') {
          // Real server write — saves a durable memory (audited to this user).
          try {
            await rememberMemory(clientId, {
              content: tu.input?.content, kind: tu.input?.kind || 'insight',
              source: tu.input?.source || `${user.email} · ${context.range?.end || ''}`.trim(),
              createdBy: user.id,
            })
            actions.push({ name: 'remember', input: tu.input }) // UI shows a "remembered" note
            results.push({ type: 'tool_result', tool_use_id: tu.id, content: 'saved to memory.' })
          } catch (e) {
            results.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify({ error: e.message }) })
          }
        } else {
          // UI-only tool: hand to the dashboard. Honest ack — the page still
          // validates the input and may skip it, so don't claim it ran.
          actions.push({ name: tu.name, input: tu.input })
          results.push({ type: 'tool_result', tool_use_id: tu.id, content: 'queued — the dashboard will run this if the input is valid.' })
        }
      }
      messages.push({ role: 'assistant', content: response.content })
      messages.push({ role: 'user', content: results })
      if (response.stop_reason !== 'tool_use') break
    }
  } catch (e) {
    // Partial failure: don't 500 away work already done — deliver collected
    // text + already-queued UI actions (drafted cards etc.) with the error.
    console.error('[mission/ask]', e)
    loopError = e.message || 'ask failed'
  }
  const answer = texts.join('\n').trim()
  if (!answer && loopError) {
    return NextResponse.json({ error: loopError, actions, queries: queriesUsed }, { status: 500 })
  }
  return NextResponse.json({
    answer: loopError ? `${answer}\n\n(interrupted: ${loopError})`.trim() : answer,
    actions,
    usage: response?.usage,
    queries: queriesUsed,
  })
}
