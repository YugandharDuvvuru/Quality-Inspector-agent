export function runSeverityClassifierAgent(visionResult) {
  const { primaryDefect, signal } = visionResult;

  if (!primaryDefect) {
    return {
      severity: "MINOR",
      standard_reference: "ISO 9001: evidence-based inspection record",
      verdict: "PASS",
      confidence: 0.82,
    };
  }

  const criticalSignals = ["crack", "fracture", "safety", "critical", "leak"];
  const majorSignals = ["corrosion", "weld", "missing", "misalignment", "tolerance"];
  const isCritical = criticalSignals.some((keyword) => signal.includes(keyword));
  const isMajor = majorSignals.some((keyword) => signal.includes(keyword));

  if (isCritical) {
    return {
      severity: "CRITICAL",
      standard_reference: "IATF 16949: control of nonconforming output and customer safety risk",
      verdict: "REJECT",
      confidence: Math.max(primaryDefect.confidence, 0.86),
    };
  }

  if (isMajor) {
    return {
      severity: "MAJOR",
      standard_reference: "ISO 9001: nonconforming output requiring containment and correction",
      verdict: "REWORK",
      confidence: Math.max(primaryDefect.confidence, 0.8),
    };
  }

  return {
    severity: "MINOR",
    standard_reference: "ISO 9001: correction and monitored acceptance criteria",
    verdict: "REWORK",
    confidence: primaryDefect.confidence,
  };
}
