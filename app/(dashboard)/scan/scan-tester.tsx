'use client'
// Round 37g — scanner test harness. Scan a QR and see the decoded text plus
// the product it matched (or "not found"). Proves camera + decode + lookup
// before we wire the scanner into the real screens.
import { useState } from 'react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatDOP } from '@/lib/format'
import type { ProductSearchResult } from '@/lib/sales'
import type { Locale } from '@/lib/i18n/dictionary'
import { QrScanButton } from '@/components/qr-scanner'
import { findProductBySkuAction } from './actions'

type LookupItem = { id: string; name: string }

export function ScanTester({
  warehouses,
  locale,
}: {
  warehouses: LookupItem[]
  locale: Locale
}) {
  const es = locale === 'es'
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? '')
  const [code, setCode] = useState<string | null>(null)
  const [product, setProduct] = useState<ProductSearchResult | null>(null)
  const [notFound, setNotFound] = useState(false)

  async function handleScan(text: string) {
    setCode(text)
    setProduct(null)
    setNotFound(false)
    const res = await findProductBySkuAction(warehouseId, text)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    if (res.product) setProduct(res.product)
    else setNotFound(true)
  }

  return (
    <div className="max-w-md space-y-4">
      <div className="flex items-center gap-2">
        {warehouses.length > 1 ? (
          <Select value={warehouseId} onValueChange={setWarehouseId}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {warehouses.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        <QrScanButton
          locale={locale}
          variant="default"
          onScan={handleScan}
          label={es ? 'Escanear código' : 'Scan code'}
        />
      </div>

      {code ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{es ? 'Código leído' : 'Scanned code'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="break-all font-mono text-xs">{code}</div>
            {product ? (
              <div className="rounded-md border p-2">
                <div className="font-medium">{product.name}</div>
                <div className="text-xs text-muted-foreground">{product.sku}</div>
                <div className="mt-1 text-xs">
                  {es ? 'Disponible' : 'On hand'}: {product.qty_on_hand} ·{' '}
                  {formatDOP(product.warehouse_price_override_cents ?? product.base_price_cents)}
                </div>
              </div>
            ) : notFound ? (
              <div className="text-rose-700">
                {es ? 'No se encontró un producto con ese código.' : 'No product found for that code.'}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
