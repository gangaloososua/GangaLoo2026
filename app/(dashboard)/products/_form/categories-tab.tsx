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
import { ChevronsUpDown, GripVertical, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
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
  const [open, setOpen] = useState(false)
  const dndContextId = useId()
  const [isPending, startTransition] = useTransition()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const assignedIds = new Set(rows.map((r) => r.category_id))
  const available = allCategories.filter((c) => !assignedIds.has(c.id))

  // Group the still-available categories under their MAIN category (parent),
  // so the picker reads main -> subs. A main with parent_id null heads its own
  // group; its sub-categories nest under it. Mains render bold, subs indented.
  // cmdk searches the visible text, so typing filters across every group.
  const groups = (() => {
    const m = new Map<string, { name: string; items: FlatCategory[] }>()
    for (const c of available) {
      const mainId = c.parent_id ?? c.id
      const mainName =
        allCategories.find((x) => x.id === mainId)?.name ?? 'Other'
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
  })()

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
    setOpen(false)
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
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                role="combobox"
                aria-expanded={open}
                disabled={available.length === 0}
                className="w-full justify-between font-normal"
              >
                {available.length
                  ? 'Select a category…'
                  : 'All categories assigned'}
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
                            onSelect={() => addCategory(c.id)}
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
