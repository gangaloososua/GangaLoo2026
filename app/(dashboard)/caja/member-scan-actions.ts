'use server'

// Round 68c — POS membership scan lookup.
//
// Turns a tapped (or typed) card serial into the matching customer, via the
// Round 68a find_customer_by_card RPC. Uses the REGULAR server client because
// that RPC gates on auth.uid() -> profiles.role in ('owner','seller') — which
// is exactly who runs the register. requireAdminCaller mirrors the other caja
// actions (loadRegisterProducts); the RPC itself is the real gate.

import { createClient } from '@/lib/supabase/server'
import { requireAdminCaller } from '@/lib/auth/guard'

export type ScannedMember = {
  customerId: string
  fullName: string
  phone: string | null
  isClubMember: boolean
  tier: string // 'none' | 'bronze' | 'silver' | 'gold' | 'platinum'
  memberNo: string | null
  points: number
}

export type FindMemberByCardResult =
  | { ok: true; member: ScannedMember | null }
  | { ok: false; error: string }

export async function findMemberByCardAction(
  cardUid: string,
): Promise<FindMemberByCardResult> {
  await requireAdminCaller()
  const clean = (cardUid ?? '').trim()
  if (!clean) return { ok: true, member: null }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('find_customer_by_card', {
    p_card_uid: clean,
  })
  if (error) return { ok: false, error: error.message }

  // find_customer_by_card is set-returning -> rpc gives an array of 0 or 1 row.
  const row = (Array.isArray(data) ? data[0] : data) as
    | {
        customer_id: string
        full_name: string
        phone: string | null
        is_club_member: boolean
        club_tier: string | null
        club_member_no: string | null
        bonus_points: number
      }
    | undefined
  if (!row) return { ok: true, member: null }

  return {
    ok: true,
    member: {
      customerId: row.customer_id,
      fullName: row.full_name,
      phone: row.phone,
      isClubMember: row.is_club_member,
      tier: row.club_tier ?? 'none',
      memberNo: row.club_member_no,
      points: row.bonus_points ?? 0,
    },
  }
}
