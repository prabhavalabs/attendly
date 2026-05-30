-- ============================================================================
-- 0004_billing — Invoices & payments (M4)
-- Money is INTEGER minor units (LKR cents). Periods are TEXT 'YYYY-MM'.
-- ============================================================================

CREATE TABLE invoices (
  id            TEXT PRIMARY KEY,
  student_id    TEXT NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  class_id      TEXT NOT NULL REFERENCES classes (id) ON DELETE CASCADE,
  period        TEXT NOT NULL,                 -- 'YYYY-MM'
  amount_minor  INTEGER NOT NULL,              -- billed amount (minor units)
  due_date      TEXT NOT NULL,                 -- 'YYYY-MM-DD'
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'partial', 'paid', 'overdue', 'waived')),
  waived_reason TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

-- One invoice per student+class+period (idempotent generation, SRS §5.3).
CREATE UNIQUE INDEX idx_invoices_unique ON invoices (student_id, class_id, period);
CREATE INDEX idx_invoices_student ON invoices (student_id);
CREATE INDEX idx_invoices_period ON invoices (period);
CREATE INDEX idx_invoices_status ON invoices (status);

CREATE TABLE payments (
  id           TEXT PRIMARY KEY,
  invoice_id   TEXT NOT NULL REFERENCES invoices (id) ON DELETE CASCADE,
  student_id   TEXT NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  amount_minor INTEGER NOT NULL,
  method       TEXT NOT NULL DEFAULT 'cash'
                 CHECK (method IN ('cash', 'card', 'bank', 'online')),
  receipt_no   TEXT NOT NULL,                  -- 'RC-YYYYMM-NNNN'
  note         TEXT,
  recorded_by  TEXT REFERENCES users (id) ON DELETE SET NULL,
  paid_at      TEXT NOT NULL,
  created_at   TEXT NOT NULL
);

CREATE UNIQUE INDEX idx_payments_receipt_no ON payments (receipt_no);
CREATE INDEX idx_payments_invoice ON payments (invoice_id);
CREATE INDEX idx_payments_student ON payments (student_id);
