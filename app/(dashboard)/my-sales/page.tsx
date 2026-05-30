import { requireAdminCaller } from '@/lib/auth/guard'
import { localeForRole } from '@/lib/i18n/dictionary'
import { fetchMySellerFinancials } from '@/lib/my-seller-financials'
import { MySalesView } from './my-sales-view'

export const dynamic = 'force-dynamic'

const TX = {
  en: { title: 'My sales', sub: 'Your invoices and the payments collected on them.' },
  es: { title: 'Mis ventas', sub: 'Tus facturas y los pagos cobrados de ellas.' },
} as const

export default async function MySalesPage() {
  // Any dashboard user may open this. The RPC self-scopes to the signed-in
  // person via auth.uid(), so owners/admins (no seller sales of their own)
  // just get a "sellers only" note from the view - never another seller's
  // data. Real data shows when a seller/distributor is signed in.
  const caller = await requireAdminCaller()
  const locale = localeForRole(caller.role)
  const tx = TX[locale]
  const data = await fetchMySellerFinancials()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{tx.title}</h1>
        <p className="text-sm text-muted-foreground">{tx.sub}</p>
      </div>

      <MySalesView data={data} locale={locale} />
    </div>
  )
}