-- ============================================================================
-- 0002_students — Students, guardians and the ID-card system (M1)
--
-- Conventions (SRS §5.1): TEXT ids, ISO-8601 UTC timestamps, soft delete via
-- deleted_at where history must survive (students), money as integer (n/a here).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- students
-- ---------------------------------------------------------------------------
CREATE TABLE students (
  id              TEXT PRIMARY KEY,
  reg_no          TEXT NOT NULL,                 -- YYYY-NNNN (Worker-generated)
  full_name       TEXT NOT NULL,
  name_normalized TEXT NOT NULL,                 -- lowercase, accent-stripped (search)
  phone           TEXT,
  email           TEXT,
  photo_url       TEXT,                          -- R2 object URL
  -- Opaque, revocable card token (>=128 bits); never derived from PII.
  card_token      TEXT NOT NULL,
  card_status     TEXT NOT NULL DEFAULT 'active'
                    CHECK (card_status IN ('active', 'revoked', 'lost')),
  card_issued_at  TEXT,
  status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'inactive', 'graduated', 'withdrawn')),
  date_of_birth   TEXT,
  address         TEXT,
  notes           TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  deleted_at      TEXT
);

-- O(log n) check-in resolution + uniqueness of reg_no among non-deleted students.
CREATE UNIQUE INDEX idx_students_card_token ON students (card_token);
CREATE UNIQUE INDEX idx_students_reg_no ON students (reg_no) WHERE deleted_at IS NULL;
CREATE INDEX idx_students_name_norm ON students (name_normalized);
CREATE INDEX idx_students_phone ON students (phone);
CREATE INDEX idx_students_status ON students (status);

-- ---------------------------------------------------------------------------
-- guardians (linked to students via student_guardians; reusable for siblings)
-- ---------------------------------------------------------------------------
CREATE TABLE guardians (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  phone      TEXT NOT NULL,
  email      TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE student_guardians (
  student_id   TEXT NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  guardian_id  TEXT NOT NULL REFERENCES guardians (id) ON DELETE CASCADE,
  relationship TEXT NOT NULL DEFAULT 'guardian'
                 CHECK (relationship IN ('mother', 'father', 'guardian', 'sibling', 'other')),
  is_primary   INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  PRIMARY KEY (student_id, guardian_id)
);

CREATE INDEX idx_student_guardians_student ON student_guardians (student_id);
CREATE INDEX idx_student_guardians_guardian ON student_guardians (guardian_id);
