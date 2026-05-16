'use client'

import { useEffect, useId, useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { saveProductWarehouseSettings } from '../actions'
import type { Warehouse, ProductWarehouseSetting } from '@/lib/products'

type Row = {
  warehouse_id: string
  warehouse_name: string
  warehouse_kind: string
  is_visible: boolean
  // We store the override as a raw input string so the user can clear it
  // without us re-formatting mid-type. Converted to cents on save.
  price_override_input: string
  display_order: number
  stock: number
}

function buildInitialRows(
  warehouses: Warehouse[],
  settings: ProductWarehouseSetting[],
  stockByWarehouse: Record<string, number>
): Row[] {
  const settingByWh = new Map(settings.map((s) => [s.warehouse_id, s]))
  // Order by saved display_order first, then by warehouse's own display_order
  return warehouses
    .map((w, i) => {
      const s = settingByWh.get(w.id)
      return {
        warehouse_id: w.id,
        warehouse_name: w.name,
        warehouse_kind: w.kind,
        is_visible: s?.is_visible ?? true,
        price_override_input:
          s?.price_override_cents != null
            ? (s.price_override_cents / 100).toFixed(2)
            : '',
        display_order: s?.display_order ?? i,
        stock: stockByWarehouse[w.id] ?? 0,
      }
    })
    .sort((a, b) => a.display_order - b.display_order)
}

function SortableRow({
  row,
  onToggleVisible,
  onOverrideChange,
}: {
  row: Row
  onToggleVisible: (id: string, v: boolean) => void
  onOverrideChange: (id: string, v: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: row.warehouse_id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 rounded-md border bg-card p-3"
    >
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{row.warehouse_name}</div>
        <div className="text-xs text-muted-foreground">{row.warehouse_kind}</div>
      </div>
      <Badge variant="secondary" className="shrink-0">
        Stock: {row.stock}
      </Badge>
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">DOP</span>
        <Input
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          value={row.price_override_input}
          onChange={(e) => onOverrideChange(row.warehouse_id, e.target.value)}
          placeholder="override"
          className="w-28"
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Switch
          checked={row.is_visible}
          onCheckedChange={(v) => onToggleVisible(row.warehouse_id, v)}
        />
        Visible
      </label>
    </div>
  )
}

export function WarehousesTab({
  productId,
  warehouses,
  initialSettings,
  stockByWarehouse,
}: {
  productId: string
  warehouses: Warehouse[]
  initialSettings: ProductWarehouseSetting[]
  stockByWarehouse: Record<string, number>
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    buildInitialRows(warehouses, initialSettings, stockByWarehouse)
  )
  const [isPending, startTransition] = useTransition()
  const dndContextId = useId()

  // Keep local state in sync if the page re-fetches (e.g. after another save)
  useEffect(() => {
    setRows(buildInitialRows(warehouses, initialSettings, stockByWarehouse))
  }, [warehouses, initialSettings, stockByWarehouse])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function toggleVisible(id: string, v: boolean) {
    setRows(rows.map((r) => (r.warehouse_id === id ? { ...r, is_visible: v } : r)))
  }

  function overrideChange(id: string, v: string) {
    setRows(
      rows.map((r) =>
        r.warehouse_id === id ? { ...r, price_override_input: v } : r
      )
    )
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIndex = rows.findIndex((r) => r.warehouse_id === active.id)
    const newIndex = rows.findIndex((r) => r.warehouse_id === over.id)
    const moved = arrayMove(rows, oldIndex, newIndex)
    setRows(moved.map((r, i) => ({ ...r, display_order: i })))
  }

  function onSave() {
    // Validate every override parses cleanly to a number (or is blank)
    const payload: Array<{
      warehouse_id: string
      is_visible: boolean
      price_override_cents: number | null
      display_order: number
    }> = []
    for (const r of rows) {
      let priceCents: number | null = null
      const raw = r.price_override_input.trim()
      if (raw !== '') {
        const parsed = Number(raw)
        if (!Number.isFinite(parsed) || parsed < 0) {
          toast.error(`Invalid price override for ${r.warehouse_name}`)
          return
        }
        priceCents = Math.round(parsed * 100)
      }
      payload.push({
        warehouse_id: r.warehouse_id,
        is_visible: r.is_visible,
        price_override_cents: priceCents,
        display_order: r.display_order,
      })
    }

    startTransition(async () => {
      const res = await saveProductWarehouseSettings(productId, payload)
      if (res.ok) toast.success('Warehouses saved')
      else toast.error(res.error ?? 'Failed to save warehouses')
    })
  }

  return (
    <div className="space-y-4">
      {rows.length === 0 ? (
        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          No active warehouses found.
        </div>
      ) : (
        <DndContext
          id={dndContextId}
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={rows.map((r) => r.warehouse_id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {rows.map((row) => (
                <SortableRow
                  key={row.warehouse_id}
                  row={row}
                  onToggleVisible={toggleVisible}
                  onOverrideChange={overrideChange}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <div className="flex justify-end">
        <Button type="button" onClick={onSave} disabled={isPending || rows.length === 0}>
          {isPending ? 'Saving…' : 'Save warehouses'}
        </Button>
      </div>
    </div>
  )
}
