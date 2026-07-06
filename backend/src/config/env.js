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

export const env = {
  ENV_FILE_PATH: envFilePath,
  PORT: Number(process.env.PORT || 4000),
  NODE_ENV: process.env.NODE_ENV || "development",
  FRONTEND_ORIGINS: configuredFrontendOrigins,
  BEDROCK_ENABLED: process.env.BEDROCK_ENABLED === "true",
  AWS_REGION: process.env.AWS_REGION || "us-east-1",
  BEDROCK_MODEL_ID:
    process.env.BEDROCK_MODEL_ID || "anthropic.claude-3-5-sonnet-20240620-v1:0",
  AWS_ACCESS_KEY_ID_PRESENT: Boolean(process.env.AWS_ACCESS_KEY_ID),
  AWS_SECRET_ACCESS_KEY_PRESENT: Boolean(process.env.AWS_SECRET_ACCESS_KEY),
  AWS_SESSION_TOKEN_PRESENT: Boolean(process.env.AWS_SESSION_TOKEN),
};
