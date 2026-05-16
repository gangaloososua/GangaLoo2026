'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Search, Plus } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import type { ProductListItem } from '@/lib/products'

type Props = {
  initialRows: ProductListItem[]
  total: number
  page: number
  pageSize: number
  categories: Array<{ id: string; name: string; parent_id: string | null }>
  currentFilters: {
    search?: string
    categoryId?: string
    active: 'all' | 'active' | 'inactive'
    visible: 'all' | 'visible' | 'hidden'
  }
}

const fmtDOP = new Intl.NumberFormat('es-DO', {
  style: 'currency',
  currency: 'DOP',
  minimumFractionDigits: 0,
})

export function ProductsClient({
  initialRows,
  total,
  page,
  pageSize,
  categories,
  currentFilters,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [searchInput, setSearchInput] = useState(currentFilters.search ?? '')

  function updateParam(key: string, value: string | undefined) {
    const params = new URLSearchParams(sp.toString())
    if (value === undefined || value === '' || value === 'all') {
      params.delete(key)
    } else {
      params.set(key, value)
    }
    if (key !== 'page') params.delete('page')
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`)
    })
  }

  // Debounced search: 300ms after user stops typing, update URL.
  useEffect(() => {
    if ((searchInput || '') === (currentFilters.search || '')) return
    const t = setTimeout(() => {
      updateParam('q', searchInput.trim() || undefined)
    }, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Products</h1>
          <p className="text-sm text-muted-foreground">{total} total</p>
        </div>
        <Button asChild>
          <Link href="/products/new">
            <Plus className="mr-2 h-4 w-4" />
            New product
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[260px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or SKU..."
            className="pl-8"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>

        <Select
          value={currentFilters.categoryId ?? 'all'}
          onValueChange={(v) => updateParam('category', v)}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={currentFilters.active}
          onValueChange={(v) => updateParam('active', v)}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={currentFilters.visible}
          onValueChange={(v) => updateParam('visible', v)}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All visibility</SelectItem>
            <SelectItem value="visible">Visible in store</SelectItem>
            <SelectItem value="hidden">Hidden</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[56px]"></TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right">Comm %</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {initialRows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="text-center py-8 text-muted-foreground"
                >
                  No products match these filters.
                </TableCell>
              </TableRow>
            ) : (
              initialRows.map((p) => (
                <TableRow
                  key={p.id}
                  className="hover:bg-muted/50"
                >
                  <TableCell>
                    {p.primary_image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.primary_image_url}
                        alt=""
                        className="h-10 w-10 rounded object-cover"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded bg-muted" />
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                  <TableCell className="font-medium">
                    <Link
                      href={`/products/${p.id}`}
                      className="hover:underline"
                    >
                      {p.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {p.primary_category?.name ?? '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    {fmtDOP.format(p.price_cents / 100)}
                  </TableCell>
                  <TableCell className="text-right">
                    {p.commission_percent.toFixed(1)}%
                  </TableCell>
                  <TableCell className="text-right">
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="hover:underline">
                          {p.stock_total}
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-56" align="end">
                        {p.stock_by_warehouse.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            No stock anywhere
                          </p>
                        ) : (
                          <div className="space-y-1 text-sm">
                            {p.stock_by_warehouse.map((s) => (
                              <div
                                key={s.warehouse_id}
                                className="flex justify-between"
                              >
                                <span className="text-muted-foreground">
                                  {s.warehouse_name}
                                </span>
                                <span className="font-medium">{s.qty}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </PopoverContent>
                    </Popover>
                  </TableCell>
                  <TableCell>
                    {!p.is_active ? (
                      <Badge variant="secondary">Inactive</Badge>
                    ) : !p.visible_in_store ? (
                      <Badge variant="outline">Hidden</Badge>
                    ) : (
                      <Badge>Live</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages} · {total} products
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || isPending}
              onClick={() => updateParam('page', String(page - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || isPending}
              onClick={() => updateParam('page', String(page + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
