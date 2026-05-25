'use client'
// Round 37h — stock locator (¿Dónde está?).
//
// Search or scan a product; show the product plus which locations hold it (and
// how many) in the chosen warehouse. Pure composition: reuses the register's
// product loader, the scanner lookup, the placement reader, and the scanner.

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Search, MapPin } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
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
import { loadRegisterProducts } from '@/app/(dashboard)/caja/actions'
import { findProductBySkuAction } from '@/app/(dashboard)/scan/actions'
import {
  listProductPlacements,
  type PlacementRow,
} from '@/app/(dashboard)/locations/asignar/actions'

type LookupItem = { id: string; name: string }
const DEBOUNCE_MS = 250

export function Locator({
  warehouses,
  locale,
}: {
  warehouses: LookupItem[]
  locale: Locale
}) {
  const es = locale === 'es'
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? '')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ProductSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<ProductSearchResult | null>(null)
  const [locations, setLocations] = useState<PlacementRow[]>([])
  const [loadingLocs, setLoadingLocs] = useState(false)
  const reqId = useRef(0)

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      setSearching(false)
      return
    }
    const myId = ++reqId.current
    setSearching(true)
    const tmr = setTimeout(async () => {
      const res = await loadRegisterProducts({ warehouseId, query: q })
      if (myId !== reqId.current) return
      setSearching(false)
      setResults(res.ok ? res.products : [])
    }, DEBOUNCE_MS)
    return () => clearTimeout(tmr)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, warehouseId])

  async function select(p: ProductSearchResult) {
    setSelected(p)
    setResults([])
    setQuery('')
    setLoadingLocs(true)
    const res = await listProductPlacements(p.id, warehouseId)
    setLoadingLocs(false)
    setLocations(res.ok ? res.rows : [])
  }

  async function handleScan(code: string) {
    const res = await findProductBySkuAction(warehouseId, code)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    if (res.product) select(res.product)
    else toast.error(es ? 'No se encontró ese código.' : 'No product for that code.')
  }

  function onWarehouseChange(id: string) {
    setWarehouseId(id)
    setSelected(null)
    setLocations([])
    setResults([])
    setQuery('')
  }

  return (
    <div className="max-w-xl space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        {warehouses.length > 1 ? (
          <Select value={warehouseId} onValueChange={onWarehouseChange}>
            <SelectTrigger className="sm:w-52">
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
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={es ? 'Buscar producto o SKU…' : 'Search product or SKU…'}
            className="pl-9"
            autoComplete="off"
          />
          {query.trim().length >= 2 && (results.length > 0 || searching) ? (
            <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-80 overflow-y-auto rounded-md border bg-popover shadow-lg">
              {searching ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  {es ? 'Buscando…' : 'Searching…'}
                </div>
              ) : (
                results.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => select(r)}
                    className="flex w-full items-center gap-3 border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted/40"
                  >
                    <div className="size-9 shrink-0 overflow-hidden rounded bg-muted">
                      {r.primary_image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.primary_image_url} alt="" className="size-full object-cover" />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{r.name}</div>
                      <div className="truncate text-xs text-muted-foreground">{r.sku}</div>
                    </div>
                  </button>
                ))
              )}
            </div>
          ) : null}
        </div>
        <QrScanButton locale={locale} onScan={handleScan} />
      </div>

      {!selected ? (
        <Card>
          <CardContent className="px-6 py-10 text-center text-sm text-muted-foreground">
            {es
              ? 'Busca o escanea un producto para ver dónde está.'
              : 'Search or scan a product to see where it is.'}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-3 text-base">
              <div className="size-12 shrink-0 overflow-hidden rounded bg-muted">
                {selected.primary_image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={selected.primary_image_url} alt="" className="size-full object-cover" />
                ) : null}
              </div>
              <div className="min-w-0">
                <div className="truncate">{selected.name}</div>
                <div className="text-xs font-normal text-muted-foreground">
                  {selected.sku} · {es ? 'Disponible' : 'On hand'}: {selected.qty_on_hand} ·{' '}
                  {formatDOP(selected.warehouse_price_override_cents ?? selected.base_price_cents)}
                </div>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-2 flex items-center gap-1 text-xs font-medium text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" />
              {es ? 'Locaciones' : 'Locations'}
            </div>
            {loadingLocs ? (
              <p className="text-sm text-muted-foreground">{es ? 'Cargando…' : 'Loading…'}</p>
            ) : locations.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {es ? 'No está asignado a ninguna locación.' : 'Not placed in any location.'}
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {locations.map((l) => (
                  <Badge key={l.location_id} variant="secondary" className="text-sm">
                    {l.location_name} · {l.qty}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
