import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/db/client";
import { conversations, faqSuggestions } from "@/db/schema";
import { resetTestDb, startTestDb, stopTestDb } from "@/test/db";
import { resetTwinAgent, setTwinAgent } from "@/features/twin/agent";
import { createStubDraftFaqAgent } from "@/test/twin-agent";
import { resetConversation } from "@/features/conversation";

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));

import { GET } from "@/app/api/admin/suggestions/route";

const SESSION = { user: { email: "admin@example.com" } };

type SuggestionRow = {
    id: string;
    conversationId: string;
    question: string;
    answer: string;
    status: string;
    createdAt: string;
};

async function seedConversation(): Promise<string> {
    const [row] = await getDb()
        .insert(conversations)
        .values({ state: "resolved", email: "p@n.io", firstName: "Priya" })
        .returning({ id: conversations.id });
    return row.id;
}

describe("GET /api/admin/suggestions", () => {
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

    it("returns 401 when not authenticated", async () => {
        authMock.mockResolvedValue(null);
        const res = await GET();
        expect(res.status).toBe(401);
    });

    it("returns pending suggestions newest-first, omitting approved or dismissed rows", async () => {
        authMock.mockResolvedValue(SESSION);
        const conversationId = await seedConversation();

        await getDb()
            .insert(faqSuggestions)
            .values([
                {
                    conversationId,
                    question: "Q-old",
                    answer: "A-old",
                    status: "pending",
                    createdAt: new Date("2026-06-08T10:00:00Z"),
                },
                {
                    conversationId,
                    question: "Q-approved",
                    answer: "A-approved",
                    status: "approved",
                    createdAt: new Date("2026-06-08T11:00:00Z"),
                },
                {
                    conversationId,
                    question: "Q-new",
                    answer: "A-new",
                    status: "pending",
                    createdAt: new Date("2026-06-08T12:00:00Z"),
                },
                {
                    conversationId,
                    question: "Q-dismissed",
                    answer: "A-dismissed",
                    status: "dismissed",
                    createdAt: new Date("2026-06-08T13:00:00Z"),
                },
            ]);

        const res = await GET();
        expect(res.status).toBe(200);
        const body = (await res.json()) as { suggestions: SuggestionRow[] };

        expect(body.suggestions.map((s) => s.question)).toEqual(["Q-new", "Q-old"]);
        expect(body.suggestions.every((s) => s.status === "pending")).toBe(true);
        expect(body.suggestions[0].conversationId).toBe(conversationId);
        expect(typeof body.suggestions[0].createdAt).toBe("string");
    });

    it("returns an empty list when no pending suggestions exist", async () => {
        authMock.mockResolvedValue(SESSION);
        const res = await GET();
        expect(res.status).toBe(200);
        const body = (await res.json()) as { suggestions: SuggestionRow[] };
        expect(body.suggestions).toEqual([]);
    });
});
