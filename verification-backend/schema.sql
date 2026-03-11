CREATE TABLE IF NOT EXISTS certificates (
  id    TEXT PRIMARY KEY,
  name  TEXT NOT NULL,
  event TEXT NOT NULL,
  date  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS login_attempts (
  ip           TEXT PRIMARY KEY,
  attempts     INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  last_attempt TEXT
);
