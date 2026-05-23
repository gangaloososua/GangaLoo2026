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
import { deleteProfile, type ProfileListRow, type UserRole } from './actions'

const ROLE_STYLES: Record<UserRole, string> = {
  owner: 'bg-purple-100 text-purple-800',
  admin: 'bg-blue-100 text-blue-800',
  seller: 'bg-emerald-100 text-emerald-800',
  distributor: 'bg-amber-100 text-amber-800',
  customer: 'bg-muted text-muted-foreground',
}

export function PeopleTable({ people }: { people: ProfileListRow[] }) {
  const router = useRouter()
  const [deleting, setDeleting] = useState<ProfileListRow | null>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleDelete() {
    if (!deleting) return
    setError(null)
    startTransition(async () => {
      const result = await deleteProfile(deleting.id)
      if (result?.error) {
        setError(result.error)
        return
      }
      toast.success('Person deleted.')
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
              <TableHead>Role</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>City</TableHead>
              <TableHead>Distributor for</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[50px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {people.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  No people match the current filters.
                </TableCell>
              </TableRow>
            ) : (
              people.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">
                    <Link href={`/people/${p.id}`} className="hover:underline">
                      {p.full_name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${ROLE_STYLES[p.role]}`}>
                      {p.role.charAt(0).toUpperCase() + p.role.slice(1)}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{p.email ?? '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{p.phone ?? '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{p.city ?? '—'}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {p.distributor_for.length > 0 ? p.distributor_for.join(', ') : '—'}
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">
                      {p.is_active ? 'Active' : 'Inactive'}
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
                          <Link href={`/people/${p.id}/edit`}>Edit</Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setDeleting(p)}
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
            <DialogTitle>Delete person?</DialogTitle>
            <DialogDescription>
              {deleting ? <>This will permanently delete <span className="font-medium text-foreground">{deleting.full_name}</span>. If they appear in any sales or other records, deletion will be blocked.</> : null}
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