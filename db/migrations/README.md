# Database migrations

SQL files applied via the Supabase SQL editor against the project DB.
Each file is wrapped in a single transaction and is idempotent on
re-run (drop-if-exists guards before create).

Apply order is by round number. Each migration ships with a paired
`*-rollback.sql` companion that undoes it.

Migrations are not auto-run from this codebase. They are applied
manually by the maintainer, and version-controlled here so the
DB-side contract this app depends on stays alongside the app.

## Files

- `round-11-rls.sql` — enables RLS on 19 tables, adds `auth_role()`
  helper, mirrors the RBAC matrix in `docs/rbac.md`.
- `round-11-rls-rollback.sql` — disables RLS and drops all policies +
  the helper. Untested on a live DB; use with care.
