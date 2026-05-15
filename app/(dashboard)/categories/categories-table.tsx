'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Pencil, Trash2, Plus } from 'lucide-react'
import { CategoryDialog } from './category-dialog'
import { DeleteCategoryDialog } from './delete-dialog'
import type { Category } from './actions'

type Props = {
  categories: Category[]
}

export function CategoriesTable({ categories }: Props) {
  const [editing, setEditing] = useState<Category | null>(null)
  const [deleting, setDeleting] = useState<Category | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Categories</h1>
          <p className="text-sm text-muted-foreground">
            Manage product categories.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New category
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Parent</TableHead>
              <TableHead className="text-right">Products</TableHead>
              <TableHead className="text-right">Order</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[100px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center text-muted-foreground py-8"
                >
                  No categories yet. Click &quot;New category&quot; to add one.
                </TableCell>
              </TableRow>
            ) : (
              categories.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {c.parent_name ?? '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c.product_count}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c.display_order}
                  </TableCell>
                  <TableCell>
                    {c.is_active ? (
                      <span className="text-xs text-muted-foreground">Active</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Inactive
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
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
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <CategoryDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        allCategories={categories}
      />
      <CategoryDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        category={editing}
        allCategories={categories}
      />
      <DeleteCategoryDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        category={deleting}
      />
    </div>
  )
}