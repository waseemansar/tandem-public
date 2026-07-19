import { test, expect } from "@playwright/test";
import { KNOWLEDGE_NONCE, KNOWLEDGE_NONCE_QUESTION } from "@tests/e2e/setup/constants";
import { connect, resetAndSeed } from "@tests/e2e/setup/seed";

test.beforeEach(async () => {
    const handle = connect();
    try {
        await resetAndSeed(handle.db);
    } finally {
        await handle.close();
    }
});

test("visitor asks an in-doc question and Tandem replies with the seeded nonce", async ({
    page,
}) => {
    await page.goto("/");

    const composer = page.getByLabel("Message", { exact: true });
    await composer.fill(KNOWLEDGE_NONCE_QUESTION);
    await composer.press("Enter");

    // The visitor's own question does NOT contain KNOWLEDGE_NONCE, so the only
    // way the nonce can appear in the DOM is if Tandem retrieved it from the
    // seeded knowledge doc.
    await expect(page.getByText(KNOWLEDGE_NONCE)).toBeVisible({
        timeout: 60_000,
    });
});
