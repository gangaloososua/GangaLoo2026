// Round 37i — label printing page (/etiquetas): QR + product name, 50x30mm roll.
import { requireRole } from '@/lib/auth/guard'
import { listWarehousesForFilter } from '@/lib/sales'
import { localeForRole } from '@/lib/i18n/dictionary'
import { LabelPrinter } from './label-printer'

export const dynamic = 'force-dynamic'

export default async function LabelsPage() {
  const caller = await requireRole(['owner', 'admin', 'distributor'] as const)
  const locale = localeForRole(caller.role)
  const es = locale === 'es'
  const warehouses = await listWarehousesForFilter()

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {es ? 'Etiquetas' : 'Labels'}
        </h1>
        <p className="text-sm text-muted-foreground">
          {es
            ? 'Imprime etiquetas con código QR y nombre del producto (50 × 30 mm).'
            : 'Print QR + product-name labels (50 × 30 mm).'}
        </p>
      </div>
      <LabelPrinter warehouses={warehouses} locale={locale} />
    </div>
  )
}
