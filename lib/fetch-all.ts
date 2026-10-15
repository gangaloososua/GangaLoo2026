// lib/fetch-all.ts
//
// 2026-10-15 — Supabase returns at most 1,000 rows per request, and silently
// drops the rest. Several tables (products, product_categories,
// product_attribute_values, ...) are at or past 1,000 rows, so any
// "load everything" read must page through them.
//
// selectAll(page) calls page(from, to) for 0-999, 1000-1999, ... until a short
// page comes back, and returns { data, error } like a normal Supabase read, so
// it can drop into existing code (including Promise.all blocks) unchanged.
// The page builder MUST end with .range(from, to) after a stable order
// (e.g. .order('name').order('id')) so no row is skipped or repeated.

const PAGE_SIZE = 1000

export async function selectAll<T = any>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown; error: any }>,
): Promise<{ data: T[]; error: any }> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1)
    if (error) return { data: out, error }
    const rows = (Array.isArray(data) ? data : []) as T[]
    out.push(...rows)
    if (rows.length < PAGE_SIZE) return { data: out, error: null }
  }
}
