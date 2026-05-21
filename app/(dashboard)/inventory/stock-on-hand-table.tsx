'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { StockOnHandRow } from '@/lib/inventory'

type WarehouseOption = { id: string; name: string }
type CategoryOption = { id: string; name: string }

type Props = {
  rows: StockOnHandRow[]
  warehouses?: WarehouseOption[]
  categories?: CategoryOption[]
  // When true, product names link to that product's history (owners only).
  enableHistoryLink?: boolean
}

const selectClass =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

function fmtInt(n: number): string {
  return Math.round(n).toLocaleString('en-GB')
}

type Group = {
  categoryId: string
  categoryName: string
  rows: StockOnHandRow[]
  subtotal: number
}

const DEFAULT_LOW = 5

export function StockOnHandTable({
  rows,
  warehouses,
  categories,
  enableHistoryLink = false,
}: Props) {
  const [warehouseId, setWarehouseId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [lowThreshold, setLowThreshold] = useState(DEFAULT_LOW)
  // Show out-of-stock rows? Default off so the view stays tidy; the user can
  // flip it on to see what ran out.
  const [showOut, setShowOut] = useState(false)

  const showFilters = !!warehouses && warehouses.length > 0

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (!showOut && r.qtyOnHand <= 0) return false
      if (warehouseId && r.warehouseId !== warehouseId) return false
      if (categoryId) {
        if (categoryId === '__uncategorized__') {
          if (r.categoryId !== null) return false
        } else if (r.categoryId !== categoryId) {
          return false
        }
      }
      return true
    })
  }, [rows, warehouseId, categoryId, showOut])

  const groups = useMemo(() => {
    const byCat = new Map<string, Group>()
    const order: string[] = []
    for (const r of filtered) {
      const key = r.categoryId ?? '__uncategorized__'
      let g = byCat.get(key)
      if (!g) {
        g = { categoryId: key, categoryName: r.categoryName, rows: [], subtotal: 0 }
        byCat.set(key, g)
        order.push(key)
      }
      g.rows.push(r)
      g.subtotal += r.qtyOnHand
    }
    return order.map((k) => byCat.get(k) as Group)
  }, [filtered])

  // Summary counts across the filtered set.
  const counts = useMemo(() => {
    let inStock = 0
    let low = 0
    let out = 0
    for (const r of filtered) {
      if (r.qtyOnHand <= 0) out += 1
      else if (r.qtyOnHand <= lowThreshold) low += 1
      else inStock += 1
    }
    return { inStock, low, out }
  }, [filtered, lowThreshold])

  function qtyClass(qty: number): string {
    if (qty <= 0) return 'text-rose-600 font-semibold'
    if (qty <= lowThreshold) return 'text-amber-600 font-semibold'
    return ''
  }

  function qtyLabel(qty: number): string {
    if (qty <= 0) return 'Out'
    if (qty <= lowThreshold) return 'Low'
    return ''
  }

  return (
    <div className="space-y-4">
      {showFilters ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
          <div className="space-y-1">
            <Label className="text-xs">Warehouse</Label>
            <select
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              className={selectClass}
            >
              <option value="">All warehouses</option>
              {warehouses!.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
          {categories && categories.length > 0 ? (
            <div className="space-y-1">
              <Label className="text-xs">Category</Label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className={selectClass}
              >
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
                <option value="__uncategorized__">(uncategorized)</option>
              </select>
            </div>
          ) : null}
          <div className="space-y-1">
            <Label className="text-xs">Low below</Label>
            <Input
              type="number"
              min={1}
              value={lowThreshold}
              onChange={(e) => setLowThreshold(Math.max(0, Number(e.target.value) || 0))}
              className="w-24"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showOut}
              onChange={(e) => setShowOut(e.target.checked)}
            />
            Show out of stock
          </label>
          {enableHistoryLink ? (
            <Link
              href={
                '/inventory/count-sheet?out=' +
                (showOut ? '1' : '0') +
                (warehouseId ? '&warehouse=' + warehouseId : '') +
                (categoryId && categoryId !== '__uncategorized__'
                  ? '&category=' + categoryId
                  : '')
              }
              target="_blank"
              className="inline-flex h-9 items-center rounded-md border px-3 text-sm hover:bg-accent"
            >
              Print count sheet
            </Link>
          ) : null}
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing matches this filter.
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            <span className="text-foreground">{fmtInt(counts.inStock)}</span> in
            stock · <span className="text-amber-600">{fmtInt(counts.low)}</span>{' '}
            low · <span className="text-rose-600">{fmtInt(counts.out)}</span> out
          </p>
          <div className="space-y-6">
            {groups.map((g) => (
              <div key={g.categoryId} className="space-y-2">
                <div className="flex items-baseline justify-between">
                  <h3 className="text-sm font-medium">{g.categoryName}</h3>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {fmtInt(g.subtotal)} units
                  </span>
                </div>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>Warehouse</TableHead>
                        <TableHead className="text-right">In stock</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {g.rows.map((r) => (
                        <TableRow key={r.productId + '|' + r.warehouseId}>
                          <TableCell className="font-medium">
                            {enableHistoryLink ? (
                              <Link
                                href={'/inventory?product=' + r.productId}
                                className="text-blue-600 hover:underline"
                              >
                                {r.productName}
                              </Link>
                            ) : (
                              r.productName
                            )}
                          </TableCell>
                          <TableCell>{r.warehouseName}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            <span className={qtyClass(r.qtyOnHand)}>
                              {fmtInt(r.qtyOnHand)}
                            </span>
                            {qtyLabel(r.qtyOnHand) ? (
                              <span
                                className={
                                  'ml-2 text-xs ' +
                                  (r.qtyOnHand <= 0
                                    ? 'text-rose-600'
                                    : 'text-amber-600')
                                }
                              >
                                {qtyLabel(r.qtyOnHand)}
                              </span>
                            ) : null}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
