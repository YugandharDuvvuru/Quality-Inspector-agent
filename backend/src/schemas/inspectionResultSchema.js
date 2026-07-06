import { z } from "zod";

const confidenceSchema = z.coerce.number().min(0).max(1);

const textSchema = z.preprocess((value) => {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}, z.string());

const nonEmptyTextSchema = textSchema.pipe(z.string().min(1));

const upperEnum = (values) =>
  z.preprocess((value) => String(value || "").toUpperCase(), z.enum(values));

const booleanSchema = z.preprocess((value) => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return value.toLowerCase() === "true";
  }

  return Boolean(value);
}, z.boolean());

export const inspectionResultSchema = z.object({
  component_id: nonEmptyTextSchema,
  inspection_summary: z.object({
    defects_detected: z
      .array(
        z.object({
          defect_type: nonEmptyTextSchema,
          location: textSchema,
          bounding_box: textSchema,
          confidence: confidenceSchema,
        })
      )
      .default([]),
    image_quality: nonEmptyTextSchema,
    reasoning: nonEmptyTextSchema,
  }),
  severity_assessment: z.object({
    severity: upperEnum(["CRITICAL", "MAJOR", "MINOR"]),
    standard_reference: nonEmptyTextSchema,
    verdict: upperEnum(["PASS", "REWORK", "REJECT"]),
    confidence: confidenceSchema,
  }),
  root_cause_analysis: z.object({
    root_cause: nonEmptyTextSchema,
    recurrence_risk: upperEnum(["LOW", "MEDIUM", "HIGH"]),
    recommended_actions: z
      .array(
        z.object({
          action: nonEmptyTextSchema,
          owner: nonEmptyTextSchema,
          timeline: nonEmptyTextSchema,
        })
      )
      .min(1),
  }),
  final_decision: z.object({
    final_decision: upperEnum(["PASS", "REWORK", "REJECT"]),
    line_action: nonEmptyTextSchema,
    batch_action: nonEmptyTextSchema,
    human_override_required: booleanSchema,
    justification: nonEmptyTextSchema,
  }),
  notifications: z.object({
    ncr_report: textSchema,
    notifications_sent: z.array(textSchema).default([]),
    copq_estimate: textSchema,
    audit_log: nonEmptyTextSchema,
  }),
  confidence_score: confidenceSchema,
});

export function validateInspectionResult(result) {
  const parsed = inspectionResultSchema.safeParse(result);

  if (parsed.success) {
    return parsed.data;
  }

  const validationError = new Error("Bedrock response failed inspection result validation");
  validationError.details = parsed.error.flatten();
  throw validationError;
}
