const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const PAGE_MARGIN = 42;
const REGULAR_FONT = "F1";
const BOLD_FONT = "F2";

export function generateNcrReportPdf({ request, result }) {
  const builder = new PdfBuilder();
  const componentId = result?.component_id || request?.component_id || "UNKNOWN";
  const createdAt = result?.created_at || request?.timestamp || new Date().toISOString();
  const severity = result?.severity_assessment || {};
  const decision = result?.final_decision || {};
  const inspection = result?.inspection_summary || {};
  const rootCause = result?.root_cause_analysis || {};
  const notifications = result?.notifications || {};
  const defects = inspection.defects_detected || [];
  const actions = rootCause.recommended_actions || [];
  const integrations = result?.enterprise_integrations || [];
  const reportNumber = buildReportNumber(componentId, createdAt, notifications.ncr_report);

  builder.title("Non-Conformance Report");
  builder.text("Agentic AI Powered Manufacturing Component Quality Inspector", {
    size: 10,
    color: "muted",
  });
  builder.rule();

  builder.section("Report Summary");
  builder.field("Report Number", reportNumber);
  builder.field("Trace ID", result?.trace_id || "-");
  builder.field("Component ID", componentId);
  builder.field("Generated At", formatDate(createdAt));
  builder.field("Inspection Source", sourceLabel(result?.source));
  builder.field("Final Disposition", decision.final_decision || "-");
  builder.field("Severity", severity.severity || "-");
  builder.field("Overall Confidence", formatPercent(result?.confidence_score));
  builder.field("Human Review", decision.human_override_required ? "Required" : "Not Required");

  builder.section("Inspection Request");
  builder.field("Line", request?.line_id || "-");
  builder.field("Inspection Station", request?.inspection_station || "-");
  builder.field("Inspection Timestamp", formatDate(request?.timestamp));
  builder.field("Material", request?.metadata?.material || "-");
  builder.field("Supplier", request?.metadata?.supplier || "-");
  builder.field("Batch", request?.metadata?.batch_number || "-");
  builder.field("Dimensions", request?.metadata?.dimensions || "-");
  builder.field("Tolerance", request?.metadata?.tolerance_range || "-");
  builder.field("Image Reference", buildImageReference(request, result));
  builder.field("Inspection Notes", request?.metadata?.notes || "-");

  builder.section("Vision Inspection Findings");

  if (defects.length) {
    defects.forEach((defect, index) => {
      builder.field(
        `Defect ${index + 1}`,
        [
          `Type: ${toTitle(defect.defect_type)}`,
          `Location: ${toTitle(defect.location)}`,
          `Bounding Box: ${defect.bounding_box || "Not available"}`,
          `Confidence: ${formatPercent(defect.confidence)}`,
        ].join(" | ")
      );
    });
  } else {
    builder.text("No visible defects were reported by the vision stage.");
  }

  builder.field("Image Quality", inspection.image_quality || "-");
  builder.field("Vision Reasoning", inspection.reasoning || "-");

  builder.section("Severity Classification");
  builder.field("Severity", severity.severity || "-");
  builder.field("Verdict", severity.verdict || decision.final_decision || "-");
  builder.field("Severity Confidence", formatPercent(severity.confidence));
  builder.field("Standard Reference", severity.standard_reference || "-");
  builder.field("Reasoning", severity.reasoning || decision.justification || "-");

  builder.section("Root Cause And Corrective Actions");
  builder.field("Probable Root Cause", rootCause.root_cause || "-");
  builder.field("Recurrence Risk", rootCause.recurrence_risk || "-");

  if (actions.length) {
    actions.forEach((action, index) => {
      builder.field(
        `Action ${index + 1}`,
        [
          `Owner: ${action.owner || "-"}`,
          `Timeline: ${action.timeline || "-"}`,
          `Action: ${action.action || "-"}`,
        ].join(" | ")
      );
    });
  } else {
    builder.text("No corrective actions were generated.");
  }

  builder.section("Decision And Containment");
  builder.field("Part Disposition", decision.final_decision || "-");
  builder.field("Line Action", decision.line_action || "-");
  builder.field("Batch Action", decision.batch_action || "-");
  builder.field("Justification", decision.justification || "-");

  builder.section("Escalation And Notifications");
  builder.field("NCR Summary", notifications.ncr_report || "-");
  builder.field("Notification Targets", formatList(notifications.notifications_sent));
  builder.field("COPQ Estimate", notifications.copq_estimate || "-");
  builder.field("Audit Log", notifications.audit_log || "-");

  builder.section("Enterprise Integration Status");

  if (integrations.length) {
    integrations.forEach((integration) => {
      builder.field(
        integration.system_name || "Integration",
        [
          `Status: ${integration.submission_status || "-"}`,
          `External Reference: ${integration.external_reference || "-"}`,
          `Error: ${integration.error_detail || "-"}`,
        ].join(" | ")
      );
    });
  } else {
    builder.text("No enterprise integration status was returned.");
  }

  builder.section("Traceability");
  builder.field("Agentic Loop", formatList(result?.agentic_loop));
  builder.field("Fallback Reason", result?.fallback_reason || "-");

  return builder.toBuffer();
}

export function buildNcrReportFilename({ request, result }) {
  const componentId = sanitizeFilenamePart(result?.component_id || request?.component_id || "UNKNOWN");
  const traceId = sanitizeFilenamePart(result?.trace_id || "NO-TRACE");
  const createdAt = result?.created_at || request?.timestamp || new Date().toISOString();
  const datePart = sanitizeFilenamePart(String(createdAt).slice(0, 19).replace(/[:T]/g, "-"));

  return `non_conformance_report_${componentId}_${traceId}_${datePart}.pdf`;
}

class PdfBuilder {
  constructor() {
    this.pages = [];
    this.startPage();
  }

  startPage() {
    this.currentPage = { operations: [] };
    this.pages.push(this.currentPage);
    this.y = PAGE_HEIGHT - PAGE_MARGIN;
  }

  title(value) {
    this.ensureSpace(34);
    this.drawText(value, {
      x: PAGE_MARGIN,
      y: this.y,
      size: 22,
      font: BOLD_FONT,
      color: "primary",
    });
    this.y -= 28;
  }

  section(title) {
    this.y -= 8;
    this.ensureSpace(34);
    this.drawText(title.toUpperCase(), {
      x: PAGE_MARGIN,
      y: this.y,
      size: 11,
      font: BOLD_FONT,
      color: "primary",
    });
    this.y -= 7;
    this.rule();
    this.y -= 7;
  }

  field(label, value) {
    const cleanLabel = normalizeText(label);
    const cleanValue = normalizeText(formatValue(value));
    const maxChars = 95;
    const valueLines = wrapText(cleanValue, maxChars);

    this.ensureSpace(15 + valueLines.length * 12);
    this.drawText(`${cleanLabel}:`, {
      x: PAGE_MARGIN,
      y: this.y,
      size: 9,
      font: BOLD_FONT,
      color: "muted",
    });

    valueLines.forEach((line, index) => {
      this.drawText(line, {
        x: PAGE_MARGIN + 112,
        y: this.y - index * 12,
        size: 9,
        font: REGULAR_FONT,
        color: "primary",
      });
    });

    this.y -= Math.max(16, valueLines.length * 12 + 4);
  }

  text(value, options = {}) {
    const size = options.size || 9;
    const lineHeight = options.lineHeight || size + 4;
    const x = options.x || PAGE_MARGIN;
    const maxChars = options.maxChars || Math.floor((PAGE_WIDTH - PAGE_MARGIN * 2) / (size * 0.54));
    const lines = wrapText(value, maxChars);

    lines.forEach((line) => {
      this.ensureSpace(lineHeight + 2);
      this.drawText(line, {
        x,
        y: this.y,
        size,
        font: options.font || REGULAR_FONT,
        color: options.color || "primary",
      });
      this.y -= lineHeight;
    });
  }

  rule() {
    this.ensureSpace(4);
    this.currentPage.operations.push("0.78 0.84 0.92 RG");
    this.currentPage.operations.push("0.8 w");
    this.currentPage.operations.push(
      `${number(PAGE_MARGIN)} ${number(this.y)} m ${number(PAGE_WIDTH - PAGE_MARGIN)} ${number(this.y)} l S`
    );
    this.y -= 5;
  }

  ensureSpace(requiredHeight) {
    if (this.y - requiredHeight < PAGE_MARGIN + 20) {
      this.startPage();
    }
  }

  drawText(value, options) {
    const color = options.color === "muted" ? "0.33 0.43 0.57 rg" : "0.06 0.13 0.24 rg";

    this.currentPage.operations.push(color);
    this.currentPage.operations.push(
      `BT /${options.font} ${number(options.size)} Tf ${number(options.x)} ${number(options.y)} Td (${escapePdfText(value)}) Tj ET`
    );
  }

  toBuffer() {
    this.addFooters();
    return buildPdfBuffer(this.pages.map((page) => page.operations.join("\n")));
  }

  addFooters() {
    this.pages.forEach((page, index) => {
      const footerText = `Quality Inspector Agent | Page ${index + 1} of ${this.pages.length}`;

      page.operations.push("0.33 0.43 0.57 rg");
      page.operations.push(
        `BT /${REGULAR_FONT} 8 Tf ${number(PAGE_MARGIN)} 24 Td (${escapePdfText(footerText)}) Tj ET`
      );
    });
  }
}

function buildPdfBuffer(pageStreams) {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pageStreams
      .map((_, index) => `${5 + index * 2} 0 R`)
      .join(" ")}] /Count ${pageStreams.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
  ];

  pageStreams.forEach((stream, index) => {
    const pageObjectId = 5 + index * 2;
    const contentObjectId = pageObjectId + 1;

    objects[pageObjectId - 1] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${number(PAGE_WIDTH)} ${number(
        PAGE_HEIGHT
      )}] /Resources << /Font << /${REGULAR_FONT} 3 0 R /${BOLD_FONT} 4 0 R >> >> /Contents ${contentObjectId} 0 R >>`;
    objects[contentObjectId - 1] = `<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`;
  });

  let pdf = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets = [0];

  objects.forEach((body, index) => {
    offsets[index + 1] = Buffer.byteLength(pdf, "binary");
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, "binary");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, "binary");
}

function buildReportNumber(componentId, createdAt, ncrReportText) {
  const ncrMatch = String(ncrReportText || "").match(/\bNCR[-_\w\d]+/i);

  if (ncrMatch) {
    return ncrMatch[0];
  }

  const datePart = String(createdAt || new Date().toISOString()).slice(0, 10).replace(/-/g, "");
  return `NCR-${componentId}-${datePart}`;
}

function buildImageReference(request, result) {
  return (
    result?.image_url ||
    request?.image_s3_uri ||
    request?.image_url ||
    request?.image_file_name ||
    "Not available"
  );
}

function formatDate(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toISOString();
}

function formatPercent(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return "-";
  }

  return `${Math.round(numericValue * 100)}%`;
}

function formatList(value) {
  if (!Array.isArray(value) || !value.length) {
    return "-";
  }

  return value.map((item) => formatValue(item)).join(", ");
}

function formatValue(value) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  if (Array.isArray(value)) {
    return formatList(value);
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

function sourceLabel(source) {
  if (source === "aws-bedrock") return "AWS Bedrock";
  if (source === "hybrid-fallback") return "Hybrid Fallback";
  if (source === "local-fallback") return "Local Fallback";
  return source || "-";
}

function toTitle(value) {
  if (!value) {
    return "-";
  }

  return String(value)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function wrapText(value, maxChars) {
  const text = normalizeText(formatValue(value)).replace(/\s+/g, " ").trim();

  if (!text) {
    return ["-"];
  }

  const words = text.split(" ");
  const lines = [];
  let currentLine = "";

  words.forEach((word) => {
    if (word.length > maxChars) {
      if (currentLine) {
        lines.push(currentLine);
        currentLine = "";
      }

      for (let index = 0; index < word.length; index += maxChars) {
        lines.push(word.slice(index, index + maxChars));
      }

      return;
    }

    const candidate = currentLine ? `${currentLine} ${word}` : word;

    if (candidate.length > maxChars) {
      lines.push(currentLine);
      currentLine = word;
      return;
    }

    currentLine = candidate;
  });

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.length ? lines : ["-"];
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "-");
}

function escapePdfText(value) {
  return normalizeText(value)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function sanitizeFilenamePart(value) {
  return normalizeText(value).replace(/[^a-zA-Z0-9._-]/g, "-") || "UNKNOWN";
}

function number(value) {
  return Number(value).toFixed(2).replace(/\.00$/, "");
}
