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
  .addNode("visionInspector", runVisionInspectorStage)
  .addNode("severityClassifier", runSeverityClassifierStage)
  .addNode("rootCauseAnalyst", runRootCauseAnalystStage)
  .addNode("decisionAction", runDecisionActionStage)
  .addNode("escalationNotify", runEscalationNotifyStage)
  .addNode("finalize", runFinalizeNode)
  .addEdge(START, "visionInspector")
  .addEdge("visionInspector", "severityClassifier")
  .addConditionalEdges("severityClassifier", routeAfterSeverity)
  .addEdge("rootCauseAnalyst", "decisionAction")
  .addEdge("decisionAction", "escalationNotify")
  .addEdge("escalationNotify", "finalize")
  .addEdge("finalize", END)
  .compile();

export async function runQualityInspectionWorkflow({
  input,
  confidenceThreshold,
  bedrockEnabled,
}) {
  const graphResult = await compiledWorkflow.invoke({
    input,
    confidenceThreshold,
    bedrockEnabled,
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

function routeAfterSeverity(state) {
  return hasDefects(state) ? "rootCauseAnalyst" : "decisionAction";
}

function hasDefects(state) {
  return Boolean(state.visionResult?.inspection_summary?.defects_detected?.length);
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
