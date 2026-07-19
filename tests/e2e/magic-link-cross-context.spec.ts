import { test, expect } from "@playwright/test";
import { firstName } from "@/config/site";
import { createMagicLinkSigner, MAGIC_LINK_TTL_MS } from "@/shared/magic-link";
import { connect, resetAndSeed } from "@tests/e2e/setup/seed";

const VISITOR_EMAIL = "e2e-magic-link@tandem.test";
// Phrase the visitor types — distinct from STARTER_CHIPS so the post-redirect
// assertion can't accidentally match the hero state's starter chips.
const VISITOR_MESSAGE = `I'd like to get in touch with ${firstName} about a role.`;

test.beforeEach(async () => {
    const handle = connect();
    try {
        await resetAndSeed(handle.db);
    } finally {
        await handle.close();
    }
});

test("magic-link landing rebinds a fresh browser context to the same conversation", async ({
    browser,
}) => {
    // 1) Visitor creates an escalated conversation with an associated email.
    const visitorContext = await browser.newContext();
    const visitorPage = await visitorContext.newPage();
    await visitorPage.goto("/");

    const composer = visitorPage.getByLabel("Message", { exact: true });
    await composer.fill(VISITOR_MESSAGE);
    await composer.press("Enter");

    const emailInput = visitorPage.getByLabel("Your email");
    await expect(emailInput).toBeVisible({ timeout: 60_000 });

    await emailInput.fill(VISITOR_EMAIL);
    await visitorPage.getByRole("button", { name: `Notify ${firstName}` }).click();
    await expect(emailInput).toBeHidden({ timeout: 30_000 });

    // 2) Pull the conversation_id cookie that the visitor's browser holds.
    const cookies = await visitorContext.cookies();
    const conversationCookie = cookies.find((c) => c.name === "conversation_id");
    expect(conversationCookie, "visitor should have a conversation_id cookie").toBeDefined();
    const conversationId = conversationCookie!.value;

    // 3) Mint a magic-link token out-of-band, mimicking the email step. Uses
    //    the same MAGIC_LINK_SECRET the running server reads.
    const secret = process.env.MAGIC_LINK_SECRET;
    if (!secret) throw new Error("MAGIC_LINK_SECRET not set in .env.test");
    const signer = createMagicLinkSigner({ secret });
    const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MS);
    const token = await signer.sign({ conversationId, email: VISITOR_EMAIL, expiresAt });

    // 4) A fresh browser context simulates "different device" — no cookies.
    const freshContext = await browser.newContext();
    const freshPage = await freshContext.newPage();
    await freshPage.goto(`/r/${token}`);

    // /r/[token] sets the conversation_id cookie and redirects to /. The
    // server-rendered home page should now show the bound thread's history,
    // including the visitor's escalation message.
    await expect(freshPage.getByText(VISITOR_MESSAGE)).toBeVisible({ timeout: 30_000 });

    const freshCookies = await freshContext.cookies();
    const rebound = freshCookies.find((c) => c.name === "conversation_id");
    expect(rebound?.value, "fresh context should be rebound to the same conversation").toBe(
        conversationId,
    );
});
