// Temporarily closed stores (2026-10-30).
//
// While a store's slug is listed here:
//  - /tienda shows a notice and the store's card points to the other store,
//  - /tienda/<slug> (store, product pages, cart, checkout) shows a "closed"
//    page with buttons to the other store and its WhatsApp,
//  - new online orders for it are refused.
// TO REOPEN: delete the store's line below (or empty the object) and publish.

export const CLOSED_STORES: Record<string, { redirectSlug: string }> = {
  maranatha: { redirectSlug: 'montellano' },
}

export function closureFor(slug: string | null | undefined): { redirectSlug: string } | null {
  if (!slug) return null
  return CLOSED_STORES[slug.toLowerCase()] ?? null
}

// Business WhatsApp, used when the open store has no WhatsApp number set.
export const FALLBACK_WHATSAPP = '18292867868'

export function whatsappHref(number: string | null | undefined, text: string): string {
  const digits = (number ?? '').replace(/\D/g, '') || FALLBACK_WHATSAPP
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
}

export function prettyPhone(number: string | null | undefined): string {
  const d = (number ?? '').replace(/\D/g, '') || FALLBACK_WHATSAPP
  // 1 829 286 7868 -> +1 (829) 286-7868
  if (d.length === 11 && d.startsWith('1')) {
    return `+1 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`
  }
  return `+${d}`
}
