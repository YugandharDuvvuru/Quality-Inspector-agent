import { randomUUID } from "crypto";
import { env } from "../config/env.js";
import { isDatabaseReady } from "../db/connection.js";
import {
  deleteInspectionsByTraceIdsFromDatabase,
  getInspectionByTraceIdFromDatabase,
  getLatestInspectionByComponentIdFromDatabase,
  getLatestInspectionReportDataByComponentIdFromDatabase,
  getInspectionReportDataByTraceIdFromDatabase,
  listLatestInspectionsFromDatabase,
  saveInspectionToDatabase,
} from "../repositories/inspectionRepository.js";
import {
  executeEnterpriseIntegrations,
  getEnterpriseIntegrationStatus,
} from "./enterpriseIntegrationService.js";
import { runQualityInspectionWorkflow } from "./qualityWorkflowGraph.js";
import { prepareInspectionImageInput } from "./s3ImageService.js";

const CONFIDENCE_THRESHOLD = 0.75;

export async function listInspections(viewer) {
  if (!isDatabaseReady()) {
    console.warn("[database] inspection history requested while Postgres is not ready");
    return [];
  }

  try {
    return await listLatestInspectionsFromDatabase(viewer);
  } catch (error) {
    console.error(`[database] failed to list inspections. reason=${error.message}`);
    return [];
  }
}

export async function getInspectionByComponentId(componentId, viewer) {
  if (!isDatabaseReady()) {
    console.warn(
      `[database] inspection lookup requested for component=${componentId} while Postgres is not ready`
    );
    return null;
  }

  try {
    return await getLatestInspectionByComponentIdFromDatabase(componentId, viewer);
  } catch (error) {
    console.error(
      `[database] failed to load inspection for component=${componentId}. reason=${error.message}`
    );
    return null;
  }
}

export async function getInspectionByTraceId(traceId, viewer) {
  if (!isDatabaseReady()) {
    console.warn(`[database] inspection lookup requested for trace=${traceId} while Postgres is not ready`);
    return null;
  }

  try {
    return await getInspectionByTraceIdFromDatabase(traceId, viewer);
  } catch (error) {
    console.error(`[database] failed to load inspection for trace=${traceId}. reason=${error.message}`);
    return null;
  }
}

export async function getInspectionReportDataByComponentId(componentId, viewer) {
  if (!isDatabaseReady()) {
    console.warn(
      `[database] inspection report requested for component=${componentId} while Postgres is not ready`
    );
    return null;
  }

  try {
    return await getLatestInspectionReportDataByComponentIdFromDatabase(componentId, viewer);
  } catch (error) {
    console.error(
      `[database] failed to load inspection report data for component=${componentId}. reason=${error.message}`
    );
    return null;
  }
}

export async function getInspectionReportDataByTraceId(traceId, viewer) {
  if (!isDatabaseReady()) {
    console.warn(`[database] inspection report requested for trace=${traceId} while Postgres is not ready`);
    return null;
  }

  try {
    return await getInspectionReportDataByTraceIdFromDatabase(traceId, viewer);
  } catch (error) {
    console.error(
      `[database] failed to load inspection report data for trace=${traceId}. reason=${error.message}`
    );
    return null;
  }
}

export async function deleteInspectionsByTraceIds(traceIds) {
  if (!isDatabaseReady()) {
    const error = new Error("Inspection database is not ready");
    error.statusCode = 503;
    throw error;
  }

  try {
    return await deleteInspectionsByTraceIdsFromDatabase(traceIds);
  } catch (error) {
    console.error(`[database] failed to delete inspections. reason=${error.message}`);
    throw error;
  }
}

export async function runInspection(input, viewer) {
  const preparedInput = await prepareInspectionImageInput(input);

  console.log(
    `[inspection] component=${preparedInput.component_id} bedrockEnabled=${env.BEDROCK_ENABLED}`
  );

  const { result, workflowMetadata } = await runQualityInspectionWorkflow({
    input: preparedInput,
    confidenceThreshold: CONFIDENCE_THRESHOLD,
    bedrockEnabled: env.BEDROCK_ENABLED,
  });
  const enterpriseIntegrations = await executeEnterpriseIntegrations({
    input: preparedInput,
    result,
  });

  const storedResult = {
    ...result,
    trace_id: randomUUID(),
    created_at: new Date().toISOString(),
    agentic_loop: ["PERCEIVE", "PLAN", "ACT", "EVALUATE"],
    enterprise_integrations: enterpriseIntegrations,
  };

  if (isDatabaseReady()) {
    try {
      await saveInspectionToDatabase({
        input: preparedInput,
        result: storedResult,
        createdByUserId: viewer?.id,
        workflowMetadata: {
          ...workflowMetadata,
          enterpriseIntegrations,
        },
      });
    } catch (error) {
      console.error(
        `[database] failed to persist inspection for component=${preparedInput.component_id}. reason=${error.message}`
      );
    }
  } else {
    console.warn(
      `[database] inspection completed for component=${preparedInput.component_id}, but Postgres is not ready so no history was stored`
    );
  }

  return storedResult;
}

export function getIntegrationReadiness() {
  return getEnterpriseIntegrationStatus();
}
