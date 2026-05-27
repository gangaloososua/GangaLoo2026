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
import {
  deleteAttribute,
  deleteAttributeValue,
  type Attribute,
  type AttributeValue,
} from './actions'

// Discriminated target: either an attribute row or a value row.
export type DeleteTarget =
  | { kind: 'attribute'; attribute: Attribute }
  | { kind: 'value'; value: AttributeValue }

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  target: DeleteTarget | null
}

export function DeleteAttributeDialog({ open, onOpenChange, target }: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const label =
    target?.kind === 'attribute'
      ? target.attribute.name
      : target?.kind === 'value'
        ? target.value.value
        : ''
  const noun = target?.kind === 'value' ? 'value' : 'attribute'

  function handleDelete() {
    if (!target) return
    setError(null)
    startTransition(async () => {
      const result =
        target.kind === 'attribute'
          ? await deleteAttribute(target.attribute.id)
          : await deleteAttributeValue(target.value.id)

      if (result?.error) {
        setError(result.error)
        return
      }

      toast.success(target.kind === 'attribute' ? 'Attribute deleted.' : 'Value deleted.')
      onOpenChange(false)
    })
  }

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
          <DialogTitle>Delete {noun}?</DialogTitle>
          <DialogDescription>
            {target ? (
              <>
                This will permanently delete{' '}
                <span className="font-medium text-foreground">{label}</span>.
                This action cannot be undone.
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>
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
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={isPending}
          >
            {isPending ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
