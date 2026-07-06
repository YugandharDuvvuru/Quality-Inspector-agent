export function runDecisionActionAgent(visionResult, severityAssessment, confidenceThreshold) {
  const confidenceScore = visionResult.primaryDefect ? severityAssessment.confidence : 0.82;

  return {
    final_decision: {
      ...decideDisposition(visionResult.primaryDefect, severityAssessment),
      human_override_required: confidenceScore < confidenceThreshold,
    },
    confidence_score: confidenceScore,
  };
}

function decideDisposition(primaryDefect, severityAssessment) {
  if (!primaryDefect) {
    return {
      final_decision: "PASS",
      line_action: "Continue",
      batch_action: "Release",
      justification: "No defects were detected from the available inspection data.",
    };
  }

  if (severityAssessment.severity === "CRITICAL") {
    return {
      final_decision: "REJECT",
      line_action: "Stop",
      batch_action: "Hold",
      justification:
        "Critical defect signal requires containment, rejection, and human quality review.",
    };
  }

  if (severityAssessment.severity === "MAJOR") {
    return {
      final_decision: "REWORK",
      line_action: "Pause",
      batch_action: "Quarantine sample",
      justification:
        "Major defect signal requires correction before release and additional batch sampling.",
    };
  }

  return {
    final_decision: "REWORK",
    line_action: "Continue",
    batch_action: "Monitor",
    justification: "Minor defect signal can be corrected with continued process monitoring.",
  };
}
