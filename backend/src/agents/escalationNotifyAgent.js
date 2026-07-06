export function runEscalationNotifyAgent(input, finalDecision, severityAssessment) {
  const shouldEscalate =
    severityAssessment.severity === "CRITICAL" || finalDecision.final_decision === "REJECT";

  return {
    ncr_report: shouldEscalate
      ? `NCR-${input.component_id}-${Date.now()}: ${severityAssessment.severity} issue at ${input.inspection_station}.`
      : "NCR not required for current disposition.",
    notifications_sent: shouldEscalate
      ? ["Quality Engineer", "Line Supervisor", "Supplier Portal"]
      : ["Quality Inspector"],
    copq_estimate: shouldEscalate ? "High - scrap, downtime, and containment cost expected" : "Low",
    audit_log: `Inspection recorded for component ${input.component_id} on line ${input.line_id}.`,
  };
}
