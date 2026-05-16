// Shared formatters. Use these everywhere — never inline a new Intl call.
// Locale notes:
//   - Money: es-DO so the thousands separator + currency match what Dominicans expect.
//   - Dates: en-GB so SSR (server is en-US) and the German browser produce the same
//     string on first paint, avoiding hydration mismatches.

type FormatDOPOptions = {
  /** Number of decimal places to show. Default 2. Use 0 for clean list prices. */
  decimals?: number
}

export function formatDOP(
  cents: number | null | undefined,
  options: FormatDOPOptions = {},
): string {
  if (cents == null) return '—'
  const decimals = options.decimals ?? 2
  return new Intl.NumberFormat('es-DO', {
    style: 'currency',
    currency: 'DOP',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(cents / 100)
}

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return '—'
  const d = value instanceof Date ? value : new Date(value)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', { dateStyle: 'medium' })
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return '—'
  const d = value instanceof Date ? value : new Date(value)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
}
