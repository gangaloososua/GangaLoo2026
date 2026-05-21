'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { StockMovementRow, CategoryOption } from '@/lib/inventory'
import { searchLedgerProducts } from './actions'

type WarehouseOption = { id: string; name: string }

type Props = {
  rows: StockMovementRow[]
  warehouses: WarehouseOption[]
  categories: CategoryOption[]
  current: {
    warehouse: string
    kind: string
    category: string
    product: string
    from: string
    to: string
  }
}

const KIND_LABELS: Record<string, string> = {
  purchase_in: 'Purchase in',
  sale_out: 'Sale out',
  transfer_in: 'Transfer in',
  transfer_out: 'Transfer out',
  adjustment_in: 'Adjustment in',
  adjustment_out: 'Adjustment out',
  return_in: 'Return in',
  initial: 'Initial',
}

const KIND_ORDER = [
  'purchase_in',
  'sale_out',
  'transfer_in',
  'transfer_out',
  'adjustment_in',
  'adjustment_out',
  'return_in',
  'initial',
]

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function fmtCost(c: number | null): string {
  if (c === null) return '—'
  return (
    'RD$' +
    c.toLocaleString('en-GB', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  )
}

const selectClass =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

type ProductHit = { id: string; name: string; sku: string | null }

export function MovementsLedger({
  rows,
  warehouses,
  categories,
  current,
}: Props) {
  const router = useRouter()

  // Only top-level (parent) categories are selectable — picking one also
  // catches its subcategories (handled server-side).
  const parentCategories = categories.filter((c) => c.parentId === null)

  // Controlled values for the URL-driving filters.
  const [warehouse, setWarehouse] = useState(current.warehouse)
  const [kind, setKind] = useState(current.kind)
  const [category, setCategory] = useState(current.category)
  const [from, setFrom] = useState(current.from)
  const [to, setTo] = useState(current.to)

  // Product type-to-search state.
  const [productId, setProductId] = useState(current.product)
  // Find the label for a currently-applied product id from the rows we have.
  const initialProductName =
    current.product &&
    (rows.find((r) => r.productId === current.product)?.productName ?? '')
  const [productLabel, setProductLabel] = useState(initialProductName || '')
  const [productQuery, setProductQuery] = useState('')
  const [hits, setHits] = useState<ProductHit[]>([])
  const [showHits, setShowHits] = useState(false)
  const [searching, setSearching] = useState(false)
  const boxRef = useRef<HTMLDivElement | null>(null)

  // Debounced search as the user types.
  useEffect(() => {
    const q = productQuery.trim()
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
  }, [productQuery])

  // Close the results dropdown on outside click.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setShowHits(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  function pickProduct(p: ProductHit) {
    setProductId(p.id)
    setProductLabel(p.name)
    setProductQuery('')
    setHits([])
    setShowHits(false)
  }

  function clearProduct() {
    setProductId('')
    setProductLabel('')
    setProductQuery('')
    setHits([])
    setShowHits(false)
  }

  function applyFilters() {
    const params = new URLSearchParams()
    if (warehouse) params.set('warehouse', warehouse)
    if (kind) params.set('kind', kind)
    if (category) params.set('category', category)
    if (productId) params.set('product', productId)
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    const qs = params.toString()
    router.push(qs ? '/inventory?' + qs : '/inventory')
  }

  function clearAll() {
    setWarehouse('')
    setKind('')
    setCategory('')
    clearProduct()
    setFrom('')
    setTo('')
    router.push('/inventory')
  }

  const hasFilters =
    !!current.warehouse ||
    !!current.kind ||
    !!current.category ||
    !!current.product ||
    !!current.from ||
    !!current.to

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          applyFilters()
        }}
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        <div className="space-y-1">
          <Label className="text-xs">Warehouse</Label>
          <select
            value={warehouse}
            onChange={(e) => setWarehouse(e.target.value)}
            className={selectClass}
          >
            <option value="">All warehouses</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Category</Label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={selectClass}
          >
            <option value="">All categories</option>
            {parentCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Type</Label>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className={selectClass}
          >
            <option value="">All types</option>
            {KIND_ORDER.map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1" ref={boxRef}>
          <Label className="text-xs">Product</Label>
          {productId ? (
            <div className="flex h-9 items-center justify-between rounded-md border border-input px-3 text-sm">
              <span className="truncate">{productLabel || 'Selected product'}</span>
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
                value={productQuery}
                onChange={(e) => setProductQuery(e.target.value)}
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

        <div className="space-y-1">
          <Label className="text-xs">From</Label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className={selectClass}
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs">To</Label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className={selectClass}
          />
        </div>

        <div className="flex gap-2 sm:col-span-2 lg:col-span-3">
          <Button type="submit">Apply</Button>
          {hasFilters ? (
            <Button type="button" variant="outline" onClick={clearAll}>
              Clear
            </Button>
          ) : null}
        </div>
      </form>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No movements match these filters.
        </p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Warehouse</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Unit cost</TableHead>
                <TableHead>Reason / by</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {fmtDate(m.occurredAt)}
                  </TableCell>
                  <TableCell className="font-medium">{m.productName}</TableCell>
                  <TableCell>{m.warehouseName}</TableCell>
                  <TableCell>{KIND_LABELS[m.kind] ?? m.kind}</TableCell>
                  <TableCell
                    className={
                      'text-right tabular-nums ' +
                      (m.qtyDelta < 0 ? 'text-rose-600' : 'text-emerald-700')
                    }
                  >
                    {m.qtyDelta > 0 ? '+' : ''}
                    {m.qtyDelta}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {fmtCost(m.unitCostDop)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {m.adjustmentReason ? m.adjustmentReason + ' · ' : ''}
                    {m.createdByName ?? ''}
                    {!m.adjustmentReason && !m.createdByName ? '—' : ''}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
