import { env } from "../config/env.js";
import { extractJsonObject, invokeQualityInspectionModel } from "./bedrockClient.js";
import { resolveInspectionImageFromInput } from "./s3ImageService.js";

export async function runStageWithBedrock({
  state,
  stageName,
  prompt,
  validator,
  fallbackFactory,
  normalizeOutput = (value) => value,
  imageResolver,
}) {
  if (!state.bedrockEnabled) {
    return {
      output: fallbackFactory(),
      fallbackReason: null,
      interaction: buildInteractionRecord({
        stageName,
        prompt,
        responseText: null,
        success: false,
        skipped: true,
        errorSummary: "Bedrock disabled for this inspection run.",
      }),
    };
  }

  let responseText = null;

  try {
    const image = imageResolver ? await imageResolver() : null;
    responseText = await invokeQualityInspectionModel({ prompt, image });
    const validated = validator(extractJsonObject(responseText));

    return {
      output: normalizeOutput(validated),
      fallbackReason: null,
      interaction: buildInteractionRecord({
        stageName,
        prompt,
        responseText,
        success: true,
        skipped: false,
        errorSummary: null,
      }),
    };
  } catch (error) {
    const fallbackReason = `${stageName}: ${formatFallbackReason(error)}`;

    return {
      output: fallbackFactory(),
      fallbackReason,
      interaction: buildInteractionRecord({
        stageName,
        prompt,
        responseText,
        success: false,
        skipped: false,
        errorSummary: formatFallbackReason(error),
      }),
    };
  }
}

export function buildStageStateUpdate(state, updates) {
  return {
    ...updates,
    bedrockInteractions: appendValue(state.bedrockInteractions, updates.interaction),
    fallbackReasons: appendValue(state.fallbackReasons, updates.fallbackReason),
  };
}

export function determineResultSource(state) {
  if (!state.bedrockEnabled) {
    return "local-fallback";
  }

  const interactions = state.bedrockInteractions || [];
  const successfulStages = interactions.filter((interaction) => interaction.success).length;
  const failedStages = interactions.filter(
    (interaction) => !interaction.success && !interaction.skipped
  ).length;

  if (successfulStages === 0) {
    return "local-fallback";
  }

  if (failedStages > 0) {
    return "hybrid-fallback";
  }

  return "aws-bedrock";
}

export function formatFallbackReasons(fallbackReasons) {
  if (!fallbackReasons.length) {
    return null;
  }

  return fallbackReasons.join(" | ");
}

export async function resolveInspectionImage(input) {
  return resolveInspectionImageFromInput(input);
}

function buildInteractionRecord({
  stageName,
  prompt,
  responseText,
  success,
  skipped,
  errorSummary,
}) {
  return {
    stage_name: stageName,
    model_id: env.BEDROCK_MODEL_ID,
    region: env.AWS_REGION,
    prompt_text: prompt,
    response_text: responseText,
    success,
    skipped,
    error_summary: errorSummary,
  };
}

function appendValue(items = [], value) {
  return value ? [...items, value] : items;
}

function formatFallbackReason(error) {
  if (!error.details) {
    return error.message;
  }

  return `${error.message}: ${JSON.stringify(error.details)}`;
}
