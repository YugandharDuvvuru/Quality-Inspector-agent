import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env.js";
import { getDatabaseStatus, initializeDatabase } from "./db/connection.js";
import { inspectionRouter } from "./routes/inspectionRoutes.js";
import { errorHandler } from "./middleware/errorHandler.js";

const app = express();

app.use(helmet());
app.use(
  cors({
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

app.get("/api/health", (_req, res) => {
  const database = getDatabaseStatus();

  res.json({
    status: "ok",
    service: "quality-inspector-backend",
    bedrockEnabled: env.BEDROCK_ENABLED,
    database,
  });
});

app.use("/api/inspections", inspectionRouter);
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
