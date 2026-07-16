import { query, withTransaction } from "../db/connection.js";

export async function listLatestInspectionsFromDatabase(viewer) {
  const { whereClause, values } = buildViewerScope(viewer, "req");
  const result = await query(
    `
      SELECT
        ir.trace_id,
        ir.raw_response,
        ir.created_at
      FROM inspection_results ir
      JOIN inspection_requests req ON req.id = ir.inspection_request_id
      ${whereClause}
      ORDER BY ir.created_at DESC
      LIMIT 100
    `,
    values
  );

  return result.rows.map((row) => ({
    ...row.raw_response,
    trace_id: row.raw_response?.trace_id || row.trace_id,
    created_at: row.raw_response?.created_at || row.created_at,
  }));
}

export async function getLatestInspectionByComponentIdFromDatabase(componentId, viewer) {
  const { whereClause, values } = buildViewerScope(viewer, "req", [componentId]);
  const result = await query(
    `
      SELECT ir.trace_id, ir.raw_response, ir.created_at
      FROM inspection_results ir
      JOIN inspection_requests req ON req.id = ir.inspection_request_id
      JOIN components c ON c.id = req.component_id
      WHERE c.component_code = $1
      ${whereClause ? `AND ${whereClause.replace(/^WHERE\s+/i, "")}` : ""}
      ORDER BY ir.created_at DESC
      LIMIT 1
    `,
    values
  );

  return normalizeInspectionResultRow(result.rows[0]);
}

export async function getInspectionByTraceIdFromDatabase(traceId, viewer) {
  const { whereClause, values } = buildViewerScope(viewer, "req", [traceId]);
  const result = await query(
    `
      SELECT ir.trace_id, ir.raw_response, ir.created_at
      FROM inspection_results ir
      JOIN inspection_requests req ON req.id = ir.inspection_request_id
      WHERE ir.trace_id = $1
      ${whereClause ? `AND ${whereClause.replace(/^WHERE\s+/i, "")}` : ""}
      LIMIT 1
    `,
    values
  );

  return normalizeInspectionResultRow(result.rows[0]);
}

export async function getLatestInspectionReportDataByComponentIdFromDatabase(componentId, viewer) {
  const { whereClause, values } = buildViewerScope(viewer, "req", [componentId]);
  const result = await query(
    `
      ${REPORT_DATA_SELECT}
      FROM inspection_results ir
      JOIN inspection_requests req ON req.id = ir.inspection_request_id
      JOIN components c ON c.id = req.component_id
      WHERE c.component_code = $1
      ${whereClause ? `AND ${whereClause.replace(/^WHERE\s+/i, "")}` : ""}
      ORDER BY ir.created_at DESC
      LIMIT 1
    `,
    values
  );

  return normalizeReportDataRow(result.rows[0]);
}

export async function getInspectionReportDataByTraceIdFromDatabase(traceId, viewer) {
  const { whereClause, values } = buildViewerScope(viewer, "req", [traceId]);
  const result = await query(
    `
      ${REPORT_DATA_SELECT}
      FROM inspection_results ir
      JOIN inspection_requests req ON req.id = ir.inspection_request_id
      JOIN components c ON c.id = req.component_id
      WHERE ir.trace_id = $1
      ${whereClause ? `AND ${whereClause.replace(/^WHERE\s+/i, "")}` : ""}
      LIMIT 1
    `,
    values
  );

  return normalizeReportDataRow(result.rows[0]);
}

export async function deleteInspectionsByTraceIdsFromDatabase(traceIds) {
  if (!traceIds.length) {
    return { deleted_count: 0, deleted_trace_ids: [] };
  }

  return withTransaction(async (client) => {
    const result = await client.query(
      `
        DELETE FROM inspection_results
        WHERE trace_id = ANY($1::text[])
        RETURNING trace_id, inspection_request_id
      `,
      [traceIds]
    );
    const deletedRequestIds = result.rows.map((row) => row.inspection_request_id).filter(Boolean);

    if (deletedRequestIds.length) {
      await client.query(
        `
          DELETE FROM inspection_requests req
          WHERE req.id = ANY($1::bigint[])
            AND NOT EXISTS (
              SELECT 1
              FROM inspection_results ir
              WHERE ir.inspection_request_id = req.id
            )
        `,
        [deletedRequestIds]
      );
    }

    return {
      deleted_count: result.rowCount,
      deleted_trace_ids: result.rows.map((row) => row.trace_id),
    };
  });
}

export async function saveInspectionToDatabase({ input, result, workflowMetadata = {}, createdByUserId = null }) {
  return withTransaction(async (client) => {
    const componentId = await upsertComponent(client, input);
    const inspectionRequestId = await insertInspectionRequest(client, componentId, input, createdByUserId);
    const inspectionResultId = await insertInspectionResult(client, inspectionRequestId, result);

    await insertDefects(client, inspectionResultId, result);
    await insertRecommendedActions(client, inspectionResultId, result);
    await insertNotifications(client, inspectionResultId, input, result);
    await insertNcrReport(client, inspectionResultId, result);
    await insertAuditLog(client, inspectionResultId, input, result);
    await insertBedrockInteractionRecords(
      client,
      inspectionResultId,
      workflowMetadata.bedrockInteractions || []
    );
    await insertEnterpriseIntegrationSubmissions(
      client,
      inspectionResultId,
      workflowMetadata.enterpriseIntegrations || []
    );

    return result;
  });
}

async function upsertComponent(client, input) {
  const result = await client.query(
    `
      INSERT INTO components (component_code, material, supplier, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (component_code)
      DO UPDATE SET
        material = COALESCE(EXCLUDED.material, components.material),
        supplier = COALESCE(EXCLUDED.supplier, components.supplier),
        updated_at = NOW()
      RETURNING id
    `,
    [input.component_id, valueOrNull(input.metadata?.material), valueOrNull(input.metadata?.supplier)]
  );

  return result.rows[0].id;
}

async function insertInspectionRequest(client, componentId, input, createdByUserId) {
  const result = await client.query(
    `
      INSERT INTO inspection_requests (
        component_id,
        created_by_user_id,
        inspection_station,
        line_id,
        image_url,
        image_storage_provider,
        image_s3_bucket,
        image_s3_key,
        image_s3_uri,
        image_file_name,
        image_media_type,
        inspection_timestamp,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)
      RETURNING id
    `,
    [
      componentId,
      valueOrNull(createdByUserId),
      input.inspection_station,
      input.line_id,
      valueOrNull(input.image_url),
      valueOrNull(input.image_storage_provider),
      valueOrNull(input.image_s3_bucket),
      valueOrNull(input.image_s3_key),
      valueOrNull(input.image_s3_uri),
      valueOrNull(input.image_file_name),
      valueOrNull(input.image_media_type),
      input.timestamp,
      JSON.stringify(input.metadata || {}),
    ]
  );

  return result.rows[0].id;
}

async function insertInspectionResult(client, inspectionRequestId, result) {
  const resultRow = await client.query(
    `
      INSERT INTO inspection_results (
        inspection_request_id,
        trace_id,
        source,
        overall_confidence,
        severity,
        verdict,
        line_action,
        batch_action,
        human_override_required,
        justification,
        fallback_reason,
        raw_response,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13)
      RETURNING id
    `,
    [
      inspectionRequestId,
      result.trace_id,
      result.source,
      result.confidence_score,
      valueOrNull(result.severity_assessment?.severity),
      valueOrNull(result.final_decision?.final_decision),
      valueOrNull(result.final_decision?.line_action),
      valueOrNull(result.final_decision?.batch_action),
      Boolean(result.final_decision?.human_override_required),
      valueOrNull(result.final_decision?.justification),
      valueOrNull(result.fallback_reason),
      JSON.stringify(result),
      result.created_at,
    ]
  );

  return resultRow.rows[0].id;
}

async function insertDefects(client, inspectionResultId, result) {
  const defects = result.inspection_summary?.defects_detected || [];

  for (const defect of defects) {
    await client.query(
      `
        INSERT INTO detected_defects (
          inspection_result_id,
          defect_type,
          location,
          bounding_box,
          confidence,
          severity
        )
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        inspectionResultId,
        defect.defect_type,
        valueOrNull(defect.location),
        valueOrNull(defect.bounding_box),
        defect.confidence,
        valueOrNull(result.severity_assessment?.severity),
      ]
    );
  }
}

async function insertRecommendedActions(client, inspectionResultId, result) {
  const actions = result.root_cause_analysis?.recommended_actions || [];

  for (const action of actions) {
    await client.query(
      `
        INSERT INTO recommended_actions (
          inspection_result_id,
          action,
          owner,
          timeline
        )
        VALUES ($1, $2, $3, $4)
      `,
      [inspectionResultId, action.action, action.owner, action.timeline]
    );
  }
}

async function insertNotifications(client, inspectionResultId, input, result) {
  const recipients = result.notifications?.notifications_sent || [];
  const verdict = result.final_decision?.final_decision || "UNKNOWN";

  for (const recipient of recipients) {
    await client.query(
      `
        INSERT INTO notifications (
          inspection_result_id,
          notification_type,
          recipient,
          message,
          delivery_status
        )
        VALUES ($1, $2, $3, $4, $5)
      `,
      [
        inspectionResultId,
        "QUALITY_ALERT",
        recipient,
        `Component ${input.component_id} received ${verdict} at station ${input.inspection_station}.`,
        "QUEUED",
      ]
    );
  }
}

async function insertNcrReport(client, inspectionResultId, result) {
  const reportText = result.notifications?.ncr_report || "NCR not required for current disposition.";
  const requiresEscalation =
    result.severity_assessment?.severity === "CRITICAL" ||
    result.final_decision?.final_decision === "REJECT" ||
    Boolean(result.final_decision?.human_override_required) ||
    requiresContainment(result.final_decision);

  await client.query(
    `
      INSERT INTO ncr_reports (
        inspection_result_id,
        ncr_number,
        report_text,
        copq_estimate,
        status
      )
      VALUES ($1, $2, $3, $4, $5)
    `,
    [
      inspectionResultId,
      extractNcrNumber(reportText),
      reportText,
      valueOrNull(result.notifications?.copq_estimate),
      requiresEscalation ? "OPEN" : "GENERATED",
    ]
  );
}

async function insertAuditLog(client, inspectionResultId, input, result) {
  await client.query(
    `
      INSERT INTO inspection_audit_log (
        inspection_result_id,
        event_type,
        event_details
      )
      VALUES ($1, $2, $3::jsonb)
    `,
    [
      inspectionResultId,
      "INSPECTION_COMPLETED",
      JSON.stringify({
        component_id: input.component_id,
        line_id: input.line_id,
        inspection_station: input.inspection_station,
        source: result.source,
        verdict: result.final_decision?.final_decision,
        confidence_score: result.confidence_score,
        audit_log: result.notifications?.audit_log,
        agentic_loop: result.agentic_loop || [],
      }),
    ]
  );
}

async function insertBedrockInteractionRecords(client, inspectionResultId, interactions) {
  for (const interaction of interactions) {
    await client.query(
      `
        INSERT INTO bedrock_interaction_records (
          inspection_result_id,
          stage_name,
          model_id,
          region,
          prompt_text,
          response_text,
          success,
          skipped,
          error_summary
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
      [
        inspectionResultId,
        interaction.stage_name,
        valueOrNull(interaction.model_id),
        valueOrNull(interaction.region),
        valueOrNull(interaction.prompt_text),
        valueOrNull(interaction.response_text),
        Boolean(interaction.success),
        Boolean(interaction.skipped),
        valueOrNull(interaction.error_summary),
      ]
    );
  }
}

async function insertEnterpriseIntegrationSubmissions(client, inspectionResultId, submissions) {
  for (const submission of submissions) {
    await client.query(
      `
        INSERT INTO enterprise_integration_submissions (
          inspection_result_id,
          system_name,
          submission_status,
          skipped_flag,
          external_reference,
          request_payload,
          response_payload,
          error_detail
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8)
      `,
      [
        inspectionResultId,
        submission.system_name,
        submission.submission_status,
        Boolean(submission.skipped_flag),
        valueOrNull(submission.external_reference),
        JSON.stringify(submission.request_payload || {}),
        JSON.stringify(submission.response_payload || {}),
        valueOrNull(submission.error_detail),
      ]
    );
  }
}

function extractNcrNumber(reportText) {
  const [firstToken] = reportText.split(":");
  return firstToken || null;
}

function requiresContainment(finalDecision = {}) {
  const decisionText = [
    finalDecision.line_action,
    finalDecision.batch_action,
    finalDecision.justification,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return /\b(stop|pause|hold|quarantine|contain|segregat|block|isolate|suspend|100%|one hundred)\b/.test(
    decisionText
  );
}

function buildViewerScope(viewer, requestAlias, initialValues = []) {
  const role = String(viewer?.role || "").toUpperCase();

  if (role === "ADMIN") {
    return {
      whereClause: "",
      values: initialValues,
    };
  }

  return {
    whereClause: `WHERE ${requestAlias}.created_by_user_id = $${initialValues.length + 1}`,
    values: [...initialValues, viewer?.id],
  };
}

function valueOrNull(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return value;
}

const REPORT_DATA_SELECT = `
  SELECT
    ir.trace_id,
    c.component_code,
    c.material AS component_material,
    c.supplier AS component_supplier,
    req.inspection_station,
    req.line_id,
    req.image_url,
    req.image_storage_provider,
    req.image_s3_bucket,
    req.image_s3_key,
    req.image_s3_uri,
    req.image_file_name,
    req.image_media_type,
    req.inspection_timestamp,
    req.metadata,
    ir.raw_response,
    ir.created_at
`;

function normalizeInspectionResultRow(row) {
  if (!row) {
    return null;
  }

  return {
    ...row.raw_response,
    trace_id: row.raw_response?.trace_id || row.trace_id,
    created_at: row.raw_response?.created_at || row.created_at,
  };
}

function normalizeReportDataRow(row) {
  if (!row) {
    return null;
  }

  const metadata = row.metadata || {};

  return {
    request: {
      component_id: row.component_code,
      image_url: row.image_s3_uri || row.image_url || "",
      image_storage_provider: row.image_storage_provider,
      image_s3_bucket: row.image_s3_bucket,
      image_s3_key: row.image_s3_key,
      image_s3_uri: row.image_s3_uri,
      image_file_name: row.image_file_name,
      image_media_type: row.image_media_type,
      inspection_station: row.inspection_station,
      timestamp: row.inspection_timestamp,
      line_id: row.line_id,
      metadata: {
        material: metadata.material || row.component_material || "",
        supplier: metadata.supplier || row.component_supplier || "",
        batch_number: metadata.batch_number || "",
        dimensions: metadata.dimensions || "",
        tolerance_range: metadata.tolerance_range || "",
        notes: metadata.notes || "",
      },
    },
    result: {
      ...row.raw_response,
      trace_id: row.raw_response?.trace_id || row.trace_id,
      created_at: row.raw_response?.created_at || row.created_at,
    },
  };
}
