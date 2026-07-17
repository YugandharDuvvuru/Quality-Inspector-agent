import React from "react";
import {
  FileDown,
  Image as ImageIcon,
  Link2,
  Loader2,
  LogOut,
  RefreshCw,
  UserRound,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  deleteInspections,
  downloadInspectionReport,
  fetchCurrentUser,
  fetchInspectionByTrace,
  fetchInspections,
  loginAccount,
  logoutAccount,
  registerAccount,
  submitInspectionWithProgress,
} from "./api.js";

const HUMAN_REVIEW_THRESHOLD = 0.75;
const DASHBOARD_REDIRECT_DELAY_SECONDS = 10;

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

const samplePlaceholders = {
  component_id: "COMP-100047",
  image_url: "s3://bucket-next-sample/QualityInspector/sample-part.png",
  inspection_station: "VISION-STATION-07",
  line_id: "LINE-A",
  material: "cast aluminum",
  supplier: "Supplier-A",
  batch_number: "BATCH-2026-06-30-A",
  dimensions: "120mm x 80mm x 35mm",
  tolerance_range: "+/-0.05mm",
  notes: "Component captured at final inspection station.",
};

const workflowDefinitions = [
  { key: "vision", index: "01", title: "Vision Inspector" },
  { key: "severity", index: "02", title: "Severity Classifier" },
  { key: "rootCause", index: "03", title: "Root Cause Analyst" },
  { key: "decision", index: "04", title: "Decision and Action" },
  { key: "notify", index: "05", title: "Escalation and Notify" },
];

export function App() {
  const [session, setSession] = useState(null);
  const [isSessionChecking, setIsSessionChecking] = useState(true);
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({
    name: "",
    mobile: "",
    email: "",
    password: "",
    role: "VIEWER",
  });
  const [authError, setAuthError] = useState("");
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [view, setView] = useState("dashboard");
  const [form, setForm] = useState(blankForm);
  const [inspections, setInspections] = useState([]);
  const [selectedInspection, setSelectedInspection] = useState(null);
  const [currentResult, setCurrentResult] = useState(null);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [isInspectionRunning, setIsInspectionRunning] = useState(false);
  const [isReportDownloading, setIsReportDownloading] = useState(false);
  const [isDeletingInspections, setIsDeletingInspections] = useState(false);
  const [selectedTraceIds, setSelectedTraceIds] = useState([]);
  const [workflowStageStatuses, setWorkflowStageStatuses] = useState(() =>
    createWorkflowStageStatuses()
  );
  const [dashboardRedirectCountdown, setDashboardRedirectCountdown] = useState(null);
  const [error, setError] = useState("");
  const [fileInputKey] = useState(0);
  const activeInspectionController = useRef(null);

  useEffect(() => {
    let ignore = false;

    async function initializeSession() {
      try {
        const data = await fetchCurrentUser();

        if (ignore) {
          return;
        }

        const nextSession = { user: data.user };
        setSession(nextSession);
        await loadInspectionHistory({ silent: true });
      } catch {
        if (!ignore) {
          setSession(null);
        }
      } finally {
        if (!ignore) {
          setIsSessionChecking(false);
        }
      }
    }

    initializeSession();

    return () => {
      ignore = true;
    };
  }, []);

  const workflowSteps = useMemo(
    () =>
      buildWorkflowSteps({
        stageStatuses: workflowStageStatuses,
        result: currentResult,
      }),
    [workflowStageStatuses, currentResult]
  );
  const isAdmin = session?.user?.role === "ADMIN";

  useEffect(() => {
    if (
      view !== "new" ||
      !currentResult ||
      isInspectionRunning ||
      dashboardRedirectCountdown === null
    ) {
      return undefined;
    }

    if (dashboardRedirectCountdown <= 0) {
      goToDashboard();
      return undefined;
    }

    const redirectTimer = window.setTimeout(() => {
      setDashboardRedirectCountdown((currentCountdown) =>
        currentCountdown === null ? null : currentCountdown - 1
      );
    }, 1000);

    return () => window.clearTimeout(redirectTimer);
  }, [view, currentResult, isInspectionRunning, dashboardRedirectCountdown]);

  useEffect(() => {
    const availableTraceIds = new Set(
      inspections.map((inspection) => inspection.trace_id).filter(Boolean)
    );

    setSelectedTraceIds((current) =>
      current.filter((traceId) => availableTraceIds.has(traceId))
    );
  }, [inspections]);

  async function loadInspectionHistory(options = {}) {
    if (!session && !isSessionChecking && !options.silent) {
      return;
    }

    if (!options.silent) {
      setIsHistoryLoading(true);
    }

    setError("");

    try {
      const data = await fetchInspections();
      setInspections(data);
    } catch (requestError) {
      handleRequestError(requestError);
    } finally {
      setIsHistoryLoading(false);
    }
  }

  function handleRequestError(requestError) {
    if (requestError.message === "Authentication required") {
      setSession(null);
      return;
    }

    setError(requestError.message);
  }

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  function updateAuthField(event) {
    const { name, value } = event.target;
    setAuthForm((current) => ({ ...current, [name]: value }));
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();
    setIsAuthLoading(true);
    setAuthError("");

    try {
      const authPayload =
        authMode === "register"
          ? {
              name: authForm.name,
              mobile: authForm.mobile,
              email: authForm.email,
              password: authForm.password,
              role: authForm.role,
            }
          : {
              email: authForm.email,
              password: authForm.password,
            };
      const nextSession =
        authMode === "register"
          ? await registerAccount(authPayload)
          : await loginAccount(authPayload);

      setSession(nextSession);
      setAuthForm({ name: "", mobile: "", email: "", password: "", role: "VIEWER" });
      setView("dashboard");
      await loadInspectionHistory({ silent: true });
    } catch (requestError) {
      setAuthError(requestError.message);
    } finally {
      setIsAuthLoading(false);
    }
  }

  async function handleLogout() {
    setSession(null);
    setInspections([]);
    setSelectedTraceIds([]);
    setSelectedInspection(null);
    setCurrentResult(null);
    setWorkflowStageStatuses(createWorkflowStageStatuses("waiting"));
    setDashboardRedirectCountdown(null);

    try {
      await logoutAccount();
    } catch {
      // Local logout still completes when the server session has already expired.
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
    setIsInspectionRunning(true);
    setWorkflowStageStatuses(createWorkflowStageStatuses("waiting"));
    setDashboardRedirectCountdown(null);
    setCurrentResult(null);
    setError("");

    if (!form.image_base64 && !form.image_url.trim()) {
      setError("Please upload an image or provide an image URL.");
      setIsInspectionRunning(false);
      setWorkflowStageStatuses(createWorkflowStageStatuses("waiting"));
      return;
    }

    let didCompleteInspection = false;

    try {
      const controller = new AbortController();
      activeInspectionController.current = controller;
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
      const inspection = await submitInspectionWithProgress(payload, {
        signal: controller.signal,
        onProgress: handleWorkflowProgress,
      });

      didCompleteInspection = true;
      setCurrentResult(inspection);
      setSelectedInspection(inspection);
      setWorkflowStageStatuses(createWorkflowStageStatuses("completed"));
      setDashboardRedirectCountdown(DASHBOARD_REDIRECT_DELAY_SECONDS);
      await loadInspectionHistory({ silent: true });
    } catch (requestError) {
      if (requestError.name === "AbortError") {
        setError("Inspection request stopped in the browser. The backend may still finish the submitted run.");
        return;
      }

      handleRequestError(requestError);
    } finally {
      activeInspectionController.current = null;
      setIsInspectionRunning(false);
      if (!didCompleteInspection) {
        setWorkflowStageStatuses(createWorkflowStageStatuses("waiting"));
        setDashboardRedirectCountdown(null);
      }
    }
  }

  function handleWorkflowProgress(event) {
    if (event.type === "workflow_started") {
      setWorkflowStageStatuses(createWorkflowStageStatuses("waiting"));
      return;
    }

    if (event.type !== "stage_status") {
      return;
    }

    setWorkflowStageStatuses((currentStatuses) =>
      applyWorkflowStageEvent(currentStatuses, event)
    );
  }

  function handleStopInspection() {
    if (activeInspectionController.current) {
      activeInspectionController.current.abort();
      return;
    }

    setCurrentResult(null);
    setSelectedInspection(null);
    setWorkflowStageStatuses(createWorkflowStageStatuses("waiting"));
    setDashboardRedirectCountdown(null);
    setError("");
  }

  async function handleOpenInspection(inspection) {
    setError("");

    try {
      const detail = inspection.trace_id
        ? await fetchInspectionByTrace(inspection.trace_id)
        : inspection;

      setDashboardRedirectCountdown(null);
      setSelectedInspection(detail);
      setCurrentResult(detail);
      setView("detail");
    } catch (requestError) {
      handleRequestError(requestError);
    }
  }

  async function handleDownloadReport(inspection = selectedInspection || currentResult) {
    if (!inspection?.trace_id) {
      setError("Report download requires a persisted inspection trace ID.");
      return;
    }

    setIsReportDownloading(true);
    setError("");
    const reportWindow = window.open("about:blank", "_blank");

    try {
      const report = await downloadInspectionReport(inspection.trace_id);
      const reportUrl = URL.createObjectURL(report.blob);

      if (reportWindow) {
        reportWindow.document.title = report.filename;
        reportWindow.location.href = reportUrl;
      } else {
        const link = document.createElement("a");

        link.href = reportUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        document.body.appendChild(link);
        link.click();
        link.remove();
      }

      window.setTimeout(() => URL.revokeObjectURL(reportUrl), 60000);
    } catch (requestError) {
      reportWindow?.close();
      handleRequestError(requestError);
    } finally {
      setIsReportDownloading(false);
    }
  }

  function toggleInspectionSelection(traceId) {
    if (!traceId) {
      return;
    }

    setSelectedTraceIds((current) =>
      current.includes(traceId)
        ? current.filter((selectedTraceId) => selectedTraceId !== traceId)
        : [...current, traceId]
    );
  }

  function toggleAllInspectionSelection() {
    const traceIds = inspections.map((inspection) => inspection.trace_id).filter(Boolean);
    const allSelected =
      traceIds.length > 0 && traceIds.every((traceId) => selectedTraceIds.includes(traceId));

    setSelectedTraceIds(allSelected ? [] : traceIds);
  }

  async function handleDeleteSelectedInspections() {
    if (!isAdmin || selectedTraceIds.length === 0) {
      return;
    }

    const confirmed = window.confirm(
      `Delete ${selectedTraceIds.length} selected inspection record${selectedTraceIds.length === 1 ? "" : "s"}?`
    );

    if (!confirmed) {
      return;
    }

    const traceIdsToDelete = [...selectedTraceIds];
    setIsDeletingInspections(true);
    setError("");

    try {
      await deleteInspections(traceIdsToDelete);
      setSelectedTraceIds([]);

      if (selectedInspection?.trace_id && traceIdsToDelete.includes(selectedInspection.trace_id)) {
        setSelectedInspection(null);
        setCurrentResult(null);
      }

      await loadInspectionHistory({ silent: true });
    } catch (requestError) {
      handleRequestError(requestError);
    } finally {
      setIsDeletingInspections(false);
    }
  }

  function startNewInspection() {
    setView("new");
    setCurrentResult(null);
    setSelectedInspection(null);
    setWorkflowStageStatuses(createWorkflowStageStatuses("waiting"));
    setDashboardRedirectCountdown(null);
    setError("");
  }

  function goToDashboard() {
    setView("dashboard");
    setSelectedInspection(null);
    setWorkflowStageStatuses(createWorkflowStageStatuses("waiting"));
    setDashboardRedirectCountdown(null);
    loadInspectionHistory({ silent: true });
  }

  if (isSessionChecking) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <Loader2 className="spin" size={22} />
          <strong>Checking secure session</strong>
        </section>
      </main>
    );
  }

  if (!session?.user) {
    return (
      <AuthScreen
        mode={authMode}
        form={authForm}
        error={authError}
        isLoading={isAuthLoading}
        onModeChange={setAuthMode}
        onFieldChange={updateAuthField}
        onSubmit={handleAuthSubmit}
      />
    );
  }

  return (
    <main className="app-shell">
      <TopBar
        view={view}
        user={session.user}
        onDashboard={goToDashboard}
        onNewInspection={startNewInspection}
        onLogout={handleLogout}
      />

      {error ? <p className="global-error">{error}</p> : null}

      {view === "dashboard" ? (
        <DashboardView
          inspections={inspections}
          isLoading={isHistoryLoading}
          isAdmin={isAdmin}
          isDeleting={isDeletingInspections}
          selectedTraceIds={selectedTraceIds}
          onRefresh={() => loadInspectionHistory()}
          onOpen={handleOpenInspection}
          onToggleTrace={toggleInspectionSelection}
          onToggleAll={toggleAllInspectionSelection}
          onDeleteSelected={handleDeleteSelectedInspections}
        />
      ) : null}

      {view === "new" ? (
        <NewInspectionView
          form={form}
          fileInputKey={fileInputKey}
          workflowSteps={workflowSteps}
          result={currentResult}
          isRunning={isInspectionRunning}
          isReportDownloading={isReportDownloading}
          dashboardRedirectCountdown={dashboardRedirectCountdown}
          onFieldChange={updateField}
          onImageUpload={handleImageUpload}
          onSubmit={handleSubmit}
          onStop={handleStopInspection}
          onDownloadReport={() => handleDownloadReport(currentResult)}
        />
      ) : null}

      {view === "detail" ? (
        <DetailView
          inspection={selectedInspection}
          isReportDownloading={isReportDownloading}
          onDownloadReport={() => handleDownloadReport(selectedInspection)}
        />
      ) : null}
    </main>
  );
}

function TopBar({ view, user, onDashboard, onNewInspection, onLogout }) {
  const isDetailView = view === "detail";
  const displayName = user?.name || user?.email || "Signed in";
  const roleLabel = user?.role === "ADMIN" ? "Admin" : "Viewer";

  return (
    <header className={`top-bar ${isDetailView ? "detail-mode" : ""}`}>
      <div>
        <p className="eyebrow">{isDetailView ? "Inspection Result" : "Quality Operations"}</p>
        <h1>Manufacturing Component Quality Inspector</h1>
        <p>
          {isDetailView
            ? "Review the complete output, escalation, enterprise dispatch, and audit trail for one inspection."
            : "Dashboard of inspection severity, workflow status, decisions, and result traceability."}
        </p>
      </div>
      <div className="top-right">
        <span className="user-chip">
          <UserRound size={18} />
          <strong>{displayName}</strong>
          <span>{roleLabel}</span>
        </span>
        <nav className="top-actions" aria-label="Primary navigation">
          <button className={view === "dashboard" ? "active" : ""} type="button" onClick={onDashboard}>
            Dashboard
          </button>
          {!isDetailView ? (
            <button className={view === "new" ? "active" : ""} type="button" onClick={onNewInspection}>
              New Inspection
            </button>
          ) : null}
        </nav>
        <button className="logout-action" type="button" onClick={onLogout} title="Logout">
          <LogOut size={16} />
        </button>
      </div>
    </header>
  );
}

function DashboardView({
  inspections,
  isLoading,
  isAdmin,
  isDeleting,
  selectedTraceIds,
  onRefresh,
  onOpen,
  onToggleTrace,
  onToggleAll,
  onDeleteSelected,
}) {
  const selectableTraceIds = inspections.map((inspection) => inspection.trace_id).filter(Boolean);
  const allSelected =
    selectableTraceIds.length > 0 &&
    selectableTraceIds.every((traceId) => selectedTraceIds.includes(traceId));

  return (
    <>
      <div className="top-page-note">
        <VerdictSeverityNote />
      </div>

      <section className="page-panel history-panel">
        <div className="panel-toolbar">
          <div>
            <p className="eyebrow">Inspection History</p>
            <h2>Previous Inspections</h2>
          </div>
          <div className="history-actions">
            {isAdmin ? (
              <>
                <label className="select-all-control">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={onToggleAll}
                    disabled={!selectableTraceIds.length || isDeleting}
                  />
                  <span>Select all</span>
                </label>
                <button
                  className="delete-selected-button"
                  type="button"
                  onClick={onDeleteSelected}
                  disabled={!selectedTraceIds.length || isDeleting}
                >
                  {isDeleting ? "Deleting" : "Delete Selected"}
                </button>
              </>
            ) : null}
            <button className="icon-text-button" type="button" onClick={onRefresh} disabled={isLoading}>
              <RefreshCw className={isLoading ? "spin" : ""} size={16} />
              Refresh
            </button>
          </div>
        </div>

        <div className="history-table" role="table" aria-label="Inspection history">
          <div className={`history-row history-head ${isAdmin ? "history-row-admin" : ""}`} role="row">
            <span>TraceID</span>
            <span>Component</span>
            <span>Status</span>
            <span>Verdict</span>
            <span>Severity</span>
            <span>Result</span>
            {isAdmin ? <span>Delete</span> : null}
          </div>

          {inspections.length ? (
            inspections.map((inspection) => (
              <div
                className={`history-row ${isAdmin ? "history-row-admin" : ""}`}
                role="row"
                key={inspection.trace_id || inspection.created_at}
              >
                <strong>{inspection.trace_id || "Trace unavailable"}</strong>
                <strong>{inspection.component_id || "-"}</strong>
                <StatusPill value={getInspectionStatus(inspection)} />
                <StatusPill value={inspection.final_decision?.final_decision || "-"} />
                <StatusPill value={inspection.severity_assessment?.severity || "-"} />
                <button className="open-link" type="button" onClick={() => onOpen(inspection)}>
                  Open
                </button>
                {isAdmin ? (
                  <label className="row-checkbox" aria-label={`Select inspection ${inspection.trace_id}`}>
                    <input
                      type="checkbox"
                      checked={selectedTraceIds.includes(inspection.trace_id)}
                      onChange={() => onToggleTrace(inspection.trace_id)}
                      disabled={!inspection.trace_id || isDeleting}
                    />
                  </label>
                ) : null}
              </div>
            ))
          ) : (
            <div className="empty-history">
              {isLoading ? "Loading inspection history..." : "No inspections are available yet."}
            </div>
          )}
        </div>
      </section>
    </>
  );
}

function NewInspectionView({
  form,
  fileInputKey,
  workflowSteps,
  result,
  isRunning,
  isReportDownloading,
  dashboardRedirectCountdown,
  onFieldChange,
  onImageUpload,
  onSubmit,
  onStop,
  onDownloadReport,
}) {
  return (
    <>
      <section className="page-panel status-panel">
        <p className="eyebrow">New Inspection</p>
        <h2>Inspection Status</h2>
        <p>
          {result
            ? `Inspection completed for ${result.component_id}. Final result: ${result.final_decision?.final_decision || "-"}`
            : isRunning
              ? "Inspection request is running through the agent workflow."
              : "Agent status appears here while the inspection request runs."}
        </p>
        {result ? (
          <div className="status-summary">
            <StatusPill value={getInspectionStatus(result)} />
            <StatusPill value={result.final_decision?.final_decision || "-"} />
            <StatusPill value={result.severity_assessment?.severity || "-"} />
            <span>{formatPercent(result.confidence_score)} confidence</span>
            {dashboardRedirectCountdown !== null ? (
              <span>
                Dashboard opens in {dashboardRedirectCountdown}{" "}
                {dashboardRedirectCountdown === 1 ? "second" : "seconds"}
              </span>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="page-panel workflow-panel">
        <h2>Agent Workflow</h2>
        <div className="agent-grid">
          {workflowSteps.map((step) => (
            <article className={`agent-card ${step.statusTone}`} key={step.index}>
              <span>{step.index}</span>
              <strong>{step.title}</strong>
              <p>{step.status}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="inspection-form-wrap">
        <form className="inspection-form" onSubmit={onSubmit}>
          <h2>New Inspection Request</h2>
          <Input
            label="Component ID"
            name="component_id"
            value={form.component_id}
            onChange={onFieldChange}
            placeholder={samplePlaceholders.component_id}
            required
          />
          <Input
            label="Inspection Station"
            name="inspection_station"
            value={form.inspection_station}
            onChange={onFieldChange}
            placeholder={samplePlaceholders.inspection_station}
            required
          />
          <Input
            label="Line"
            name="line_id"
            value={form.line_id}
            onChange={onFieldChange}
            placeholder={samplePlaceholders.line_id}
            required
          />
          <Input label="Timestamp(yyyy-MM-ddTHH:mm:ss)" value={new Date().toISOString()} readOnly />
          <label className="field">
            <span>Image Path, URL, or S3 URI</span>
            <textarea
              name="image_url"
              rows="4"
              value={form.image_url}
              onChange={onFieldChange}
              placeholder={samplePlaceholders.image_url}
            />
          </label>
          <label className="field">
            <span>Local Image File</span>
            <input key={fileInputKey} type="file" accept="image/*" onChange={onImageUpload} />
            <small>{form.image_file_name || "No file chosen"}</small>
          </label>
          <Input
            label="Material"
            name="material"
            value={form.material}
            onChange={onFieldChange}
            placeholder={samplePlaceholders.material}
          />
          <Input
            label="Supplier"
            name="supplier"
            value={form.supplier}
            onChange={onFieldChange}
            placeholder={samplePlaceholders.supplier}
          />
          <Input
            label="Batch"
            name="batch_number"
            value={form.batch_number}
            onChange={onFieldChange}
            placeholder={samplePlaceholders.batch_number}
          />
          <Input
            label="Dimensions"
            name="dimensions"
            value={form.dimensions}
            onChange={onFieldChange}
            placeholder={samplePlaceholders.dimensions}
          />
          <Input
            label="Tolerance"
            name="tolerance_range"
            value={form.tolerance_range}
            onChange={onFieldChange}
            placeholder={samplePlaceholders.tolerance_range}
          />
          <label className="field">
            <span>Inspection Notes</span>
            <textarea
              name="notes"
              rows="4"
              value={form.notes}
              onChange={onFieldChange}
              placeholder={samplePlaceholders.notes}
            />
          </label>

          <div className="evidence-row">
            <EvidencePill icon={Link2} label={form.image_url ? "Source URL or S3 URI ready" : "No URL provided"} />
            <EvidencePill icon={ImageIcon} label={form.image_file_name || "No local file selected"} />
          </div>

          <button className="primary-action" type="submit" disabled={isRunning}>
            {isRunning ? <Loader2 className="spin" size={16} /> : null}
            {isRunning ? "Running Inspection" : "Run Inspection"}
          </button>
          <button className="danger-action" type="button" onClick={onStop}>
            Stop Inspection
          </button>
          <div className="form-secondary-actions">
            {result?.trace_id ? (
              <button className="secondary-action" type="button" onClick={onDownloadReport} disabled={isReportDownloading}>
                {isReportDownloading ? "Preparing PDF" : "Download NCR PDF"}
              </button>
            ) : null}
          </div>
        </form>
      </section>
    </>
  );
}

function DetailView({ inspection, isReportDownloading, onDownloadReport }) {
  if (!inspection) {
    return (
      <section className="page-panel">
        <p>No inspection selected.</p>
      </section>
    );
  }

  const findings = inspection.inspection_summary?.defects_detected || [];
  const actions = inspection.root_cause_analysis?.recommended_actions || [];
  const integrations = inspection.enterprise_integrations || [];
  const notifications = inspection.notifications?.notifications_sent || [];
  const notificationItems = notifications.map(normalizeNotificationForDisplay).filter(Boolean);

  return (
    <section className="result-page">
      <VerdictSeverityNote />

      <div className="result-grid">
        <section className="result-card">
          <div className="card-heading">
            <h2>Inspection</h2>
            <StatusPill value={getInspectionStatus(inspection)} />
          </div>
          <Definition label="Component" value={inspection.component_id || "-"} />
          <Definition label="Trace" value={shortTrace(inspection.trace_id)} />
          <Definition label="Confidence" value={formatPercent(inspection.confidence_score)} />
          <Definition label="Source" value={sourceLabel(inspection.source)} />
        </section>

        <section className="result-card">
          <div className="card-heading">
            <h2>Severity</h2>
            <StatusPill value={inspection.severity_assessment?.severity || "-"} />
          </div>
          <Definition label="Verdict" value={inspection.final_decision?.final_decision || "-"} />
          <Definition label="Line" value={inspection.final_decision?.line_action || "-"} />
          <Definition label="Batch" value={inspection.final_decision?.batch_action || "-"} />
          <p className="detail-copy">
            {inspection.final_decision?.justification ||
              inspection.severity_assessment?.reasoning ||
              "Severity reasoning is not available."}
          </p>
        </section>

        <section className="result-card">
          <h2>Vision Inspector</h2>
          <div className="stack-list">
            {findings.length ? (
              findings.map((defect) => (
                <div className="mini-row" key={`${defect.defect_type}-${defect.location}`}>
                  <div>
                    <strong>{toTitle(defect.defect_type)}</strong>
                    <span>{toTitle(defect.location)}</span>
                  </div>
                  <strong>{formatPercent(defect.confidence)}</strong>
                </div>
              ))
            ) : (
              <p className="muted">No defects detected.</p>
            )}
          </div>
          <p className="detail-copy">{inspection.inspection_summary?.reasoning || "-"}</p>
        </section>

        <section className="result-card">
          <h2>Root Cause Analyst</h2>
          <p className="detail-copy">{inspection.root_cause_analysis?.root_cause || "-"}</p>
          <Definition label="Recurrence Risk" value={inspection.root_cause_analysis?.recurrence_risk || "-"} />
          <div className="stack-list">
            {actions.length ? (
              actions.map((action) => (
                <div className="mini-row" key={`${action.owner}-${action.timeline}`}>
                  <div>
                    <strong>{action.owner}</strong>
                    <span>{action.action}</span>
                  </div>
                  <strong>{action.timeline}</strong>
                </div>
              ))
            ) : (
              <p className="muted">No corrective actions generated.</p>
            )}
          </div>
        </section>

        <section className="result-card">
          <h2>Decision and Action</h2>
          <Definition label="Disposition" value={inspection.final_decision?.final_decision || "-"} />
          <Definition label="Line Action" value={inspection.final_decision?.line_action || "-"} />
          <Definition label="Batch Action" value={inspection.final_decision?.batch_action || "-"} />
          <Definition
            label="Human Review"
            value={inspection.final_decision?.human_override_required ? "Required" : "Not Required"}
          />
          <p className="review-note">
            {getHumanReviewReason(inspection, HUMAN_REVIEW_THRESHOLD)}
          </p>
        </section>

        <section className="result-card">
          <h2>Escalation and Notify</h2>
          <p className="detail-copy">{inspection.notifications?.ncr_report || "-"}</p>
          <button className="download-button" type="button" onClick={onDownloadReport} disabled={isReportDownloading}>
            <FileDown size={16} />
            {isReportDownloading ? "Preparing PDF" : "Download NCR PDF"}
          </button>
          <Definition label="COPQ Estimate" value={inspection.notifications?.copq_estimate || "-"} />
          <Definition label="Audit Log" value={inspection.notifications?.audit_log || "-"} />
          {notificationItems.length ? (
            <div className="notification-list">
              {notificationItems.map((item, index) => (
                <div className="notification-card" key={`${item.title}-${index}`}>
                  <strong>{item.title}</strong>
                  <span>{item.message}</span>
                  {item.meta ? <small>{item.meta}</small> : null}
                </div>
              ))}
            </div>
          ) : null}
        </section>

        <section className="result-card wide-card">
          <h2>Enterprise Dispatch</h2>
          <div className="integration-table">
            {integrations.length ? (
              integrations.map((integration) => (
                <div className="integration-row" key={integration.system_name}>
                  <strong>{integration.system_name}</strong>
                  <StatusPill value={integration.submission_status || "-"} />
                  <span>{integration.external_reference || integration.error_detail || "No external reference returned"}</span>
                </div>
              ))
            ) : (
              <p className="muted">No enterprise submission records available.</p>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}

function AuthScreen({ mode, form, error, isLoading, onModeChange, onFieldChange, onSubmit }) {
  const isRegisterMode = mode === "register";

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="auth-brand">
          <p className="eyebrow">Quality Operations</p>
          <h1>Manufacturing Component Quality Inspector</h1>
          <p>Secure access for quality engineers, line supervisors, and inspection teams.</p>
        </div>

        <form className="auth-card" onSubmit={onSubmit}>
          <div>
            <p className="eyebrow">Secure Access</p>
            <h2>{isRegisterMode ? "Create Account" : "Login"}</h2>
          </div>

          <div className="auth-toggle" role="tablist" aria-label="Authentication mode">
            <button className={mode === "login" ? "active" : ""} type="button" onClick={() => onModeChange("login")}>
              Login
            </button>
            <button
              className={mode === "register" ? "active" : ""}
              type="button"
              onClick={() => onModeChange("register")}
            >
              Register
            </button>
          </div>

          {isRegisterMode ? (
            <>
              <Input label="Name" name="name" value={form.name} onChange={onFieldChange} required />
              <Input label="Mobile" name="mobile" value={form.mobile} onChange={onFieldChange} required />
              <label className="field">
                <span>Role</span>
                <select name="role" value={form.role} onChange={onFieldChange}>
                  <option value="VIEWER">Viewer</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </label>
            </>
          ) : null}
          <Input label="Email" name="email" type="email" value={form.email} onChange={onFieldChange} required />
          <Input
            label="Password"
            name="password"
            type="password"
            value={form.password}
            onChange={onFieldChange}
            required
            minLength={isRegisterMode ? 8 : 1}
          />

          {error ? <p className="global-error compact">{error}</p> : null}

          <button className="primary-action" type="submit" disabled={isLoading}>
            {isLoading ? <Loader2 className="spin" size={16} /> : null}
            {isLoading ? "Please wait" : isRegisterMode ? "Create Account" : "Login"}
          </button>
        </form>
      </section>
    </main>
  );
}

function Input({ label, ...props }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input {...props} />
    </label>
  );
}

function EvidencePill({ icon: Icon, label }) {
  return (
    <span className="evidence-pill">
      <Icon size={14} />
      {label}
    </span>
  );
}

function Definition({ label, value }) {
  return (
    <div className="definition">
      <strong>{label}</strong>
      <span>{value}</span>
    </div>
  );
}

function StatusPill({ value }) {
  const tone = getStatusTone(value);
  return <span className={`status-pill ${tone}`}>{value}</span>;
}

function VerdictSeverityNote() {
  const thresholdLabel = formatPercent(HUMAN_REVIEW_THRESHOLD);
  const guideItems = [
    {
      tone: "confidence",
      title: "Confidence Score",
      copy: "Used with severity and defect evidence to support the verdict; unclear image quality limits confidence to 50%.",
    },
    {
      tone: "pass",
      title: "PASS",
      copy: `Needs at least ${thresholdLabel} confidence, severity NONE, and no visible defects.`,
    },
    {
      tone: "rework",
      title: "REWORK",
      copy: `Needs at least ${thresholdLabel} confidence plus a repairable MINOR or MAJOR defect.`,
    },
    {
      tone: "reject",
      title: "REJECT",
      copy: `Needs at least ${thresholdLabel} confidence plus CRITICAL severity or non-repairable defect evidence.`,
    },
    {
      tone: "review",
      title: "Human Review",
      copy: `Scores below ${thresholdLabel} set workflow status to NEEDS_HUMAN_REVIEW while the verdict remains PASS, REWORK, or REJECT.`,
    },
  ];

  return (
    <section className="decision-note" aria-label="Verdict and severity guide">
      <div className="decision-note-header">
        <h2>Verdict and Severity Guide</h2>
        <span className="review-threshold-badge">Review below {thresholdLabel}</span>
      </div>
      <p className="decision-note-summary">
        There is no separate confidence cutoff for PASS, REWORK, and REJECT. Any automated verdict needs confidence at or above {thresholdLabel}; below that, the workflow is sent to human review.
      </p>
      <div className="decision-guide-grid">
        {guideItems.map((item) => (
          <article className={`decision-guide-card ${item.tone}`} key={item.title}>
            <h3>{item.title}</h3>
            <p>{item.copy}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function normalizeNotificationForDisplay(item) {
  if (item && typeof item === "object") {
    const message = item.message || item.action || item.summary || "";

    if (!message && isPlaceholderNotificationText(item.recipient || item.stakeholder || item.channel)) {
      return null;
    }

    return {
      title: item.recipient || item.stakeholder || item.channel || "Notification",
      message: message || JSON.stringify(item),
      meta: [item.channel, item.priority].filter(Boolean).join(" | "),
    };
  }

  const text = String(item || "").trim();

  if (!text) {
    return null;
  }

  if (text.startsWith("{")) {
    try {
      const parsed = JSON.parse(text);

      return normalizeNotificationForDisplay(parsed);
    } catch {
      return {
        title: "Notification",
        message: text,
        meta: "",
      };
    }
  }

  const [possibleTitle, ...messageParts] = text.split(":");
  const hasReadableTitle = messageParts.length > 0 && possibleTitle.length <= 48;
  const messageText = hasReadableTitle ? messageParts.join(":").trim() : text;

  if (
    (!hasReadableTitle && isPlaceholderNotificationText(text)) ||
    (hasReadableTitle && isPlaceholderNotificationText(messageText))
  ) {
    return null;
  }

  return {
    title: hasReadableTitle ? possibleTitle.trim() : "Notification",
    message: messageText,
    meta: "",
  };
}

function isPlaceholderNotificationText(value) {
  const normalized = String(value || "").trim().toLowerCase();
  const withoutNotificationLabel = normalized.startsWith("notification:")
    ? normalized.slice("notification:".length).trim()
    : normalized;

  return [
    "notification",
    "quality inspector",
    "quality engineer",
    "line supervisor",
    "mes",
    "erp",
    "servicenow",
    "supplier portal",
  ].includes(withoutNotificationLabel);
}

function createWorkflowStageStatuses(status = "waiting") {
  return workflowDefinitions.reduce(
    (statuses, step) => ({
      ...statuses,
      [step.key]: status,
    }),
    {}
  );
}

function applyWorkflowStageEvent(currentStatuses, event) {
  const stageIndex = workflowDefinitions.findIndex((step) => step.key === event.stage);

  if (stageIndex === -1) {
    return currentStatuses;
  }

  if (event.status === "failed") {
    return {
      ...currentStatuses,
      [event.stage]: "failed",
    };
  }

  if (event.status !== "running" && event.status !== "completed") {
    return currentStatuses;
  }

  return workflowDefinitions.reduce((statuses, step, index) => {
    if (event.status === "running") {
      statuses[step.key] =
        index < stageIndex ? "completed" : index === stageIndex ? "running" : "waiting";
      return statuses;
    }

    statuses[step.key] = index <= stageIndex ? "completed" : "waiting";
    return statuses;
  }, {});
}

function buildWorkflowSteps({ stageStatuses, result }) {
  if (result) {
    return workflowDefinitions.map((step) => ({
      ...step,
      status: "Completed",
      statusTone: "completed",
    }));
  }

  return workflowDefinitions.map((step) => ({
    ...step,
    status: getWorkflowStatusLabel(stageStatuses[step.key]),
    statusTone: stageStatuses[step.key] || "waiting",
  }));
}

function getWorkflowStatusLabel(status) {
  if (status === "running") return "Running";
  if (status === "completed") return "Completed";
  if (status === "failed") return "Failed";
  return "Waiting";
}

function getInspectionStatus(inspection) {
  if (!inspection) {
    return "WAITING";
  }

  return inspection.final_decision?.human_override_required ? "NEEDS_HUMAN_REVIEW" : "COMPLETED";
}

function getStatusTone(value) {
  const normalized = String(value || "").toUpperCase();

  if (["COMPLETED", "PASS", "SUCCESS", "SUBMITTED"].includes(normalized)) return "success";
  if (["NEEDS_HUMAN_REVIEW", "REWORK", "MINOR", "MAJOR", "MEDIUM"].includes(normalized)) return "warning";
  if (["REJECT", "CRITICAL", "FAILED", "HIGH"].includes(normalized)) return "danger";
  return "neutral";
}

function getHumanReviewReason(inspection, threshold) {
  const confidence = inspection?.confidence_score;
  const reviewRequired = Boolean(inspection?.final_decision?.human_override_required);
  const confidenceText = formatPercent(confidence);
  const thresholdText = formatPercent(threshold);

  return reviewRequired
    ? `Manual review is required because inspection confidence is ${confidenceText}, below the ${thresholdText} approval threshold.`
    : `Manual review is not required because inspection confidence is ${confidenceText}, meeting the ${thresholdText} approval threshold.`;
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

function shortTrace(traceId) {
  if (!traceId) {
    return "-";
  }

  return traceId.length > 14 ? `${traceId.slice(0, 8)}...${traceId.slice(-4)}` : traceId;
}

function sourceLabel(source) {
  if (source === "aws-bedrock") return "AWS Bedrock";
  if (source === "hybrid-fallback") return "Hybrid Fallback";
  if (source === "local-fallback") return "Local Fallback";
  return source || "-";
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read image file"));
    reader.readAsDataURL(file);
  });
}
