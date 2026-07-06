import { closeDatabase, runDatabaseMigrations } from "./connection.js";

async function main() {
  await runDatabaseMigrations();
  console.log("[database] migrations complete");
}

main()
  .catch((error) => {
    console.error(`[database] migration failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
