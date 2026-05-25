'use client'
// Round 37e — placement editor (Asignar productos). [v2: + camera scan to select]
//
// Pick a warehouse, search a product (reusing the register's product loader),
// select it, then see/add/edit/remove how many units sit at each location.
// Saves via the placement actions; reads on-hand from the search result so we
// can gently flag when placed > on-hand.

import { useEffect, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Search, Plus, Trash2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { ProductSearchResult } from '@/lib/sales'
import type { Locale } from '@/lib/i18n/dictionary'
import { tl } from '@/lib/i18n/locations-i18n'
import { QrScanButton } from '@/components/qr-scanner'
import { findProductBySkuAction } from '@/app/(dashboard)/scan/actions'
import { loadRegisterProducts } from '@/app/(dashboard)/caja/actions'
import {
  listProductPlacements,
  setPlacement,
  removePlacement,
  type PlacementRow,
} from './actions'

type LookupItem = { id: string; name: string }
type LocationItem = { id: string; warehouse_id: string; name: string }

type Props = {
  warehouses: LookupItem[]
  locations: LocationItem[]
  locale: Locale
}

const DEBOUNCE_MS = 250

export function PlacementEditor({ warehouses, locations, locale }: Props) {
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? '')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ProductSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<ProductSearchResult | null>(null)
  const [placements, setPlacements] = useState<PlacementRow[]>([])
  const [addLocId, setAddLocId] = useState('')
  const [addQty, setAddQty] = useState('1')
  const [pending, start] = useTransition()
  const reqId = useRef(0)

  const whLocations = locations.filter((l) => l.warehouse_id === warehouseId)

  // Debounced product search within the chosen warehouse.
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

  function onWarehouseChange(id: string) {
    setWarehouseId(id)
    setSelected(null)
    setPlacements([])
    setResults([])
    setQuery('')
    setAddLocId('')
  }

  async function selectProduct(p: ProductSearchResult) {
    setSelected(p)
    setResults([])
    setQuery('')
    setAddLocId('')
    setAddQty('1')
    const res = await listProductPlacements(p.id, warehouseId)
    setPlacements(res.ok ? res.rows : [])
  }

  async function handleScan(code: string) {
    const res = await findProductBySkuAction(warehouseId, code)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    if (res.product) {
      selectProduct(res.product)
    } else {
      toast.error(locale === 'es' ? 'No se encontró ese código.' : 'No product for that code.')
    }
  }

  function refreshPlacements() {
    if (!selected) return
    listProductPlacements(selected.id, warehouseId).then((res) => {
      if (res.ok) setPlacements(res.rows)
    })
  }

  function savePlacement(locationId: string, qty: number, okKey: string) {
    if (!selected) return
    start(async () => {
      const res = await setPlacement(selected.id, locationId, qty)
      if (res.ok) {
        toast.success(tl(locale, okKey))
        refreshPlacements()
      } else {
        toast.error(tl(locale, 'loc.assign.toast.failed'))
      }
    })
  }

  function remove(locationId: string) {
    if (!selected) return
    start(async () => {
      const res = await removePlacement(selected.id, locationId)
      if (res.ok) {
        toast.success(tl(locale, 'loc.assign.toast.removed'))
        refreshPlacements()
      } else {
        toast.error(tl(locale, 'loc.assign.toast.failed'))
      }
    })
  }

  function addNew() {
    if (!addLocId) {
      toast.error(tl(locale, 'loc.assign.toast.pickLoc'))
      return
    }
    const n = Math.max(1, parseInt(addQty, 10) || 1)
    savePlacement(addLocId, n, 'loc.assign.toast.saved')
    setAddLocId('')
    setAddQty('1')
  }

  const placedTotal = placements.reduce((n, p) => n + p.qty, 0)
  const usedLocIds = new Set(placements.map((p) => p.location_id))
  const addableLocations = whLocations.filter((l) => !usedLocIds.has(l.id))

  return (
    <div className="space-y-4">
      {/* Warehouse + search */}
      <div className="flex flex-col gap-2 sm:flex-row">
        {warehouses.length > 1 ? (
          <Select value={warehouseId} onValueChange={onWarehouseChange}>
            <SelectTrigger className="sm:w-56">
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
            placeholder={tl(locale, 'loc.assign.searchPh')}
            className="pl-9"
            autoComplete="off"
          />
          {query.trim().length >= 2 && (results.length > 0 || searching) ? (
            <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-80 overflow-y-auto rounded-md border bg-popover shadow-lg">
              {searching ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  {tl(locale, 'loc.assign.searching')}
                </div>
              ) : (
                results.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => selectProduct(r)}
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
                    <div className="shrink-0 text-xs text-muted-foreground">
                      {r.qty_on_hand}
                    </div>
                  </button>
                ))
              )}
            </div>
          ) : null}
        </div>
        <QrScanButton locale={locale} onScan={handleScan} />
      </div>

      {/* Selected product + placements */}
      {!selected ? (
        <Card>
          <CardContent className="px-6 py-10 text-center text-sm text-muted-foreground">
            {tl(locale, 'loc.assign.pickProduct')}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{selected.name}</CardTitle>
            <div className="text-xs text-muted-foreground">
              {selected.sku} · {tl(locale, 'loc.assign.onHand')}: {selected.qty_on_hand} ·{' '}
              {tl(locale, 'loc.assign.placed')}: {placedTotal}
            </div>
            {placedTotal > selected.qty_on_hand ? (
              <div className="text-xs text-amber-700">{tl(locale, 'loc.assign.placedMore')}</div>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Current placements */}
            <div>
              <div className="mb-1 text-xs font-medium text-muted-foreground">
                {tl(locale, 'loc.assign.current')}
              </div>
              {placements.length === 0 ? (
                <p className="text-sm text-muted-foreground">{tl(locale, 'loc.assign.none')}</p>
              ) : (
                <div className="divide-y rounded-md border">
                  {placements.map((p) => (
                    <PlacementRowEdit
                      key={p.location_id}
                      row={p}
                      locale={locale}
                      pending={pending}
                      onSave={(qty) => savePlacement(p.location_id, qty, 'loc.assign.toast.saved')}
                      onRemove={() => remove(p.location_id)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Add to a location */}
            <div>
              <div className="mb-1 text-xs font-medium text-muted-foreground">
                {tl(locale, 'loc.assign.addHere')}
              </div>
              {whLocations.length === 0 ? (
                <p className="text-sm text-muted-foreground">{tl(locale, 'loc.assign.noLocs')}</p>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={addLocId} onValueChange={setAddLocId}>
                    <SelectTrigger className="w-56">
                      <SelectValue placeholder={tl(locale, 'loc.assign.pickLoc')} />
                    </SelectTrigger>
                    <SelectContent>
                      {addableLocations.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    value={addQty}
                    onChange={(e) => setAddQty(e.target.value)}
                    className="w-20"
                    aria-label={tl(locale, 'loc.assign.qty')}
                  />
                  <Button type="button" onClick={addNew} disabled={pending}>
                    <Plus className="mr-1 h-4 w-4" />
                    {tl(locale, 'loc.assign.add')}
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function PlacementRowEdit({
  row,
  locale,
  pending,
  onSave,
  onRemove,
}: {
  row: PlacementRow
  locale: Locale
  pending: boolean
  onSave: (qty: number) => void
  onRemove: () => void
}) {
  const [qty, setQty] = useState(String(row.qty))

  // Keep the input in sync if the row's qty changes after a refresh.
  useEffect(() => {
    setQty(String(row.qty))
  }, [row.qty])

  const n = Math.max(0, parseInt(qty, 10) || 0)
  const dirty = n !== row.qty

  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <span className="min-w-0 flex-1 truncate text-sm">{row.location_name}</span>
      <Input
        type="number"
        min={0}
        step={1}
        value={qty}
        onChange={(e) => setQty(e.target.value)}
        className="w-20"
        aria-label={tl(locale, 'loc.assign.qty')}
      />
      <Button
        type="button"
        size="sm"
        variant={dirty ? 'default' : 'outline'}
        disabled={pending || !dirty}
        onClick={() => onSave(n)}
      >
        {tl(locale, 'loc.save')}
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        disabled={pending}
        onClick={onRemove}
        aria-label={tl(locale, 'loc.assign.remove')}
      >
        <Trash2 className="h-4 w-4 text-rose-600" />
      </Button>
    </div>
  )
}
