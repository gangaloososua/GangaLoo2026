// lib/campaigns.ts
//
// Seasonal campaigns (round-80). A campaign is just a label stored in
// discount_rules.campaign on ordinary PROMOTION rules, so the register and
// online checkout charge them exactly like any other promotion. The
// storefront reads the label (via the store_promotions view) to show the
// products in a themed box while the promotions are live.
//
// Safe to import from both server and client code (no server-only imports).
//
// TO ADD A SEASON (round-90):
//   1. add one entry below (id = short lowercase word, no spaces; it is saved
//      in the database, so never rename an id once it has been used),
//   2. optionally add its look in lib/store/campaign-themes.tsx.
//      Without a look it still shows on the storefront, in a plain box.

export const CAMPAIGNS = [
  { id: 'blackfriday', label: 'Black Friday', emoji: '🛍️' },
  { id: 'christmas', label: 'Christmas / Navidad', emoji: '🎄' },
  { id: 'halloween', label: 'Halloween', emoji: '🎃' },
] as const

export type CampaignId = (typeof CAMPAIGNS)[number]['id']

export function isCampaignId(v: string): v is CampaignId {
  return CAMPAIGNS.some((c) => c.id === v)
}

export function campaignLabel(id: string | null | undefined): string | null {
  if (!id) return null
  const c = CAMPAIGNS.find((x) => x.id === id)
  return c ? `${c.emoji} ${c.label}` : id
}
