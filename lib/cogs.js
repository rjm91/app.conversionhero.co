// COGS engine — turn a BOM + material costs into real per-order cost.
// Pure functions (no DB); usable on server or client.
//
// Rules (validated against ShieldTech's data):
//   • Order SKU = parent + color suffix (-BK/-CF/-DB). Strip it → parent.
//   • The color picks the ONE vinyl used (Black / Carbon Fiber / Diamondback).
//   • A SKU whose parent isn't in the BOM (e.g. SHIP-PROTECT add-on) = $0 COGS.
//   • Matching is hyphen/case-insensitive as a fallback (CF-MOTO ↔ CFMOTO).

const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')

// Canonical snake_case BOM keys. canonBom() folds ANY historical shape onto
// these — Jason's original headers ("FiberTape", "3M Sticker", "Double Sided
// Tape"), the legacy stored keys (blackvinyl_yd), or future re-uploads with
// different casing/spacing — so the cost math never depends on how a
// spreadsheet column happened to be written.
const BOM_KEYS = [
  'magnets_north', 'magnets_south', 'fiber_tape', 'double_sided_tape',
  'foam_yd', 'black_vinyl_yd', 'carbon_fiber_vinyl_yd', 'diamondback_vinyl_yd',
  'box_size', 'magnet_box_size', 'bag_size', 'packing_foam',
  '3m_sticker', 'logo_patch', 'usa_sticker', 'shipping_label_sticker',
]
// Legacy keys whose normalized form doesn't collapse onto a canonical key.
const KEY_ALIASES = { diamondbackyd: 'diamondback_vinyl_yd' }
const CANON = BOM_KEYS.reduce((m, k) => { m[norm(k)] = k; return m }, { ...KEY_ALIASES })

// Map one key to its canonical form (unknown keys pass through trimmed).
export const canonKey = k => CANON[norm(k)] || String(k || '').trim()
// Normalize a whole BOM object: canonical keys, trimmed values (kills the
// stray "\r" CSV artifacts), numeric strings become numbers.
export function canonBom(bom = {}) {
  const out = {}
  for (const [k, v] of Object.entries(bom)) {
    const val = typeof v === 'string' ? v.trim() : v
    out[canonKey(k)] = val !== '' && val !== null && !isNaN(Number(val)) ? Number(val) : val
  }
  return out
}

const VINYL = {
  BK: ['black_vinyl_yd', 'Black Vinyl (COST PER YARD)'],
  CF: ['carbon_fiber_vinyl_yd', 'Carbon Fiber Vinyl (COST PER YARD)'],
  DB: ['diamondback_vinyl_yd', 'Diamond Back Vinyl (COST PER YARD)'],
}
const VINYL_CODES = new Set(['BK', 'CF', 'DB'])

// Build a cost lookup from the materials list.
export function buildCostBook(materials = []) {
  const byNorm = {}
  for (const m of materials) byNorm[norm(m.name)] = Number(m.cost) || 0
  const get = key => byNorm[norm(key)] ?? 0
  return {
    get,
    boxCost: size => get(size),                                 // 'Large' → material 'Large'
    bagCost: bag => get(bag),                                   // 'Large Bag'
    magnetBoxCost: dim => byNorm[norm(dim) + 'magnetbox'] ?? 0, // '8x2x2' → '8 X 2 X 2 (Magnet Box)'
  }
}

// Cost of one unit of a parent SKU, for a given vinyl color.
export function skuUnitCost(bom = {}, book, vinylCode = 'BK') {
  const b = canonBom(bom)
  const q = k => Number(b[k]) || 0
  let c = 0
  c += (q('magnets_north') + q('magnets_south')) * book.get('Magnet')
  c += q('fiber_tape') * book.get('FiberTape')
  c += q('double_sided_tape') * book.get('Double Sided Tape')
  c += q('foam_yd') * book.get('Foam (COST PER YARD)')
  c += q('packing_foam') * book.get('Packing Foam')
  c += q('3m_sticker') * book.get('3M Sticker')
  c += q('logo_patch') * book.get('Logo Patch')
  c += q('shipping_label_sticker') * book.get('Shipping Label Sticker')
  c += q('usa_sticker') * book.get('USA Sticker Cost')
  const v = VINYL[vinylCode] || VINYL.BK
  c += q(v[0]) * book.get(v[1])
  c += book.boxCost(b.box_size)
  c += book.magnetBoxCost(b.magnet_box_size)
  c += book.bagCost(b.bag_size)
  return c
}

// Per-component cost breakdown for one unit — the leaf of the drill cascade
// (BOM line → client_materials). Sums to skuUnitCost() exactly (same terms).
export function skuUnitCostBreakdown(bom = {}, book, vinylCode = 'BK') {
  const b = canonBom(bom)
  const q = k => Number(b[k]) || 0
  const out = []
  const add = (component, qty, unit) => { if (qty > 0 && unit > 0) out.push({ component, qty, unit, cost: qty * unit }) }
  add('Magnet', q('magnets_north') + q('magnets_south'), book.get('Magnet'))
  add('FiberTape', q('fiber_tape'), book.get('FiberTape'))
  add('Double Sided Tape', q('double_sided_tape'), book.get('Double Sided Tape'))
  add('Foam (per yd)', q('foam_yd'), book.get('Foam (COST PER YARD)'))
  add('Packing Foam', q('packing_foam'), book.get('Packing Foam'))
  add('3M Sticker', q('3m_sticker'), book.get('3M Sticker'))
  add('Logo Patch', q('logo_patch'), book.get('Logo Patch'))
  add('Shipping Label Sticker', q('shipping_label_sticker'), book.get('Shipping Label Sticker'))
  add('USA Sticker', q('usa_sticker'), book.get('USA Sticker Cost'))
  const v = VINYL[vinylCode] || VINYL.BK
  add(v[1], q(v[0]), book.get(v[1]))
  if (b.box_size) add(`Box · ${b.box_size}`, 1, book.boxCost(b.box_size))
  if (b.magnet_box_size) add(`Magnet Box · ${b.magnet_box_size}`, 1, book.magnetBoxCost(b.magnet_box_size))
  if (b.bag_size) add(`Bag · ${b.bag_size}`, 1, book.bagCost(b.bag_size))
  return out
}

// Split an order SKU into parent + vinyl color.
export function parseSku(orderSku) {
  if (!orderSku) return { parent: null, vinyl: 'BK' }
  const parts = String(orderSku).split('-')
  const last = parts[parts.length - 1].toUpperCase()
  if (VINYL_CODES.has(last)) return { parent: parts.slice(0, -1).join('-'), vinyl: last }
  return { parent: orderSku, vinyl: 'BK' }
}

// Index parent SKUs for exact + normalized (hyphen-insensitive) lookup.
export function buildSkuIndex(skus = []) {
  const exact = {}, normd = {}
  for (const s of skus) { exact[s.parent_sku] = s; normd[norm(s.parent_sku)] = s }
  return { find: parent => exact[parent] || normd[norm(parent)] || null }
}

// Total COGS for an order's line items.
export function orderCogs(lineItems, skuIndex, book) {
  let cogs = 0
  const lines = [], unmatched = []
  for (const li of (lineItems || [])) {
    const { parent, vinyl } = parseSku(li.sku)
    const row = parent ? skuIndex.find(parent) : null
    if (!row) { unmatched.push(li.sku); lines.push({ sku: li.sku, qty: li.qty, matched: false, cost: 0 }); continue }
    const unit = skuUnitCost(row.bom, book, vinyl)
    const cost = unit * (Number(li.qty) || 0)
    cogs += cost
    lines.push({ sku: li.sku, parent, vinyl, qty: li.qty, unit, cost, matched: true })
  }
  return { cogs, lines, unmatched }
}

// Convenience: COGS for a stored order row (uses shopify_data.line_items).
export function orderRowCogs(order, skuIndex, book) {
  const li = order?.shopify_data?.line_items || []
  return orderCogs(li, skuIndex, book)
}
