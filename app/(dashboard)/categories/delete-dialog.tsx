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
import { deleteCategory, type Category } from './actions'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  category: Category | null
}

export function DeleteCategoryDialog({ open, onOpenChange, category }: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleDelete() {
    if (!category) return
    setError(null)
    startTransition(async () => {
      const result = await deleteCategory(category.id)
      if (result?.error) {
        setError(result.error)
        return
      }
      toast.success('Category deleted.')
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
          <DialogTitle>Delete category?</DialogTitle>
          <DialogDescription>
            {category ? (
              <>
                This will permanently delete{' '}
                <span className="font-medium text-foreground">
                  {category.name}
                </span>
                . This action cannot be undone.
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