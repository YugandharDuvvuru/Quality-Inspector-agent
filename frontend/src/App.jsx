import React from "react";
import {
  Activity,
  AlertTriangle,
  ClipboardCheck,
  Database,
  Factory,
  FileJson,
  Gauge,
  History,
  Loader2,
  Sparkles,
  Send,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { fetchHealthStatus, fetchInspections, submitInspection } from "./api.js";

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

export function App() {
  const [form, setForm] = useState(() => ({
    component_id: samplePayload.component_id,
    image_url: samplePayload.image_url,
    inspection_station: samplePayload.inspection_station,
    line_id: samplePayload.line_id,
    ...samplePayload.metadata,
  }));
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [fileInputKey, setFileInputKey] = useState(0);
  const [runtime, setRuntime] = useState({
    backend: "Checking",
    bedrock: "Unknown",
    database: "Unknown",
  });

  useEffect(() => {
    loadDashboardData();
  }, []);

  const verdictTone = useMemo(() => {
    const verdict = result?.final_decision?.final_decision;

    if (verdict === "REJECT") return "danger";
    if (verdict === "REWORK") return "warning";
    if (verdict === "PASS") return "success";
    return "neutral";
  }, [result]);

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

  async function loadDashboardData() {
    try {
      const [inspections, health] = await Promise.all([
        fetchInspections().catch(() => []),
        fetchHealthStatus().catch(() => null),
      ]);

      setHistory(inspections);

      if (health) {
        setRuntime({
          backend: health.status === "ok" ? "Connected" : "Issue",
          bedrock: health.bedrockEnabled ? "Enabled" : "Disabled",
          database: health.database?.ready ? "Connected" : "Unavailable",
        });
      } else {
        setRuntime({
          backend: "Unavailable",
          bedrock: "Unknown",
          database: "Unknown",
        });
      }
    } catch {
      setHistory([]);
      setRuntime({
        backend: "Unavailable",
        bedrock: "Unknown",
        database: "Unknown",
      });
    }
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
      const updatedHistory = await fetchInspections();
      setHistory(updatedHistory);
      const health = await fetchHealthStatus().catch(() => null);

      if (health) {
        setRuntime({
          backend: health.status === "ok" ? "Connected" : "Issue",
          bedrock: health.bedrockEnabled ? "Enabled" : "Disabled",
          database: health.database?.ready ? "Connected" : "Unavailable",
        });
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="top-bar">
        <div>
          <p className="eyebrow">Agentic Manufacturing Quality</p>
          <h1>Component Quality Inspector</h1>
        </div>
        <div className="status-strip">
          <StatusPill icon={Factory} label="5 Agents" />
          <StatusPill icon={ShieldCheck} label="IATF 16949" />
          <StatusPill icon={ClipboardCheck} label="ISO 9001" />
        </div>
      </section>

      <section className="runtime-strip">
        <StatusPill icon={Activity} label={`Backend ${runtime.backend}`} />
        <StatusPill icon={Sparkles} label={`Bedrock ${runtime.bedrock}`} />
        <StatusPill icon={Database} label={`Database ${runtime.database}`} />
      </section>

      <section className="workspace-grid">
        <form className="panel form-panel" onSubmit={handleSubmit}>
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Inspection Input</p>
              <h2>Component details</h2>
            </div>
            <button className="icon-button" type="submit" disabled={isLoading} title="Run inspection">
              {isLoading ? <Loader2 className="spin" size={19} /> : <Send size={19} />}
            </button>
          </div>

          <div className="field-grid">
            <Input label="Component ID" name="component_id" value={form.component_id} onChange={updateField} required />
            <Input label="Inspection Station" name="inspection_station" value={form.inspection_station} onChange={updateField} required />
            <Input label="Line ID" name="line_id" value={form.line_id} onChange={updateField} required />
            <label className="field field-full upload-field">
              <span>Upload Component Image</span>
              <input key={fileInputKey} type="file" accept="image/*" onChange={handleImageUpload} />
              {form.image_file_name ? <small>{form.image_file_name}</small> : null}
            </label>
            <Input label="Image URL" name="image_url" value={form.image_url} onChange={updateField} full />
            <Input label="Material" name="material" value={form.material} onChange={updateField} />
            <Input label="Supplier" name="supplier" value={form.supplier} onChange={updateField} />
            <Input label="Batch Number" name="batch_number" value={form.batch_number} onChange={updateField} />
            <Input label="Dimensions" name="dimensions" value={form.dimensions} onChange={updateField} />
            <Input label="Tolerance Range" name="tolerance_range" value={form.tolerance_range} onChange={updateField} />
            <label className="field field-full">
              <span>Inspection Notes</span>
              <textarea name="notes" rows="4" value={form.notes} onChange={updateField} />
            </label>
          </div>

          {error ? <p className="error-message">{error}</p> : null}

          <div className="button-row">
            <button className="primary-button" type="submit" disabled={isLoading}>
              {isLoading ? "Inspecting..." : "Run Inspection"}
            </button>
            <button className="secondary-button" type="button" onClick={loadSample}>
              Load Sample
            </button>
            <button className="secondary-button" type="button" onClick={clearForm}>
              Clear
            </button>
          </div>
        </form>

        <section className="result-stack">
          <div className={`panel decision-panel ${verdictTone}`}>
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Final Decision</p>
                <h2>{result?.final_decision?.final_decision || "Awaiting inspection"}</h2>
              </div>
              <div className="decision-badges">
                <SourceBadge source={result?.source} />
                <Gauge size={24} />
              </div>
            </div>

            <div className="metric-grid">
              <Metric label="Severity" value={result?.severity_assessment?.severity || "-"} />
              <Metric label="Line Action" value={result?.final_decision?.line_action || "-"} />
              <Metric label="Batch Action" value={result?.final_decision?.batch_action || "-"} />
              <Metric label="Confidence" value={result ? `${Math.round(result.confidence_score * 100)}%` : "-"} />
            </div>

            <p className="decision-text">
              {result?.final_decision?.justification ||
                "Submit an inspection request to run the agentic quality workflow."}
            </p>
            {result?.fallback_reason ? (
              <p className="fallback-note">Fallback reason: {result.fallback_reason}</p>
            ) : null}
          </div>

          <div className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Agent Outputs</p>
                <h2>Inspection summary</h2>
              </div>
              <FileJson size={22} />
            </div>
            {result ? <ResultView result={result} /> : <EmptyState />}
          </div>
        </section>
      </section>

      <section className="panel history-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Postgres History</p>
            <h2>Inspection history</h2>
          </div>
          <History size={22} />
        </div>
        <div className="history-list">
          {history.length ? (
            history.map((item) => (
              <button
                className="history-item"
                key={`${item.component_id}-${item.created_at}`}
                onClick={() => setResult(item)}
              >
                <div className="history-item-top">
                  <span>{item.component_id}</span>
                  <SourceBadge source={item.source} compact />
                </div>
                <strong>{item.final_decision?.final_decision || "PENDING"}</strong>
                <span>{item.severity_assessment?.severity || "No severity"}</span>
                <small>{item.created_at ? new Date(item.created_at).toLocaleString() : ""}</small>
              </button>
            ))
          ) : (
            <p className="muted">No persisted inspections recorded yet.</p>
          )}
        </div>
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

function StatusPill({ icon: Icon, label }) {
  return (
    <span className="status-pill">
      <Icon size={16} />
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

function Metric({ label, value }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SourceBadge({ source, compact = false }) {
  if (!source) {
    return <span className={`source-badge neutral ${compact ? "compact" : ""}`}>Unknown</span>;
  }

  const isBedrock = source === "aws-bedrock";
  const label = isBedrock ? "AWS Bedrock" : "Local Fallback";

  return (
    <span className={`source-badge ${isBedrock ? "bedrock" : "fallback"} ${compact ? "compact" : ""}`}>
      {label}
    </span>
  );
}

function EmptyState() {
  return (
    <div className="empty-state">
      <AlertTriangle size={22} />
      <p>The five-agent loop will appear here after the first inspection.</p>
    </div>
  );
}

function ResultView({ result }) {
  const defects = result.inspection_summary?.defects_detected || [];
  const actions = result.root_cause_analysis?.recommended_actions || [];

  return (
    <div className="result-view">
      <section>
        <h3>Vision Inspector Agent</h3>
        {defects.length ? (
          defects.map((defect) => (
            <div className="result-card" key={`${defect.defect_type}-${defect.location}`}>
              <strong>{defect.defect_type}</strong>
              <span>{defect.location}</span>
              <small>{Math.round(defect.confidence * 100)}% confidence</small>
            </div>
          ))
        ) : (
          <p className="muted">No defects detected.</p>
        )}
        <p className="agent-summary">{result.inspection_summary?.reasoning}</p>
      </section>

      <section>
        <h3>Severity Classifier Agent</h3>
        <div className="agent-grid">
          <Metric label="Severity" value={result.severity_assessment?.severity || "-"} />
          <Metric label="Verdict" value={result.severity_assessment?.verdict || "-"} />
          <Metric
            label="Confidence"
            value={
              result.severity_assessment?.confidence
                ? `${Math.round(result.severity_assessment.confidence * 100)}%`
                : "-"
            }
          />
        </div>
        <p className="agent-summary">{result.severity_assessment?.standard_reference}</p>
      </section>

      <section>
        <h3>Root Cause Analyst Agent</h3>
        <p>{result.root_cause_analysis?.root_cause}</p>
        <div className="action-list">
          {actions.map((action) => (
            <div className="action-item" key={`${action.action}-${action.owner}`}>
              <strong>{action.owner}</strong>
              <span>{action.action}</span>
              <small>{action.timeline}</small>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3>Decision & Action Agent</h3>
        <div className="agent-grid">
          <Metric label="Disposition" value={result.final_decision?.final_decision || "-"} />
          <Metric label="Line Action" value={result.final_decision?.line_action || "-"} />
          <Metric label="Batch Action" value={result.final_decision?.batch_action || "-"} />
          <Metric
            label="Human Override"
            value={result.final_decision?.human_override_required ? "Required" : "Not Required"}
          />
        </div>
        <p className="agent-summary">{result.final_decision?.justification}</p>
      </section>

      <section>
        <h3>Escalation & Notify Agent</h3>
        <p>{result.notifications?.ncr_report}</p>
        <div className="tag-row">
          {(result.notifications?.notifications_sent || []).map((notification) => (
            <span className="tag" key={notification}>
              {notification}
            </span>
          ))}
        </div>
        <p className="agent-summary">{result.notifications?.copq_estimate}</p>
      </section>

      <details>
        <summary>Consolidated JSON</summary>
        <pre>{JSON.stringify(result, null, 2)}</pre>
      </details>
    </div>
  );
}
