'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Pencil, Plus, Power, Search } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import type { SupplierRow, SupplierKind } from '@/lib/suppliers'
import {
  createSupplier,
  updateSupplier,
  setSupplierActive,
  type SupplierInput,
} from './supplier-actions'

type KindFilter = 'all' | SupplierKind
type ActiveFilter = 'active' | 'inactive' | 'all'

function kindLabel(k: SupplierKind): string {
  return k === 'courier' ? 'Courier' : 'Supplier'
}

export function SuppliersManager({ rows }: { rows: SupplierRow[] }) {
  const router = useRouter()

  const [kindFilter, setKindFilter] = useState<KindFilter>('all')
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('active')
  const [search, setSearch] = useState('')

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<SupplierRow | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Form fields
  const [fKind, setFKind] = useState<SupplierKind>('supplier')
  const [fName, setFName] = useState('')
  const [fContact, setFContact] = useState('')
  const [fEmail, setFEmail] = useState('')
  const [fPhone, setFPhone] = useState('')
  const [fAddress, setFAddress] = useState('')
  const [fNotes, setFNotes] = useState('')

  const [busyId, setBusyId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (kindFilter !== 'all' && r.kind !== kindFilter) return false
      if (activeFilter === 'active' && !r.isActive) return false
      if (activeFilter === 'inactive' && r.isActive) return false
      if (q) {
        const hay = `${r.name} ${r.contactName ?? ''} ${r.phone ?? ''} ${r.email ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [rows, kindFilter, activeFilter, search])

  function openAdd() {
    setEditing(null)
    setFKind(kindFilter === 'courier' ? 'courier' : 'supplier')
    setFName('')
    setFContact('')
    setFEmail('')
    setFPhone('')
    setFAddress('')
    setFNotes('')
    setDialogOpen(true)
  }

  function openEdit(r: SupplierRow) {
    setEditing(r)
    setFKind(r.kind)
    setFName(r.name)
    setFContact(r.contactName ?? '')
    setFEmail(r.email ?? '')
    setFPhone(r.phone ?? '')
    setFAddress(r.address ?? '')
    setFNotes(r.notes ?? '')
    setDialogOpen(true)
  }

  const formValid = fName.trim().length > 0

  async function handleSave() {
    if (!formValid || submitting) return
    setSubmitting(true)
    const input: SupplierInput = {
      kind: fKind,
      name: fName,
      contactName: fContact,
      email: fEmail,
      phone: fPhone,
      address: fAddress,
      notes: fNotes,
    }
    const res = editing
      ? await updateSupplier(editing.id, input)
      : await createSupplier(input)
    if (!res.ok) {
      setSubmitting(false)
      toast.error(res.error)
      return
    }
    toast.success(editing ? 'Saved.' : 'Added.')
    setDialogOpen(false)
    setSubmitting(false)
    router.refresh()
  }

  async function toggleActive(r: SupplierRow) {
    setBusyId(r.id)
    const res = await setSupplierActive(r.id, !r.isActive)
    if (!res.ok) {
      setBusyId(null)
      toast.error(res.error)
      return
    }
    toast.success(r.isActive ? 'Deactivated.' : 'Reactivated.')
    setBusyId(null)
    router.refresh()
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, contact, phone..."
            className="w-64 pl-8"
          />
        </div>
        <Select value={kindFilter} onValueChange={(v) => setKindFilter(v as KindFilter)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All kinds</SelectItem>
            <SelectItem value="supplier">Suppliers</SelectItem>
            <SelectItem value="courier">Couriers</SelectItem>
          </SelectContent>
        </Select>
        <Select value={activeFilter} onValueChange={(v) => setActiveFilter(v as ActiveFilter)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active only</SelectItem>
            <SelectItem value="inactive">Inactive only</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto">
          <Button type="button" onClick={openAdd}>
            <Plus className="mr-2 h-4 w-4" />
            Add
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                  No suppliers or couriers match.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => (
                <TableRow key={r.id} className={r.isActive ? '' : 'opacity-60'}>
                  <TableCell>
                    <span className="font-medium">{r.name}</span>
                    {!r.isActive ? (
                      <Badge variant="outline" className="ml-2 text-muted-foreground">
                        Inactive
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.kind === 'courier' ? 'secondary' : 'outline'}>
                      {kindLabel(r.kind)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{r.contactName ?? '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{r.phone ?? '—'}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => openEdit(r)}
                      aria-label="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleActive(r)}
                      disabled={busyId === r.id}
                      aria-label={r.isActive ? 'Deactivate' : 'Reactivate'}
                      title={r.isActive ? 'Deactivate' : 'Reactivate'}
                    >
                      <Power className={'h-4 w-4 ' + (r.isActive ? '' : 'text-muted-foreground')} />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit' : 'Add'} {kindLabel(fKind).toLowerCase()}</DialogTitle>
            <DialogDescription>
              Suppliers and couriers used by purchases and transport. Only the name is required.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="sup-kind">Kind</Label>
              <Select value={fKind} onValueChange={(v) => setFKind(v as SupplierKind)}>
                <SelectTrigger id="sup-kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="supplier">Supplier</SelectItem>
                  <SelectItem value="courier">Courier</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sup-name">Name</Label>
              <Input id="sup-name" value={fName} onChange={(e) => setFName(e.target.value)} placeholder="e.g. Liberty Express" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sup-contact">Contact name (optional)</Label>
              <Input id="sup-contact" value={fContact} onChange={(e) => setFContact(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sup-phone">Phone (optional)</Label>
              <Input id="sup-phone" value={fPhone} onChange={(e) => setFPhone(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sup-email">Email (optional)</Label>
              <Input id="sup-email" type="email" value={fEmail} onChange={(e) => setFEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sup-address">Address (optional)</Label>
              <Input id="sup-address" value={fAddress} onChange={(e) => setFAddress(e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="sup-notes">Notes (optional)</Label>
              <Textarea id="sup-notes" rows={2} value={fNotes} onChange={(e) => setFNotes(e.target.value)} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="button" onClick={() => { void handleSave() }} disabled={!formValid || submitting}>
              {submitting ? 'Saving...' : editing ? 'Save changes' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
