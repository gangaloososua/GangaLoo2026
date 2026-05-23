'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createCategory, updateCategory, type Category } from './actions'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  category?: Category | null
  allCategories: Category[]
}

export function CategoryDialog({
  open,
  onOpenChange,
  category,
  allCategories,
}: Props) {
  const isEdit = !!category
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const disallowedParents = new Set<string>()
  if (category) {
    disallowedParents.add(category.id)
    const queue = [category.id]
    while (queue.length) {
      const current = queue.shift()!
      for (const c of allCategories) {
        if (c.parent_id === current && !disallowedParents.has(c.id)) {
          disallowedParents.add(c.id)
          queue.push(c.id)
        }
      }
    }
  }

  const parentOptions = allCategories.filter((c) => !disallowedParents.has(c.id))

  function handleSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const result = isEdit
        ? await updateCategory(category!.id, formData)
        : await createCategory(formData)

      if (result?.error) {
        setError(result.error)
        return
      }

      toast.success(isEdit ? 'Category updated.' : 'Category created.')
      onOpenChange(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit category' : 'New category'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update the category details below.'
              : 'Add a new product category. Slugs are generated automatically, and new categories appear at the bottom of their group — drag to reorder.'}
          </DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              name="name"
              defaultValue={category?.name ?? ''}
              required
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="parent_id">Parent category</Label>
            <Select
              name="parent_id"
              defaultValue={category?.parent_id ?? '__root__'}
            >
              <SelectTrigger id="parent_id">
                <SelectValue placeholder="No parent" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__root__">— No parent (top level) —</SelectItem>
                {parentOptions.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.parent_name ? `${c.parent_name} / ${c.name}` : c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
