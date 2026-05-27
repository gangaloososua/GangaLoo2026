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
  createAttributeValue,
  updateAttributeValue,
  type Attribute,
  type AttributeValue,
} from './actions'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  // The attribute we're adding a value to (create mode).
  attribute?: Attribute | null
  // The value being edited (edit mode). When set, takes precedence.
  value?: AttributeValue | null
}

export function ValueDialog({ open, onOpenChange, attribute, value }: Props) {
  const isEdit = !!value
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const result = isEdit
        ? await updateAttributeValue(value!.id, formData)
        : await createAttributeValue(formData)

      if (result?.error) {
        setError(result.error)
        return
      }

      toast.success(isEdit ? 'Value updated.' : 'Value added.')
      onOpenChange(false)
    })
  }

  // attribute_id needed for create; in edit mode the value keeps its own.
  const attributeId = value?.attribute_id ?? attribute?.id ?? ''

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setError(null)
        onOpenChange(o)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit value' : 'New value'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update the value below.'
              : `Add a value${attribute ? ` to “${attribute.name}”` : ''} (e.g. Black, 26").`}
          </DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          {!isEdit && (
            <input type="hidden" name="attribute_id" value={attributeId} />
          )}
          <div className="space-y-2">
            <Label htmlFor="value">Value</Label>
            <Input
              id="value"
              name="value"
              defaultValue={value?.value ?? ''}
              required
              autoFocus
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
              {isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Add'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
