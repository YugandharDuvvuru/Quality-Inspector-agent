import { Router } from "express";
import { env } from "../config/env.js";
import { getDatabaseStatus } from "../db/connection.js";
import { getBedrockDebugInfo, probeBedrockRuntime } from "../services/bedrockClient.js";
import { getIntegrationReadiness } from "../services/qualityOrchestrator.js";

export const debugRouter = Router();

debugRouter.get("/bedrock", (_req, res) => {
  res.json({
    service: "quality-inspector-backend",
    nodeEnv: env.NODE_ENV,
    database: getDatabaseStatus(),
    bedrock: getBedrockDebugInfo(),
  });
});

debugRouter.post("/bedrock/probe", async (_req, res, next) => {
  if (!env.BEDROCK_ENABLED) {
    return res.status(400).json({
      message: "Bedrock probe unavailable because BEDROCK_ENABLED is false",
      bedrock: getBedrockDebugInfo(),
    });
  }

  try {
    const probe = await probeBedrockRuntime();

    return res.json({
      service: "quality-inspector-backend",
      probe,
    });
  } catch (error) {
    return next(error);
  }
});

debugRouter.get("/integrations", (_req, res) => {
  res.json({
    service: "quality-inspector-backend",
    nodeEnv: env.NODE_ENV,
    integrations: getIntegrationReadiness(),
  });
});
