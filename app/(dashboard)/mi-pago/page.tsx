// app/(dashboard)/mi-pago/page.tsx
// "Mi pago" — any signed-in staff member sees their OWN pay summary. The RPC
// self-scopes to auth.uid(), so owners (not on payroll) just see a friendly
// note, and a seller only ever sees her own numbers.

import { requireAdminCaller } from '@/lib/auth/guard'
import { localeForRole } from '@/lib/i18n/dictionary'
import { MiPagoView } from './mi-pago-view'

export const dynamic = 'force-dynamic'

export default async function MiPagoPage() {
  const caller = await requireAdminCaller()
  const locale = localeForRole(caller.role)
  return <MiPagoView locale={locale} />
}
