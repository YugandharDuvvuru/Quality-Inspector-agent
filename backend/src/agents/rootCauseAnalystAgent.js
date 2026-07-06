export function runRootCauseAnalystAgent(visionResult, severityAssessment) {
  const { primaryDefect } = visionResult;

  if (!primaryDefect) {
    return {
      root_cause: "No defect detected from available data",
      recurrence_risk: "LOW",
      recommended_actions: [
        {
          action: "Continue normal inspection sampling",
          owner: "Quality Inspector",
          timeline: "Current shift",
        },
      ],
    };
  }

  const causeByDefect = {
    "surface crack": "Material fatigue or machine calibration issue",
    corrosion: "Material handling, storage humidity, or supplier surface treatment issue",
    misalignment: "Fixture setup drift or operator loading variation",
    "weld defect": "Welding parameter deviation or tooling wear",
    "missing feature": "Process skip, tooling issue, or upstream assembly miss",
    contamination: "Insufficient cleaning or foreign material control gap",
    scratch: "Handling damage or conveyor contact",
    "dimensional deviation": "Tool wear, thermal variation, or calibration drift",
  };

  return {
    root_cause: causeByDefect[primaryDefect.type] || "Process variation requiring investigation",
    recurrence_risk: severityAssessment.severity === "CRITICAL" ? "HIGH" : "MEDIUM",
    recommended_actions: [
      {
        action: "Contain affected parts and verify last known good batch",
        owner: "Line Supervisor",
        timeline: "Immediate",
      },
      {
        action: "Perform root-cause validation and update control plan",
        owner: "Quality Engineer",
        timeline: "24 hours",
      },
    ],
  };
}
