'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createRate, updateRate } from './actions'
import type { ExchangeRate } from '@/lib/exchange-rates'

type Mode =
  | { kind: 'create'; defaultYear: number; defaultMonth: number }
  | { kind: 'edit'; row: ExchangeRate }

type Props = {
  mode: Mode
  trigger: React.ReactNode
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export function RateFormDialog({ mode, trigger }: Props) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  const initial =
    mode.kind === 'edit'
      ? {
          year: mode.row.year,
          month: mode.row.month,
          rate: mode.row.rate,
          source: mode.row.source ?? '',
          notes: mode.row.notes ?? '',
        }
      : {
          year: mode.defaultYear,
          month: mode.defaultMonth,
          rate: '' as number | '',
          source: '',
          notes: '',
        }

  const [year, setYear] = useState<number | ''>(initial.year)
  const [month, setMonth] = useState<number>(initial.month)
  const [rate, setRate] = useState<number | ''>(initial.rate)
  const [source, setSource] = useState<string>(initial.source)
  const [notes, setNotes] = useState<string>(initial.notes)

  function reset() {
    setYear(initial.year)
    setMonth(initial.month)
    setRate(initial.rate)
    setSource(initial.source)
    setNotes(initial.notes)
  }

  function onOpenChange(next: boolean) {
    setOpen(next)
    if (!next) reset()
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const fd = new FormData()
    fd.set('year', String(year))
    fd.set('month', String(month))
    fd.set('rate', String(rate))
    fd.set('source', source)
    fd.set('notes', notes)

    startTransition(async () => {
      const result =
        mode.kind === 'create'
          ? await createRate(fd)
          : await updateRate(mode.row.year, mode.row.month, fd)
      if (result.ok) {
        toast.success(mode.kind === 'create' ? 'Rate added.' : 'Rate updated.')
        setOpen(false)
      } else {
        toast.error(result.error ?? 'Something went wrong.')
      }
    })
  }

  const isEdit = mode.kind === 'edit'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>{isEdit ? 'Edit exchange rate' : 'Add exchange rate'}</DialogTitle>
            <DialogDescription>
              Rate is DOP per 1 USD for the given month.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="year">Year</Label>
                <Input
                  id="year"
                  type="number"
                  min={2000}
                  max={2100}
                  step={1}
                  value={year}
                  onChange={(e) => setYear(e.target.value === '' ? '' : Number(e.target.value))}
                  disabled={isEdit}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="month">Month</Label>
                <Select
                  value={String(month)}
                  onValueChange={(v) => setMonth(Number(v))}
                  disabled={isEdit}
                >
                  <SelectTrigger id="month">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((label, idx) => (
                      <SelectItem key={idx + 1} value={String(idx + 1)}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="rate">Rate (DOP per 1 USD)</Label>
              <Input
                id="rate"
                type="number"
                min={0}
                step="0.0001"
                value={rate}
                onChange={(e) => setRate(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="e.g. 61.5000"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="source">Source (optional)</Label>
              <Select value={source || 'none'} onValueChange={(v) => setSource(v === 'none' ? '' : v)}>
                <SelectTrigger id="source">
                  <SelectValue placeholder="Select source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— none —</SelectItem>
                  <SelectItem value="BCRD">BCRD (Banco Central)</SelectItem>
                  <SelectItem value="bank">Bank</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Add rate'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
