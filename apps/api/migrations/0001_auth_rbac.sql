-- ============================================================================
-- 0001_auth_rbac — Authentication, users, roles & permissions (RBAC)
--
-- Conventions (SRS §5.1):
--   * IDs are TEXT (UUID/nanoid generated in the Worker)
--   * Timestamps are TEXT ISO-8601 UTC
--   * Booleans are INTEGER 0/1
--   * Soft delete via deleted_at where history must survive
-- ============================================================================

-- ---------------------------------------------------------------------------
-- users — staff accounts that sign in to the admin portal
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL,
  name          TEXT NOT NULL,
  -- PBKDF2 (WebCrypto) derived: "pbkdf2$<iterations>$<salt_b64>$<hash_b64>"
  password_hash TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'suspended')),
  last_login_at TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  deleted_at    TEXT
);

-- Case-insensitive unique email among non-deleted users.
CREATE UNIQUE INDEX idx_users_email
  ON users (email) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_status ON users (status);

-- ---------------------------------------------------------------------------
-- roles — named permission bundles (5 system roles seeded on first boot)
-- ---------------------------------------------------------------------------
CREATE TABLE roles (
  id          TEXT PRIMARY KEY,
  key         TEXT NOT NULL UNIQUE,
  label       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  -- system roles cannot be deleted (permissions may still be edited)
  system      INTEGER NOT NULL DEFAULT 0 CHECK (system IN (0, 1)),
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- permissions — the authoritative permission catalog (resource.action)
-- ---------------------------------------------------------------------------
CREATE TABLE permissions (
  key      TEXT PRIMARY KEY,   -- "resource.action"
  resource TEXT NOT NULL,
  action   TEXT NOT NULL,
  label    TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- role_permissions — which permission keys a role grants
-- permission_key references permissions(key) OR the literal '*' wildcard
-- (owner), so it is intentionally not a foreign key.
-- ---------------------------------------------------------------------------
CREATE TABLE role_permissions (
  role_id        TEXT NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
  permission_key TEXT NOT NULL,
  PRIMARY KEY (role_id, permission_key)
);

CREATE INDEX idx_role_permissions_role ON role_permissions (role_id);

-- ---------------------------------------------------------------------------
-- user_roles — many-to-many user ↔ role assignment
-- ---------------------------------------------------------------------------
CREATE TABLE user_roles (
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role_id TEXT NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

CREATE INDEX idx_user_roles_role ON user_roles (role_id);

-- ---------------------------------------------------------------------------
-- auth_sessions — refresh-token sessions, stored hashed (SRS §9)
-- ---------------------------------------------------------------------------
CREATE TABLE auth_sessions (
  id                 TEXT PRIMARY KEY,
  user_id            TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- SHA-256 hex of the opaque refresh token; the raw token is never stored
  refresh_token_hash TEXT NOT NULL UNIQUE,
  user_agent         TEXT,
  created_at         TEXT NOT NULL,
  expires_at         TEXT NOT NULL,
  revoked_at         TEXT
);

CREATE INDEX idx_auth_sessions_user ON auth_sessions (user_id);

-- ---------------------------------------------------------------------------
-- audit_log — append-only; never updated or deleted by app code (SRS §9)
-- ---------------------------------------------------------------------------
CREATE TABLE audit_log (
  id          TEXT PRIMARY KEY,
  actor_id    TEXT,
  action      TEXT NOT NULL,
  entity_type TEXT,
  entity_id   TEXT,
  before_json TEXT,
  after_json  TEXT,
  created_at  TEXT NOT NULL
);

CREATE INDEX idx_audit_actor  ON audit_log (actor_id);
CREATE INDEX idx_audit_entity ON audit_log (entity_type, entity_id);
CREATE INDEX idx_audit_created ON audit_log (created_at);

-- ---------------------------------------------------------------------------
-- settings — small key/value app settings (org name, currency, timezone, …)
-- ---------------------------------------------------------------------------
CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
