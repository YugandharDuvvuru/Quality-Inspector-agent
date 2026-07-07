CREATE TABLE IF NOT EXISTS bedrock_interaction_records (
  id BIGSERIAL PRIMARY KEY,
  inspection_result_id BIGINT NOT NULL REFERENCES inspection_results(id) ON DELETE CASCADE,
  stage_name TEXT NOT NULL,
  model_id TEXT,
  region TEXT,
  prompt_text TEXT,
  response_text TEXT,
  success BOOLEAN NOT NULL DEFAULT FALSE,
  skipped BOOLEAN NOT NULL DEFAULT FALSE,
  error_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS enterprise_integration_submissions (
  id BIGSERIAL PRIMARY KEY,
  inspection_result_id BIGINT NOT NULL REFERENCES inspection_results(id) ON DELETE CASCADE,
  system_name TEXT NOT NULL,
  submission_status TEXT NOT NULL,
  skipped_flag BOOLEAN NOT NULL DEFAULT FALSE,
  external_reference TEXT,
  request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  response_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bedrock_interaction_records_result_id
  ON bedrock_interaction_records(inspection_result_id);

CREATE INDEX IF NOT EXISTS idx_enterprise_integration_submissions_result_id
  ON enterprise_integration_submissions(inspection_result_id);
