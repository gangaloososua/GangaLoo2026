'use client'

import { useId, useState, useTransition } from 'react'
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
import { GripVertical, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { saveProductCategories } from '../actions'
import type { ProductCategory } from '@/lib/products'

type FlatCategory = { id: string; name: string; parent_id: string | null }

type Row = ProductCategory

function SortableRow({
  row,
  onToggleVisible,
  onSetPrimary,
  onRemove,
}: {
  row: Row
  onToggleVisible: (id: string, v: boolean) => void
  onSetPrimary: (id: string) => void
  onRemove: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: row.category_id })
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
      <div className="flex-1 font-medium">{row.category_name}</div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="radio"
          name="primary-category"
          checked={row.is_primary}
          onChange={() => onSetPrimary(row.category_id)}
        />
        Primary
      </label>
      <label className="flex items-center gap-2 text-sm">
        <Switch
          checked={row.is_visible}
          onCheckedChange={(v) => onToggleVisible(row.category_id, v)}
        />
        Visible
      </label>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => onRemove(row.category_id)}
        aria-label="Remove category"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  )
}

export function CategoriesTab({
  productId,
  initialRows,
  allCategories,
}: {
  productId: string
  initialRows: ProductCategory[]
  allCategories: FlatCategory[]
}) {
  const [rows, setRows] = useState<Row[]>(initialRows)
  const [pickerValue, setPickerValue] = useState<string>('')
  const dndContextId = useId()
  const [isPending, startTransition] = useTransition()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const assignedIds = new Set(rows.map((r) => r.category_id))
  const available = allCategories.filter((c) => !assignedIds.has(c.id))

  function addCategory(id: string) {
    const cat = allCategories.find((c) => c.id === id)
    if (!cat) return
    const next: Row = {
      category_id: cat.id,
      category_name: cat.name,
      is_visible: true,
      is_primary: rows.length === 0,
      display_order: rows.length,
    }
    setRows([...rows, next])
    setPickerValue('')
  }

  function removeCategory(id: string) {
    const filtered = rows.filter((r) => r.category_id !== id)
    const wasPrimary = rows.find((r) => r.category_id === id)?.is_primary
    if (wasPrimary && filtered.length > 0) filtered[0].is_primary = true
    setRows(filtered.map((r, i) => ({ ...r, display_order: i })))
  }

  function toggleVisible(id: string, v: boolean) {
    setRows(rows.map((r) => (r.category_id === id ? { ...r, is_visible: v } : r)))
  }

  function setPrimary(id: string) {
    setRows(rows.map((r) => ({ ...r, is_primary: r.category_id === id })))
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIndex = rows.findIndex((r) => r.category_id === active.id)
    const newIndex = rows.findIndex((r) => r.category_id === over.id)
    const moved = arrayMove(rows, oldIndex, newIndex)
    setRows(moved.map((r, i) => ({ ...r, display_order: i })))
  }

  function onSave() {
    startTransition(async () => {
      const res = await saveProductCategories(
        productId,
        rows.map((r) => ({
          category_id: r.category_id,
          is_visible: r.is_visible,
          is_primary: r.is_primary,
          display_order: r.display_order,
        }))
      )
      if (res.ok) toast.success('Categories saved')
      else toast.error(res.error ?? 'Failed to save categories')
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label className="mb-1 block text-sm font-medium">Add category</label>
          <Select value={pickerValue} onValueChange={addCategory}>
            <SelectTrigger>
              <SelectValue placeholder={available.length ? 'Select a category…' : 'All categories assigned'} />
            </SelectTrigger>
            <SelectContent>
              {available.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          No categories assigned yet. Add one above.
        </div>
      ) : (
        <DndContext id={dndContextId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={rows.map((r) => r.category_id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {rows.map((row) => (
                <SortableRow
                  key={row.category_id}
                  row={row}
                  onToggleVisible={toggleVisible}
                  onSetPrimary={setPrimary}
                  onRemove={removeCategory}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <div className="flex justify-end">
        <Button type="button" onClick={onSave} disabled={isPending}>
          {isPending ? 'Saving…' : 'Save categories'}
        </Button>
      </div>
    </div>
  )
}
