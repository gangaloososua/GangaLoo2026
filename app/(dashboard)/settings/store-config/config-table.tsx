'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Check, X } from 'lucide-react'
import { formatDateTime } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { updateConfigValue } from './actions'
import type { StoreConfigRow } from '@/lib/store-config'

function toEditableString(value: string | number | boolean): string {
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return String(value)
}


function ConfigRow({ row }: { row: StoreConfigRow }) {
  const original = toEditableString(row.value)
  const [draft, setDraft] = useState(original)
  const [pending, startTransition] = useTransition()

  const dirty = draft !== original

  function save() {
    startTransition(async () => {
      const result = await updateConfigValue(row.key, draft, row.valueType)
      if (result.ok) {
        toast.success(`Updated ${row.key}.`)
      } else {
        toast.error(result.error ?? 'Failed to update.')
      }
    })
  }

  function cancel() {
    setDraft(original)
  }

  let editor: React.ReactNode
  if (row.valueType === 'boolean') {
    editor = (
      <Select value={draft} onValueChange={setDraft}>
        <SelectTrigger className="h-9 w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="true">true</SelectItem>
          <SelectItem value="false">false</SelectItem>
        </SelectContent>
      </Select>
    )
  } else {
    editor = (
      <Input
        type={row.valueType === 'number' ? 'number' : 'text'}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && dirty && !pending) {
            e.preventDefault()
            save()
          } else if (e.key === 'Escape' && dirty) {
            e.preventDefault()
            cancel()
          }
        }}
        className="h-9 max-w-xs"
        step={row.valueType === 'number' ? 'any' : undefined}
      />
    )
  }

  return (
    <TableRow>
      <TableCell className="font-mono text-sm font-medium">{row.key}</TableCell>
      <TableCell>
        <span className="text-xs uppercase tracking-wide text-muted-foreground">
          {row.valueType}
        </span>
      </TableCell>
      <TableCell>{editor}</TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          {dirty ? (
            <>
              <Button
                size="icon"
                variant="ghost"
                onClick={cancel}
                disabled={pending}
                aria-label="Revert"
              >
                <X className="h-4 w-4" />
              </Button>
              <Button size="sm" onClick={save} disabled={pending}>
                <Check className="mr-1 h-4 w-4" />
                {pending ? 'Saving…' : 'Save'}
              </Button>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">
              {formatDateTime(row.updated_at)}
            </span>
          )}
        </div>
      </TableCell>
    </TableRow>
  )
}

export function ConfigTable({ rows }: { rows: StoreConfigRow[] }) {
  const [filter, setFilter] = useState('')
  const q = filter.trim().toLowerCase()
  const filtered = q
    ? rows.filter(
        (r) =>
          r.key.toLowerCase().includes(q) ||
          toEditableString(r.value).toLowerCase().includes(q),
      )
    : rows

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Input
          placeholder="Filter by key or value…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="max-w-sm"
        />
        <p className="text-sm text-muted-foreground">
          {filtered.length} of {rows.length}
        </p>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-64">Key</TableHead>
              <TableHead className="w-24">Type</TableHead>
              <TableHead>Value</TableHead>
              <TableHead className="w-48 text-right">Last updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-sm text-muted-foreground">
                  No matching keys.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((row) => <ConfigRow key={row.key} row={row} />)
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

