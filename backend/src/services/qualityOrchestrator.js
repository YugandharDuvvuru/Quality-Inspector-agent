import { env } from "../config/env.js";
import { isDatabaseReady } from "../db/connection.js";
import {
  getLatestInspectionByComponentIdFromDatabase,
  listLatestInspectionsFromDatabase,
  saveInspectionToDatabase,
} from "../repositories/inspectionRepository.js";
import {
  executeEnterpriseIntegrations,
  getEnterpriseIntegrationStatus,
} from "./enterpriseIntegrationService.js";
import { runQualityInspectionWorkflow } from "./qualityWorkflowGraph.js";

const CONFIDENCE_THRESHOLD = 0.75;

export async function listInspections() {
  if (!isDatabaseReady()) {
    console.warn("[database] inspection history requested while Postgres is not ready");
    return [];
  }

  try {
    return await listLatestInspectionsFromDatabase();
  } catch (error) {
    console.error(`[database] failed to list inspections. reason=${error.message}`);
    return [];
  }
}

export async function getInspectionByComponentId(componentId) {
  if (!isDatabaseReady()) {
    console.warn(
      `[database] inspection lookup requested for component=${componentId} while Postgres is not ready`
    );
    return null;
  }

  try {
    return await getLatestInspectionByComponentIdFromDatabase(componentId);
  } catch (error) {
    console.error(
      `[database] failed to load inspection for component=${componentId}. reason=${error.message}`
    );
    return null;
  }
}

export async function runInspection(input) {
  const previousResult = await getInspectionByComponentId(input.component_id);

  console.log(
    `[inspection] component=${input.component_id} bedrockEnabled=${env.BEDROCK_ENABLED}`
  );

  const { result, workflowMetadata } = await runQualityInspectionWorkflow({
    input,
    previousResult,
    confidenceThreshold: CONFIDENCE_THRESHOLD,
    bedrockEnabled: env.BEDROCK_ENABLED,
  });
  const enterpriseIntegrations = await executeEnterpriseIntegrations({
    input,
    result,
  });

  const storedResult = {
    ...result,
    created_at: new Date().toISOString(),
    agentic_loop: ["PERCEIVE", "PLAN", "ACT", "EVALUATE"],
    enterprise_integrations: enterpriseIntegrations,
  };

  if (isDatabaseReady()) {
    try {
      await saveInspectionToDatabase({
        input,
        result: storedResult,
        workflowMetadata: {
          ...workflowMetadata,
          enterpriseIntegrations,
        },
      });
    } catch (error) {
      console.error(
        `[database] failed to persist inspection for component=${input.component_id}. reason=${error.message}`
      );
    }
  } else {
    console.warn(
      `[database] inspection completed for component=${input.component_id}, but Postgres is not ready so no history was stored`
    );
  }

  return storedResult;
}

export function getIntegrationReadiness() {
  return getEnterpriseIntegrationStatus();
}
