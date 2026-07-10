import React from "react";
import {
  ClipboardCheck,
  Cloud,
  Factory,
  Image as ImageIcon,
  Link2,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { useMemo, useState } from "react";
import { submitInspection } from "./api.js";

const samplePayload = {
  component_id: "CMP-AXLE-1042",
  image_url: "https://example.com/images/corrosion-bearing-race.jpg",
  inspection_station: "Vision Station A3",
  line_id: "LINE-07",
  metadata: {
    material: "Forged steel",
    supplier: "Supplier Alpha",
    batch_number: "BATCH-2026-0705",
    dimensions: "OD 82mm, ID 42mm",
    tolerance_range: "+/- 0.03mm",
    notes: "Operator noted corrosion-like discoloration near outer face",
  },
};

const blankForm = {
  component_id: "",
  image_url: "",
  image_base64: "",
  image_media_type: "",
  image_file_name: "",
  inspection_station: "",
  line_id: "",
  material: "",
  supplier: "",
  batch_number: "",
  dimensions: "",
  tolerance_range: "",
  notes: "",
};

const workflowDefinitions = [
  { key: "vision", index: "01", title: "Vision Inspector" },
  { key: "severity", index: "02", title: "Severity Classifier" },
  { key: "rootCause", index: "03", title: "Root Cause Analyst" },
  { key: "decision", index: "04", title: "Decision and Action" },
  { key: "notify", index: "05", title: "Escalation and Notify" },
  { key: "integration", index: "06", title: "Enterprise Integration" },
];

export function App() {
  const [form, setForm] = useState(() => ({
    component_id: samplePayload.component_id,
    image_url: samplePayload.image_url,
    inspection_station: samplePayload.inspection_station,
    line_id: samplePayload.line_id,
    ...samplePayload.metadata,
  }));
  const [result, setResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [fileInputKey, setFileInputKey] = useState(0);

  const verdictTone = useMemo(
    () => getVerdictTone(result?.final_decision?.final_decision),
    [result]
  );
  const workflowSteps = useMemo(() => buildWorkflowSteps(result), [result]);
  const findings = result?.inspection_summary?.defects_detected || [];
  const actions = result?.root_cause_analysis?.recommended_actions || [];
  const notifications = result?.notifications?.notifications_sent || [];
  const integrations = result?.enterprise_integrations || [];

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  function loadSample() {
    setForm({
      component_id: samplePayload.component_id,
      image_url: samplePayload.image_url,
      image_base64: "",
      image_media_type: "",
      image_file_name: "",
      inspection_station: samplePayload.inspection_station,
      line_id: samplePayload.line_id,
      ...samplePayload.metadata,
    });
    setFileInputKey((current) => current + 1);
    setError("");
  }

  function clearForm() {
    setForm(blankForm);
    setResult(null);
    setError("");
    setFileInputKey((current) => current + 1);
  }

  async function handleImageUpload(event) {
    const file = event.target.files?.[0];

    if (!file) {
      setForm((current) => ({
        ...current,
        image_base64: "",
        image_media_type: "",
        image_file_name: "",
      }));
      return;
    }

    if (!file.type.startsWith("image/")) {
      setError("Please upload an image file.");
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      setError("Please upload an image smaller than 8 MB.");
      return;
    }

    const dataUrl = await readFileAsDataUrl(file);
    const base64 = dataUrl.split("base64,")[1] || "";

    setForm((current) => ({
      ...current,
      image_base64: base64,
      image_media_type: file.type,
      image_file_name: file.name,
    }));
    setError("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setIsLoading(true);
    setError("");

    if (!form.image_base64 && !form.image_url.trim()) {
      setError("Please upload an image or provide an image URL.");
      setIsLoading(false);
      return;
    }

    try {
      const payload = {
        component_id: form.component_id,
        image_url: form.image_url,
        image_base64: form.image_base64,
        image_media_type: form.image_media_type,
        image_file_name: form.image_file_name,
        inspection_station: form.inspection_station,
        timestamp: new Date().toISOString(),
        line_id: form.line_id,
        metadata: {
          material: form.material,
          supplier: form.supplier,
          batch_number: form.batch_number,
          dimensions: form.dimensions,
          tolerance_range: form.tolerance_range,
          notes: form.notes,
        },
      };

      const inspection = await submitInspection(payload);
      setResult(inspection);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="dashboard-shell">
      <section className="hero-band">
        <div className="hero-copy">
          <p className="hero-kicker">Agentic AI Quality Demo</p>
          <h1>Manufacturing Component Quality Inspector</h1>
          <p className="hero-text">
            A unified view of inspection outcomes, quality risk, corrective action, escalation, and
            enterprise traceability.
          </p>
        </div>
        <div className="hero-status">
          <StatusChip icon={Factory} label="5 Agents" />
          <StatusChip icon={ShieldCheck} label="IATF 16949" />
          <StatusChip icon={ClipboardCheck} label="ISO 9001" />
        </div>
      </section>

      <section className="dashboard-grid">
        <form className="request-panel" onSubmit={handleSubmit}>
          <div className="panel-title-block">
            <h2>Inspection Request</h2>
            <p>Submit a new component image, URL, or S3 URI for multi-agent review.</p>
          </div>

          <div className="request-fields">
            <Input label="Component ID" name="component_id" value={form.component_id} onChange={updateField} required />
            <Input
              label="Inspection Station"
              name="inspection_station"
              value={form.inspection_station}
              onChange={updateField}
              required
            />
            <Input label="Line" name="line_id" value={form.line_id} onChange={updateField} required />
            <Input label="Timestamp" value={new Date().toISOString()} readOnly />
            <label className="field field-full">
              <span>Image Path, URL, or S3 URI</span>
              <textarea
                name="image_url"
                rows="3"
                value={form.image_url}
                onChange={updateField}
                placeholder="https://... or s3://bucket/path"
              />
            </label>
            <label className="field field-full">
              <span>Local Image File</span>
              <input key={fileInputKey} type="file" accept="image/*" onChange={handleImageUpload} />
              {form.image_file_name ? <small>{form.image_file_name}</small> : null}
            </label>
            <Input label="Material" name="material" value={form.material} onChange={updateField} />
            <Input label="Supplier" name="supplier" value={form.supplier} onChange={updateField} />
            <Input label="Batch" name="batch_number" value={form.batch_number} onChange={updateField} />
            <Input label="Dimensions" name="dimensions" value={form.dimensions} onChange={updateField} />
            <Input label="Tolerance" name="tolerance_range" value={form.tolerance_range} onChange={updateField} />
            <label className="field field-full">
              <span>Inspection Notes</span>
              <textarea name="notes" rows="5" value={form.notes} onChange={updateField} />
            </label>
          </div>

          <div className="input-evidence">
            <EvidencePill icon={Link2} label={form.image_url ? "Source URL or S3 URI ready" : "No URL provided"} />
            <EvidencePill
              icon={ImageIcon}
              label={form.image_file_name ? `${form.image_file_name}` : "No local file selected"}
            />
          </div>

          {error ? <p className="error-banner">{error}</p> : null}

          <div className="request-actions">
            <button className="primary-action" type="submit" disabled={isLoading}>
              {isLoading ? <Loader2 className="spin" size={18} /> : null}
              {isLoading ? "Running Inspection" : "Run Inspection"}
            </button>
            <button className="secondary-action" type="button" disabled={isLoading}>
              Stop Inspection
            </button>
            <button className="secondary-action" type="button" onClick={loadSample}>
              Load Sample
            </button>
            <button className="ghost-action" type="button" onClick={clearForm}>
              Clear
            </button>
          </div>
        </form>

        <section className="results-area">
          <div className="summary-grid">
            <SummaryCard
              label="Workflow"
              value={getWorkflowHeadline(result)}
              tone={result?.final_decision?.human_override_required ? "warning" : "neutral"}
            />
            <SummaryCard
              label="Final Decision"
              value={result?.final_decision?.final_decision || "Awaiting input"}
              tone={verdictTone}
            />
            <SummaryCard
              label="Severity"
              value={result?.severity_assessment?.severity || "-"}
              tone={verdictTone}
            />
            <SummaryCard
              label="Confidence"
              value={formatPercent(result?.confidence_score)}
              tone="neutral"
            />
            <SummaryCard
              label="Defects"
              value={String(findings.length)}
              tone={findings.length ? "danger" : "success"}
            />
          </div>

          <section className="content-panel">
            <div className="section-heading">
              <div>
                <p className="section-kicker">Workflow</p>
                <h3>Agent Workflow</h3>
              </div>
              <SourceBadge source={result?.source} />
            </div>
            <div className="workflow-grid">
              {workflowSteps.map((step) => (
                <WorkflowCard key={step.index} step={step} />
              ))}
            </div>
          </section>

          <div className="details-grid">
            <section className="content-panel">
              <div className="section-heading">
                <div>
                  <p className="section-kicker">Vision Inspector</p>
                  <h3>Vision Findings</h3>
                </div>
                {findings.length ? <StatusTag tone="success">Clear</StatusTag> : null}
              </div>

              {findings.length ? (
                <div className="finding-list">
                  {findings.map((defect) => (
                    <div className="finding-card" key={`${defect.defect_type}-${defect.location}`}>
                      <div>
                        <strong>{toTitle(defect.defect_type)}</strong>
                        <p>{toTitle(defect.location)}</p>
                      </div>
                      <span>{formatPercent(defect.confidence)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="body-copy muted-copy">No defects detected from the latest inspection result.</p>
              )}

              <p className="body-copy">
                {result?.inspection_summary?.reasoning || "Inspection reasoning will appear after the first run."}
              </p>
            </section>

            <section className="content-panel">
              <div className="section-heading">
                <div>
                  <p className="section-kicker">Severity Classifier</p>
                  <h3>Severity Assessment</h3>
                </div>
                <StatusTag tone={verdictTone}>{result?.severity_assessment?.verdict || "Pending"}</StatusTag>
              </div>

              <div className="definition-grid">
                <DefinitionRow label="Severity" value={result?.severity_assessment?.severity || "-"} />
                <DefinitionRow
                  label="Confidence"
                  value={formatPercent(result?.severity_assessment?.confidence)}
                />
                <DefinitionRow
                  label="Standard"
                  value={result?.severity_assessment?.standard_reference || "-"}
                  wide
                />
              </div>

              <p className="body-copy">
                {result?.final_decision?.justification ||
                  "Disposition rationale will appear once an inspection has completed."}
              </p>
            </section>

            <section className="content-panel">
              <div className="section-heading">
                <div>
                  <p className="section-kicker">Root Cause Analyst</p>
                  <h3>Root Cause and Actions</h3>
                </div>
              </div>

              <p className="body-copy">
                {result?.root_cause_analysis?.root_cause || "Root-cause analysis is not available yet."}
              </p>

              <div className="action-list">
                {actions.length ? (
                  actions.map((action) => (
                    <div className="action-card" key={`${action.action}-${action.owner}`}>
                      <div>
                        <strong>{action.owner}</strong>
                        <p>{action.action}</p>
                      </div>
                      <span>{action.timeline}</span>
                    </div>
                  ))
                ) : (
                  <p className="muted-copy">No corrective actions generated yet.</p>
                )}
              </div>
            </section>

            <section className="content-panel">
              <div className="section-heading">
                <div>
                  <p className="section-kicker">Decision and Action</p>
                  <h3>Disposition Controls</h3>
                </div>
              </div>

              <div className="metric-row">
                <DetailMetric label="Disposition" value={result?.final_decision?.final_decision || "-"} />
                <DetailMetric label="Line Action" value={result?.final_decision?.line_action || "-"} />
                <DetailMetric label="Batch Action" value={result?.final_decision?.batch_action || "-"} />
                <DetailMetric
                  label="Human Review"
                  value={result?.final_decision?.human_override_required ? "Required" : "Not Required"}
                />
              </div>

              {result?.fallback_reason ? (
                <p className="note-copy">Fallback reason: {result.fallback_reason}</p>
              ) : null}
            </section>
          </div>

          <section className="content-panel">
            <div className="section-heading">
              <div>
                <p className="section-kicker">Escalation</p>
                <h3>Escalation and Notifications</h3>
              </div>
            </div>

            <p className="headline-copy">
              {result?.notifications?.ncr_report ||
                "Escalation details will appear after the inspection agents complete."}
            </p>

            <div className="notification-chip-row">
              {notifications.length ? (
                notifications.map((entry) => (
                  <span className="notification-chip" key={entry}>
                    {entry}
                  </span>
                ))
              ) : (
                <span className="muted-copy">No notification targets recorded.</span>
              )}
            </div>

            <div className="definition-grid compact-gap">
              <DefinitionRow
                label="COPQ Estimate"
                value={result?.notifications?.copq_estimate || "Pending"}
              />
              <DefinitionRow label="Audit Log" value={result?.notifications?.audit_log || "Pending"} wide />
            </div>
          </section>

          <section className="content-panel">
            <div className="section-heading">
              <div>
                <p className="section-kicker">Enterprise</p>
                <h3>Enterprise Submissions</h3>
              </div>
              <Cloud size={18} />
            </div>

            {result?.image_url ? (
              <p className="body-copy">
                Canonical image reference: <span className="inline-code">{result.image_url}</span>
              </p>
            ) : null}

            <div className="integration-list">
              {integrations.length ? (
                integrations.map((integration) => (
                  <IntegrationCard key={integration.system_name} integration={integration} />
                ))
              ) : (
                <p className="muted-copy">No enterprise submission records available for this inspection.</p>
              )}
            </div>
          </section>
        </section>
      </section>
    </main>
  );
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read image file"));
    reader.readAsDataURL(file);
  });
}

function buildWorkflowSteps(result) {
  if (!result) {
    return workflowDefinitions.map((step) => ({
      ...step,
      status: "Waiting",
      tone: "idle",
    }));
  }

  return workflowDefinitions.map((step) => ({
    ...step,
    status: step.key === "integration" ? "Submitted" : "Completed",
    tone:
      step.key === "decision" && result.final_decision?.human_override_required
        ? "warning"
        : "done",
  }));
}

function getWorkflowHeadline(result) {
  if (!result) {
    return "Awaiting Request";
  }

  return result.final_decision?.human_override_required ? "Needs Human Review" : "Completed";
}

function getVerdictTone(verdict) {
  if (verdict === "REJECT") return "danger";
  if (verdict === "REWORK") return "warning";
  if (verdict === "PASS") return "success";
  return "neutral";
}

function formatPercent(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "-";
  }

  return `${Math.round(value * 100)}%`;
}

function toTitle(value) {
  if (!value) {
    return "-";
  }

  return String(value)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getIntegrationTone(status) {
  if (status === "SUCCESS") return "success";
  if (status === "FAILED") return "danger";
  return "warning";
}

function getIntegrationLabel(status) {
  if (!status) {
    return "Attention";
  }

  return status.replace(/_/g, " ");
}

function StatusChip({ icon: Icon, label }) {
  return (
    <span className="status-chip">
      <Icon size={16} />
      {label}
    </span>
  );
}

function EvidencePill({ icon: Icon, label }) {
  return (
    <span className="evidence-pill">
      <Icon size={15} />
      {label}
    </span>
  );
}

function Input({ label, full, ...props }) {
  return (
    <label className={`field ${full ? "field-full" : ""}`}>
      <span>{label}</span>
      <input {...props} />
    </label>
  );
}

function SummaryCard({ label, value, tone = "neutral" }) {
  return (
    <div className={`summary-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function WorkflowCard({ step }) {
  return (
    <div className={`workflow-card ${step.tone}`}>
      <span className="workflow-index">{step.index}</span>
      <strong>{step.title}</strong>
      <p>{step.status}</p>
    </div>
  );
}

function DefinitionRow({ label, value, wide = false }) {
  return (
    <div className={`definition-row ${wide ? "wide" : ""}`}>
      <span>{label}</span>
      <p>{value}</p>
    </div>
  );
}

function DetailMetric({ label, value }) {
  return (
    <div className="detail-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StatusTag({ tone = "neutral", children }) {
  return <span className={`status-tag ${tone}`}>{children}</span>;
}

function SourceBadge({ source, compact = false }) {
  if (!source) {
    return <span className={`source-badge neutral ${compact ? "compact" : ""}`}>Unknown</span>;
  }

  const label =
    source === "aws-bedrock"
      ? "AWS Bedrock"
      : source === "hybrid-fallback"
        ? "Hybrid Fallback"
        : "Local Fallback";

  const tone =
    source === "aws-bedrock"
      ? "bedrock"
      : source === "hybrid-fallback"
        ? "warning"
        : "fallback";

  return <span className={`source-badge ${tone} ${compact ? "compact" : ""}`}>{label}</span>;
}

function IntegrationCard({ integration }) {
  return (
    <div className="integration-card">
      <div>
        <strong>{integration.system_name}</strong>
        <p>{integration.external_reference || "No external reference returned"}</p>
      </div>
      <div className="integration-status">
        <StatusTag tone={getIntegrationTone(integration.submission_status)}>
          {getIntegrationLabel(integration.submission_status)}
        </StatusTag>
        <span>{integration.error_detail || "Submission record stored successfully."}</span>
      </div>
    </div>
  );
}
