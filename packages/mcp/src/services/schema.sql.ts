// One place for the DDL. The closed enums from constants/enums.ts are repeated here as
// CHECK constraints on purpose: the database is the last line where an unknown cause kind
// or state can be caught, and it outlives any single process.
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS runs (
  run_date            TEXT PRIMARY KEY,
  prior_runs_on_file  INTEGER NOT NULL,
  checked             INTEGER NOT NULL,
  healthy             INTEGER NOT NULL,
  failing             INTEGER NOT NULL,
  suppressed_credential INTEGER NOT NULL,
  suppressed_catalog  INTEGER NOT NULL,
  actionable          INTEGER NOT NULL,
  built_at            TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cases (
  case_id           TEXT PRIMARY KEY,
  cause_key         TEXT NOT NULL UNIQUE,
  cause_kind        TEXT NOT NULL CHECK (cause_kind IN (
                      'code_host_path_removed','deprecated_service','content_type_mismatch',
                      'tls_expired','auth_rejected','path_not_found','redirect_unresolved',
                      'host_unreachable','individual')),
  status_class      TEXT NOT NULL,
  proposed_party    TEXT NOT NULL CHECK (proposed_party IN (
                      'repository','catalog','host_operator','cert_holder','agency')),
  party_kind        TEXT CHECK (party_kind IS NULL OR party_kind IN (
                      'repository','catalog','host_operator','cert_holder','agency')),
  agency_count      INTEGER NOT NULL,
  confidence        INTEGER NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 3),
  consecutive_runs  INTEGER NOT NULL,
  state             TEXT NOT NULL CHECK (state IN (
                      'watching','ready','snoozed','approved','rejected','resolved')),
  snoozed_until     TEXT,
  first_seen        TEXT NOT NULL,
  last_seen         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS case_members (
  case_id   TEXT NOT NULL REFERENCES cases(case_id) ON DELETE CASCADE,
  run_date  TEXT NOT NULL,
  feed_id   TEXT NOT NULL,
  role      TEXT NOT NULL CHECK (role IN ('member','corroborating')),
  reason    TEXT,
  PRIMARY KEY (case_id, run_date, feed_id)
);

CREATE TABLE IF NOT EXISTS suppressions (
  run_date  TEXT NOT NULL,
  feed_id   TEXT NOT NULL,
  cause_key TEXT NOT NULL,
  reason    TEXT NOT NULL,
  PRIMARY KEY (run_date, feed_id)
);

CREATE TABLE IF NOT EXISTS evidence (
  case_id     TEXT NOT NULL REFERENCES cases(case_id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('http','catalog','repo','redirect','tls')),
  observation TEXT NOT NULL,
  source_url  TEXT,
  observed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS drafts (
  case_id       TEXT NOT NULL REFERENCES cases(case_id) ON DELETE CASCADE,
  subject       TEXT NOT NULL,
  body          TEXT NOT NULL,
  recipient_kind TEXT NOT NULL,
  generated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS decisions (
  case_id TEXT NOT NULL REFERENCES cases(case_id) ON DELETE CASCADE,
  actor   TEXT NOT NULL,
  action  TEXT NOT NULL CHECK (action IN ('approve','deny','edit','reject','snooze')),
  at      TEXT NOT NULL,
  note    TEXT
);

CREATE INDEX IF NOT EXISTS idx_members_case ON case_members(case_id, run_date);
CREATE INDEX IF NOT EXISTS idx_evidence_case ON evidence(case_id);
CREATE INDEX IF NOT EXISTS idx_cases_state ON cases(state);
`
