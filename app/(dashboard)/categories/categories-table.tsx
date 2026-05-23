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
import { CornerDownRight, Folder, GripVertical, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CategoryDialog } from './category-dialog'
import { DeleteCategoryDialog } from './delete-dialog'
import { reorderCategories, type Category } from './actions'

function SortableRow({
  cat,
  level,
  onEdit,
  onDelete,
}: {
  cat: Category
  level: 'main' | 'sub'
  onEdit: (c: Category) => void
  onDelete: (c: Category) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: cat.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }
  const isMain = level === 'main'
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={[
        'flex items-center gap-3 rounded-md border bg-card p-3',
        isMain ? 'font-semibold' : 'ml-8 bg-muted/30 text-sm',
      ].join(' ')}
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
      {isMain ? (
        <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
      ) : (
        <CornerDownRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      )}
      <span className="flex-1 truncate">{cat.name}</span>
      <span className="shrink-0 text-xs font-normal tabular-nums text-muted-foreground">
        {cat.product_count} {cat.product_count === 1 ? 'product' : 'products'}
      </span>
      {!cat.is_active && (
        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
          Inactive
        </span>
      )}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onEdit(cat)}
        aria-label="Edit"
      >
        <Pencil className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onDelete(cat)}
        aria-label="Delete"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  )
}

export function CategoriesTable({ categories }: { categories: Category[] }) {
  const [cats, setCats] = useState<Category[]>(categories)
  const [editing, setEditing] = useState<Category | null>(null)
  const [deleting, setDeleting] = useState<Category | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const dndId = useId()
  const [, startTransition] = useTransition()

  // Resync after create / edit / delete / reorder revalidations.
  useEffect(() => {
    setCats(categories)
  }, [categories])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const byOrder = (a: Category, b: Category) =>
    a.display_order - b.display_order || a.name.localeCompare(b.name)

  const mains = cats.filter((c) => c.parent_id === null).sort(byOrder)
  const subsOf = (parentId: string) =>
    cats.filter((c) => c.parent_id === parentId).sort(byOrder)

  // Safety net: anything not rendered under a main (orphan / deeper nesting)
  // still shows flat under "Other" so nothing disappears.
  const rendered = new Set<string>()
  for (const m of mains) {
    rendered.add(m.id)
    for (const s of subsOf(m.id)) rendered.add(s.id)
  }
  const orphans = cats.filter((c) => !rendered.has(c.id))

  function persist(group: Category[]) {
    const updates = group.map((c, i) => ({ id: c.id, display_order: i }))
    const orderMap = new Map(updates.map((u) => [u.id, u.display_order]))
    setCats((prev) =>
      prev.map((c) =>
        orderMap.has(c.id) ? { ...c, display_order: orderMap.get(c.id)! } : c
      )
    )
    startTransition(async () => {
      const res = await reorderCategories(updates)
      if (res?.error) toast.error(res.error)
    })
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const a = cats.find((c) => c.id === active.id)
    const o = cats.find((c) => c.id === over.id)
    if (!a || !o) return
    // Only reorder within the same level (same parent). Cross-level drops are
    // ignored - re-parenting is done in the edit dialog's Parent field.
    if ((a.parent_id ?? null) !== (o.parent_id ?? null)) return
    const group = a.parent_id === null ? mains : subsOf(a.parent_id)
    const oldIndex = group.findIndex((c) => c.id === active.id)
    const newIndex = group.findIndex((c) => c.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    persist(arrayMove(group, oldIndex, newIndex))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Categories</h1>
          <p className="text-sm text-muted-foreground">
            Main categories in bold, sub-categories nested beneath. Drag the
            handle to reorder within a level.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New category
        </Button>
      </div>

      {cats.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          No categories yet. Click “New category” to add one.
        </div>
      ) : (
        <DndContext
          id={dndId}
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={mains.map((m) => m.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {mains.map((m) => {
                const subs = subsOf(m.id)
                return (
                  <div key={m.id} className="space-y-2">
                    <SortableRow
                      cat={m}
                      level="main"
                      onEdit={(c) => setEditing(c)}
                      onDelete={(c) => setDeleting(c)}
                    />
                    {subs.length > 0 && (
                      <SortableContext
                        items={subs.map((s) => s.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="space-y-2">
                          {subs.map((s) => (
                            <SortableRow
                              key={s.id}
                              cat={s}
                              level="sub"
                              onEdit={(c) => setEditing(c)}
                              onDelete={(c) => setDeleting(c)}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    )}
                  </div>
                )
              })}
            </div>
          </SortableContext>

          {orphans.length > 0 && (
            <div className="mt-4 space-y-2">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Other
              </div>
              {orphans.map((c) => (
                <div
                  key={c.id}
                  className="ml-8 flex items-center gap-3 rounded-md border bg-muted/30 p-3 text-sm"
                >
                  <span className="flex-1 truncate">{c.name}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {c.product_count}{' '}
                    {c.product_count === 1 ? 'product' : 'products'}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setEditing(c)}
                    aria-label="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleting(c)}
                    aria-label="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </DndContext>
      )}

      <CategoryDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        allCategories={cats}
      />
      <CategoryDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        category={editing}
        allCategories={cats}
      />
      <DeleteCategoryDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        category={deleting}
      />
    </div>
  )
}
