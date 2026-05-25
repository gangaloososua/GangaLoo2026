'use client'
// Round 37b/37f — interactive locations manager. [v2: expandable product list]
//
// One card per warehouse: an "add location" box + the list of that warehouse's
// locations. Each location row can be tapped to EXPAND inline and show the
// products stored there, with editable quantity and remove. Location CRUD uses
// ./actions; product placements reuse ./asignar/actions.

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { MapPin, Plus, Pencil, Check, X, Power, Trash2, ChevronRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import type { Locale } from '@/lib/i18n/dictionary'
import { tl } from '@/lib/i18n/locations-i18n'
import {
  createLocation,
  renameLocation,
  setLocationActive,
  deleteLocation,
  type LocationActionResult,
} from './actions'
import {
  listLocationProducts,
  setPlacement,
  removePlacement,
  type LocationProduct,
} from './asignar/actions'

export type ManagerLocation = {
  id: string
  name: string
  isActive: boolean
  productCount: number
  unitCount: number
}
export type ManagerWarehouse = {
  id: string
  name: string
  locations: ManagerLocation[]
}

function word(locale: Locale, n: number, oneKey: string, otherKey: string): string {
  return tl(locale, n === 1 ? oneKey : otherKey)
}

function failToast(locale: Locale, res: Extract<LocationActionResult, { ok: false }>) {
  toast.error(res.dup ? tl(locale, 'loc.toast.dupName') : tl(locale, 'loc.toast.failed'))
}

export function LocationsManager({
  warehouses,
  locale,
}: {
  warehouses: ManagerWarehouse[]
  locale: Locale
}) {
  return (
    <div className="space-y-4">
      {warehouses.map((wh) => (
        <WarehouseCard key={wh.id} wh={wh} locale={locale} />
      ))}
    </div>
  )
}

function WarehouseCard({ wh, locale }: { wh: ManagerWarehouse; locale: Locale }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [pending, start] = useTransition()

  function add() {
    const clean = name.trim()
    if (!clean) {
      toast.error(tl(locale, 'loc.err.emptyName'))
      return
    }
    start(async () => {
      const res = await createLocation(wh.id, clean)
      if (res.ok) {
        toast.success(tl(locale, 'loc.toast.added'))
        setName('')
        router.refresh()
      } else {
        failToast(locale, res)
      }
    })
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          {wh.name}
          <span className="ml-1 text-sm font-normal text-muted-foreground">
            ({wh.locations.length})
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') add()
            }}
            placeholder={tl(locale, 'loc.addPh')}
            disabled={pending}
          />
          <Button onClick={add} disabled={pending}>
            <Plus className="mr-1 h-4 w-4" />
            {pending ? tl(locale, 'loc.adding') : tl(locale, 'loc.add')}
          </Button>
        </div>

        {wh.locations.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">{tl(locale, 'loc.empty')}</p>
        ) : (
          <div className="divide-y rounded-md border">
            {wh.locations.map((loc) => (
              <LocationRow key={loc.id} loc={loc} locale={locale} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function LocationRow({ loc, locale }: { loc: ManagerLocation; locale: Locale }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(loc.name)
  const [pending, start] = useTransition()
  const [expanded, setExpanded] = useState(false)
  const [products, setProducts] = useState<LocationProduct[] | null>(null)
  const [loadingProducts, setLoadingProducts] = useState(false)

  function run(p: Promise<LocationActionResult>, okKey: string, after?: () => void) {
    start(async () => {
      const res = await p
      if (res.ok) {
        toast.success(tl(locale, okKey))
        after?.()
        router.refresh()
      } else {
        failToast(locale, res)
      }
    })
  }

  function saveRename() {
    const clean = draft.trim()
    if (!clean) {
      toast.error(tl(locale, 'loc.err.emptyName'))
      return
    }
    run(renameLocation(loc.id, clean), 'loc.toast.renamed', () => setEditing(false))
  }

  function toggleActive() {
    const next = !loc.isActive
    run(setLocationActive(loc.id, next), next ? 'loc.toast.activated' : 'loc.toast.deactivated')
  }

  function removeLocation() {
    const msg = loc.productCount > 0
      ? tl(locale, 'loc.confirmDeleteWithItems')
      : tl(locale, 'loc.confirmDelete')
    if (!window.confirm(msg)) return
    run(deleteLocation(loc.id), 'loc.toast.deleted')
  }

  function loadProducts() {
    setLoadingProducts(true)
    listLocationProducts(loc.id).then((res) => {
      setLoadingProducts(false)
      setProducts(res.ok ? res.rows : [])
    })
  }
  function refreshProducts() {
    listLocationProducts(loc.id).then((res) => {
      if (res.ok) setProducts(res.rows)
    })
  }
  function toggleExpand() {
    const next = !expanded
    setExpanded(next)
    if (next && products === null) loadProducts()
  }

  function saveProductQty(productId: string, qty: number) {
    start(async () => {
      const res = await setPlacement(productId, loc.id, qty)
      if (res.ok) {
        toast.success(tl(locale, 'loc.assign.toast.saved'))
        refreshProducts()
        router.refresh()
      } else {
        toast.error(tl(locale, 'loc.assign.toast.failed'))
      }
    })
  }
  function removeProduct(productId: string) {
    start(async () => {
      const res = await removePlacement(productId, loc.id)
      if (res.ok) {
        toast.success(tl(locale, 'loc.assign.toast.removed'))
        refreshProducts()
        router.refresh()
      } else {
        toast.error(tl(locale, 'loc.assign.toast.failed'))
      }
    })
  }

  const here =
    loc.productCount > 0
      ? `${loc.productCount} ${word(locale, loc.productCount, 'loc.product.one', 'loc.product.other')} · ${loc.unitCount} ${word(locale, loc.unitCount, 'loc.unit.one', 'loc.unit.other')}`
      : tl(locale, 'loc.here.none')

  if (editing) {
    return (
      <div className="flex items-center gap-2 px-3 py-2">
        <Input
          value={draft}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') saveRename()
            if (e.key === 'Escape') {
              setDraft(loc.name)
              setEditing(false)
            }
          }}
          disabled={pending}
        />
        <Button size="sm" onClick={saveRename} disabled={pending}>
          <Check className="mr-1 h-4 w-4" />
          {pending ? tl(locale, 'loc.saving') : tl(locale, 'loc.save')}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setDraft(loc.name)
            setEditing(false)
          }}
          disabled={pending}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 px-3 py-2">
        <div
          role="button"
          tabIndex={0}
          onClick={toggleExpand}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              toggleExpand()
            }
          }}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2"
        >
          <ChevronRight
            className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
              expanded ? 'rotate-90' : ''
            }`}
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={`truncate text-sm ${
                  loc.isActive ? '' : 'text-muted-foreground line-through'
                }`}
              >
                {loc.name}
              </span>
              {!loc.isActive ? (
                <Badge variant="outline" className="text-muted-foreground">
                  {tl(locale, 'loc.inactive')}
                </Badge>
              ) : null}
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">{here}</div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)} disabled={pending} title={tl(locale, 'loc.edit')}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={toggleActive} disabled={pending} title={loc.isActive ? tl(locale, 'loc.deactivate') : tl(locale, 'loc.activate')}>
            <Power className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={removeLocation} disabled={pending} title={tl(locale, 'loc.delete')}>
            <Trash2 className="h-4 w-4 text-rose-600" />
          </Button>
        </div>
      </div>

      {expanded ? (
        <div className="border-t bg-muted/30 px-3 py-2 pl-9">
          {loadingProducts ? (
            <p className="py-2 text-xs text-muted-foreground">
              {locale === 'es' ? 'Cargando…' : 'Loading…'}
            </p>
          ) : products && products.length > 0 ? (
            <div className="divide-y">
              {products.map((p) => (
                <LocationProductRow
                  key={p.product_id}
                  p={p}
                  locale={locale}
                  pending={pending}
                  onSave={(qty) => saveProductQty(p.product_id, qty)}
                  onRemove={() => removeProduct(p.product_id)}
                />
              ))}
            </div>
          ) : (
            <p className="py-2 text-xs text-muted-foreground">{tl(locale, 'loc.here.none')}</p>
          )}
        </div>
      ) : null}
    </div>
  )
}

function LocationProductRow({
  p,
  locale,
  pending,
  onSave,
  onRemove,
}: {
  p: LocationProduct
  locale: Locale
  pending: boolean
  onSave: (qty: number) => void
  onRemove: () => void
}) {
  const [qty, setQty] = useState(String(p.qty))

  useEffect(() => {
    setQty(String(p.qty))
  }, [p.qty])

  const n = Math.max(0, parseInt(qty, 10) || 0)
  const dirty = n !== p.qty

  return (
    <div className="flex items-center gap-2 py-1.5">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm">{p.name}</div>
        {p.sku ? <div className="truncate text-xs text-muted-foreground">{p.sku}</div> : null}
      </div>
      <Input
        type="number"
        min={0}
        step={1}
        value={qty}
        onChange={(e) => setQty(e.target.value)}
        className="h-8 w-16"
        aria-label={tl(locale, 'loc.assign.qty')}
      />
      <Button
        size="sm"
        variant={dirty ? 'default' : 'outline'}
        disabled={pending || !dirty}
        onClick={() => onSave(n)}
      >
        {tl(locale, 'loc.save')}
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8"
        disabled={pending}
        onClick={onRemove}
        aria-label={tl(locale, 'loc.assign.remove')}
      >
        <Trash2 className="h-4 w-4 text-rose-600" />
      </Button>
    </div>
  )
}
