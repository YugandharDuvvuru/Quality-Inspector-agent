import { buildRootCauseAnalystPrompt } from "../prompts/qualityInspectionPrompt.js";
import { validateRootCauseAnalysisStage } from "../schemas/inspectionResultSchema.js";
import {
  buildStageStateUpdate,
  runStageWithBedrock,
} from "../services/agentStageRuntime.js";

export async function runRootCauseAnalystStage(state) {
  const prompt = buildRootCauseAnalystPrompt({
    input: state.input,
    visionResult: state.visionResult,
    severityAssessment: state.severityAssessment,
  });

  const stageResult = await runStageWithBedrock({
    state,
    stageName: "root_cause_analyst",
    prompt,
    validator: validateRootCauseAnalysisStage,
    fallbackFactory: () =>
      runRootCauseAnalystAgent(state.visionResult, state.severityAssessment),
  });

  return buildStageStateUpdate(state, {
    rootCauseAnalysis: stageResult.output,
    interaction: stageResult.interaction,
    fallbackReason: stageResult.fallbackReason,
  });
}

export function runRootCauseAnalystAgent(visionResult, severityAssessment) {
  const { primaryDefect } = visionResult;

  if (!primaryDefect) {
    return {
      root_cause: "Root cause analysis not required because no defect was detected",
      recurrence_risk: "LOW",
      recommended_actions: [
        {
          action: "Continue normal inspection sampling",
          owner: "Quality Inspector",
          timeline: "Current shift",
        },
      ],
      reasoning:
        "The root cause stage was skipped for defect investigation because the vision stage did not detect a nonconformance.",
    };
  }

  const causeByDefect = {
    "surface crack": "Material fatigue or machine calibration issue",
    corrosion: "Material handling, storage humidity, or supplier surface treatment issue",
    misalignment: "Fixture setup drift or operator loading variation",
    "weld defect": "Welding parameter deviation or tooling wear",
    "missing feature": "Process skip, tooling issue, or upstream assembly miss",
    contamination: "Insufficient cleaning or foreign material control gap",
    scratch: "Handling damage or conveyor contact",
    "dimensional deviation": "Tool wear, thermal variation, or calibration drift",
  };

  return {
    root_cause: causeByDefect[primaryDefect.type] || "Process variation requiring investigation",
    recurrence_risk: severityAssessment.severity === "CRITICAL" ? "HIGH" : "MEDIUM",
    recommended_actions: [
      {
        action: "Contain affected parts and verify last known good batch",
        owner: "Line Supervisor",
        timeline: "Immediate",
      },
      {
        action: "Perform root-cause validation and update control plan",
        owner: "Quality Engineer",
        timeline: "24 hours",
      },
    ],
    reasoning:
      "The probable cause is inferred from the detected defect type and the assessed severity of the nonconformance.",
  };
}
