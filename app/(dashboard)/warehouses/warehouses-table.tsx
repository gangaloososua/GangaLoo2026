'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { MoreHorizontal } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { deleteWarehouse, type WarehouseListRow } from './actions'

const KIND_LABEL = {
  store: 'Store',
  fulfillment: 'Fulfillment',
  virtual: 'Virtual',
} as const

export function WarehousesTable({ warehouses }: { warehouses: WarehouseListRow[] }) {
  const router = useRouter()
  const [deleting, setDeleting] = useState<WarehouseListRow | null>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleDelete() {
    if (!deleting) return
    setError(null)
    startTransition(async () => {
      const result = await deleteWarehouse(deleting.id)
      if (result?.error) {
        setError(result.error)
        return
      }
      toast.success('Warehouse deleted.')
      setDeleting(null)
      router.refresh()
    })
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead>City</TableHead>
              <TableHead>Distributor</TableHead>
              <TableHead>Manager</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[50px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {warehouses.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  No warehouses yet.
                </TableCell>
              </TableRow>
            ) : (
              warehouses.map((w) => (
                <TableRow key={w.id}>
                  <TableCell className="font-medium">
                    <Link href={`/warehouses/${w.id}/edit`} className="hover:underline">
                      {w.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{KIND_LABEL[w.kind]}</TableCell>
                  <TableCell className="text-muted-foreground">{w.city ?? '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{w.distributor_name ?? '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{w.manager_name ?? '—'}</TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">
                      {w.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="Actions">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/warehouses/${w.id}/edit`}>Edit</Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setDeleting(w)}
                        >
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!deleting} onOpenChange={(o) => { if (!o) { setDeleting(null); setError(null) } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete warehouse?</DialogTitle>
            <DialogDescription>
              {deleting ? <>This will permanently delete <span className="font-medium text-foreground">{deleting.name}</span>. Inventory, sales, and other records that reference it may also be affected.</> : null}
            </DialogDescription>
          </DialogHeader>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)} disabled={isPending}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isPending}>
              {isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}