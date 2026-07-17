import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { runDecisionActionStage } from "../agents/decisionActionAgent.js";
import { runEscalationNotifyStage } from "../agents/escalationNotifyAgent.js";
import { runRootCauseAnalystStage } from "../agents/rootCauseAnalystAgent.js";
import { runSeverityClassifierStage } from "../agents/severityClassifierAgent.js";
import { runVisionInspectorStage } from "../agents/visionInspectorAgent.js";
import {
  determineResultSource,
  formatFallbackReasons,
} from "./agentStageRuntime.js";

const InspectionState = Annotation.Root({
  input: Annotation(),
  confidenceThreshold: Annotation(),
  bedrockEnabled: Annotation(),
  onStageProgress: Annotation(),
  fallbackReasons: Annotation(),
  bedrockInteractions: Annotation(),
  visionResult: Annotation(),
  severityAssessment: Annotation(),
  rootCauseAnalysis: Annotation(),
  decisionResult: Annotation(),
  notifications: Annotation(),
  finalResult: Annotation(),
});

const compiledWorkflow = new StateGraph(InspectionState)
  .addNode("visionInspector", withStageProgress("vision", runVisionInspectorStage))
  .addNode("severityClassifier", withStageProgress("severity", runSeverityClassifierStage))
  .addNode("rootCauseAnalyst", withStageProgress("rootCause", runRootCauseAnalystStage))
  .addNode("decisionAction", withStageProgress("decision", runDecisionActionStage))
  .addNode("escalationNotify", withStageProgress("notify", runEscalationNotifyStage))
  .addNode("finalize", runFinalizeNode)
  .addEdge(START, "visionInspector")
  .addEdge("visionInspector", "severityClassifier")
  .addEdge("severityClassifier", "rootCauseAnalyst")
  .addEdge("rootCauseAnalyst", "decisionAction")
  .addEdge("decisionAction", "escalationNotify")
  .addEdge("escalationNotify", "finalize")
  .addEdge("finalize", END)
  .compile();

export async function runQualityInspectionWorkflow({
  input,
  confidenceThreshold,
  bedrockEnabled,
  onStageProgress,
}) {
  const graphResult = await compiledWorkflow.invoke({
    input,
    confidenceThreshold,
    bedrockEnabled,
    onStageProgress,
    fallbackReasons: [],
    bedrockInteractions: [],
  });

  return {
    result: graphResult.finalResult,
    workflowMetadata: {
      bedrockInteractions: graphResult.bedrockInteractions || [],
    },
  };
}

function withStageProgress(stageKey, runStage) {
  return async (state) => {
    await notifyStageProgress(state, {
      stage: stageKey,
      status: "running",
    });

    try {
      const stageUpdate = await runStage(state);

      await notifyStageProgress(state, {
        stage: stageKey,
        status: "completed",
      });

      return stageUpdate;
    } catch (error) {
      await notifyStageProgress(state, {
        stage: stageKey,
        status: "failed",
        message: error.message,
      });

      throw error;
    }
  };
}

async function notifyStageProgress(state, event) {
  if (!state.onStageProgress) {
    return;
  }

  try {
    await state.onStageProgress({
      type: "stage_status",
      ...event,
    });
  } catch (error) {
    console.warn(`[inspection] failed to emit stage progress. reason=${error.message}`);
  }
}

async function runFinalizeNode(state) {
  return {
    finalResult: {
      component_id: state.input.component_id,
      inspection_summary: state.visionResult.inspection_summary,
      severity_assessment: state.severityAssessment,
      root_cause_analysis:
        state.rootCauseAnalysis || buildSkippedRootCauseAnalysis(state.visionResult),
      final_decision: state.decisionResult.final_decision,
      notifications:
        state.notifications ||
        buildNonEscalatedNotificationSummary(
          state.input,
          state.decisionResult,
          state.severityAssessment
        ),
      confidence_score: state.decisionResult.confidence_score,
      source: determineResultSource(state),
      fallback_reason: formatFallbackReasons(state.fallbackReasons || []),
    },
  };
}

function buildSkippedRootCauseAnalysis(visionResult) {
  const hasDetectedDefects = Boolean(visionResult?.inspection_summary?.defects_detected?.length);

  if (hasDetectedDefects) {
    return {
      root_cause: "Root cause analysis was unavailable for this inspection",
      recurrence_risk: "MEDIUM",
      recommended_actions: [
        {
          action: "Escalate to quality engineering for manual root-cause review",
          owner: "Quality Engineer",
          timeline: "Current shift",
        },
      ],
      reasoning:
        "A defect was detected, but the root cause stage did not return a structured analysis payload.",
    };
  }

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
      "The root cause stage was skipped because the vision stage did not detect a nonconformance.",
  };
}

function buildNonEscalatedNotificationSummary(input, decisionResult, severityAssessment) {
  const finalDecision = decisionResult?.final_decision?.final_decision || "PASS";
  const supplierUpdateNeeded =
    finalDecision === "REJECT" || severityAssessment?.severity === "CRITICAL";

  return {
    ncr_report: "NCR not required for current disposition.",
    notifications_sent: ["Quality Inspector"],
    supplier_updates: supplierUpdateNeeded
      ? [
          `Supplier quality update required for component ${input.component_id} from batch ${input.metadata?.batch_number || "unknown-batch"}.`,
        ]
      : [],
    copq_estimate: "Low",
    audit_log: `Inspection recorded for component ${input.component_id} on line ${input.line_id}.`,
  };
}
