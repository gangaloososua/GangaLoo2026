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
import { CornerDownRight, GripVertical, Pencil, Plus, Tag, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AttributeDialog } from './attribute-dialog'
import { ValueDialog } from './value-dialog'
import { DeleteAttributeDialog, type DeleteTarget } from './delete-dialog'
import {
  reorderAttributes,
  reorderAttributeValues,
  type Attribute,
  type AttributeValue,
} from './actions'

// --- Attribute (main) row -------------------------------------------------
function AttributeRow({
  attr,
  onEdit,
  onDelete,
  onAddValue,
}: {
  attr: Attribute
  onEdit: (a: Attribute) => void
  onDelete: (a: Attribute) => void
  onAddValue: (a: Attribute) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: attr.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 rounded-md border bg-card p-3 font-semibold"
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
      <Tag className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="flex-1 truncate">{attr.name}</span>
      {attr.single_value_only && (
        <Badge variant="secondary" className="shrink-0 font-normal">
          Single value
        </Badge>
      )}
      <span className="shrink-0 text-xs font-normal tabular-nums text-muted-foreground">
        {attr.value_count} {attr.value_count === 1 ? 'value' : 'values'}
      </span>
      {!attr.is_active && (
        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
          Inactive
        </span>
      )}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onAddValue(attr)}
        aria-label="Add value"
      >
        <Plus className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon" onClick={() => onEdit(attr)} aria-label="Edit">
        <Pencil className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon" onClick={() => onDelete(attr)} aria-label="Delete">
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  )
}

// --- Value (sub) row ------------------------------------------------------
function ValueRow({
  val,
  onEdit,
  onDelete,
}: {
  val: AttributeValue
  onEdit: (v: AttributeValue) => void
  onDelete: (v: AttributeValue) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: val.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="ml-8 flex items-center gap-3 rounded-md border bg-muted/30 p-3 text-sm"
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
      <CornerDownRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="flex-1 truncate">{val.value}</span>
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
        {val.product_count} {val.product_count === 1 ? 'product' : 'products'}
      </span>
      {!val.is_active && (
        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
          Inactive
        </span>
      )}
      <Button variant="ghost" size="icon" onClick={() => onEdit(val)} aria-label="Edit">
        <Pencil className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon" onClick={() => onDelete(val)} aria-label="Delete">
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  )
}

export function AttributesTable({
  attributes,
  values,
}: {
  attributes: Attribute[]
  values: AttributeValue[]
}) {
  const [attrs, setAttrs] = useState<Attribute[]>(attributes)
  const [vals, setVals] = useState<AttributeValue[]>(values)

  const [editingAttr, setEditingAttr] = useState<Attribute | null>(null)
  const [createAttrOpen, setCreateAttrOpen] = useState(false)

  const [addingValueTo, setAddingValueTo] = useState<Attribute | null>(null)
  const [editingValue, setEditingValue] = useState<AttributeValue | null>(null)

  const [deleting, setDeleting] = useState<DeleteTarget | null>(null)

  const dndId = useId()
  const [, startTransition] = useTransition()

  // Resync after any revalidation.
  useEffect(() => setAttrs(attributes), [attributes])
  useEffect(() => setVals(values), [values])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const byOrderAttr = (a: Attribute, b: Attribute) =>
    a.display_order - b.display_order || a.name.localeCompare(b.name)
  const byOrderVal = (a: AttributeValue, b: AttributeValue) =>
    a.display_order - b.display_order || a.value.localeCompare(b.value)

  const sortedAttrs = [...attrs].sort(byOrderAttr)
  const valuesOf = (attributeId: string) =>
    vals.filter((v) => v.attribute_id === attributeId).sort(byOrderVal)

  function persistAttrs(group: Attribute[]) {
    const updates = group.map((a, i) => ({ id: a.id, display_order: i }))
    const orderMap = new Map(updates.map((u) => [u.id, u.display_order]))
    setAttrs((prev) =>
      prev.map((a) =>
        orderMap.has(a.id) ? { ...a, display_order: orderMap.get(a.id)! } : a,
      ),
    )
    startTransition(async () => {
      const res = await reorderAttributes(updates)
      if (res?.error) toast.error(res.error)
    })
  }

  function persistValues(group: AttributeValue[]) {
    const updates = group.map((v, i) => ({ id: v.id, display_order: i }))
    const orderMap = new Map(updates.map((u) => [u.id, u.display_order]))
    setVals((prev) =>
      prev.map((v) =>
        orderMap.has(v.id) ? { ...v, display_order: orderMap.get(v.id)! } : v,
      ),
    )
    startTransition(async () => {
      const res = await reorderAttributeValues(updates)
      if (res?.error) toast.error(res.error)
    })
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return

    // Is this a drag among attributes (main rows)?
    const activeAttr = attrs.find((a) => a.id === active.id)
    const overAttr = attrs.find((a) => a.id === over.id)
    if (activeAttr && overAttr) {
      const group = sortedAttrs
      const oldIndex = group.findIndex((a) => a.id === active.id)
      const newIndex = group.findIndex((a) => a.id === over.id)
      if (oldIndex < 0 || newIndex < 0) return
      persistAttrs(arrayMove(group, oldIndex, newIndex))
      return
    }

    // Otherwise a value drag - only within the same attribute (no re-parenting).
    const activeVal = vals.find((v) => v.id === active.id)
    const overVal = vals.find((v) => v.id === over.id)
    if (!activeVal || !overVal) return
    if (activeVal.attribute_id !== overVal.attribute_id) return
    const group = valuesOf(activeVal.attribute_id)
    const oldIndex = group.findIndex((v) => v.id === active.id)
    const newIndex = group.findIndex((v) => v.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    persistValues(arrayMove(group, oldIndex, newIndex))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Attributes</h1>
          <p className="text-sm text-muted-foreground">
            Attributes (Color, Length…) in bold, their values nested beneath.
            Use the + on an attribute to add a value. Drag the handle to reorder
            within a level.
          </p>
        </div>
        <Button onClick={() => setCreateAttrOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New attribute
        </Button>
      </div>

      {sortedAttrs.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          No attributes yet. Click “New attribute” to add one.
        </div>
      ) : (
        <DndContext
          id={dndId}
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={sortedAttrs.map((a) => a.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {sortedAttrs.map((attr) => {
                const attrValues = valuesOf(attr.id)
                return (
                  <div key={attr.id} className="space-y-2">
                    <AttributeRow
                      attr={attr}
                      onEdit={(a) => setEditingAttr(a)}
                      onDelete={(a) => setDeleting({ kind: 'attribute', attribute: a })}
                      onAddValue={(a) => setAddingValueTo(a)}
                    />
                    {attrValues.length > 0 && (
                      <SortableContext
                        items={attrValues.map((v) => v.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="space-y-2">
                          {attrValues.map((v) => (
                            <ValueRow
                              key={v.id}
                              val={v}
                              onEdit={(vv) => setEditingValue(vv)}
                              onDelete={(vv) => setDeleting({ kind: 'value', value: vv })}
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
        </DndContext>
      )}

      {/* Create attribute */}
      <AttributeDialog open={createAttrOpen} onOpenChange={setCreateAttrOpen} />
      {/* Edit attribute */}
      <AttributeDialog
        open={!!editingAttr}
        onOpenChange={(o) => !o && setEditingAttr(null)}
        attribute={editingAttr}
      />
      {/* Add value to an attribute */}
      <ValueDialog
        open={!!addingValueTo}
        onOpenChange={(o) => !o && setAddingValueTo(null)}
        attribute={addingValueTo}
      />
      {/* Edit value */}
      <ValueDialog
        open={!!editingValue}
        onOpenChange={(o) => !o && setEditingValue(null)}
        value={editingValue}
      />
      {/* Delete (attribute or value) */}
      <DeleteAttributeDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        target={deleting}
      />
    </div>
  )
}
