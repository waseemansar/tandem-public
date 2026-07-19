import { asc, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@openai/agents", () => ({
    Agent: vi.fn(),
    run: vi.fn(),
    tool: vi.fn((cfg: unknown) => cfg),
    withTrace: vi.fn(async (_name: string, fn: (trace: unknown) => Promise<unknown>) => fn(null)),
}));

import { withTrace } from "@openai/agents";
import { getDb } from "@/db/client";
import { conversations, faqSuggestions, messages } from "@/db/schema";
import { resetTestDb, startTestDb, stopTestDb } from "@/test/db";
import { resetSseBroadcaster } from "@/shared/sse-broadcaster";
import { resetTwinAgent, setTwinAgent } from "@/features/twin/agent";
import { createStubDraftFaqAgent } from "@/test/twin-agent";
import { getConversation, resetConversation } from "@/features/conversation";
import { getLiveDoc, setLiveDoc } from "@/features/twin/knowledge-doc";

describe("faq draft suggestions", () => {
    beforeAll(async () => {
        await startTestDb();
    });

    afterAll(async () => {
        await stopTestDb();
    });

    beforeEach(async () => {
        await resetTestDb();
        resetTwinAgent();
        resetSseBroadcaster();
        resetConversation();
    });

    afterEach(async () => {
        await getConversation().idle();
    });

    async function seedActiveYouConversation(): Promise<string> {
        const db = getDb();
        const [convo] = await db
            .insert(conversations)
            .values({ state: "active_you", email: "p@n.io", firstName: "Priya" })
            .returning({ id: conversations.id });
        await db.insert(messages).values([
            { conversationId: convo.id, sender: "visitor", content: "where do you live?" },
            { conversationId: convo.id, sender: "human", content: "Berlin since 2024." },
        ]);
        return convo.id;
    }

    it("handleHandBack drafts an FAQ in the background and persists a pending suggestion", async () => {
        const capturedTranscripts: string[] = [];
        setTwinAgent(
            createStubDraftFaqAgent(
                { question: "Where is Waseem Ansar based?", answer: "Berlin, since 2024." },
                { captureTranscripts: capturedTranscripts },
            ),
        );

        const conversationId = await seedActiveYouConversation();

        await getConversation().handleHandBack({ conversationId });
        await getConversation().idle();

        const rows = await getDb()
            .select()
            .from(faqSuggestions)
            .where(eq(faqSuggestions.conversationId, conversationId))
            .orderBy(asc(faqSuggestions.createdAt));

        expect(rows).toHaveLength(1);
        expect(rows[0].question).toBe("Where is Waseem Ansar based?");
        expect(rows[0].answer).toBe("Berlin, since 2024.");
        expect(rows[0].status).toBe("pending");
        expect(capturedTranscripts).toHaveLength(1);
        expect(capturedTranscripts[0]).toContain("where do you live?");
        expect(capturedTranscripts[0]).toContain("Berlin since 2024.");
    });

    it("wraps the FAQ draft in withTrace with workflow name 'Tandem FAQ Drafter' and groupId equal to the conversation id", async () => {
        const mockedWithTrace = vi.mocked(withTrace);
        mockedWithTrace.mockClear();
        setTwinAgent(createStubDraftFaqAgent({ question: "q", answer: "a" }));

        const conversationId = await seedActiveYouConversation();

        await getConversation().handleHandBack({ conversationId });
        await getConversation().idle();

        expect(mockedWithTrace).toHaveBeenCalledTimes(1);
        expect(mockedWithTrace).toHaveBeenCalledWith(
            "Tandem FAQ Drafter",
            expect.any(Function),
            expect.objectContaining({ groupId: conversationId }),
        );
    });

    async function seedPendingSuggestion(
        conversationId: string,
        overrides: Partial<{ question: string; answer: string }> = {},
    ): Promise<string> {
        const [row] = await getDb()
            .insert(faqSuggestions)
            .values({
                conversationId,
                question: overrides.question ?? "Where is Waseem Ansar based?",
                answer: overrides.answer ?? "Berlin, since 2024.",
                status: "pending",
            })
            .returning({ id: faqSuggestions.id });
        return row.id;
    }

    it("approveSuggestion appends the original Q/A to the live doc and marks status approved", async () => {
        setTwinAgent(createStubDraftFaqAgent({ question: "q", answer: "a" }));
        const conversationId = await seedActiveYouConversation();
        const suggestionId = await seedPendingSuggestion(conversationId);

        await setLiveDoc("# Base doc");

        await getConversation().approveSuggestion({ id: suggestionId });

        const doc = await getLiveDoc();
        expect(doc).toContain("# Base doc");
        expect(doc).toContain("Where is Waseem Ansar based?");
        expect(doc).toContain("Berlin, since 2024.");

        const [row] = await getDb()
            .select()
            .from(faqSuggestions)
            .where(eq(faqSuggestions.id, suggestionId));
        expect(row.status).toBe("approved");
    });

    it("approveSuggestion with edited question/answer appends the edited text instead", async () => {
        setTwinAgent(createStubDraftFaqAgent({ question: "q", answer: "a" }));
        const conversationId = await seedActiveYouConversation();
        const suggestionId = await seedPendingSuggestion(conversationId, {
            question: "Original question",
            answer: "Original answer",
        });

        await setLiveDoc("# Base");

        await getConversation().approveSuggestion({
            id: suggestionId,
            editedQuestion: "Edited question",
            editedAnswer: "Edited answer",
        });

        const doc = await getLiveDoc();
        expect(doc).not.toContain("Original question");
        expect(doc).not.toContain("Original answer");
        expect(doc).toContain("Edited question");
        expect(doc).toContain("Edited answer");
    });

    it("approveSuggestion throws when the suggestion is not pending", async () => {
        setTwinAgent(createStubDraftFaqAgent({ question: "q", answer: "a" }));
        const conversationId = await seedActiveYouConversation();
        const suggestionId = await seedPendingSuggestion(conversationId);

        await getConversation().approveSuggestion({ id: suggestionId });

        await expect(getConversation().approveSuggestion({ id: suggestionId })).rejects.toThrow();
    });

    it("dismissSuggestion marks the suggestion dismissed and leaves the live doc unchanged", async () => {
        setTwinAgent(createStubDraftFaqAgent({ question: "q", answer: "a" }));
        const conversationId = await seedActiveYouConversation();
        const suggestionId = await seedPendingSuggestion(conversationId);

        await setLiveDoc("# Base");

        await getConversation().dismissSuggestion({ id: suggestionId });

        expect(await getLiveDoc()).toBe("# Base");

        const [row] = await getDb()
            .select()
            .from(faqSuggestions)
            .where(eq(faqSuggestions.id, suggestionId));
        expect(row.status).toBe("dismissed");
    });

    it("dismissSuggestion throws when the suggestion is not pending", async () => {
        setTwinAgent(createStubDraftFaqAgent({ question: "q", answer: "a" }));
        const conversationId = await seedActiveYouConversation();
        const suggestionId = await seedPendingSuggestion(conversationId);

        await getConversation().dismissSuggestion({ id: suggestionId });

        await expect(getConversation().dismissSuggestion({ id: suggestionId })).rejects.toThrow();
    });

    it("the next twin turn sees an approved entry in the live doc immediately", async () => {
        const capturedTranscripts: string[] = [];
        const capturedDocs: string[] = [];
        // A stub agent that records the doc it received on each stream call.
        setTwinAgent({
            async *stream({ doc }) {
                capturedDocs.push(doc);
                yield { type: "text_delta", delta: "ok" };
            },
            async draftFaq({ transcript }) {
                capturedTranscripts.push(transcript);
                return { question: "ignored", answer: "ignored" };
            },
        });

        await setLiveDoc("# Base doc");
        const conversationId = await seedActiveYouConversation();
        const suggestionId = await seedPendingSuggestion(conversationId, {
            question: "Where is he based?",
            answer: "Berlin since 2024.",
        });

        // Approve appends to the live doc.
        await getConversation().approveSuggestion({ id: suggestionId });

        // A new visitor turn picks up the freshly-appended entry — no restart.
        await getConversation().handleVisitorMessage({
            session: null,
            content: "where is he based?",
        });
        await getConversation().idle();

        expect(capturedDocs).toHaveLength(1);
        expect(capturedDocs[0]).toContain("# Base doc");
        expect(capturedDocs[0]).toContain("Where is he based?");
        expect(capturedDocs[0]).toContain("Berlin since 2024.");
    });

    it("listPendingSuggestions returns only pending rows, newest first", async () => {
        setTwinAgent(createStubDraftFaqAgent({ question: "q", answer: "a" }));
        const db = getDb();
        const conversationId = await seedActiveYouConversation();

        // Insert three rows with explicit createdAt so order is deterministic.
        await db.insert(faqSuggestions).values([
            {
                conversationId,
                question: "Q1",
                answer: "A1",
                status: "pending",
                createdAt: new Date("2026-06-08T10:00:00Z"),
            },
            {
                conversationId,
                question: "Q2",
                answer: "A2",
                status: "approved",
                createdAt: new Date("2026-06-08T11:00:00Z"),
            },
            {
                conversationId,
                question: "Q3",
                answer: "A3",
                status: "pending",
                createdAt: new Date("2026-06-08T12:00:00Z"),
            },
            {
                conversationId,
                question: "Q4",
                answer: "A4",
                status: "dismissed",
                createdAt: new Date("2026-06-08T13:00:00Z"),
            },
        ]);

        const pending = await getConversation().listPendingSuggestions();

        expect(pending.map((r) => r.question)).toEqual(["Q3", "Q1"]);
        expect(pending.every((r) => r.status === "pending")).toBe(true);
    });

    it("handleMarkResolved drafts an FAQ in the background and persists a pending suggestion", async () => {
        setTwinAgent(
            createStubDraftFaqAgent({
                question: "Which neighbourhood does Waseem Ansar like?",
                answer: "He likes Berlin-Marzahn for its peaceful, open feel.",
            }),
        );

        const conversationId = await seedActiveYouConversation();

        await getConversation().handleMarkResolved({ conversationId });
        await getConversation().idle();

        const rows = await getDb()
            .select()
            .from(faqSuggestions)
            .where(eq(faqSuggestions.conversationId, conversationId));

        expect(rows).toHaveLength(1);
        expect(rows[0].question).toBe("Which neighbourhood does Waseem Ansar like?");
        expect(rows[0].answer).toBe("He likes Berlin-Marzahn for its peaceful, open feel.");
        expect(rows[0].status).toBe("pending");
    });
});
