'use client'

import { useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { formatDOP } from '@/lib/format'
import { searchProductsForSaleAction } from '../actions'
import type { ProductSearchResult } from '@/lib/sales'

type Props = {
  warehouseId: string
  onAdd: (product: ProductSearchResult) => void
}

const DEBOUNCE_MS = 250
const MIN_QUERY_LEN = 2

export function ProductSearch({ warehouseId, onAdd }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ProductSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const reqIdRef = useRef(0)
  const containerRef = useRef<HTMLDivElement>(null)

  // Click-outside closes the dropdown without clearing the input —
  // operator might want to re-open and pick again.
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  // Debounced fetch. Each call gets a monotonically increasing reqId;
  // late responses to old queries are dropped.
  useEffect(() => {
    const q = query.trim()
    if (q.length < MIN_QUERY_LEN) {
      setResults([])
      setLoading(false)
      setError(null)
      return
    }

    const myReqId = ++reqIdRef.current
    setLoading(true)
    setError(null)

    const t = setTimeout(async () => {
      const res = await searchProductsForSaleAction({
        query: q,
        warehouseId,
      })
      if (myReqId !== reqIdRef.current) return
      setLoading(false)
      if (res.ok) {
        setResults(res.results)
      } else {
        setResults([])
        setError(res.error)
      }
    }, DEBOUNCE_MS)

    return () => clearTimeout(t)
  }, [query, warehouseId])

  function handlePick(p: ProductSearchResult) {
    onAdd(p)
    setQuery('')
    setResults([])
    setOpen(false)
  }

  function stockBadge(qty: number) {
    if (qty <= 0) {
      return (
        <Badge className="bg-rose-100 text-rose-800 hover:bg-rose-100">
          out
        </Badge>
      )
    }
    if (qty < 5) {
      return (
        <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">
          {qty}
        </Badge>
      )
    }
    return <Badge variant="secondary">{qty}</Badge>
  }

  return (
    <div ref={containerRef} className="relative">
      <Input
        placeholder="Search by SKU or name…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        autoComplete="off"
      />

      {open && query.trim().length >= MIN_QUERY_LEN && (
        <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-[28rem] overflow-y-auto rounded-md border bg-popover shadow-lg">
          {loading && (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              Searching…
            </div>
          )}
          {error && (
            <div className="px-3 py-2 text-sm text-rose-700">{error}</div>
          )}
          {!loading && !error && results.length === 0 && (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              No products match.
            </div>
          )}
          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => handlePick(r)}
              className="flex w-full min-h-[52px] items-center gap-3 border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted/40"
            >
              <div className="size-9 shrink-0 overflow-hidden rounded bg-muted">
                {r.primary_image_url ? (
                  // Plain img is fine for a 36px thumb from Supabase storage.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={r.primary_image_url}
                    alt=""
                    className="size-full object-cover"
                  />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{r.name}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {r.sku}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-sm">
                  {formatDOP(
                    r.warehouse_price_override_cents ?? r.base_price_cents
                  )}
                </div>
                <div className="mt-0.5">{stockBadge(r.qty_on_hand)}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
