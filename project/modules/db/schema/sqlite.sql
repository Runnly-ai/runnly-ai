CREATE TABLE IF NOT EXISTS scm_pr_bindings (
  provider TEXT NOT NULL,
  repository TEXT NOT NULL,
  pull_request_number INTEGER NOT NULL,
  session_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (provider, repository, pull_request_number)
);

CREATE TABLE IF NOT EXISTS app_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS app_user_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  revoked_at INTEGER,
  FOREIGN KEY (user_id) REFERENCES app_users(id)
);

CREATE INDEX IF NOT EXISTS idx_app_user_sessions_user_id ON app_user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_app_user_sessions_token_hash ON app_user_sessions(token_hash);
