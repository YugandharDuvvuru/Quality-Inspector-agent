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
  const shouldEscalate =
    severityAssessment.severity === "CRITICAL" ||
    finalDecision.final_decision === "REJECT" ||
    Boolean(finalDecision.human_override_required);
  const supplierUpdateNeeded =
    finalDecision.final_decision === "REJECT" || severityAssessment.severity === "CRITICAL";

  return {
    ncr_report: shouldEscalate
      ? `NCR-${input.component_id}-${Date.now()}: ${severityAssessment.severity} issue at ${input.inspection_station}.`
      : "NCR not required for current disposition.",
    notifications_sent: shouldEscalate
      ? ["Quality Engineer", "Line Supervisor", "Supplier Portal"]
      : ["Quality Inspector"],
    supplier_updates: supplierUpdateNeeded
      ? [
          `Supplier quality update required for component ${input.component_id} from batch ${input.metadata?.batch_number || "unknown-batch"}.`,
        ]
      : [],
    copq_estimate: shouldEscalate ? "High - scrap, downtime, and containment cost expected" : "Low",
    audit_log: `Inspection recorded for component ${input.component_id} on line ${input.line_id}.`,
  };
}
