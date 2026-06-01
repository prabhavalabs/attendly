-- ============================================================================
-- 0006_integrations — External integration accounts (Google Calendar, M6)
-- OAuth tokens are AES-GCM encrypted at rest (SRS §9, FR-8.3).
-- Single-tenant: one row per provider.
-- ============================================================================

CREATE TABLE integration_accounts (
  id                TEXT PRIMARY KEY,
  provider          TEXT NOT NULL,                 -- 'google'
  connected_by      TEXT REFERENCES users (id) ON DELETE SET NULL,
  account_email     TEXT,
  access_token_enc  TEXT,                           -- AES-GCM (iv|ciphertext, base64)
  refresh_token_enc TEXT,
  token_expires_at  TEXT,                           -- ISO-8601 UTC
  scope             TEXT,
  calendar_id       TEXT,                           -- selected target calendar
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

CREATE UNIQUE INDEX idx_integration_provider ON integration_accounts (provider);
