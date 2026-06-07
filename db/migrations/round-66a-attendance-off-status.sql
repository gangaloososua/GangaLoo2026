-- Round 66a - Attendance: allow an 'off' status.
--
-- Bug: a normal work day (Tue-Sat) set to "Off" on screen never stuck after a
-- refresh. Two reasons: (1) the attendance table's CHECK only allowed
-- present/late/absent, so an 'off' row could not be stored at all, and (2) the
-- screen skipped off-days when saving. This migration fixes reason (1) by
-- widening the allowed statuses to include 'off'. The matching screen + action
-- changes (which actually write and read off-days) ship alongside.
--
-- 'off' means a rest day: not worked, no deduction. The pay calculator already
-- ignores any status that is not present/late/absent, so 'off' rows have no
-- effect on pay. Purely additive: changes a constraint only, no data touched.

alter table public.payroll_attendance
  drop constraint if exists payroll_attendance_status_check;

alter table public.payroll_attendance
  add constraint payroll_attendance_status_check
  check (status in ('present', 'late', 'absent', 'off'));
