import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env.js";
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
  res.json({
    status: "ok",
    service: "quality-inspector-backend",
    bedrockEnabled: env.BEDROCK_ENABLED,
  });
});

app.use("/api/inspections", inspectionRouter);
app.use(errorHandler);

app.listen(env.PORT, () => {
  console.log(`Quality Inspector API listening on http://localhost:${env.PORT}`);
  // console.log(`[config] envFile=${env.ENV_FILE_PATH}`);
  // console.log(
  //   `[config] bedrockEnabled=${env.BEDROCK_ENABLED} region=${env.AWS_REGION} modelId=${env.BEDROCK_MODEL_ID}`
  // );
  // console.log(
  //   `[config] awsAccessKeyPresent=${env.AWS_ACCESS_KEY_ID_PRESENT} awsSecretPresent=${env.AWS_SECRET_ACCESS_KEY_PRESENT} awsSessionTokenPresent=${env.AWS_SESSION_TOKEN_PRESENT}`
  // );
  // console.log(`[config] frontendOrigins=${env.FRONTEND_ORIGINS.join(",")}`);
});
