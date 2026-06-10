'use server'

// Round 68b — NFC membership card management (owner-facing, on a person's page).
//
// Calls the Round 68a RPCs via the REGULAR server client (@/lib/supabase/server),
// because those RPCs gate on auth.uid() -> profiles.role in ('owner','seller').
// This screen is owner-only: it renders on the requireOwner()-gated
// /people/[id] page, so requireOwner() here matches that gate.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireOwner } from '@/lib/auth/guard'

export type MemberCard = {
  id: string
  card_uid: string
  label: string | null
  is_active: boolean
  created_at: string
  deactivated_at: string | null
}

export async function listMemberCards(customerId: string): Promise<MemberCard[]> {
  await requireOwner()
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('list_member_cards', {
    p_customer_id: customerId,
  })
  if (error) throw new Error(error.message)
  return (data ?? []) as MemberCard[]
}

type LinkResult =
  | { ok: true; status: string; cards: MemberCard[] }
  | { ok: false; error: string }

export async function linkMemberCard(
  customerId: string,
  cardUid: string,
  label: string | null,
): Promise<LinkResult> {
  await requireOwner()
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('link_member_card', {
    p_customer_id: customerId,
    p_card_uid: cardUid,
    p_label: label,
  })
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/people/${customerId}`)
  const status = (data as { status?: string } | null)?.status ?? 'linked'
  const cards = await listMemberCards(customerId)
  return { ok: true, status, cards }
}

type RemoveResult =
  | { ok: true; cards: MemberCard[] }
  | { ok: false; error: string }

export async function deactivateMemberCard(
  customerId: string,
  cardId: string,
): Promise<RemoveResult> {
  await requireOwner()
  const supabase = await createClient()
  const { error } = await supabase.rpc('deactivate_member_card', {
    p_card_id: cardId,
  })
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/people/${customerId}`)
  const cards = await listMemberCards(customerId)
  return { ok: true, cards }
}
