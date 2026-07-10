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

const defectSchema = z.object({
  defect_type: nonEmptyTextSchema,
  location: textSchema,
  bounding_box: textSchema,
  confidence: confidenceSchema,
});

const recommendedActionSchema = z.object({
  action: nonEmptyTextSchema,
  owner: nonEmptyTextSchema,
  timeline: nonEmptyTextSchema,
});

export const inspectionSummarySchema = z.object({
  defects_detected: z.array(defectSchema).default([]),
  image_quality: nonEmptyTextSchema,
  reasoning: nonEmptyTextSchema,
});

export const severityAssessmentSchema = z.object({
  severity: upperEnum(["CRITICAL", "MAJOR", "MINOR"]),
  standard_reference: nonEmptyTextSchema,
  verdict: upperEnum(["PASS", "REWORK", "REJECT"]),
  confidence: confidenceSchema,
  reasoning: nonEmptyTextSchema,
});

export const rootCauseAnalysisSchema = z.object({
  root_cause: nonEmptyTextSchema,
  recurrence_risk: upperEnum(["LOW", "MEDIUM", "HIGH"]),
  recommended_actions: z.array(recommendedActionSchema).min(1),
  reasoning: nonEmptyTextSchema,
});

export const finalDecisionSchema = z.object({
  final_decision: upperEnum(["PASS", "REWORK", "REJECT"]),
  line_action: nonEmptyTextSchema,
  batch_action: nonEmptyTextSchema,
  human_override_required: booleanSchema,
  justification: nonEmptyTextSchema,
});

export const notificationsSchema = z.object({
  ncr_report: textSchema,
  notifications_sent: z.array(textSchema).default([]),
  supplier_updates: z.array(textSchema).default([]),
  copq_estimate: textSchema,
  audit_log: nonEmptyTextSchema,
});

export const decisionStageSchema = z.object({
  final_decision: finalDecisionSchema,
  confidence_score: confidenceSchema,
});

export const inspectionResultSchema = z.object({
  component_id: nonEmptyTextSchema,
  inspection_summary: inspectionSummarySchema,
  severity_assessment: severityAssessmentSchema,
  root_cause_analysis: rootCauseAnalysisSchema,
  final_decision: finalDecisionSchema,
  notifications: notificationsSchema,
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

export function validateInspectionSummaryStage(result) {
  return validateStageResult(
    z.object({ inspection_summary: inspectionSummarySchema }),
    result,
    "Vision Inspector Agent response failed validation"
  ).inspection_summary;
}

export function validateSeverityAssessmentStage(result) {
  return validateStageResult(
    z.object({ severity_assessment: severityAssessmentSchema }),
    result,
    "Severity Classifier Agent response failed validation"
  ).severity_assessment;
}

export function validateRootCauseAnalysisStage(result) {
  return validateStageResult(
    z.object({ root_cause_analysis: rootCauseAnalysisSchema }),
    result,
    "Root Cause Analyst Agent response failed validation"
  ).root_cause_analysis;
}

export function validateDecisionStage(result) {
  return validateStageResult(
    decisionStageSchema,
    result,
    "Decision & Action Agent response failed validation"
  );
}

export function validateNotificationsStage(result) {
  return validateStageResult(
    z.object({ notifications: notificationsSchema }),
    result,
    "Escalation & Notify Agent response failed validation"
  ).notifications;
}

function validateStageResult(schema, result, message) {
  const parsed = schema.safeParse(result);

  if (parsed.success) {
    return parsed.data;
  }

  const validationError = new Error(message);
  validationError.details = parsed.error.flatten();
  throw validationError;
}
