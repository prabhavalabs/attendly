# Migrations

Wrangler D1 migrations live here. Files are applied in lexical order.

- `0001_init.sql` — full DDL (users/roles/permissions, students, classes, sessions,
  attendance, invoices, payments, audit_log, settings). **To be added in M0.**

Apply:

```bash
pnpm --filter @tuition/db migrate:local    # local D1
pnpm --filter @tuition/db migrate:remote   # remote D1 (production)
```

See SRS §5 (Data Model) for table definitions, indexes, and constraints.
