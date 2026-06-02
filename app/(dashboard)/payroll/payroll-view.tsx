'use client'

// app/(dashboard)/payroll/payroll-view.tsx
// Owner-only Payroll view. Three tabs: Employees (add staff, deduction defaults,
// extra-day pay, pay components), Attendance (month grid), and Pay run (calculator).

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  addEmployee,
  updateEmployee,
  removeEmployee,
  saveComponent,
  removeComponent,
} from './actions'
import { AttendanceTab } from './attendance-tab'
import { PayRunTab } from './pay-run-tab'
import {
  FREQUENCIES,
  FREQUENCY_LABEL,
  formatDOP,
  type PayComponent,
  type PayrollEmployeeRow,
  type StaffOption,
  type PayFrequency,
} from '@/lib/payroll'

const selectClass =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring'

function pesosToCents(s: string): number {
  const n = Number((s || '').trim())
  return Number.isFinite(n) ? Math.max(0, Math.round(n * 100)) : 0
}
function centsToPesos(c: number): string {
  return c ? String(c / 100) : ''
}

export function PayrollView({
  employees,
  components,
  availableStaff,
}: {
  employees: PayrollEmployeeRow[]
  components: PayComponent[]
  availableStaff: StaffOption[]
}) {
  const router = useRouter()
  const [addId, setAddId] = useState('')
  const [busy, setBusy] = useState(false)

  async function onAdd() {
    if (!addId) {
      toast.error('Pick a staff member first.')
      return
    }
    setBusy(true)
    const res = await addEmployee(addId)
    setBusy(false)
    if (res.ok) {
      toast.success('Added to payroll')
      setAddId('')
      router.refresh()
    } else {
      toast.error(res.error)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Payroll</h1>
        <p className="text-sm text-muted-foreground">
          Employees, pay setup, attendance, and pay calculation. Owner only.
        </p>
      </div>

      <Tabs defaultValue="employees">
        <TabsList>
          <TabsTrigger value="employees">Employees</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="payrun">Pay run</TabsTrigger>
        </TabsList>

        <TabsContent value="employees" className="space-y-6 pt-4">
          <div className="rounded-md border p-4">
            <Label className="text-sm font-medium">Add an employee to payroll</Label>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <select
                className={`${selectClass} max-w-xs`}
                value={addId}
                onChange={(e) => setAddId(e.target.value)}
              >
                <option value="">Select staff…</option>
                {availableStaff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.fullName} ({s.role})
                  </option>
                ))}
              </select>
              <Button type="button" onClick={onAdd} disabled={busy || !addId}>
                Add
              </Button>
            </div>
            {availableStaff.length === 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                All staff are already on payroll.
              </p>
            )}
          </div>

          {employees.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No employees on payroll yet. Add one above.
            </p>
          ) : (
            <div className="space-y-4">
              {employees.map((emp) => (
                <EmployeeCard
                  key={emp.id}
                  emp={emp}
                  components={components.filter((c) => c.employee_id === emp.id)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="attendance" className="pt-4">
          <AttendanceTab employees={employees} />
        </TabsContent>

        <TabsContent value="payrun" className="pt-4">
          <PayRunTab employees={employees} components={components} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function EmployeeCard({
  emp,
  components,
}: {
  emp: PayrollEmployeeRow
  components: PayComponent[]
}) {
  const router = useRouter()
  const [isActive, setIsActive] = useState(emp.is_active)
  const [late, setLate] = useState(centsToPesos(emp.default_late_deduction_cents))
  const [absent, setAbsent] = useState(
    centsToPesos(emp.default_absent_deduction_cents),
  )
  const [extra, setExtra] = useState(centsToPesos(emp.extra_day_pay_cents))
  const [notes, setNotes] = useState(emp.notes ?? '')
  const [saving, setSaving] = useState(false)

  async function onSave() {
    setSaving(true)
    const res = await updateEmployee({
      id: emp.id,
      isActive,
      defaultLateDeductionCents: pesosToCents(late),
      defaultAbsentDeductionCents: pesosToCents(absent),
      extraDayPayCents: pesosToCents(extra),
      notes,
    })
    setSaving(false)
    if (res.ok) {
      toast.success('Saved')
      router.refresh()
    } else {
      toast.error(res.error)
    }
  }

  async function onRemove() {
    if (
      !confirm(
        `Remove ${emp.fullName} from payroll? This also deletes their pay setup, attendance and advances.`,
      )
    )
      return
    const res = await removeEmployee(emp.id)
    if (res.ok) {
      toast.success('Removed from payroll')
      router.refresh()
    } else {
      toast.error(res.error)
    }
  }

  return (
    <div className="space-y-4 rounded-md border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-semibold">{emp.fullName}</div>
          <div className="text-xs text-muted-foreground">
            {emp.role}
            {!isActive && ' · inactive'}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch
              id={`active-${emp.id}`}
              checked={isActive}
              onCheckedChange={setIsActive}
            />
            <Label htmlFor={`active-${emp.id}`} className="cursor-pointer text-xs">
              Active
            </Label>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={onRemove}>
            Remove
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label className="text-xs">Default late deduction / day (RD$)</Label>
          <Input
            type="number"
            inputMode="decimal"
            min="0"
            step="1"
            value={late}
            onChange={(e) => setLate(e.target.value)}
            placeholder="0"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Default absent deduction / day (RD$)</Label>
          <Input
            type="number"
            inputMode="decimal"
            min="0"
            step="1"
            value={absent}
            onChange={(e) => setAbsent(e.target.value)}
            placeholder="0"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Extra day pay (RD$)</Label>
          <Input
            type="number"
            inputMode="decimal"
            min="0"
            step="1"
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
            placeholder="0"
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Deductions only pre-fill the box when you mark a Late/Absent day — you set
        the actual amount per day. Extra day pay is added per day worked beyond the
        normal 5 (Tue–Sat) in a pay run.
      </p>

      <div className="space-y-1">
        <Label className="text-xs">Notes</Label>
        <Input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional"
        />
      </div>

      <div className="flex justify-end">
        <Button type="button" size="sm" onClick={onSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save employee'}
        </Button>
      </div>

      <div className="border-t pt-3">
        <div className="mb-2 text-sm font-medium">Pay components</div>
        {components.length === 0 ? (
          <p className="mb-2 text-xs text-muted-foreground">
            No pay components yet. Add one below (e.g. Base · 2000 · Weekly).
          </p>
        ) : (
          <div className="mb-3 space-y-2">
            {components.map((c) => (
              <ComponentRow key={c.id} comp={c} />
            ))}
          </div>
        )}
        <AddComponent employeeId={emp.id} />
      </div>
    </div>
  )
}

function ComponentRow({ comp }: { comp: PayComponent }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [label, setLabel] = useState(comp.label)
  const [amount, setAmount] = useState(centsToPesos(comp.amount_cents))
  const [freq, setFreq] = useState<PayFrequency>(comp.frequency)
  const [busy, setBusy] = useState(false)

  async function onSave() {
    setBusy(true)
    const res = await saveComponent({
      id: comp.id,
      employeeId: comp.employee_id,
      label,
      amountCents: pesosToCents(amount),
      frequency: freq,
    })
    setBusy(false)
    if (res.ok) {
      toast.success('Saved')
      setEditing(false)
      router.refresh()
    } else {
      toast.error(res.error)
    }
  }

  async function onRemove() {
    if (!confirm('Remove this pay component?')) return
    const res = await removeComponent(comp.id)
    if (res.ok) {
      toast.success('Removed')
      router.refresh()
    } else {
      toast.error(res.error)
    }
  }

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded border px-3 py-2 text-sm">
        <div>
          <span className="font-medium">{comp.label}</span> ·{' '}
          {formatDOP(comp.amount_cents)} · {FREQUENCY_LABEL[comp.frequency]}
        </div>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setEditing(true)}
          >
            Edit
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            Remove
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="grid items-end gap-2 rounded border p-3 sm:grid-cols-4">
      <div className="space-y-1">
        <Label className="text-xs">Label</Label>
        <Input value={label} onChange={(e) => setLabel(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Amount (RD$)</Label>
        <Input
          type="number"
          inputMode="decimal"
          min="0"
          step="1"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Frequency</Label>
        <select
          className={selectClass}
          value={freq}
          onChange={(e) => setFreq(e.target.value as PayFrequency)}
        >
          {FREQUENCIES.map((f) => (
            <option key={f} value={f}>
              {FREQUENCY_LABEL[f]}
            </option>
          ))}
        </select>
      </div>
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={onSave} disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setEditing(false)}
        >
          Cancel
        </Button>
      </div>
    </div>
  )
}

function AddComponent({ employeeId }: { employeeId: string }) {
  const router = useRouter()
  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState('')
  const [freq, setFreq] = useState<PayFrequency>('weekly')
  const [busy, setBusy] = useState(false)

  async function onAdd() {
    if (!label.trim()) {
      toast.error('Enter a label.')
      return
    }
    if (pesosToCents(amount) <= 0) {
      toast.error('Enter an amount.')
      return
    }
    setBusy(true)
    const res = await saveComponent({
      employeeId,
      label,
      amountCents: pesosToCents(amount),
      frequency: freq,
    })
    setBusy(false)
    if (res.ok) {
      toast.success('Component added')
      setLabel('')
      setAmount('')
      setFreq('weekly')
      router.refresh()
    } else {
      toast.error(res.error)
    }
  }

  return (
    <div className="grid items-end gap-2 sm:grid-cols-4">
      <div className="space-y-1">
        <Label className="text-xs">Label</Label>
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Base"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Amount (RD$)</Label>
        <Input
          type="number"
          inputMode="decimal"
          min="0"
          step="1"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="2000"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Frequency</Label>
        <select
          className={selectClass}
          value={freq}
          onChange={(e) => setFreq(e.target.value as PayFrequency)}
        >
          {FREQUENCIES.map((f) => (
            <option key={f} value={f}>
              {FREQUENCY_LABEL[f]}
            </option>
          ))}
        </select>
      </div>
      <Button type="button" size="sm" onClick={onAdd} disabled={busy}>
        {busy ? 'Adding…' : 'Add component'}
      </Button>
    </div>
  )
}
