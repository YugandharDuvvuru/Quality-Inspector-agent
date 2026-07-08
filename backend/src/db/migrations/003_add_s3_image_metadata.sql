ALTER TABLE inspection_requests
  ADD COLUMN IF NOT EXISTS image_storage_provider TEXT,
  ADD COLUMN IF NOT EXISTS image_s3_bucket TEXT,
  ADD COLUMN IF NOT EXISTS image_s3_key TEXT,
  ADD COLUMN IF NOT EXISTS image_s3_uri TEXT;

CREATE INDEX IF NOT EXISTS idx_inspection_requests_image_s3_bucket_key
  ON inspection_requests(image_s3_bucket, image_s3_key);
