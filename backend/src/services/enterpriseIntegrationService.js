import { env } from "../config/env.js";

export function getEnterpriseIntegrationStatus() {
  return {
    enabled: env.ENTERPRISE_INTEGRATIONS_ENABLED,
    timeoutMs: env.ENTERPRISE_INTEGRATION_TIMEOUT_MS,
    systems: env.ENTERPRISE_INTEGRATIONS.map((system) => ({
      systemName: system.systemName,
      enabled: system.enabled,
      configured: Boolean(system.baseUrl && system.endpointPath),
      authType: system.authType,
    })),
  };
}

export async function executeEnterpriseIntegrations({ input, result }) {
  const configs = env.ENTERPRISE_INTEGRATIONS;

  if (!env.ENTERPRISE_INTEGRATIONS_ENABLED) {
    return configs.map((config) =>
      buildSubmissionRecord(config.systemName, "DISABLED", {
        skipped: true,
        requestPayload: buildInspectionPayload(input, result),
        errorDetail: "Enterprise integrations are disabled in configuration.",
      })
    );
  }

  const submissions = [];

  for (const config of configs) {
    submissions.push(await submitToIntegration(config, input, result));
  }

  return submissions;
}

async function submitToIntegration(config, input, result) {
  const requestPayload = buildInspectionPayload(input, result);

  if (!shouldTriggerIntegration(config, result)) {
    return buildSubmissionRecord(config.systemName, "NOT_TRIGGERED", {
      skipped: true,
      requestPayload,
      errorDetail: "Integration not triggered for this inspection outcome.",
    });
  }

  if (!config.enabled) {
    return buildSubmissionRecord(config.systemName, "DISABLED", {
      skipped: true,
      requestPayload,
      errorDetail: `${config.systemName} integration is disabled.`,
    });
  }

  if (!config.baseUrl || !config.endpointPath) {
    return buildSubmissionRecord(config.systemName, "NOT_CONFIGURED", {
      skipped: true,
      requestPayload,
      errorDetail: `${config.systemName} endpoint details are not configured yet.`,
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.ENTERPRISE_INTEGRATION_TIMEOUT_MS);

  try {
    const headers = await buildIntegrationHeaders(config);
    const response = await fetch(buildUrl(config.baseUrl, config.endpointPath), {
      method: config.method,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(requestPayload),
      signal: controller.signal,
    });

    const responsePayload = await readResponsePayload(response);

    if (!response.ok) {
      return buildSubmissionRecord(config.systemName, "FAILED", {
        requestPayload,
        responsePayload,
        externalReference: extractExternalReference(response, responsePayload),
        errorDetail: `${config.systemName} responded with HTTP ${response.status}.`,
      });
    }

    return buildSubmissionRecord(config.systemName, "SUCCESS", {
      requestPayload,
      responsePayload,
      externalReference: extractExternalReference(response, responsePayload),
    });
  } catch (error) {
    return buildSubmissionRecord(config.systemName, "FAILED", {
      requestPayload,
      errorDetail: error.name === "AbortError" ? "Integration request timed out." : error.message,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function shouldTriggerIntegration(config, result) {
  const recipients = (result.notifications?.notifications_sent || []).map((value) =>
    String(value).toLowerCase()
  );

  return config.recipientKeywords.some((keyword) =>
    recipients.some((recipient) => recipient.includes(keyword))
  );
}

function buildInspectionPayload(input, result) {
  return {
    component_id: input.component_id,
    inspection_station: input.inspection_station,
    timestamp: input.timestamp,
    line_id: input.line_id,
    metadata: input.metadata || {},
    source: result.source,
    confidence_score: result.confidence_score,
    inspection_summary: result.inspection_summary,
    severity_assessment: result.severity_assessment,
    root_cause_analysis: result.root_cause_analysis,
    final_decision: result.final_decision,
    notifications: result.notifications,
  };
}

async function buildIntegrationHeaders(config) {
  switch (config.authType) {
    case "api-key":
      return config.apiKey ? { [config.apiKeyHeader]: config.apiKey } : {};
    case "bearer":
      return config.bearerToken ? { Authorization: `Bearer ${config.bearerToken}` } : {};
    case "basic":
      if (!config.username || !config.password) {
        return {};
      }

      return {
        Authorization: `Basic ${Buffer.from(`${config.username}:${config.password}`).toString(
          "base64"
        )}`,
      };
    case "oauth-client-credentials": {
      const token = await fetchOauthToken(config);
      return token ? { Authorization: `Bearer ${token}` } : {};
    }
    default:
      return {};
  }
}

async function fetchOauthToken(config) {
  if (!config.tokenUrl || !config.clientId || !config.clientSecret) {
    return "";
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });

  if (config.scope) {
    body.set("scope", config.scope);
  }

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    throw new Error(`OAuth token request failed with HTTP ${response.status}.`);
  }

  const payload = await response.json();
  return payload.access_token || "";
}

async function readResponsePayload(response) {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function extractExternalReference(response, responsePayload) {
  return (
    responsePayload?.id ||
    responsePayload?.reference ||
    responsePayload?.number ||
    response.headers.get("x-request-id") ||
    response.headers.get("x-correlation-id") ||
    null
  );
}

function buildUrl(baseUrl, endpointPath) {
  const trimmedBase = baseUrl.replace(/\/+$/, "");
  const trimmedPath = endpointPath.replace(/^\/+/, "");
  return `${trimmedBase}/${trimmedPath}`;
}

function buildSubmissionRecord(systemName, submissionStatus, options = {}) {
  return {
    system_name: systemName,
    submission_status: submissionStatus,
    skipped_flag: Boolean(options.skipped),
    external_reference: options.externalReference || null,
    request_payload: options.requestPayload || {},
    response_payload: options.responsePayload || {},
    error_detail: options.errorDetail || null,
  };
}
