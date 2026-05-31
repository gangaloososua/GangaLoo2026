'use server'

// Seller application from the public /partners page. Sellers are a privileged
// role the owner sets up by hand after vetting, so this does NOT create an
// account — it just sends the full application to the owner's WhatsApp.

import { notifySellerApplication } from '@/lib/notify'

export type SellerApplyResult = { ok: true } | { ok: false; error: string }

export async function submitSellerApplication(input: {
  firstName: string
  lastName: string
  email: string
  phone: string
  city: string
  cedula?: string
  experience?: string
  expDetail?: string
  channel?: string
  message?: string
}): Promise<SellerApplyResult> {
  const firstName = input.firstName?.trim()
  const lastName = input.lastName?.trim()
  const email = input.email?.trim().toLowerCase()
  const phone = (input.phone ?? '').trim()
  const city = input.city?.trim()

  if (!firstName || !lastName) return { ok: false, error: 'NAME_REQUIRED' }
  if (!email || !email.includes('@')) return { ok: false, error: 'EMAIL_INVALID' }
  if (!phone) return { ok: false, error: 'PHONE_REQUIRED' }
  if (!city) return { ok: false, error: 'CITY_REQUIRED' }
  if (!input.channel) return { ok: false, error: 'CHANNEL_REQUIRED' }

  try {
    await notifySellerApplication({
      name: `${firstName} ${lastName}`,
      email,
      phone,
      city,
      cedula: input.cedula?.trim() || undefined,
      experience: input.experience || undefined,
      expDetail: input.expDetail?.trim() || undefined,
      channel: input.channel || undefined,
      message: input.message?.trim() || undefined,
    })
    return { ok: true }
  } catch {
    return { ok: false, error: 'SEND_FAILED' }
  }
}
