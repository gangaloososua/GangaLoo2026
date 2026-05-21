'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { recordStockAdjustment } from './actions'
import { searchLedgerProducts } from './actions'

type WarehouseOption = { id: string; name: string }
type Props = { warehouses: WarehouseOption[] }

type ProductHit = { id: string; name: string; sku: string | null }

const REASONS = [
  'Damaged',
  'Theft',
  'Lost',
  'Expired',
  'Count correction',
  'Other',
]

const selectClass =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

export function AdjustmentForm({ warehouses }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Product search.
  const [productId, setProductId] = useState('')
  const [productLabel, setProductLabel] = useState('')
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<ProductHit[]>([])
  const [showHits, setShowHits] = useState(false)
  const [searching, setSearching] = useState(false)
  const boxRef = useRef<HTMLDivElement | null>(null)

  const [warehouseId, setWarehouseId] = useState('')
  const [direction, setDirection] = useState<'remove' | 'add'>('remove')
  const [qty, setQty] = useState('')
  const [reason, setReason] = useState(REASONS[0])
  const [note, setNote] = useState('')
  const [unitCost, setUnitCost] = useState('')

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setHits([])
      return
    }
    let cancelled = false
    setSearching(true)
    const t = setTimeout(async () => {
      try {
        const res = await searchLedgerProducts(q)
        if (!cancelled) {
          setHits(res)
          setShowHits(true)
        }
      } finally {
        if (!cancelled) setSearching(false)
      }
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [query])

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setShowHits(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  function pickProduct(p: ProductHit) {
    setProductId(p.id)
    setProductLabel(p.name)
    setQuery('')
    setHits([])
    setShowHits(false)
  }

  function clearProduct() {
    setProductId('')
    setProductLabel('')
  }

  function handleSubmit() {
    setError(null)
    const qtyNum = Number(qty)
    const costNum = unitCost === '' ? null : Number(unitCost)

    if (!productId) return setError('Pick a product.')
    if (!warehouseId) return setError('Pick a warehouse.')
    if (!Number.isFinite(qtyNum) || qtyNum <= 0)
      return setError('Quantity must be greater than zero.')
    if (direction === 'add' && (costNum === null || !Number.isFinite(costNum) || costNum < 0))
      return setError('Enter the unit cost for added stock.')

    startTransition(async () => {
      const result = await recordStockAdjustment({
        productId,
        warehouseId,
        direction,
        qty: qtyNum,
        reason,
        note: note.trim() || null,
        unitCostDop: direction === 'add' ? costNum : null,
      })
      if ('error' in result) {
        // Make the RPC's raw insufficient_stock message friendlier.
        const msg = result.error.includes('insufficient_stock')
          ? 'Not enough stock to remove that many. ' + result.error
          : result.error
        setError(msg)
        return
      }
      toast.success(
        (direction === 'add' ? 'Added ' : 'Removed ') + qtyNum + ' units.',
      )
      // Reset for the next entry.
      clearProduct()
      setQty('')
      setNote('')
      setUnitCost('')
      router.refresh()
    })
  }

  return (
    <div className="max-w-xl space-y-5">
      {/* Product */}
      <div className="space-y-1" ref={boxRef}>
        <Label className="text-xs">Product</Label>
        {productId ? (
          <div className="flex h-9 items-center justify-between rounded-md border border-input px-3 text-sm">
            <span className="truncate">{productLabel}</span>
            <button
              type="button"
              onClick={clearProduct}
              className="ml-2 text-muted-foreground hover:text-destructive"
              aria-label="Clear product"
            >
              ×
            </button>
          </div>
        ) : (
          <div className="relative">
            <Input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => hits.length > 0 && setShowHits(true)}
              placeholder="Type to search a product…"
            />
            {showHits && (hits.length > 0 || searching) ? (
              <div className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-popover shadow-md">
                {searching && hits.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-muted-foreground">
                    Searching…
                  </div>
                ) : (
                  hits.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => pickProduct(p)}
                      className="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
                    >
                      {p.name}
                      {p.sku ? (
                        <span className="text-muted-foreground"> · {p.sku}</span>
                      ) : null}
                    </button>
                  ))
                )}
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* Warehouse */}
      <div className="space-y-1">
        <Label className="text-xs">Warehouse</Label>
        <select
          value={warehouseId}
          onChange={(e) => setWarehouseId(e.target.value)}
          className={selectClass}
        >
          <option value="">Pick a warehouse…</option>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </div>

      {/* Direction */}
      <div className="space-y-1">
        <Label className="text-xs">Direction</Label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setDirection('remove')}
            className={
              'flex-1 rounded-md border px-3 py-2 text-sm ' +
              (direction === 'remove'
                ? 'border-rose-500 bg-rose-50 text-rose-700'
                : 'hover:bg-accent')
            }
          >
            Remove stock
            <span className="block text-xs text-muted-foreground">
              Damage, theft, loss
            </span>
          </button>
          <button
            type="button"
            onClick={() => setDirection('add')}
            className={
              'flex-1 rounded-md border px-3 py-2 text-sm ' +
              (direction === 'add'
                ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                : 'hover:bg-accent')
            }
          >
            Add stock
            <span className="block text-xs text-muted-foreground">
              Found, correction up
            </span>
          </button>
        </div>
      </div>

      {/* Qty + (cost when adding) */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">Quantity</Label>
          <Input
            type="number"
            min="0"
            step="1"
            inputMode="decimal"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder="0"
          />
        </div>
        {direction === 'add' ? (
          <div className="space-y-1">
            <Label className="text-xs">Unit cost (RD$)</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={unitCost}
              onChange={(e) => setUnitCost(e.target.value)}
              placeholder="0"
            />
            <p className="text-xs text-muted-foreground">
              What this found stock is worth per unit.
            </p>
          </div>
        ) : null}
      </div>

      {/* Reason + note */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">Reason</Label>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className={selectClass}
          >
            {REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Note (optional)</Label>
          <Input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. water damage in back room"
          />
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex gap-2">
        <Button type="button" onClick={handleSubmit} disabled={isPending}>
          {isPending ? 'Saving…' : 'Record adjustment'}
        </Button>
      </div>
    </div>
  )
}
