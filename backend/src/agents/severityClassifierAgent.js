import { buildSeverityClassifierPrompt } from "../prompts/qualityInspectionPrompt.js";
import { validateSeverityAssessmentStage } from "../schemas/inspectionResultSchema.js";
import {
  buildStageStateUpdate,
  runStageWithBedrock,
} from "../services/agentStageRuntime.js";

export async function runSeverityClassifierStage(state) {
  const prompt = buildSeverityClassifierPrompt({
    input: state.input,
    visionResult: state.visionResult,
  });

  const stageResult = await runStageWithBedrock({
    state,
    stageName: "severity_classifier",
    prompt,
    validator: validateSeverityAssessmentStage,
    fallbackFactory: () => runSeverityClassifierAgent(state.visionResult),
  });

  return buildStageStateUpdate(state, {
    severityAssessment: stageResult.output,
    interaction: stageResult.interaction,
    fallbackReason: stageResult.fallbackReason,
  });
}

export function runSeverityClassifierAgent(visionResult) {
  const { primaryDefect, signal } = visionResult;

  if (!primaryDefect) {
    return {
      severity: "MINOR",
      standard_reference: "ISO 9001: evidence-based inspection record",
      verdict: "PASS",
      confidence: 0.82,
      reasoning: "No defects were detected in the vision summary, so the part remains within normal acceptance criteria.",
    };
  }

  const criticalSignals = ["crack", "fracture", "safety", "critical", "leak"];
  const majorSignals = ["corrosion", "weld", "missing", "misalignment", "tolerance"];
  const isCritical = criticalSignals.some((keyword) => signal.includes(keyword));
  const isMajor = majorSignals.some((keyword) => signal.includes(keyword));

  if (isCritical) {
    return {
      severity: "CRITICAL",
      standard_reference: "IATF 16949: control of nonconforming output and customer safety risk",
      verdict: "REJECT",
      confidence: Math.max(primaryDefect.confidence, 0.86),
      reasoning:
        "The defect pattern indicates potential safety or functional risk, so the part should be rejected and contained immediately.",
    };
  }

  if (isMajor) {
    return {
      severity: "MAJOR",
      standard_reference: "ISO 9001: nonconforming output requiring containment and correction",
      verdict: "REWORK",
      confidence: Math.max(primaryDefect.confidence, 0.8),
      reasoning:
        "The defect is significant enough to require containment and correction before release, but it does not clearly indicate immediate scrap.",
    };
  }

  return {
    severity: "MINOR",
    standard_reference: "ISO 9001: correction and monitored acceptance criteria",
    verdict: "REWORK",
    confidence: primaryDefect.confidence,
    reasoning:
      "A minor nonconformance is present, so the part should be corrected or monitored before normal release.",
  };
}
