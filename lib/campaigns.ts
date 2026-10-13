// lib/campaigns.ts
//
// Seasonal campaigns (round-80). A campaign is just a label stored in
// discount_rules.campaign on ordinary PROMOTION rules, so the register and
// online checkout charge them exactly like any other promotion. The
// storefront reads the label (via the store_promotions view) to show the
// products in a themed box while the promotions are live.
//
// Safe to import from both server and client code (no server-only imports).
// To add a season later, add one entry here (and its storefront theme).

export type CampaignId = 'halloween'

export const CAMPAIGNS: Array<{ id: CampaignId; label: string; emoji: string }> = [
  { id: 'halloween', label: 'Halloween', emoji: '🎃' },
]

export function isCampaignId(v: string): v is CampaignId {
  return CAMPAIGNS.some((c) => c.id === v)
}

export function campaignLabel(id: string | null | undefined): string | null {
  if (!id) return null
  const c = CAMPAIGNS.find((x) => x.id === id)
  return c ? `${c.emoji} ${c.label}` : id
}
