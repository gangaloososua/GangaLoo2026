// Round 37b/37e — Locations page (/locations). [v2: + Asignar productos button]
//
// Owner/admin manage locations in every warehouse; a distributor only in their
// assigned warehouse(s). Language follows role (en/es). Warehouse names read
// straight from the warehouses table. Placement counts come from
// product_locations. Header links to the placement editor.
import Link from 'next/link'
import { PackageSearch } from 'lucide-react'
import { requireRole } from '@/lib/auth/guard'
import { isOwnerEquivalent } from '@/lib/auth/roles'
import { createClient } from '@/lib/supabase/server'
import { listWarehousesForDistributor } from '@/lib/stock-transfers'
import { localeForRole, type Locale } from '@/lib/i18n/dictionary'
import { tl } from '@/lib/i18n/locations-i18n'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { LocationsManager, type ManagerWarehouse } from './locations-manager'

export const dynamic = 'force-dynamic'

function PageHeader({ locale }: { locale: Locale }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{tl(locale, 'loc.title')}</h1>
        <p className="text-sm text-muted-foreground">{tl(locale, 'loc.blurb')}</p>
      </div>
      <Button asChild variant="outline">
        <Link href="/locations/asignar">
          <PackageSearch className="mr-1 h-4 w-4" />
          {tl(locale, 'loc.assign.title')}
        </Link>
      </Button>
    </div>
  )
}

export default async function LocationsPage() {
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

  const [{ data: whRows }, { data: locRows }, { data: placeRows }] = await Promise.all([
    supabase.from('warehouses').select('id, name').in('id', allowedIds).order('name'),
    supabase
      .from('storage_locations')
      .select('id, warehouse_id, name, is_active, sort_order')
      .in('warehouse_id', allowedIds)
      .order('sort_order')
      .order('name'),
    supabase.from('product_locations').select('location_id, qty'),
  ])

  const warehouses = (whRows ?? []) as Array<{ id: string; name: string }>
  const locs = (locRows ?? []) as Array<{
    id: string
    warehouse_id: string
    name: string
    is_active: boolean
  }>
  const places = (placeRows ?? []) as Array<{ location_id: string; qty: number }>

  const counts = new Map<string, { products: number; units: number }>()
  for (const p of places) {
    const c = counts.get(p.location_id) ?? { products: 0, units: 0 }
    c.products += 1
    c.units += p.qty ?? 0
    counts.set(p.location_id, c)
  }

  const byWh: ManagerWarehouse[] = warehouses.map((w) => ({
    id: w.id,
    name: w.name,
    locations: locs
      .filter((l) => l.warehouse_id === w.id)
      .map((l) => {
        const c = counts.get(l.id) ?? { products: 0, units: 0 }
        return {
          id: l.id,
          name: l.name,
          isActive: l.is_active,
          productCount: c.products,
          unitCount: c.units,
        }
      }),
  }))

  return (
    <div className="space-y-4">
      <PageHeader locale={locale} />
      <LocationsManager warehouses={byWh} locale={locale} />
    </div>
  )
}
