import { config as loadEnv } from "dotenv";
import { connect, migrate, resetAndSeed } from "@tests/e2e/setup/seed";

export default async function globalSetup(): Promise<void> {
    // Belt-and-braces: playwright.config.ts also loads .env.test, but reload
    // here so the invariant holds if a caller imports this outside the runner.
    loadEnv({ path: ".env.test", quiet: true });

    const handle = connect();
    try {
        await migrate(handle.db);
        await resetAndSeed(handle.db);
    } finally {
        await handle.close();
    }
}
