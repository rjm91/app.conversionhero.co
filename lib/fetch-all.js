// Supabase/PostgREST silently caps every request at 1,000 rows — a query
// over a busy range returns the newest 1,000 and looks complete. (Found
// 2026-07-08: All-Time dashboard showed $332k instead of $1.19M.)
// Wrap any unbounded read: pass a factory that BUILDS a fresh query for the
// given row window; pages are fetched until one comes back short.
//
//   const orders = await fetchAllRows((from, to) =>
//     supabase.from('client_orders').select('…').eq(…).order(…).range(from, to))
export async function fetchAllRows(makePage, pageSize = 1000) {
  let all = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await makePage(from, from + pageSize - 1)
    if (error) throw error
    if (data?.length) all = all.concat(data)
    if (!data || data.length < pageSize) return all
  }
}
