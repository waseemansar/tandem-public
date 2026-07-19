import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { conversations } from "@/db/schema";
import { resetTestDb, startTestDb, stopTestDb } from "@/test/db";
import {
    createMagicLinkSigner,
    MAGIC_LINK_TTL_MS,
    resetMagicLinkSigner,
    setMagicLinkSigner,
} from "@/shared/magic-link";

import { GET } from "@/app/(chat)/r/[token]/route";

const TEST_SECRET = "test-magic-link-secret-32-bytes-long-aaa";

function makeRequest(token: string): {
    request: Request;
    ctx: { params: Promise<{ token: string }> };
} {
    return {
        request: new Request(`http://localhost/r/${token}`),
        ctx: { params: Promise.resolve({ token }) },
    };
}

async function seedThread(email: string): Promise<string> {
    const db = getDb();
    const [row] = await db
        .insert(conversations)
        .values({ email, state: "awaiting_visitor" })
        .returning({ id: conversations.id });
    return row.id;
}

describe("GET /r/[token]", () => {
    beforeAll(async () => {
        await startTestDb();
    });

    afterAll(async () => {
        await stopTestDb();
    });

    beforeEach(async () => {
        await resetTestDb();
        resetMagicLinkSigner();
        setMagicLinkSigner(createMagicLinkSigner({ secret: TEST_SECRET }));
    });

    it("on tampered token, 302 redirects to the error page with reason=invalid and no cookie", async () => {
        const conversationId = await seedThread("visitor@example.com");
        const wrongSigner = createMagicLinkSigner({
            secret: "different-secret-32-bytes-aaaaaaaaaaa",
        });
        const tamperedToken = await wrongSigner.sign({
            conversationId,
            email: "visitor@example.com",
            expiresAt: new Date(Date.now() + 60_000),
        });

        const { request, ctx } = makeRequest(tamperedToken);
        const res = await GET(request, ctx);

        expect(res.status).toBe(302);
        expect(res.headers.get("location")).toContain("/magic-link/error?reason=invalid");
        expect(res.headers.get("set-cookie")).toBeNull();
    });

    it("on expired token, 302 redirects to the error page with reason=expired and no cookie", async () => {
        const conversationId = await seedThread("visitor@example.com");
        const expiredToken = await createMagicLinkSigner({ secret: TEST_SECRET }).sign({
            conversationId,
            email: "visitor@example.com",
            expiresAt: new Date(Date.now() - 1000),
        });

        const { request, ctx } = makeRequest(expiredToken);
        const res = await GET(request, ctx);

        expect(res.status).toBe(302);
        expect(res.headers.get("location")).toContain("/magic-link/error?reason=expired");
        expect(res.headers.get("set-cookie")).toBeNull();
    });

    it("on valid token, 302 redirects to / and sets the conversation_id cookie", async () => {
        const conversationId = await seedThread("visitor@example.com");
        const token = await createMagicLinkSigner({ secret: TEST_SECRET }).sign({
            conversationId,
            email: "visitor@example.com",
            expiresAt: new Date(Date.now() + MAGIC_LINK_TTL_MS),
        });

        const { request, ctx } = makeRequest(token);
        const res = await GET(request, ctx);

        expect(res.status).toBe(302);
        expect(res.headers.get("location")).toBe("/");
        const setCookie = res.headers.get("set-cookie");
        expect(setCookie).toContain(`conversation_id=${conversationId}`);
    });
});
