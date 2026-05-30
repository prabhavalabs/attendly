# Migrations

Wrangler D1 migrations live here. Files are applied in lexical order. The schema
is built up milestone by milestone (not one monolithic `0001_init.sql`).

- `0001_auth_rbac.sql` — users, roles, permissions, the join tables
  (`role_permissions`, `user_roles`), refresh `auth_sessions`, append-only
  `audit_log`, and `settings`. (M0)

Apply (the D1 binding/config lives in `apps/api/wrangler.toml`, so run from there):

```bash
pnpm --filter @tuition/db migrate:local    # local D1
pnpm --filter @tuition/db migrate:remote   # remote D1 (production)
```

Quick DDL validation without Wrangler (used in CI):

```bash
sqlite3 :memory: ".read packages/db/migrations/0001_auth_rbac.sql" ".tables"
```

See SRS §5 (Data Model) for table definitions, indexes, and constraints.
