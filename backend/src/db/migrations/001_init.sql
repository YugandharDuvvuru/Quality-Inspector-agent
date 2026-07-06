CREATE TABLE IF NOT EXISTS components (
  id BIGSERIAL PRIMARY KEY,
  component_code TEXT NOT NULL UNIQUE,
  component_type TEXT,
  material TEXT,
  supplier TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inspection_requests (
  id BIGSERIAL PRIMARY KEY,
  component_id BIGINT NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  inspection_station TEXT NOT NULL,
  line_id TEXT NOT NULL,
  image_url TEXT,
  image_file_name TEXT,
  image_media_type TEXT,
  inspection_timestamp TIMESTAMPTZ NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inspection_results (
  id BIGSERIAL PRIMARY KEY,
  inspection_request_id BIGINT NOT NULL REFERENCES inspection_requests(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  overall_confidence NUMERIC(5,4) NOT NULL,
  severity TEXT,
  verdict TEXT,
  line_action TEXT,
  batch_action TEXT,
  human_override_required BOOLEAN NOT NULL DEFAULT FALSE,
  justification TEXT,
  fallback_reason TEXT,
  raw_response JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS detected_defects (
  id BIGSERIAL PRIMARY KEY,
  inspection_result_id BIGINT NOT NULL REFERENCES inspection_results(id) ON DELETE CASCADE,
  defect_type TEXT NOT NULL,
  location TEXT,
  bounding_box TEXT,
  confidence NUMERIC(5,4) NOT NULL,
  severity TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recommended_actions (
  id BIGSERIAL PRIMARY KEY,
  inspection_result_id BIGINT NOT NULL REFERENCES inspection_results(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  owner TEXT NOT NULL,
  timeline TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  inspection_result_id BIGINT NOT NULL REFERENCES inspection_results(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL,
  recipient TEXT NOT NULL,
  message TEXT NOT NULL,
  delivery_status TEXT NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ncr_reports (
  id BIGSERIAL PRIMARY KEY,
  inspection_result_id BIGINT NOT NULL REFERENCES inspection_results(id) ON DELETE CASCADE,
  ncr_number TEXT,
  report_text TEXT NOT NULL,
  copq_estimate TEXT,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inspection_audit_log (
  id BIGSERIAL PRIMARY KEY,
  inspection_result_id BIGINT NOT NULL REFERENCES inspection_results(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_components_component_code
  ON components(component_code);

CREATE INDEX IF NOT EXISTS idx_inspection_requests_component_id
  ON inspection_requests(component_id);

CREATE INDEX IF NOT EXISTS idx_inspection_results_request_id
  ON inspection_results(inspection_request_id);

CREATE INDEX IF NOT EXISTS idx_inspection_results_created_at
  ON inspection_results(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_detected_defects_result_id
  ON detected_defects(inspection_result_id);

CREATE INDEX IF NOT EXISTS idx_recommended_actions_result_id
  ON recommended_actions(inspection_result_id);

CREATE INDEX IF NOT EXISTS idx_notifications_result_id
  ON notifications(inspection_result_id);

CREATE INDEX IF NOT EXISTS idx_ncr_reports_result_id
  ON ncr_reports(inspection_result_id);

CREATE INDEX IF NOT EXISTS idx_inspection_audit_log_result_id
  ON inspection_audit_log(inspection_result_id);
