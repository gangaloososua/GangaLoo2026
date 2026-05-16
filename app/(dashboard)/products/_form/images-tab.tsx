'use client'

import { useEffect, useId, useRef, useState, useTransition } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
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
import { GripVertical, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  uploadProductImage,
  saveProductImagesMetadata,
  deleteProductImage,
} from '../actions'
import type { ProductImage } from '@/lib/products'

const MAX_SIZE = 5 * 1024 * 1024
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

type Row = ProductImage

function SortableRow({
  row,
  onAltChange,
  onSetPrimary,
  onRemove,
  isRemoving,
}: {
  row: Row
  onAltChange: (id: string, v: string) => void
  onSetPrimary: (id: string) => void
  onRemove: (id: string) => void
  isRemoving: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: row.id })
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
      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded border bg-muted">
        <Image
          src={row.url}
          alt={row.alt_text ?? ''}
          fill
          sizes="64px"
          className="object-cover"
          unoptimized
        />
      </div>
      <div className="flex-1">
        <Input
          value={row.alt_text ?? ''}
          onChange={(e) => onAltChange(row.id, e.target.value)}
          placeholder="Alt text (for accessibility)"
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="radio"
          name="primary-image"
          checked={row.is_primary}
          onChange={() => onSetPrimary(row.id)}
        />
        Primary
      </label>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => onRemove(row.id)}
        disabled={isRemoving}
        aria-label="Remove image"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  )
}

export function ImagesTab({
  productId,
  initialRows,
}: {
  productId: string
  initialRows: ProductImage[]
}) {
  const router = useRouter()
  const [rows, setRows] = useState<Row[]>(initialRows)
  const [isUploading, setIsUploading] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)
  const dndContextId = useId()

  useEffect(() => {
    setRows(initialRows)
  }, [initialRows])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  async function uploadFiles(files: FileList | File[]) {
    const list = Array.from(files)
    if (list.length === 0) return
    setIsUploading(true)
    try {
      for (const file of list) {
        if (!ALLOWED.includes(file.type)) {
          toast.error(`${file.name}: unsupported type`)
          continue
        }
        if (file.size > MAX_SIZE) {
          toast.error(`${file.name}: exceeds 5 MB`)
          continue
        }
        const fd = new FormData()
        fd.append('product_id', productId)
        fd.append('file', file)
        const res = await uploadProductImage(fd)
        if (!res.ok || !res.image) {
          toast.error(`${file.name}: ${res.error ?? 'upload failed'}`)
          continue
        }
        toast.success(`${file.name} uploaded`)
      }
      // Re-fetch by refreshing the page data — simpler than threading the new row through
      router.refresh()
    } finally {
      setIsUploading(false)
    }
  }

  function onFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) void uploadFiles(e.target.files)
    if (inputRef.current) inputRef.current.value = ''
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragOver(false)
    if (e.dataTransfer.files) void uploadFiles(e.dataTransfer.files)
  }

  function altChange(id: string, v: string) {
    setRows(rows.map((r) => (r.id === id ? { ...r, alt_text: v } : r)))
  }

  function setPrimary(id: string) {
    setRows(rows.map((r) => ({ ...r, is_primary: r.id === id })))
  }

  async function remove(id: string) {
    setRemovingId(id)
    const res = await deleteProductImage(productId, id)
    setRemovingId(null)
    if (!res.ok) {
      toast.error(res.error ?? 'Failed to remove image')
      return
    }
    toast.success('Image removed')
    router.refresh()
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIndex = rows.findIndex((r) => r.id === active.id)
    const newIndex = rows.findIndex((r) => r.id === over.id)
    const moved = arrayMove(rows, oldIndex, newIndex)
    setRows(moved.map((r, i) => ({ ...r, display_order: i })))
  }

  function onSave() {
    startTransition(async () => {
      const res = await saveProductImagesMetadata(
        productId,
        rows.map((r) => ({
          id: r.id,
          alt_text: r.alt_text,
          is_primary: r.is_primary,
          display_order: r.display_order,
        }))
      )
      if (res.ok) toast.success('Images saved')
      else toast.error(res.error ?? 'Failed to save images')
    })
  }

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragOver(true)
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={onDrop}
        className={`rounded-md border-2 border-dashed p-6 text-center transition-colors ${
          isDragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'
        }`}
      >
        <Upload className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
        <p className="mb-2 text-sm text-muted-foreground">
          Drag images here, or click to choose. JPEG, PNG, WebP, or GIF. Max 5 MB each.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={ALLOWED.join(',')}
          multiple
          onChange={onFilePick}
          className="hidden"
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => inputRef.current?.click()}
          disabled={isUploading}
        >
          {isUploading ? 'Uploading…' : 'Choose files'}
        </Button>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          No images yet. Upload one above.
        </div>
      ) : (
        <DndContext
          id={dndContextId}
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={rows.map((r) => r.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {rows.map((row) => (
                <SortableRow
                  key={row.id}
                  row={row}
                  onAltChange={altChange}
                  onSetPrimary={setPrimary}
                  onRemove={remove}
                  isRemoving={removingId === row.id}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {rows.length > 0 && (
        <div className="flex justify-end">
          <Button type="button" onClick={onSave} disabled={isPending}>
            {isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      )}
    </div>
  )
}
