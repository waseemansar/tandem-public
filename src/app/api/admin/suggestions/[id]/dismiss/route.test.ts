import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/db/client";
import { conversations, faqSuggestions } from "@/db/schema";
import { resetTestDb, startTestDb, stopTestDb } from "@/test/db";
import { resetTwinAgent, setTwinAgent } from "@/features/twin/agent";
import { createStubDraftFaqAgent } from "@/test/twin-agent";
import { resetConversation } from "@/features/conversation";
import { getLiveDoc, setLiveDoc } from "@/features/twin/knowledge-doc";

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));

import { POST } from "@/app/api/admin/suggestions/[id]/dismiss/route";

const SESSION = { user: { email: "admin@example.com" } };

async function seedPending(): Promise<string> {
    const [convo] = await getDb()
        .insert(conversations)
        .values({ state: "resolved" })
        .returning({ id: conversations.id });
    const [row] = await getDb()
        .insert(faqSuggestions)
        .values({ conversationId: convo.id, question: "Q", answer: "A", status: "pending" })
        .returning({ id: faqSuggestions.id });
    return row.id;
}

function makeRequest(id: string): {
    request: Request;
    ctx: { params: Promise<{ id: string }> };
} {
    return {
        request: new Request(`http://localhost/api/admin/suggestions/${id}/dismiss`, {
            method: "POST",
        }),
        ctx: { params: Promise.resolve({ id }) },
    };
}

describe("POST /api/admin/suggestions/[id]/dismiss", () => {
    beforeAll(async () => {
        await startTestDb();
    });

    afterAll(async () => {
        await stopTestDb();
    });

    beforeEach(async () => {
        await resetTestDb();
        authMock.mockReset();
        resetTwinAgent();
        setTwinAgent(createStubDraftFaqAgent({ question: "q", answer: "a" }));
        resetConversation();
    });

    it("returns 401 when not authenticated and leaves the suggestion unchanged", async () => {
        authMock.mockResolvedValue(null);
        const id = await seedPending();

        const { request, ctx } = makeRequest(id);
        const res = await POST(request, ctx);
        expect(res.status).toBe(401);

        const [row] = await getDb().select().from(faqSuggestions).where(eq(faqSuggestions.id, id));
        expect(row.status).toBe("pending");
    });

    it("marks status dismissed and leaves the live doc unchanged", async () => {
        authMock.mockResolvedValue(SESSION);
        const id = await seedPending();
        await setLiveDoc("# Base");

        const { request, ctx } = makeRequest(id);
        const res = await POST(request, ctx);
        expect(res.status).toBe(202);

        expect(await getLiveDoc()).toBe("# Base");

        const [row] = await getDb().select().from(faqSuggestions).where(eq(faqSuggestions.id, id));
        expect(row.status).toBe("dismissed");
    });

    it("returns 404 for an unknown id", async () => {
        authMock.mockResolvedValue(SESSION);
        const { request, ctx } = makeRequest("00000000-0000-0000-0000-000000000000");
        const res = await POST(request, ctx);
        expect(res.status).toBe(404);
    });

    it("returns 409 when the suggestion is not pending", async () => {
        authMock.mockResolvedValue(SESSION);
        const id = await seedPending();

        const first = makeRequest(id);
        const firstRes = await POST(first.request, first.ctx);
        expect(firstRes.status).toBe(202);

        const second = makeRequest(id);
        const res = await POST(second.request, second.ctx);
        expect(res.status).toBe(409);
    });
});
