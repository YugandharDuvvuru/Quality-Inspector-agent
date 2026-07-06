import { runDecisionActionAgent } from "../agents/decisionActionAgent.js";
import { runEscalationNotifyAgent } from "../agents/escalationNotifyAgent.js";
import { runRootCauseAnalystAgent } from "../agents/rootCauseAnalystAgent.js";
import { runSeverityClassifierAgent } from "../agents/severityClassifierAgent.js";
import { runVisionInspectorAgent } from "../agents/visionInspectorAgent.js";
import { env } from "../config/env.js";
import { buildQualityInspectionPrompt } from "../prompts/qualityInspectionPrompt.js";
import { validateInspectionResult } from "../schemas/inspectionResultSchema.js";
import { extractJsonObject, invokeQualityInspectionModel } from "./bedrockClient.js";

const inspectionMemory = new Map();
const CONFIDENCE_THRESHOLD = 0.75;

export function listInspections() {
  return Array.from(inspectionMemory.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export function getInspectionByComponentId(componentId) {
  return inspectionMemory.get(componentId);
}

export async function runInspection(input) {
  const previousResult = inspectionMemory.get(input.component_id);

  console.log(
    `[inspection] component=${input.component_id} bedrockEnabled=${env.BEDROCK_ENABLED}`
  );

  const result = env.BEDROCK_ENABLED
    ? await runBedrockInspectionWithFallback(input, previousResult)
    : runLocalAgentInspection(input, previousResult);

  const storedResult = {
    ...result,
    created_at: new Date().toISOString(),
    agentic_loop: ["PERCEIVE", "PLAN", "ACT", "EVALUATE"],
  };

  inspectionMemory.set(input.component_id, storedResult);
  return storedResult;
}

async function runBedrockInspectionWithFallback(input, previousResult) {
  try {
    console.log(`[bedrock] attempting request for component=${input.component_id}`);
    const prompt = buildQualityInspectionPrompt({
      input,
      previousResult,
      confidenceThreshold: CONFIDENCE_THRESHOLD,
    });
    const image = await resolveInspectionImage(input);
    const modelResponse = await invokeQualityInspectionModel({ prompt, image });
    const validatedResult = validateInspectionResult(extractJsonObject(modelResponse));
    console.log(`[bedrock] success for component=${input.component_id}`);
    return normalizeModelResult(validatedResult, input);
  } catch (error) {
    const fallbackReason = formatFallbackReason(error);
    console.error(
      `[bedrock] failed for component=${input.component_id}; using fallback. reason=${fallbackReason}`
    );
    return runLocalAgentInspection(input, previousResult, fallbackReason);
  }
}

function runLocalAgentInspection(input, previousResult, fallbackReason) {
  if (fallbackReason) {
    console.log(`[fallback] component=${input.component_id} reason=${fallbackReason}`);
  } else {
    console.log(`[fallback] component=${input.component_id} local mode active`);
  }

  const visionResult = runVisionInspectorAgent(input, previousResult);
  const severityAssessment = runSeverityClassifierAgent(visionResult);
  const rootCauseAnalysis = runRootCauseAnalystAgent(visionResult, severityAssessment);
  const decisionResult = runDecisionActionAgent(
    visionResult,
    severityAssessment,
    CONFIDENCE_THRESHOLD
  );
  const notifications = runEscalationNotifyAgent(
    input,
    decisionResult.final_decision,
    severityAssessment
  );

  return {
    component_id: input.component_id,
    inspection_summary: visionResult.inspection_summary,
    severity_assessment: severityAssessment,
    root_cause_analysis: rootCauseAnalysis,
    final_decision: decisionResult.final_decision,
    notifications,
    confidence_score: decisionResult.confidence_score,
    source: "local-fallback",
    fallback_reason: fallbackReason,
  };
}

function normalizeModelResult(result, input) {
  return {
    component_id: result.component_id || input.component_id,
    inspection_summary: result.inspection_summary || {},
    severity_assessment: result.severity_assessment || {},
    root_cause_analysis: result.root_cause_analysis || {},
    final_decision: {
      ...(result.final_decision || {}),
      human_override_required:
        result.final_decision?.human_override_required ??
        Number(result.confidence_score || 0) < CONFIDENCE_THRESHOLD,
    },
    notifications: result.notifications || {},
    confidence_score: Number(result.confidence_score || 0),
    source: "aws-bedrock",
  };
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

async function resolveInspectionImage(input) {
  if (input.image_base64 && input.image_media_type?.startsWith("image/")) {
    return {
      mediaType: input.image_media_type,
      base64: stripDataUrlPrefix(input.image_base64),
    };
  }

  return tryLoadImageFromUrl(input.image_url);
}

function stripDataUrlPrefix(value) {
  const marker = "base64,";
  const markerIndex = value.indexOf(marker);

  if (markerIndex === -1) {
    return value;
  }

  return value.slice(markerIndex + marker.length);
}

function formatFallbackReason(error) {
  if (!error.details) {
    return error.message;
  }

  return `${error.message}: ${JSON.stringify(error.details)}`;
}
