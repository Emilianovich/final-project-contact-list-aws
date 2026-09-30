BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  password_hash text NOT NULL,
  theme text NOT NULL DEFAULT 'light' CHECK (theme IN ('light','dark','contrast','sepia','vibrant','pastel','brutalist','terminal')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users (lower(trim(email)));

CREATE TABLE IF NOT EXISTS countries (
  code varchar(2) PRIMARY KEY,
  name text NOT NULL,
  calling_code varchar(4) NOT NULL
);

CREATE TABLE IF NOT EXISTS contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 100),
  email text NOT NULL CHECK (length(trim(email)) > 0),
  country_code varchar(2) NOT NULL REFERENCES countries(code),
  phone_e164 varchar(16) NOT NULL CHECK (phone_e164 ~ '^\+[1-9][0-9]{1,14}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT contacts_user_phone_unique UNIQUE (user_id, phone_e164)
);
CREATE INDEX IF NOT EXISTS contacts_user_status_idx ON contacts (user_id, deleted_at);
CREATE INDEX IF NOT EXISTS contacts_user_country_status_idx ON contacts (user_id, country_code, deleted_at);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions (user_id);
COMMIT;
