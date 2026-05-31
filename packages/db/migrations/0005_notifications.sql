-- ============================================================================
-- 0005_notifications — Composed notifications (SRS §7.7)
-- v1 records & schedules; delivery providers (push/SMS/email) land with M5.
-- ============================================================================

CREATE TABLE notifications (
  id              TEXT PRIMARY KEY,
  type            TEXT NOT NULL DEFAULT 'announcement'
                    CHECK (type IN ('announcement', 'reminder')),
  title           TEXT NOT NULL,
  body            TEXT NOT NULL,
  channel         TEXT NOT NULL DEFAULT 'in_app'
                    CHECK (channel IN ('in_app', 'push', 'sms', 'email')),
  audience        TEXT NOT NULL
                    CHECK (audience IN ('all_students', 'all_guardians', 'class', 'student')),
  class_id        TEXT REFERENCES classes (id) ON DELETE SET NULL,
  student_id      TEXT REFERENCES students (id) ON DELETE SET NULL,
  recipient_count INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued', 'sent', 'failed')),
  scheduled_at    TEXT,
  sent_at         TEXT,
  created_by      TEXT REFERENCES users (id) ON DELETE SET NULL,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE INDEX idx_notifications_status ON notifications (status);
CREATE INDEX idx_notifications_created ON notifications (created_at);
