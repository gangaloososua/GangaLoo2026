// Round 37h — stock locator page (/buscar): scan or search to find where a product is.
import { requireRole } from '@/lib/auth/guard'
import { isOwnerEquivalent } from '@/lib/auth/roles'
import { createClient } from '@/lib/supabase/server'
import { listWarehousesForDistributor } from '@/lib/stock-transfers'
import { localeForRole } from '@/lib/i18n/dictionary'
import { Locator } from './locator'

export const dynamic = 'force-dynamic'

export default async function FindStockPage() {
  const caller = await requireRole(['owner', 'admin', 'distributor'] as const)
  const locale = localeForRole(caller.role)
  const es = locale === 'es'
  const supabase = await createClient()

  let allowedIds: string[]
  if (isOwnerEquivalent(caller.role)) {
    const { data } = await supabase.from('warehouses').select('id')
    allowedIds = ((data ?? []) as Array<{ id: string }>).map((r) => r.id)
  } else {
    const mine = await listWarehousesForDistributor(caller.id)
    allowedIds = mine.map((w) => w.id)
  }

  const { data: whRows } = await supabase
    .from('warehouses')
    .select('id, name')
    .in('id', allowedIds.length ? allowedIds : ['00000000-0000-0000-0000-000000000000'])
    .order('name')
  const warehouses = (whRows ?? []) as Array<{ id: string; name: string }>

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {es ? '¿Dónde está?' : 'Find stock'}
        </h1>
        <p className="text-sm text-muted-foreground">
          {es
            ? 'Escanea o busca un producto para ver en qué locaciones está.'
            : 'Scan or search a product to see which locations hold it.'}
        </p>
      </div>
      <Locator warehouses={warehouses} locale={locale} />
    </div>
  )
}
