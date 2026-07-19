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

import { POST } from "@/app/api/admin/suggestions/[id]/approve/route";

const SESSION = { user: { email: "admin@example.com" } };

async function seedPending(question = "Where based?", answer = "Berlin"): Promise<string> {
    const [convo] = await getDb()
        .insert(conversations)
        .values({ state: "resolved" })
        .returning({ id: conversations.id });
    const [row] = await getDb()
        .insert(faqSuggestions)
        .values({ conversationId: convo.id, question, answer, status: "pending" })
        .returning({ id: faqSuggestions.id });
    return row.id;
}

function makeRequest(
    id: string,
    body: unknown = {},
): { request: Request; ctx: { params: Promise<{ id: string }> } } {
    return {
        request: new Request(`http://localhost/api/admin/suggestions/${id}/approve`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
        }),
        ctx: { params: Promise.resolve({ id }) },
    };
}

describe("POST /api/admin/suggestions/[id]/approve", () => {
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
        await setLiveDoc("# Base");

        const { request, ctx } = makeRequest(id);
        const res = await POST(request, ctx);
        expect(res.status).toBe(401);

        const [row] = await getDb().select().from(faqSuggestions).where(eq(faqSuggestions.id, id));
        expect(row.status).toBe("pending");
        expect(await getLiveDoc()).toBe("# Base");
    });

    it("appends the original Q/A to the live doc and marks status approved", async () => {
        authMock.mockResolvedValue(SESSION);
        const id = await seedPending("Where based?", "Berlin");
        await setLiveDoc("# Base");

        const { request, ctx } = makeRequest(id);
        const res = await POST(request, ctx);
        expect(res.status).toBe(202);

        const doc = await getLiveDoc();
        expect(doc).toContain("# Base");
        expect(doc).toContain("Where based?");
        expect(doc).toContain("Berlin");

        const [row] = await getDb().select().from(faqSuggestions).where(eq(faqSuggestions.id, id));
        expect(row.status).toBe("approved");
    });

    it("appends the edited question and answer when supplied in the body", async () => {
        authMock.mockResolvedValue(SESSION);
        const id = await seedPending("Original Q", "Original A");
        await setLiveDoc("# Base");

        const { request, ctx } = makeRequest(id, {
            question: "Edited Q",
            answer: "Edited A",
        });
        const res = await POST(request, ctx);
        expect(res.status).toBe(202);

        const doc = await getLiveDoc();
        expect(doc).toContain("Edited Q");
        expect(doc).toContain("Edited A");
        expect(doc).not.toContain("Original Q");
        expect(doc).not.toContain("Original A");
    });

    it("returns 404 for an unknown suggestion id", async () => {
        authMock.mockResolvedValue(SESSION);
        const { request, ctx } = makeRequest("00000000-0000-0000-0000-000000000000");
        const res = await POST(request, ctx);
        expect(res.status).toBe(404);
    });

    it("returns 409 when the suggestion is not pending", async () => {
        authMock.mockResolvedValue(SESSION);
        const id = await seedPending();
        await setLiveDoc("# Base");

        const first = makeRequest(id);
        const firstRes = await POST(first.request, first.ctx);
        expect(firstRes.status).toBe(202);

        const second = makeRequest(id);
        const res = await POST(second.request, second.ctx);
        expect(res.status).toBe(409);
    });
});
