// Agent semantic memory — SERVER ONLY.
// Architecture decision #3: pgvector in the same Postgres, voyage-3.5
// embeddings. The discipline "if a query can answer it, it's not a memory"
// lives in the prompt (what the agent chooses to save), not here — here we
// just embed, store, and recall.

import { createClient } from '@supabase/supabase-js'

const VOYAGE_MODEL = 'voyage-3.5'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

// input_type matters for Voyage: 'document' when storing, 'query' when searching.
async function embed(text, inputType) {
  const key = process.env.VOYAGE_API_KEY
  if (!key) return null // memory degrades gracefully if the key is absent
  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: VOYAGE_MODEL, input: [text], input_type: inputType }),
  })
  if (!res.ok) throw new Error(`voyage ${res.status}: ${(await res.text()).slice(0, 120)}`)
  const j = await res.json()
  return j.data?.[0]?.embedding || null
}

// Recall the most relevant live memories for a question. Returns [] on any
// failure (missing key, no rows) — recall must never break an answer.
export async function recallMemories(clientId, query, limit = 6) {
  try {
    const vec = await embed(query, 'query')
    if (!vec) return []
    const { data, error } = await admin().rpc('match_agent_memories', {
      p_client_id: clientId, p_embedding: vec, p_limit: limit,
    })
    if (error) return []
    // Only surface genuinely-relevant hits; cosine sim below ~0.4 is noise.
    return (data || []).filter(m => m.similarity >= 0.4)
  } catch { return [] }
}

// Save one memory. content = the fact; kind/source/metadata optional.
// createdBy = the human who prompted it (audit). Returns { id } or throws.
export async function rememberMemory(clientId, { content, kind = 'insight', source = null, metadata = {}, createdBy = null }) {
  if (!content?.trim()) throw new Error('empty memory')
  const vec = await embed(content, 'document')
  const { data, error } = await admin().from('agent_memories').insert({
    client_id: clientId, content: content.trim(), kind, source, metadata,
    embedding: vec, created_by: createdBy,
  }).select('id').single()
  if (error) throw new Error(error.message)
  return data
}

// Supersede an old memory with a correction (append-only — never overwrite).
export async function supersedeMemory(oldId, clientId, correction, createdBy = null) {
  const fresh = await rememberMemory(clientId, { ...correction, createdBy })
  await admin().from('agent_memories').update({ superseded_by: fresh.id }).eq('id', oldId).eq('client_id', clientId)
  return fresh
}
