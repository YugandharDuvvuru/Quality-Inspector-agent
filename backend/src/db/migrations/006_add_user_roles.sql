ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'VIEWER';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'app_users_role_check'
  ) THEN
    ALTER TABLE app_users
      ADD CONSTRAINT app_users_role_check
      CHECK (role IN ('ADMIN', 'VIEWER'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_app_users_role
  ON app_users(role);
