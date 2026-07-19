import { test, expect } from "@playwright/test";
import { firstName, fullName } from "@/config/site";
import { ADMIN_EMAIL, ADMIN_PASSWORD } from "@tests/e2e/setup/constants";
import { connect, resetAndSeed } from "@tests/e2e/setup/seed";

const VISITOR_EMAIL = "e2e-visitor@tandem.test";
// Unique marker so the assertion can't accidentally match other text on the page.
const ADMIN_REPLY = "Got it — let's set up a call. [marker-9-orbit]";

test.beforeEach(async () => {
    const handle = connect();
    try {
        await resetAndSeed(handle.db);
    } finally {
        await handle.close();
    }
});

test("visitor escalates, admin replies via console, visitor sees the reply via SSE", async ({
    browser,
}) => {
    // --- Visitor: trigger escalation and submit email ---
    const visitorContext = await browser.newContext();
    const visitorPage = await visitorContext.newPage();
    await visitorPage.goto("/");

    const visitorComposer = visitorPage.getByLabel("Message", { exact: true });
    await visitorComposer.fill(`I'd like to get in touch with ${firstName} about a role.`);
    await visitorComposer.press("Enter");

    // EscalationPrompt renders once the twin calls request_human_handoff.
    const emailInput = visitorPage.getByLabel("Your email");
    await expect(emailInput).toBeVisible({ timeout: 60_000 });

    await emailInput.fill(VISITOR_EMAIL);
    await visitorPage.getByRole("button", { name: `Notify ${firstName}` }).click();

    // Prompt clears once accept resolves.
    await expect(emailInput).toBeHidden({ timeout: 30_000 });

    // --- Admin: sign in, open thread, reply ---
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await adminPage.goto("/admin/signin");

    await adminPage.getByLabel("Email", { exact: true }).fill(ADMIN_EMAIL);
    await adminPage.getByLabel("Password", { exact: true }).fill(ADMIN_PASSWORD);
    await adminPage.getByRole("button", { name: "Sign in" }).click();

    await adminPage.waitForURL(/\/admin\/inbox(?:\/|$|\?)/, { timeout: 30_000 });

    // The escalated thread should be in the inbox; the visitor's email is shown
    // on the row, so we click the row by that text.
    await adminPage.getByText(VISITOR_EMAIL).first().click();
    await adminPage.waitForURL(/\/admin\/inbox\/[0-9a-f-]+/, { timeout: 30_000 });

    const adminComposer = adminPage.getByLabel(`Reply as ${fullName}`);
    await adminComposer.fill(ADMIN_REPLY);
    await adminComposer.press("Enter");

    // --- Visitor: SSE delivers the admin's reply into the visitor's thread ---
    await expect(visitorPage.getByText(ADMIN_REPLY)).toBeVisible({
        timeout: 60_000,
    });
});
