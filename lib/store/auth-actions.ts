'use server'

// Customer authentication for the storefront. Separate from staff/admin auth.
// Sign-up creates the Supabase login AND a locked-down customer profile
// (role is forced to 'customer' inside upsert_customer_profile).

import { createClient } from '@/lib/supabase/server'
import { notifyNewSignup } from '@/lib/notify'

export type AuthResult = { ok: true; memberNo?: string } | { ok: false; error: string }

export async function signUpCustomer(input: {
  name: string
  email: string
  password: string
  phone?: string
  // Optional extras used by the Club signup page. When `plan` is set, the owner
  // alert is framed as a Club membership request. Neither field changes the
  // account itself (the Club toggle is activated manually after payment).
  city?: string
  plan?: string
}): Promise<AuthResult> {
  const name = input.name?.trim()
  const email = input.email?.trim().toLowerCase()
  // Normalize phone to digits only; prepend DR country code (1) for 10-digit
  // numbers so it is consistent + tappable. Unusual lengths keep their digits.
  const phoneDigits = (input.phone ?? '').replace(/\D/g, '')
  const phone = phoneDigits
    ? phoneDigits.length === 10
      ? '1' + phoneDigits
      : phoneDigits
    : undefined

  if (!name) return { ok: false, error: 'NAME_REQUIRED' }
  if (!email || !email.includes('@')) return { ok: false, error: 'EMAIL_INVALID' }
  if (!input.password || input.password.length < 6)
    return { ok: false, error: 'PASSWORD_SHORT' }
  if (!phone) return { ok: false, error: 'PHONE_REQUIRED' }

  const supabase = await createClient()

  const { error: signErr } = await supabase.auth.signUp({
    email,
    password: input.password,
  })
  if (signErr) {
    const m = signErr.message || ''
    if (/already registered|already exists|already been registered/i.test(m))
      return { ok: false, error: 'EMAIL_TAKEN' }
    return { ok: false, error: m }
  }

  // Confirm-email is off, so the user is signed in now. Create/link the profile.
  const { error: profErr } = await supabase.rpc('upsert_customer_profile', {
    p_name: name,
    p_phone: phone ?? null,
  })
  if (profErr) {
    const m = profErr.message || ''
    if (/phone_in_use/i.test(m)) return { ok: false, error: 'PHONE_TAKEN' }
    return { ok: false, error: m }
  }

  // For a Club signup (plan present), assign this member's sequential number now
  // so it can show on their card. Non-fatal: if it fails (e.g. the function
  // isn't deployed yet), signup still succeeds and the card shows a placeholder.
  let memberNo: string | undefined
  if (input.plan) {
    try {
      const { data: noData, error: noErr } = await supabase.rpc('assign_club_member_no')
      if (!noErr && typeof noData === 'string') memberNo = noData
    } catch {
      memberNo = undefined
    }
  }

  // New-customer WhatsApp alert to the owner. Fires once, on full success.
  // notifyNewSignup never throws, so it cannot break signup. When `plan` is
  // present this reads as a Club membership request.
  await notifyNewSignup({
    name,
    phone,
    email,
    city: input.city?.trim() || undefined,
    plan: input.plan?.trim() || undefined,
    memberNo,
  })

  return { ok: true, memberNo }
}

export async function signInCustomer(input: {
  email: string
  password: string
}): Promise<AuthResult> {
  const email = input.email?.trim().toLowerCase()
  if (!email || !input.password)
    return { ok: false, error: 'CREDENTIALS_REQUIRED' }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: input.password,
  })
  if (error) {
    const m = error.message || ''
    if (/invalid login credentials/i.test(m))
      return { ok: false, error: 'BAD_LOGIN' }
    return { ok: false, error: m }
  }
  return { ok: true }
}

export async function signOutCustomer(): Promise<AuthResult> {
  const supabase = await createClient()
  const { error } = await supabase.auth.signOut()
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
