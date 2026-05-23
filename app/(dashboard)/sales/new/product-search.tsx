'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronsUpDown, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { formatDOP } from '@/lib/format'
import { searchProductsForSaleAction } from '../actions'
import type { ProductSearchResult, SaleCategoryPickerItem } from '@/lib/sales'

type Props = {
  warehouseId: string
  categories: SaleCategoryPickerItem[]
  onAdd: (product: ProductSearchResult) => void
}

const DEBOUNCE_MS = 250
const MIN_QUERY_LEN = 2

export function ProductSearch({ warehouseId, categories, onAdd }: Props) {
  const [query, setQuery] = useState('')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [results, setResults] = useState<ProductSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [catOpen, setCatOpen] = useState(false)
  const reqIdRef = useRef(0)
  const containerRef = useRef<HTMLDivElement>(null)

  // A search is "armed" when there's a long-enough text query OR a category
  // is selected. Either one (or both) drives results.
  const hasQuery = query.trim().length >= MIN_QUERY_LEN
  const armed = hasQuery || categoryId !== null

  // Group categories main -> subs for the picker, mirroring the product
  // form's combobox. A main (parent_id null) heads its group; its subs nest
  // beneath it. cmdk searches the visible text so typing filters all groups.
  const groups = useMemo(() => {
    const m = new Map<string, { name: string; items: SaleCategoryPickerItem[] }>()
    for (const c of categories) {
      const mainId = c.parent_id ?? c.id
      const mainName =
        categories.find((x) => x.id === mainId)?.name ?? 'Other'
      if (!m.has(mainId)) m.set(mainId, { name: mainName, items: [] })
      m.get(mainId)!.items.push(c)
    }
    return [...m.entries()]
      .map(([mainId, g]) => ({
        mainId,
        name: g.name,
        items: g.items.sort((a, b) => {
          if (a.id === mainId) return -1
          if (b.id === mainId) return 1
          return a.name.localeCompare(b.name)
        }),
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [categories])

  const selectedCategoryName = categoryId
    ? categories.find((c) => c.id === categoryId)?.name ?? null
    : null

  // Click-outside closes the results dropdown without clearing the inputs —
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
  // late responses to old queries are dropped. Re-runs when the text query,
  // the chosen category, or the warehouse changes.
  useEffect(() => {
    const q = query.trim()
    if (!armed) {
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
        categoryId,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, categoryId, warehouseId])

  function handlePick(p: ProductSearchResult) {
    onAdd(p)
    setQuery('')
    setResults([])
    setOpen(false)
    // Keep the category selected so the operator can add several items
    // from the same category in a row without re-picking it.
  }

  function pickCategory(id: string) {
    setCategoryId(id)
    setCatOpen(false)
    setOpen(true)
  }

  function clearCategory() {
    setCategoryId(null)
    setOpen(true)
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
    <div ref={containerRef} className="relative space-y-2">
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

      {/* Category filter sits under the search box. Picking one lists that
          category's products (plus its sub-categories) even with no text. */}
      <div className="flex items-center gap-2">
        <Popover open={catOpen} onOpenChange={setCatOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={catOpen}
              disabled={categories.length === 0}
              className="flex-1 justify-between font-normal"
            >
              <span className={selectedCategoryName ? '' : 'text-muted-foreground'}>
                {selectedCategoryName ?? 'Filter by category…'}
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-[var(--radix-popover-trigger-width)] p-0"
            align="start"
          >
            <Command>
              <CommandInput placeholder="Search categories…" />
              <CommandList>
                <CommandEmpty>No category found.</CommandEmpty>
                {groups.map((g) => (
                  <CommandGroup key={g.mainId} heading={g.name}>
                    {g.items.map((c) => {
                      const isMain = c.id === g.mainId
                      return (
                        <CommandItem
                          key={c.id}
                          value={`${c.name} ${c.id}`}
                          onSelect={() => pickCategory(c.id)}
                          className={isMain ? 'font-medium' : 'pl-6'}
                        >
                          {c.name}
                        </CommandItem>
                      )
                    })}
                  </CommandGroup>
                ))}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {categoryId && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={clearCategory}
            aria-label="Clear category filter"
          >
            <X className="size-4" />
          </Button>
        )}
      </div>

      {open && armed && (
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
