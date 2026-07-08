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
      root_cause_analysis: state.rootCauseAnalysis,
      final_decision: state.decisionResult.final_decision,
      notifications: state.notifications,
      confidence_score: state.decisionResult.confidence_score,
      source: determineResultSource(state),
      fallback_reason: formatFallbackReasons(state.fallbackReasons || []),
    },
  };
}
