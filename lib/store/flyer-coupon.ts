// Round 43 — flyer / QR coupon capture (client-side only, no server/DB).
//
// A printed flyer's QR points at the store with ?coupon=CODE. We stash the code
// in the browser for the visit so it survives the customer browsing around, then
// pre-fill the checkout coupon box. CODE is just a normal online coupon created
// on the admin screen — nothing here touches the database.

const KEY = 'gl_flyer_coupon'
const TTL_MS = 14 * 24 * 60 * 60 * 1000 // 14 days
const CODE_RE = /^[A-Z0-9._-]{2,40}$/

export function saveFlyerCoupon(raw: string): string | null {
  if (typeof window === 'undefined') return null
  const code = raw.trim().toUpperCase()
  if (!CODE_RE.test(code)) return null
  try {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ code, savedAt: Date.now() }),
    )
  } catch {
    /* storage unavailable (e.g. private mode) — ignore */
  }
  return code
}

export function readFlyerCoupon(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { code?: string; savedAt?: number }
    if (!parsed.code || !parsed.savedAt) return null
    if (Date.now() - parsed.savedAt > TTL_MS) {
      window.localStorage.removeItem(KEY)
      return null
    }
    return CODE_RE.test(parsed.code) ? parsed.code : null
  } catch {
    return null
  }
}

export function clearFlyerCoupon(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
