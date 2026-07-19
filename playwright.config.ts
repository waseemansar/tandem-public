import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.test", quiet: true });

const APP_BASE_URL = process.env.APP_BASE_URL ?? "http://localhost:3100";
const PORT = new URL(APP_BASE_URL).port || "3100";

export default defineConfig({
    testDir: "./tests/e2e",
    fullyParallel: false,
    workers: 1,
    timeout: 90_000,
    expect: { timeout: 30_000 },
    reporter: process.env.CI ? "github" : "list",
    use: {
        baseURL: APP_BASE_URL,
        trace: "retain-on-failure",
    },
    projects: [
        {
            name: "chromium",
            use: { ...devices["Desktop Chrome"] },
        },
    ],
    globalSetup: "./tests/e2e/setup/global-setup.ts",
    webServer: {
        command: `pnpm exec next build && pnpm exec next start --port ${PORT}`,
        url: APP_BASE_URL,
        reuseExistingServer: !process.env.CI,
        stdout: "pipe",
        stderr: "pipe",
        timeout: 180_000,
        // SIGTERM (not SIGKILL) gives Next.js — and inside it, the OpenAI
        // Agents SDK's batched trace processor — a window to flush pending
        // spans before the process dies. Without this, trace rows stay
        // marked "In progress" forever in the OpenAI Traces dashboard.
        gracefulShutdown: { signal: "SIGTERM", timeout: 15_000 },
    },
});
