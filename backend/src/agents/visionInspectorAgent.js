import { buildVisionInspectorPrompt } from "../prompts/qualityInspectionPrompt.js";
import { validateInspectionSummaryStage } from "../schemas/inspectionResultSchema.js";
import {
  buildStageStateUpdate,
  resolveInspectionImage,
  runStageWithBedrock,
} from "../services/agentStageRuntime.js";

export async function runVisionInspectorStage(state) {
  const prompt = buildVisionInspectorPrompt({
    input: state.input,
  });

  const stageResult = await runStageWithBedrock({
    state,
    stageName: "vision_inspector",
    prompt,
    imageResolver: () => resolveInspectionImage(state.input),
    validator: validateInspectionSummaryStage,
    normalizeOutput: normalizeVisionStageOutput,
    fallbackFactory: () => runVisionInspectorAgent(state.input),
  });

  return buildStageStateUpdate(state, {
    visionResult: stageResult.output,
    interaction: stageResult.interaction,
    fallbackReason: stageResult.fallbackReason,
  });
}

export function runVisionInspectorAgent(input) {
  const signal = [
    input.image_url,
    input.image_file_name,
    input.image_media_type,
    input.metadata?.notes,
    input.metadata?.material,
    input.metadata?.dimensions,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const primaryDefect = detectDefect(signal);

  return {
    signal,
    primaryDefect,
    inspection_summary: {
      defects_detected: primaryDefect
        ? [
            {
              defect_type: primaryDefect.type,
              location: primaryDefect.location,
              bounding_box: "not_available_without_vision_model",
              confidence: primaryDefect.confidence,
            },
          ]
        : [],
      image_quality: getImageQuality(input),
      reasoning: primaryDefect
        ? `Local fallback detected a ${primaryDefect.type} signal from supplied image URL or metadata.`
        : "No defect keywords were detected in the supplied image URL or metadata.",
    },
  };
}

function normalizeVisionStageOutput(inspectionSummary) {
  const primaryDefect = inspectionSummary.defects_detected[0]
    ? {
        type: inspectionSummary.defects_detected[0].defect_type,
        location: inspectionSummary.defects_detected[0].location,
        confidence: inspectionSummary.defects_detected[0].confidence,
      }
    : null;

  const signal = [
    inspectionSummary.reasoning,
    ...inspectionSummary.defects_detected.map((defect) => defect.defect_type),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return {
    signal,
    primaryDefect,
    inspection_summary: inspectionSummary,
  };
}

function getImageQuality(input) {
  if (input.image_base64) {
    return "uploaded_image_available";
  }

  if (input.image_url) {
    return "image_url_available";
  }

  return "missing";
}

function detectDefect(signal) {
  const defectRules = [
    ["crack", "surface crack", "upper surface", 0.86],
    ["fracture", "surface crack", "edge region", 0.85],
    ["corrosion", "corrosion", "outer face", 0.84],
    ["rust", "corrosion", "outer face", 0.82],
    ["misalignment", "misalignment", "mounting axis", 0.81],
    ["weld", "weld defect", "weld seam", 0.8],
    ["missing", "missing feature", "feature zone", 0.83],
    ["contamination", "contamination", "surface area", 0.78],
    ["scratch", "scratch", "visible surface", 0.77],
    ["dent", "dimensional deviation", "impact zone", 0.79],
    ["tolerance", "dimensional deviation", "measurement profile", 0.76],
  ];

  const match = defectRules.find(([keyword]) => signal.includes(keyword));

  if (!match) {
    return null;
  }

  return {
    type: match[1],
    location: match[2],
    confidence: match[3],
  };
}
