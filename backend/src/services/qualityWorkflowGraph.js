import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { runDecisionActionAgent } from "../agents/decisionActionAgent.js";
import { runEscalationNotifyAgent } from "../agents/escalationNotifyAgent.js";
import { runRootCauseAnalystAgent } from "../agents/rootCauseAnalystAgent.js";
import { runSeverityClassifierAgent } from "../agents/severityClassifierAgent.js";
import { runVisionInspectorAgent } from "../agents/visionInspectorAgent.js";
import { env } from "../config/env.js";
import { buildQualityInspectionPrompt } from "../prompts/qualityInspectionPrompt.js";
import { validateInspectionResult } from "../schemas/inspectionResultSchema.js";
import { extractJsonObject, invokeQualityInspectionModel } from "./bedrockClient.js";

const InspectionState = Annotation.Root({
  input: Annotation(),
  previousResult: Annotation(),
  confidenceThreshold: Annotation(),
  bedrockEnabled: Annotation(),
  fallbackReason: Annotation(),
  bedrockInteraction: Annotation(),
  modelResult: Annotation(),
  visionResult: Annotation(),
  severityAssessment: Annotation(),
  rootCauseAnalysis: Annotation(),
  decisionResult: Annotation(),
  notifications: Annotation(),
  finalResult: Annotation(),
});

const compiledWorkflow = new StateGraph(InspectionState)
  .addNode("bedrockAttempt", runBedrockAttemptNode)
  .addNode("visionInspector", runVisionInspectorNode)
  .addNode("severityClassifier", runSeverityClassifierNode)
  .addNode("rootCauseAnalyst", runRootCauseAnalystNode)
  .addNode("decisionAction", runDecisionActionNode)
  .addNode("escalationNotify", runEscalationNotifyNode)
  .addNode("finalize", runFinalizeNode)
  .addEdge(START, "bedrockAttempt")
  .addConditionalEdges("bedrockAttempt", routeAfterBedrockAttempt, {
    finalize: "finalize",
    visionInspector: "visionInspector",
  })
  .addEdge("visionInspector", "severityClassifier")
  .addEdge("severityClassifier", "rootCauseAnalyst")
  .addEdge("rootCauseAnalyst", "decisionAction")
  .addEdge("decisionAction", "escalationNotify")
  .addEdge("escalationNotify", "finalize")
  .addEdge("finalize", END)
  .compile();

export async function runQualityInspectionWorkflow({
  input,
  previousResult,
  confidenceThreshold,
  bedrockEnabled,
}) {
  const graphResult = await compiledWorkflow.invoke({
    input,
    previousResult,
    confidenceThreshold,
    bedrockEnabled,
  });

  return {
    result: graphResult.finalResult,
    workflowMetadata: {
      bedrockInteractions: graphResult.bedrockInteraction ? [graphResult.bedrockInteraction] : [],
    },
  };
}

async function runBedrockAttemptNode(state) {
  if (!state.bedrockEnabled) {
    return {
      fallbackReason: null,
      bedrockInteraction: {
        stage_name: "multi_agent_inspection",
        model_id: env.BEDROCK_MODEL_ID,
        region: env.AWS_REGION,
        prompt_text: null,
        response_text: null,
        success: false,
        skipped: true,
        error_summary: "Bedrock disabled for this inspection run.",
      },
    };
  }

  try {
    const { modelResult, interactionRecord } = await attemptBedrockInspection(state);
    return {
      modelResult,
      fallbackReason: null,
      bedrockInteraction: interactionRecord,
    };
  } catch (error) {
    const fallbackReason = formatFallbackReason(error);
    console.error(
      `[bedrock] failed for component=${state.input.component_id}; using fallback. reason=${fallbackReason}`
    );
    return {
      fallbackReason,
      bedrockInteraction: error.bedrockInteractionRecord || {
        stage_name: "multi_agent_inspection",
        model_id: env.BEDROCK_MODEL_ID,
        region: env.AWS_REGION,
        prompt_text: null,
        response_text: null,
        success: false,
        skipped: false,
        error_summary: fallbackReason,
      },
    };
  }
}

function routeAfterBedrockAttempt(state) {
  return state.modelResult ? "finalize" : "visionInspector";
}

async function runVisionInspectorNode(state) {
  if (state.fallbackReason) {
    console.log(`[fallback] component=${state.input.component_id} reason=${state.fallbackReason}`);
  } else {
    console.log(`[fallback] component=${state.input.component_id} local mode active`);
  }

  return {
    visionResult: runVisionInspectorAgent(state.input, state.previousResult),
  };
}

async function runSeverityClassifierNode(state) {
  return {
    severityAssessment: runSeverityClassifierAgent(state.visionResult),
  };
}

async function runRootCauseAnalystNode(state) {
  return {
    rootCauseAnalysis: runRootCauseAnalystAgent(state.visionResult, state.severityAssessment),
  };
}

async function runDecisionActionNode(state) {
  return {
    decisionResult: runDecisionActionAgent(
      state.visionResult,
      state.severityAssessment,
      state.confidenceThreshold
    ),
  };
}

async function runEscalationNotifyNode(state) {
  return {
    notifications: runEscalationNotifyAgent(
      state.input,
      state.decisionResult.final_decision,
      state.severityAssessment
    ),
  };
}

async function runFinalizeNode(state) {
  if (state.modelResult) {
    return {
      finalResult: state.modelResult,
    };
  }

  return {
    finalResult: {
      component_id: state.input.component_id,
      inspection_summary: state.visionResult.inspection_summary,
      severity_assessment: state.severityAssessment,
      root_cause_analysis: state.rootCauseAnalysis,
      final_decision: state.decisionResult.final_decision,
      notifications: state.notifications,
      confidence_score: state.decisionResult.confidence_score,
      source: "local-fallback",
      fallback_reason: state.fallbackReason,
    },
  };
}

async function attemptBedrockInspection(state) {
  console.log(`[bedrock] attempting request for component=${state.input.component_id}`);
  const prompt = buildQualityInspectionPrompt({
    input: state.input,
    previousResult: state.previousResult,
    confidenceThreshold: state.confidenceThreshold,
  });
  let modelResponse = null;

  try {
    const image = await resolveInspectionImage(state.input);
    modelResponse = await invokeQualityInspectionModel({ prompt, image });
    const validatedResult = validateInspectionResult(extractJsonObject(modelResponse));
    console.log(`[bedrock] success for component=${state.input.component_id}`);

    return {
      modelResult: normalizeModelResult(validatedResult, state.input, state.confidenceThreshold),
      interactionRecord: {
        stage_name: "multi_agent_inspection",
        model_id: env.BEDROCK_MODEL_ID,
        region: env.AWS_REGION,
        prompt_text: prompt,
        response_text: modelResponse,
        success: true,
        skipped: false,
        error_summary: null,
      },
    };
  } catch (error) {
    error.bedrockInteractionRecord = {
      stage_name: "multi_agent_inspection",
      model_id: env.BEDROCK_MODEL_ID,
      region: env.AWS_REGION,
      prompt_text: prompt,
      response_text: modelResponse,
      success: false,
      skipped: false,
      error_summary: formatFallbackReason(error),
    };
    throw error;
  }
}

async function resolveInspectionImage(input) {
  if (input.image_base64 && input.image_media_type?.startsWith("image/")) {
    return {
      mediaType: input.image_media_type,
      base64: stripDataUrlPrefix(input.image_base64),
    };
  }

  return tryLoadImageFromUrl(input.image_url);
}

async function tryLoadImageFromUrl(imageUrl) {
  if (!imageUrl || !imageUrl.startsWith("http")) {
    return null;
  }

  const response = await fetch(imageUrl);

  if (!response.ok) {
    return null;
  }

  const mediaType = response.headers.get("content-type") || "image/jpeg";

  if (!mediaType.startsWith("image/")) {
    return null;
  }

  const arrayBuffer = await response.arrayBuffer();
  return {
    mediaType,
    base64: Buffer.from(arrayBuffer).toString("base64"),
  };
}

function stripDataUrlPrefix(value) {
  const marker = "base64,";
  const markerIndex = value.indexOf(marker);

  if (markerIndex === -1) {
    return value;
  }

  return value.slice(markerIndex + marker.length);
}

function normalizeModelResult(result, input, confidenceThreshold) {
  return {
    component_id: result.component_id || input.component_id,
    inspection_summary: result.inspection_summary || {},
    severity_assessment: result.severity_assessment || {},
    root_cause_analysis: result.root_cause_analysis || {},
    final_decision: {
      ...(result.final_decision || {}),
      human_override_required:
        result.final_decision?.human_override_required ??
        Number(result.confidence_score || 0) < confidenceThreshold,
    },
    notifications: result.notifications || {},
    confidence_score: Number(result.confidence_score || 0),
    source: "aws-bedrock",
  };
}

function formatFallbackReason(error) {
  if (!error.details) {
    return error.message;
  }

  return `${error.message}: ${JSON.stringify(error.details)}`;
}
