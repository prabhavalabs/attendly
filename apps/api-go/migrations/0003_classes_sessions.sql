-- ============================================================================
-- 0003_classes_sessions — Lecturers, classes, enrollments, timetable,
-- sessions and attendance (M2; attendance is written by check-in in M3).
-- Money is INTEGER minor units (LKR cents). Times TEXT HH:MM, dates YYYY-MM-DD.
-- ============================================================================

CREATE TABLE lecturers (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  phone      TEXT,
  email      TEXT,
  user_id    TEXT REFERENCES users (id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE classes (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  subject     TEXT NOT NULL,
  code        TEXT NOT NULL,                 -- short label for chips, e.g. "Phys"
  band        TEXT NOT NULL DEFAULT 'teal'
                CHECK (band IN ('teal', 'amber', 'coral', 'blue', 'violet', 'green')),
  fee_minor   INTEGER NOT NULL DEFAULT 0,    -- monthly fee, minor units
  capacity    INTEGER,
  room        TEXT,
  lecturer_id TEXT REFERENCES lecturers (id) ON DELETE SET NULL,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT
);

CREATE INDEX idx_classes_status ON classes (status);
CREATE INDEX idx_classes_lecturer ON classes (lecturer_id);

CREATE TABLE enrollments (
  id                 TEXT PRIMARY KEY,
  student_id         TEXT NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  class_id           TEXT NOT NULL REFERENCES classes (id) ON DELETE CASCADE,
  -- NULL falls back to the class fee (SRS FR-5.2).
  fee_override_minor INTEGER,
  status             TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'dropped')),
  enrolled_at        TEXT NOT NULL
);

CREATE UNIQUE INDEX idx_enrollments_unique ON enrollments (student_id, class_id);
CREATE INDEX idx_enrollments_class ON enrollments (class_id);
CREATE INDEX idx_enrollments_student ON enrollments (student_id);

CREATE TABLE timetable_slots (
  id         TEXT PRIMARY KEY,
  class_id   TEXT NOT NULL REFERENCES classes (id) ON DELETE CASCADE,
  weekday    INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),  -- 0=Sunday
  start_time TEXT NOT NULL,                                     -- HH:MM
  end_time   TEXT NOT NULL,
  room       TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_timetable_class ON timetable_slots (class_id);

CREATE TABLE class_sessions (
  id                     TEXT PRIMARY KEY,
  class_id               TEXT NOT NULL REFERENCES classes (id) ON DELETE CASCADE,
  session_date           TEXT NOT NULL,                          -- YYYY-MM-DD
  start_time             TEXT NOT NULL,
  end_time               TEXT NOT NULL,
  status                 TEXT NOT NULL DEFAULT 'scheduled'
                           CHECK (status IN ('scheduled', 'open', 'closed', 'cancelled')),
  topic                  TEXT,
  substitute_lecturer_id TEXT REFERENCES lecturers (id) ON DELETE SET NULL,
  gcal_event_id          TEXT,                                   -- M6 calendar sync
  created_at             TEXT NOT NULL,
  updated_at             TEXT NOT NULL
);

-- Idempotent session generation (SRS FR-5.4): one session per class per date.
CREATE UNIQUE INDEX idx_sessions_unique ON class_sessions (class_id, session_date);
CREATE INDEX idx_sessions_date ON class_sessions (session_date);
CREATE INDEX idx_sessions_status ON class_sessions (status);

-- ---------------------------------------------------------------------------
-- attendance — written by check-in (M3); rosters read from it.
-- ---------------------------------------------------------------------------
CREATE TABLE attendance (
  id               TEXT PRIMARY KEY,
  session_id       TEXT NOT NULL REFERENCES class_sessions (id) ON DELETE CASCADE,
  student_id       TEXT NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  status           TEXT NOT NULL DEFAULT 'present'
                     CHECK (status IN ('present', 'late', 'absent', 'excused')),
  method           TEXT NOT NULL DEFAULT 'manual'
                     CHECK (method IN ('qr', 'nfc', 'search', 'manual')),
  client_dedup_key TEXT,
  recorded_by      TEXT REFERENCES users (id) ON DELETE SET NULL,
  checked_in_at    TEXT NOT NULL,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);

CREATE UNIQUE INDEX idx_attendance_session_student ON attendance (session_id, student_id);
CREATE INDEX idx_attendance_student ON attendance (student_id);
-- Offline idempotency: dedup on the client-supplied key (SRS §5.4, §10).
CREATE UNIQUE INDEX idx_attendance_dedup ON attendance (client_dedup_key)
  WHERE client_dedup_key IS NOT NULL;
