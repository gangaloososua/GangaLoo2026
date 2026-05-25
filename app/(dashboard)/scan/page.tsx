// Round 37g — scanner test page (/scan).
import { requireAdminCaller } from '@/lib/auth/guard'
import { listWarehousesForFilter } from '@/lib/sales'
import { localeForRole } from '@/lib/i18n/dictionary'
import { ScanTester } from './scan-tester'

export const dynamic = 'force-dynamic'

export default async function ScanTestPage() {
  const caller = await requireAdminCaller()
  const locale = localeForRole(caller.role)
  const es = locale === 'es'
  const warehouses = await listWarehousesForFilter()

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {es ? 'Escáner (prueba)' : 'Scanner (test)'}
        </h1>
        <p className="text-sm text-muted-foreground">
          {es
            ? 'Escanea un código QR para comprobar que encuentra el producto.'
            : 'Scan a QR code to check it finds the product.'}
        </p>
      </div>
      <ScanTester warehouses={warehouses} locale={locale} />
    </div>
  )
}
