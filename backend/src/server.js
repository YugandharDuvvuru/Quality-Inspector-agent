import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env.js";
import { getDatabaseStatus, initializeDatabase } from "./db/connection.js";
import { debugRouter } from "./routes/debugRoutes.js";
import { inspectionRouter } from "./routes/inspectionRoutes.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { requireAuth } from "./middleware/authMiddleware.js";
import { authRouter } from "./routes/authRoutes.js";

const app = express();

const routeCatalog = [
  { method: "GET", path: "/api", purpose: "Service metadata and available routes" },
  { method: "GET", path: "/api/health", purpose: "Backend, Bedrock, and database readiness" },
  { method: "POST", path: "/api/auth/register", purpose: "Register a quality inspection user" },
  { method: "POST", path: "/api/auth/login", purpose: "Login and create a secure session" },
  { method: "GET", path: "/api/auth/me", purpose: "Get the authenticated user profile" },
  { method: "POST", path: "/api/auth/logout", purpose: "Revoke the active user session" },
  { method: "GET", path: "/api/inspections", purpose: "List persisted inspection history" },
  { method: "DELETE", path: "/api/inspections", purpose: "Delete selected inspections (admin only)" },
  { method: "GET", path: "/api/inspections/trace/:traceId", purpose: "Get one inspection by trace ID" },
  { method: "GET", path: "/api/inspections/trace/:traceId/report.pdf", purpose: "Download NCR PDF by trace ID" },
  { method: "GET", path: "/api/inspections/:componentId", purpose: "Get latest inspection for one component" },
  { method: "GET", path: "/api/inspections/:componentId/report.pdf", purpose: "Download latest NCR PDF report" },
  { method: "POST", path: "/api/inspections", purpose: "Run the quality inspection workflow" },
  { method: "GET", path: "/api/debug/bedrock", purpose: "Inspect Bedrock runtime configuration metadata" },
  { method: "POST", path: "/api/debug/bedrock/probe", purpose: "Run a live Bedrock connectivity probe" },
  { method: "GET", path: "/api/debug/integrations", purpose: "Inspect enterprise integration readiness" },
];

app.use(helmet());
app.use(
  cors({
    credentials: true,
    exposedHeaders: ["Content-Disposition"],
    origin(origin, callback) {
      if (!origin || env.FRONTEND_ORIGINS.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
  })
);
app.use(express.json({ limit: "20mb" }));
app.use(morgan("dev"));

app.get("/api", (_req, res) => {
  res.json({
    service: "quality-inspector-backend",
    version: "1.0.0",
    routes: routeCatalog,
  });
});

app.get("/api/health", (_req, res) => {
  const database = getDatabaseStatus();

  res.json({
    status: "ok",
    service: "quality-inspector-backend",
    bedrockEnabled: env.BEDROCK_ENABLED,
    database,
    enterpriseIntegrationsEnabled: env.ENTERPRISE_INTEGRATIONS_ENABLED,
    routes: routeCatalog.map((route) => route.path),
  });
});

app.use("/api/auth", authRouter);
app.use("/api/inspections", requireAuth, inspectionRouter);
app.use("/api/debug", requireAuth, debugRouter);
app.use(errorHandler);

async function bootstrap() {
  const database = await initializeDatabase();

  app.listen(env.PORT, () => {
    console.log(`Quality Inspector API listening on http://localhost:${env.PORT}`);
    console.log(
      `[config] databaseEnabled=${database.enabled} databaseConfigured=${database.configured} databaseReady=${database.ready}`
    );
  });
}

bootstrap().catch((error) => {
  console.error(`[startup] failed to initialize backend. reason=${error.message}`);
  process.exit(1);
});
