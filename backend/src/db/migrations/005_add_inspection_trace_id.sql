ALTER TABLE inspection_results
  ADD COLUMN IF NOT EXISTS trace_id TEXT;

UPDATE inspection_results
SET trace_id =
  SUBSTRING(MD5(id::text || created_at::text), 1, 8) || '-' ||
  SUBSTRING(MD5(id::text || created_at::text), 9, 4) || '-' ||
  SUBSTRING(MD5(id::text || created_at::text), 13, 4) || '-' ||
  SUBSTRING(MD5(id::text || created_at::text), 17, 4) || '-' ||
  SUBSTRING(MD5(id::text || created_at::text), 21, 12)
WHERE trace_id IS NULL;

ALTER TABLE inspection_results
  ALTER COLUMN trace_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_inspection_results_trace_id
  ON inspection_results(trace_id);
