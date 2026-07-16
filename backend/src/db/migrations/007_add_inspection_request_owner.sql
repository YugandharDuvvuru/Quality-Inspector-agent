ALTER TABLE inspection_requests
  ADD COLUMN IF NOT EXISTS created_by_user_id BIGINT REFERENCES app_users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_inspection_requests_created_by_user_id
  ON inspection_requests(created_by_user_id);
