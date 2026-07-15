import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.resolve(__dirname, ".env"),
});

const envFilePath = path.resolve(__dirname, ".env");

const defaultFrontendOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
];

const configuredFrontendOrigins = process.env.FRONTEND_ORIGIN
  ? process.env.FRONTEND_ORIGIN.split(",").map((origin) => origin.trim()).filter(Boolean)
  : defaultFrontendOrigins;

const toBoolean = (value, defaultValue = false) => {
  if (value === undefined) {
    return defaultValue;
  }

  if (typeof value === "boolean") {
    return value;
  }

  return String(value).split("#")[0].trim().toLowerCase() === "true";
};

const toNumber = (value, defaultValue) => {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
};

const toText = (value, defaultValue = "") => {
  if (value === undefined || value === null) {
    return defaultValue;
  }

  return String(value).trim();
};

const buildIntegrationConfig = (prefix, systemName, recipientKeywords) => ({
  systemName,
  enabled: toBoolean(process.env[`${prefix}_ENABLED`]),
  baseUrl: toText(process.env[`${prefix}_BASE_URL`]),
  endpointPath: toText(process.env[`${prefix}_ENDPOINT_PATH`]),
  method: toText(process.env[`${prefix}_METHOD`], "POST").toUpperCase(),
  authType: toText(process.env[`${prefix}_AUTH_TYPE`], "none").toLowerCase(),
  apiKey: toText(process.env[`${prefix}_API_KEY`]),
  apiKeyHeader: toText(process.env[`${prefix}_API_KEY_HEADER`], "x-api-key"),
  bearerToken: toText(process.env[`${prefix}_BEARER_TOKEN`]),
  username: toText(process.env[`${prefix}_USERNAME`]),
  password: toText(process.env[`${prefix}_PASSWORD`]),
  tokenUrl: toText(process.env[`${prefix}_TOKEN_URL`]),
  clientId: toText(process.env[`${prefix}_CLIENT_ID`]),
  clientSecret: toText(process.env[`${prefix}_CLIENT_SECRET`]),
  scope: toText(process.env[`${prefix}_SCOPE`]),
  recipientKeywords,
});

const enterpriseIntegrationConfigs = [
  buildIntegrationConfig("MES", "MES", ["mes", "manufacturing execution system"]),
  buildIntegrationConfig("ERP", "ERP", ["erp"]),
  buildIntegrationConfig("SERVICENOW", "ServiceNow", ["servicenow"]),
  buildIntegrationConfig("SUPPLIER_PORTAL", "Supplier Portal", ["supplier portal"]),
];

const parseS3Prefix = (value) => {
  const raw = toText(value);

  if (!raw) {
    return {
      uri: "",
      bucket: "",
      keyPrefix: "",
      configured: false,
    };
  }

  if (!raw.startsWith("s3://")) {
    return {
      uri: raw,
      bucket: "",
      keyPrefix: "",
      configured: false,
    };
  }

  const withoutScheme = raw.slice("s3://".length);
  const firstSlashIndex = withoutScheme.indexOf("/");
  const bucket =
    firstSlashIndex === -1 ? withoutScheme : withoutScheme.slice(0, firstSlashIndex);
  const keyPrefix =
    firstSlashIndex === -1
      ? ""
      : withoutScheme.slice(firstSlashIndex + 1).replace(/^\/+/, "").replace(/\/+$/, "");

  return {
    uri: raw,
    bucket,
    keyPrefix,
    configured: Boolean(bucket),
  };
};

const s3InputPrefix = parseS3Prefix(process.env.QI_S3_INPUT_PREFIX);
const s3AuditPrefix = parseS3Prefix(process.env.QI_S3_AUDIT_PREFIX);
const databaseUrl = toText(process.env.DATABASE_URL || process.env.QI_DATABASE_URL);
const databaseEnabled =
  process.env.DATABASE_ENABLED === undefined ? Boolean(databaseUrl) : toBoolean(process.env.DATABASE_ENABLED);

export const env = {
  ENV_FILE_PATH: envFilePath,
  PORT: Number(process.env.PORT || 4000),
  NODE_ENV: process.env.NODE_ENV || "development",
  FRONTEND_ORIGINS: configuredFrontendOrigins,
  BEDROCK_ENABLED: toBoolean(process.env.BEDROCK_ENABLED),
  AWS_REGION: process.env.AWS_REGION || "us-east-1",
  BEDROCK_MODEL_ID:
    process.env.BEDROCK_MODEL_ID || "anthropic.claude-3-5-sonnet-20240620-v1:0",
  DATABASE_ENABLED: databaseEnabled,
  DATABASE_URL: databaseUrl,
  DATABASE_SSL: toBoolean(process.env.DATABASE_SSL),
  DATABASE_AUTO_MIGRATE: toBoolean(process.env.DATABASE_AUTO_MIGRATE, true),
  AUTH_SESSION_TTL_HOURS: toNumber(process.env.AUTH_SESSION_TTL_HOURS, 8),
  AUTH_COOKIE_NAME: toText(process.env.AUTH_COOKIE_NAME, "quality_inspector_session"),
  AUTH_COOKIE_SECURE: toBoolean(process.env.AUTH_COOKIE_SECURE, process.env.NODE_ENV === "production"),
  AUTH_COOKIE_SAME_SITE: toText(process.env.AUTH_COOKIE_SAME_SITE, "lax"),
  ENTERPRISE_INTEGRATIONS_ENABLED: toBoolean(process.env.ENTERPRISE_INTEGRATIONS_ENABLED),
  ENTERPRISE_INTEGRATION_TIMEOUT_MS: toNumber(
    process.env.ENTERPRISE_INTEGRATION_TIMEOUT_MS,
    8000
  ),
  ENTERPRISE_INTEGRATIONS: enterpriseIntegrationConfigs,
  QI_S3_REGION: toText(process.env.QI_S3_REGION, process.env.AWS_REGION || "us-east-1"),
  QI_S3_INPUT_PREFIX: s3InputPrefix,
  QI_S3_AUDIT_PREFIX: s3AuditPrefix,
  QI_S3_ENABLED: Boolean(s3InputPrefix.configured || s3AuditPrefix.configured),
  AWS_ACCESS_KEY_ID_PRESENT: Boolean(process.env.AWS_ACCESS_KEY_ID),
  AWS_SECRET_ACCESS_KEY_PRESENT: Boolean(process.env.AWS_SECRET_ACCESS_KEY),
  AWS_SESSION_TOKEN_PRESENT: Boolean(process.env.AWS_SESSION_TOKEN),
};
