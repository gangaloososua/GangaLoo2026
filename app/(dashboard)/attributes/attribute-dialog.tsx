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
import { Switch } from '@/components/ui/switch'
import { createAttribute, updateAttribute, type Attribute } from './actions'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  attribute?: Attribute | null
}

export function AttributeDialog({ open, onOpenChange, attribute }: Props) {
  const isEdit = !!attribute
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  // Controlled so the Switch value reliably reaches the form via a hidden input.
  const [singleValueOnly, setSingleValueOnly] = useState(false)

  // Reset the toggle whenever the dialog opens for a different attribute.
  function handleOpenChange(o: boolean) {
    if (o) setSingleValueOnly(attribute?.single_value_only ?? false)
    else setError(null)
    onOpenChange(o)
  }

  function handleSubmit(formData: FormData) {
    setError(null)
    // Switch isn't a native input; inject its state as the action expects ('on').
    if (singleValueOnly) formData.set('single_value_only', 'on')
    else formData.delete('single_value_only')

    startTransition(async () => {
      const result = isEdit
        ? await updateAttribute(attribute!.id, formData)
        : await createAttribute(formData)

      if (result?.error) {
        setError(result.error)
        return
      }

      toast.success(isEdit ? 'Attribute updated.' : 'Attribute created.')
      onOpenChange(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit attribute' : 'New attribute'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update the attribute details below.'
              : 'Add a new attribute (e.g. Color, Length). Slugs are generated automatically, and new attributes appear at the bottom — drag to reorder. Add its values after creating it.'}
          </DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              name="name"
              defaultValue={attribute?.name ?? ''}
              required
              autoFocus
            />
          </div>
          <div className="flex items-start justify-between gap-4 rounded-md border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="single_value_only">Single value only</Label>
              <p className="text-xs text-muted-foreground">
                When on, a product can have only one value for this attribute
                (e.g. one Color). When off, a product can have several (e.g.
                multiple available Lengths).
              </p>
            </div>
            <Switch
              id="single_value_only"
              checked={singleValueOnly}
              onCheckedChange={setSingleValueOnly}
            />
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
