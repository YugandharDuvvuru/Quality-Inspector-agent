import { buildEscalationNotifyPrompt } from "../prompts/qualityInspectionPrompt.js";
import { validateNotificationsStage } from "../schemas/inspectionResultSchema.js";
import {
  buildStageStateUpdate,
  runStageWithBedrock,
} from "../services/agentStageRuntime.js";

export async function runEscalationNotifyStage(state) {
  const prompt = buildEscalationNotifyPrompt({
    input: state.input,
    severityAssessment: state.severityAssessment,
    rootCauseAnalysis: state.rootCauseAnalysis,
    decisionResult: state.decisionResult,
  });

  const stageResult = await runStageWithBedrock({
    state,
    stageName: "escalation_notify",
    prompt,
    validator: validateNotificationsStage,
    normalizeOutput: (output) =>
      normalizeEscalationNotificationOutput(
        output,
        state.input,
        state.decisionResult,
        state.severityAssessment
      ),
    fallbackFactory: () =>
      runEscalationNotifyAgent(
        state.input,
        state.decisionResult,
        state.severityAssessment
      ),
  });

  return buildStageStateUpdate(state, {
    notifications: stageResult.output,
    interaction: stageResult.interaction,
    fallbackReason: stageResult.fallbackReason,
  });
}

export function runEscalationNotifyAgent(input, decisionResult, severityAssessment) {
  const finalDecision = decisionResult.final_decision;
  const shouldEscalate = shouldRunFullEscalation(decisionResult, severityAssessment);
  const supplierUpdateNeeded =
    finalDecision.final_decision === "REJECT" || severityAssessment.severity === "CRITICAL";

  return {
    ncr_report: buildGeneratedNcrReportSummary(
      input,
      decisionResult,
      severityAssessment,
      shouldEscalate
    ),
    notifications_sent: shouldEscalate
      ? buildFallbackEscalationNotifications(input, decisionResult, severityAssessment, supplierUpdateNeeded)
      : [],
    supplier_updates: supplierUpdateNeeded
      ? [
          `Supplier quality update required for component ${input.component_id} from batch ${input.metadata?.batch_number || "unknown-batch"}.`,
        ]
      : [],
    copq_estimate: shouldEscalate
      ? "High - scrap, downtime, and containment cost expected"
      : buildLightCopqEstimate(finalDecision.final_decision),
    audit_log: `Inspection recorded for component ${input.component_id} on line ${input.line_id}.`,
  };
}

function normalizeEscalationNotificationOutput(output, input, decisionResult, severityAssessment) {
  const shouldEscalate = shouldRunFullEscalation(decisionResult, severityAssessment);
  const supplierUpdateNeeded =
    decisionResult.final_decision?.final_decision === "REJECT" ||
    severityAssessment.severity === "CRITICAL";
  const ncrReport = output.ncr_report || "";
  const normalizedReport =
    ncrReport.trim() && !ncrReport.toLowerCase().startsWith("ncr not required")
      ? ncrReport
      : buildGeneratedNcrReportSummary(
          input,
          decisionResult,
          severityAssessment,
          shouldEscalate
        );

  return {
    ...output,
    ncr_report: shouldEscalate
      ? normalizedReport
      : buildGeneratedNcrReportSummary(input, decisionResult, severityAssessment, false),
    notifications_sent: shouldEscalate
      ? normalizeNotificationTargets(output.notifications_sent, {
          input,
          decisionResult,
          severityAssessment,
          supplierUpdateNeeded,
        })
      : [],
    supplier_updates: shouldEscalate ? normalizeTextList(output.supplier_updates) : [],
    copq_estimate: shouldEscalate
      ? output.copq_estimate || "High - scrap, downtime, and containment cost expected"
      : buildLightCopqEstimate(decisionResult.final_decision?.final_decision),
    audit_log:
      output.audit_log ||
      `Inspection recorded for component ${input.component_id} on line ${input.line_id}.`,
  };
}

function buildGeneratedNcrReportSummary(input, decisionResult, severityAssessment, shouldEscalate) {
  const finalDecision = decisionResult.final_decision;
  const ncrNumber = `NCR-${input.component_id}-${Date.now()}`;
  const escalationText = shouldEscalate
    ? "Escalation and containment review required."
    : "No broad escalation required; report retained for audit traceability.";

  return `${ncrNumber}: Inspection completed at ${input.inspection_station}. Verdict ${finalDecision.final_decision}; severity ${severityAssessment.severity}; line action ${finalDecision.line_action}; batch action ${finalDecision.batch_action}. ${escalationText}`;
}

function shouldRunFullEscalation(decisionResult, severityAssessment) {
  const finalDecision = decisionResult.final_decision;

  return (
    severityAssessment.severity === "CRITICAL" ||
    finalDecision.final_decision === "REJECT" ||
    Boolean(finalDecision.human_override_required) ||
    requiresContainment(finalDecision)
  );
}

function requiresContainment(finalDecision) {
  const decisionText = [
    finalDecision.line_action,
    finalDecision.batch_action,
    finalDecision.justification,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return /\b(stop|pause|hold|quarantine|contain|segregat|block|isolate|suspend|100%|one hundred)\b/.test(
    decisionText
  );
}

function buildFallbackEscalationNotifications(
  input,
  decisionResult,
  severityAssessment,
  supplierUpdateNeeded
) {
  const finalDecision = decisionResult.final_decision;
  const batchNumber = input.metadata?.batch_number || "unknown batch";
  const notifications = [
    `Quality Engineer: Review ${severityAssessment.severity} ${finalDecision.final_decision} inspection for component ${input.component_id} and confirm containment actions.`,
    `Line Supervisor: Execute line action ${finalDecision.line_action} for ${input.line_id} and verify affected batch ${batchNumber}.`,
    `MES: Record disposition ${finalDecision.final_decision}, line action ${finalDecision.line_action}, and batch action ${finalDecision.batch_action} for component ${input.component_id}.`,
    `ServiceNow: Create quality action for ${input.component_id} with severity ${severityAssessment.severity} and owner assignment from corrective actions.`,
  ];

  if (supplierUpdateNeeded) {
    notifications.push(
      `Supplier Portal: Notify supplier for component ${input.component_id} from batch ${batchNumber} because supplier or critical/rejected quality risk is present.`
    );
  }

  return notifications;
}

function buildLightCopqEstimate(verdict) {
  return verdict === "REWORK"
    ? "Medium-Low - rework and re-inspection effort only"
    : "Low - routine inspection record only";
}

function normalizeNotificationTargets(
  items = [],
  { input, decisionResult, severityAssessment, supplierUpdateNeeded }
) {
  const normalized = normalizeTextList(items)
    .map((item) => parseNotificationText(item))
    .filter((item) => !isPlaceholderNotification(item))
    .filter(Boolean);

  if (normalized.length) {
    return Array.from(new Set(normalized));
  }

  return buildFallbackEscalationNotifications(
    input,
    decisionResult,
    severityAssessment,
    supplierUpdateNeeded
  );
}

function normalizeTextList(items = []) {
  return items
    .map((item) => {
      if (typeof item === "string") {
        return item.trim();
      }

      if (item && typeof item === "object") {
        return item.message || item.recipient || item.stakeholder || JSON.stringify(item);
      }

      return "";
    })
    .filter(Boolean);
}

function parseNotificationText(item) {
  if (!item.trim().startsWith("{")) {
    return item;
  }

  try {
    const parsed = JSON.parse(item);
    const recipient = parsed.recipient || parsed.stakeholder || parsed.channel || "Notification";
    const message = parsed.message || parsed.action || parsed.summary || "";

    return message ? `${recipient}: ${message}` : recipient;
  } catch {
    return item;
  }
}

function isPlaceholderNotification(item) {
  const normalized = String(item || "").trim().toLowerCase();
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
