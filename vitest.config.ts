import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
    test: {
        environment: "node",
        testTimeout: 60_000,
        hookTimeout: 60_000,
        exclude: ["**/node_modules/**", "**/.next/**", "tests/e2e/**"],
    },
    resolve: {
        alias: {
            "@": fileURLToPath(new URL("./src", import.meta.url)),
        },
    },
});
