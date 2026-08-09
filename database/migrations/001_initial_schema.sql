CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account VARCHAR(24) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  display_name VARCHAR(30) NOT NULL,
  city VARCHAR(40) NOT NULL DEFAULT '',
  bio VARCHAR(500) NOT NULL DEFAULT '',
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT users_account_format CHECK (account ~ '^[a-z0-9_]{3,24}$')
);

CREATE TABLE IF NOT EXISTS skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(60) NOT NULL,
  category VARCHAR(30) NOT NULL,
  hourly_rate NUMERIC(10, 2) NOT NULL,
  teaching_mode VARCHAR(12) NOT NULL,
  location VARCHAR(120) NOT NULL DEFAULT '',
  tags TEXT[] NOT NULL DEFAULT '{}',
  description VARCHAR(1200) NOT NULL,
  availability_days SMALLINT[] NOT NULL DEFAULT '{}',
  availability_start TIME,
  availability_end TIME,
  status VARCHAR(12) NOT NULL DEFAULT 'published',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT skills_rate_range CHECK (hourly_rate >= 0 AND hourly_rate <= 999999),
  CONSTRAINT skills_mode CHECK (teaching_mode IN ('online', 'offline', 'both')),
  CONSTRAINT skills_status CHECK (status IN ('draft', 'published', 'archived')),
  CONSTRAINT skills_availability_days CHECK (availability_days <@ ARRAY[1,2,3,4,5,6,7]::SMALLINT[])
);

CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id UUID REFERENCES skills(id) ON DELETE SET NULL,
  learner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT conversations_distinct_users CHECK (learner_id <> teacher_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS conversations_unique_skill_pair
  ON conversations(skill_id, learner_id, teacher_id)
  WHERE skill_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body VARCHAR(1000) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT messages_body_not_blank CHECK (LENGTH(TRIM(body)) > 0)
);

CREATE TABLE IF NOT EXISTS user_sessions (
  token_hash CHAR(64) PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip_address VARCHAR(64),
  user_agent VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS login_attempts (
  id BIGSERIAL PRIMARY KEY,
  account VARCHAR(64) NOT NULL,
  ip_address VARCHAR(64) NOT NULL,
  succeeded BOOLEAN NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  name TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS skills_owner_idx ON skills(owner_id);
CREATE INDEX IF NOT EXISTS skills_status_created_idx ON skills(status, created_at DESC);
CREATE INDEX IF NOT EXISTS skills_category_idx ON skills(category) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS conversations_learner_idx ON conversations(learner_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS conversations_teacher_idx ON conversations(teacher_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS messages_conversation_idx ON messages(conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS user_sessions_user_idx ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS user_sessions_expiry_idx ON user_sessions(expires_at);
CREATE INDEX IF NOT EXISTS login_attempts_lookup_idx ON login_attempts(account, ip_address, attempted_at DESC);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_set_updated_at ON users;
CREATE TRIGGER users_set_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS skills_set_updated_at ON skills;
CREATE TRIGGER skills_set_updated_at
BEFORE UPDATE ON skills
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS conversations_set_updated_at ON conversations;
CREATE TRIGGER conversations_set_updated_at
BEFORE UPDATE ON conversations
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
