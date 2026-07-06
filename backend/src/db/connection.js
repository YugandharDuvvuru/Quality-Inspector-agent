import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { env } from "../config/env.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDirectory = path.resolve(__dirname, "migrations");

let pool;
let poolFactory;
let databaseReady = false;
let databaseError = null;

async function ensurePool() {
  if (pool) {
    return pool;
  }

  if (!poolFactory) {
    const { Pool } = await import("pg");
    poolFactory = Pool;
  }

  pool = new poolFactory({
    connectionString: env.DATABASE_URL,
    ssl: env.DATABASE_SSL ? { rejectUnauthorized: false } : false,
  });

  return pool;
}

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export async function runDatabaseMigrations() {
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to run Postgres migrations");
  }

  const activePool = await ensurePool();
  const migrationFiles = (await fs.readdir(migrationsDirectory))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  await ensureMigrationsTable(activePool);

  for (const migrationFile of migrationFiles) {
    const existingMigration = await activePool.query(
      "SELECT name FROM schema_migrations WHERE name = $1",
      [migrationFile]
    );

    if (existingMigration.rowCount) {
      continue;
    }

    const sql = await fs.readFile(path.join(migrationsDirectory, migrationFile), "utf8");
    const client = await activePool.connect();

    try {
      await client.query("BEGIN");
      await ensureMigrationsTable(client);
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [migrationFile]);
      await client.query("COMMIT");
      console.log(`[database] applied migration ${migrationFile}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

export async function initializeDatabase() {
  if (!env.DATABASE_ENABLED) {
    databaseReady = false;
    databaseError = null;
    console.log("[database] disabled; using in-memory inspection store");
    return getDatabaseStatus();
  }

  if (!env.DATABASE_URL) {
    databaseReady = false;
    databaseError = new Error("DATABASE_URL is missing while DATABASE_ENABLED=true");
    console.warn("[database] DATABASE_ENABLED=true but DATABASE_URL is missing");
    return getDatabaseStatus();
  }

  try {
    const activePool = await ensurePool();
    await activePool.query("SELECT 1");

    if (env.DATABASE_AUTO_MIGRATE) {
      await runDatabaseMigrations();
    }

    databaseReady = true;
    databaseError = null;
    console.log("[database] connected to Postgres");
  } catch (error) {
    databaseReady = false;
    databaseError = error;
    console.error(`[database] unavailable; using in-memory inspection store. reason=${error.message}`);
  }

  return getDatabaseStatus();
}

export function isDatabaseReady() {
  return databaseReady;
}

export function getDatabaseStatus() {
  return {
    enabled: env.DATABASE_ENABLED,
    configured: Boolean(env.DATABASE_URL),
    ready: databaseReady,
    autoMigrate: env.DATABASE_AUTO_MIGRATE,
    error: databaseError?.message || null,
  };
}

export async function query(text, params = []) {
  if (!databaseReady) {
    throw new Error("Postgres is not ready");
  }

  const activePool = await ensurePool();
  return activePool.query(text, params);
}

export async function withTransaction(callback) {
  if (!databaseReady) {
    throw new Error("Postgres is not ready");
  }

  const activePool = await ensurePool();
  const client = await activePool.connect();

  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function closeDatabase() {
  if (!pool) {
    return;
  }

  await pool.end();
  pool = undefined;
  databaseReady = false;
}
