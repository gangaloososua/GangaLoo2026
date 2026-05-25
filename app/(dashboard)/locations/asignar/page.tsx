// Round 37e — Asignar productos page (/locations/asignar).
//
// Owner/admin manage placements in every warehouse; a distributor only in
// their assigned warehouse(s). Loads active locations for those warehouses and
// hands them to the client editor. Product search happens client-side.
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { requireRole } from '@/lib/auth/guard'
import { isOwnerEquivalent } from '@/lib/auth/roles'
import { createClient } from '@/lib/supabase/server'
import { listWarehousesForDistributor } from '@/lib/stock-transfers'
import { localeForRole, type Locale } from '@/lib/i18n/dictionary'
import { tl } from '@/lib/i18n/locations-i18n'
import { Card, CardContent } from '@/components/ui/card'
import { PlacementEditor } from './placement-editor'

export const dynamic = 'force-dynamic'

function PageHeader({ locale }: { locale: Locale }) {
  return (
    <div className="space-y-1">
      <Link
        href="/locations"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        {tl(locale, 'loc.assign.back')}
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">{tl(locale, 'loc.assign.title')}</h1>
      <p className="text-sm text-muted-foreground">{tl(locale, 'loc.assign.blurb')}</p>
    </div>
  )
}

export default async function AssignProductsPage() {
  const caller = await requireRole(['owner', 'admin', 'distributor'] as const)
  const locale = localeForRole(caller.role)
  const supabase = await createClient()

  let allowedIds: string[]
  if (isOwnerEquivalent(caller.role)) {
    const { data } = await supabase.from('warehouses').select('id')
    allowedIds = ((data ?? []) as Array<{ id: string }>).map((r) => r.id)
  } else {
    const mine = await listWarehousesForDistributor(caller.id)
    allowedIds = mine.map((w) => w.id)
  }

  if (allowedIds.length === 0) {
    return (
      <div className="space-y-4">
        <PageHeader locale={locale} />
        <Card>
          <CardContent className="px-6 py-6 text-sm text-muted-foreground">
            {tl(locale, 'loc.noWh')}
          </CardContent>
        </Card>
      </div>
    )
  }

  const [{ data: whRows }, { data: locRows }] = await Promise.all([
    supabase.from('warehouses').select('id, name').in('id', allowedIds).order('name'),
    supabase
      .from('storage_locations')
      .select('id, warehouse_id, name')
      .eq('is_active', true)
      .in('warehouse_id', allowedIds)
      .order('sort_order')
      .order('name'),
  ])

  const warehouses = (whRows ?? []) as Array<{ id: string; name: string }>
  const locations = (locRows ?? []) as Array<{ id: string; warehouse_id: string; name: string }>

  return (
    <div className="space-y-4">
      <PageHeader locale={locale} />
      <PlacementEditor warehouses={warehouses} locations={locations} locale={locale} />
    </div>
  )
}
