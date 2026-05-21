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
  enableHistoryLink?: boolean
}

const selectClass =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

function fmtInt(n: number): string {
  return Math.round(n).toLocaleString('en-GB')
}

// One product, pivoted across warehouses.
type ProductLine = {
  productId: string
  productName: string
  categoryId: string | null
  categoryName: string
  qtyByWarehouse: Map<string, number>
  total: number
}
type Group = {
  categoryId: string
  categoryName: string
  products: ProductLine[]
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
  const [showOut, setShowOut] = useState(false)

  const showFilters = !!warehouses && warehouses.length > 0

  // Map warehouse id -> name for the selected-warehouse column filter.
  const warehouseNameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const w of warehouses ?? []) m.set(w.id, w.name)
    return m
  }, [warehouses])
  const selectedWarehouseName = warehouseId
    ? warehouseNameById.get(warehouseId) ?? ''
    : ''

  // Category-filter the raw rows first (warehouse filter is applied as a
  // column choice below, not by dropping rows).
  const catFiltered = useMemo(() => {
    return rows.filter((r) => {
      if (categoryId) {
        if (categoryId === '__uncategorized__') {
          if (r.categoryId !== null) return false
        } else if (r.categoryId !== categoryId) {
          return false
        }
      }
      return true
    })
  }, [rows, categoryId])

  // Which warehouses are columns: the selected one, or all present in data.
  const presentWarehouses = useMemo(() => {
    return Array.from(new Set(catFiltered.map((r) => r.warehouseName))).sort(
      (a, b) => a.localeCompare(b),
    )
  }, [catFiltered])
  const columnWarehouses = selectedWarehouseName
    ? presentWarehouses.filter((w) => w === selectedWarehouseName)
    : presentWarehouses

  // Pivot into per-product lines, grouped by category.
  const groups = useMemo(() => {
    const byCat = new Map<string, Group>()
    const order: string[] = []
    const lineByProduct = new Map<string, ProductLine>()

    for (const r of catFiltered) {
      const catKey = r.categoryId ?? '__uncategorized__'
      let g = byCat.get(catKey)
      if (!g) {
        g = { categoryId: catKey, categoryName: r.categoryName, products: [], subtotal: 0 }
        byCat.set(catKey, g)
        order.push(catKey)
      }
      let line = lineByProduct.get(r.productId)
      if (!line) {
        line = {
          productId: r.productId,
          productName: r.productName,
          categoryId: r.categoryId,
          categoryName: r.categoryName,
          qtyByWarehouse: new Map(),
          total: 0,
        }
        lineByProduct.set(r.productId, line)
        g.products.push(line)
      }
      line.qtyByWarehouse.set(
        r.warehouseName,
        (line.qtyByWarehouse.get(r.warehouseName) ?? 0) + r.qtyOnHand,
      )
    }

    // Compute each line's total over the COLUMN warehouses, and drop products
    // that are empty across all shown columns unless showOut.
    const result: Group[] = []
    for (const key of order) {
      const g = byCat.get(key) as Group
      const keptProducts: ProductLine[] = []
      for (const line of g.products) {
        let total = 0
        for (const w of columnWarehouses) total += line.qtyByWarehouse.get(w) ?? 0
        line.total = total
        if (total > 0 || showOut) keptProducts.push(line)
      }
      if (keptProducts.length === 0) continue
      keptProducts.sort((a, b) => a.productName.localeCompare(b.productName))
      result.push({
        ...g,
        products: keptProducts,
        subtotal: keptProducts.reduce((s, p) => s + p.total, 0),
      })
    }
    return result
  }, [catFiltered, columnWarehouses, showOut])

  // Summary: count cells (product-at-warehouse) across shown columns.
  const counts = useMemo(() => {
    let inStock = 0
    let low = 0
    let out = 0
    for (const g of groups) {
      for (const pr of g.products) {
        for (const w of columnWarehouses) {
          const q = pr.qtyByWarehouse.get(w) ?? 0
          if (q <= 0) {
            if (showOut) out += 1
          } else if (q <= lowThreshold) low += 1
          else inStock += 1
        }
      }
    }
    return { inStock, low, out }
  }, [groups, columnWarehouses, lowThreshold, showOut])

  function cellClass(qty: number): string {
    if (qty <= 0) return 'text-rose-600 font-semibold'
    if (qty <= lowThreshold) return 'text-amber-600 font-semibold'
    return ''
  }

  const showTotalCol = columnWarehouses.length > 1

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

      {groups.length === 0 || columnWarehouses.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing matches this filter.</p>
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
                        {columnWarehouses.map((w) => (
                          <TableHead key={w} className="text-right">
                            {w}
                          </TableHead>
                        ))}
                        {showTotalCol ? (
                          <TableHead className="text-right">Total</TableHead>
                        ) : null}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {g.products.map((pr) => (
                        <TableRow key={pr.productId}>
                          <TableCell className="font-medium">
                            {enableHistoryLink ? (
                              <Link
                                href={'/inventory?product=' + pr.productId}
                                className="text-blue-600 hover:underline"
                              >
                                {pr.productName}
                              </Link>
                            ) : (
                              pr.productName
                            )}
                          </TableCell>
                          {columnWarehouses.map((w) => {
                            const q = pr.qtyByWarehouse.get(w) ?? 0
                            return (
                              <TableCell
                                key={w}
                                className={'text-right tabular-nums ' + cellClass(q)}
                              >
                                {fmtInt(q)}
                              </TableCell>
                            )
                          })}
                          {showTotalCol ? (
                            <TableCell className="text-right tabular-nums font-medium">
                              {fmtInt(pr.total)}
                            </TableCell>
                          ) : null}
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
