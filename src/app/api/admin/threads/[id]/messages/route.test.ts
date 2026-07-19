import { asc, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/db/client";
import { conversations, messages } from "@/db/schema";
import { resetTestDb, startTestDb, stopTestDb } from "@/test/db";
import {
    getSseBroadcaster,
    resetSseBroadcaster,
    type SseEvent,
    type SseMessageEvent,
} from "@/shared/sse-broadcaster";
import { getConversation, resetConversation } from "@/features/conversation";
import { JOIN_SYSTEM_MESSAGE } from "@/features/conversation/constants";
import { resetTwinAgent, setTwinAgent } from "@/features/twin/agent";
import { createEchoTwinAgent } from "@/test/twin-agent";

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));

import { POST } from "@/app/api/admin/threads/[id]/messages/route";

const SESSION = { user: { email: "admin@example.com" } };

async function seedThread(opts: {
    state: "twin_only" | "awaiting_you" | "active_you" | "awaiting_visitor" | "resolved";
    email?: string | null;
    firstName?: string | null;
}): Promise<string> {
    const db = getDb();
    const [row] = await db
        .insert(conversations)
        .values({
            state: opts.state,
            email: opts.email ?? null,
            firstName: opts.firstName ?? null,
        })
        .returning({ id: conversations.id });
    return row.id;
}

function makeRequest(
    id: string,
    body: unknown,
): { request: Request; ctx: { params: Promise<{ id: string }> } } {
    return {
        request: new Request(`http://localhost/api/admin/threads/${id}/messages`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
        }),
        ctx: { params: Promise.resolve({ id }) },
    };
}

async function collectEvents(conversationId: string, expectedCount: number): Promise<SseEvent[]> {
    const sub = getSseBroadcaster().subscribe(conversationId);
    const iter = sub.events[Symbol.asyncIterator]();
    const seen: SseEvent[] = [];
    while (seen.length < expectedCount) {
        const next = await iter.next();
        if (next.done) break;
        seen.push(next.value);
    }
    sub.unsubscribe();
    return seen;
}

describe("POST /api/admin/threads/[id]/messages", () => {
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
        setTwinAgent(createEchoTwinAgent());
        resetSseBroadcaster();
        resetConversation();
    });

    afterEach(async () => {
        await getConversation().idle();
    });

    it("returns 401 when not authenticated and persists nothing", async () => {
        authMock.mockResolvedValue(null);
        const id = await seedThread({ state: "awaiting_you" });
        const { request, ctx } = makeRequest(id, { content: "hi" });
        const res = await POST(request, ctx);
        expect(res.status).toBe(401);

        const rows = await getDb().select().from(messages).where(eq(messages.conversationId, id));
        expect(rows).toHaveLength(0);
    });

    it("returns 404 for a twin_only conversation (not escalated)", async () => {
        authMock.mockResolvedValue(SESSION);
        const id = await seedThread({ state: "twin_only" });
        const { request, ctx } = makeRequest(id, { content: "hi" });
        const res = await POST(request, ctx);
        expect(res.status).toBe(404);

        const [convo] = await getDb()
            .select({ state: conversations.state })
            .from(conversations)
            .where(eq(conversations.id, id));
        expect(convo.state).toBe("twin_only");
    });

    it("returns 404 for a resolved conversation", async () => {
        authMock.mockResolvedValue(SESSION);
        const id = await seedThread({ state: "resolved" });
        const { request, ctx } = makeRequest(id, { content: "hi" });
        const res = await POST(request, ctx);
        expect(res.status).toBe(404);
    });

    it("returns 404 for an unknown conversation id", async () => {
        authMock.mockResolvedValue(SESSION);
        const { request, ctx } = makeRequest("00000000-0000-0000-0000-000000000000", {
            content: "hi",
        });
        const res = await POST(request, ctx);
        expect(res.status).toBe(404);
    });

    it("returns 400 on blank or missing content", async () => {
        authMock.mockResolvedValue(SESSION);
        const id = await seedThread({ state: "awaiting_you" });

        const blank = makeRequest(id, { content: "   " });
        expect((await POST(blank.request, blank.ctx)).status).toBe(400);

        const missing = makeRequest(id, {});
        expect((await POST(missing.request, missing.ctx)).status).toBe(400);

        const rows = await getDb().select().from(messages).where(eq(messages.conversationId, id));
        expect(rows).toHaveLength(0);
    });

    it("returns 400 message_too_long when content exceeds 50,000 chars and persists nothing", async () => {
        authMock.mockResolvedValue(SESSION);
        const id = await seedThread({ state: "awaiting_you", email: "k@e.dev" });

        const { request, ctx } = makeRequest(id, { content: "a".repeat(50_001) });
        const res = await POST(request, ctx);

        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ error: "message_too_long", maxLength: 50000 });

        const rows = await getDb().select().from(messages).where(eq(messages.conversationId, id));
        expect(rows).toHaveLength(0);
    });

    it("accepts a reply of exactly 50,000 chars (boundary) and persists it", async () => {
        authMock.mockResolvedValue(SESSION);
        const id = await seedThread({ state: "active_you", email: "k@e.dev" });
        const atLimit = "a".repeat(50_000);

        const eventsPromise = collectEvents(id, 1);

        const { request, ctx } = makeRequest(id, { content: atLimit });
        const res = await POST(request, ctx);
        expect(res.status).toBe(202);

        await eventsPromise;

        const rows = await getDb()
            .select({ sender: messages.sender, content: messages.content })
            .from(messages)
            .where(eq(messages.conversationId, id));
        expect(rows).toHaveLength(1);
        expect(rows[0].sender).toBe("human");
        expect(rows[0].content).toBe(atLimit);
    });

    it("on active_you, persists only the human message and broadcasts only the human event", async () => {
        authMock.mockResolvedValue(SESSION);
        const id = await seedThread({ state: "active_you", email: "k@e.dev" });

        const eventsPromise = collectEvents(id, 1);

        const { request, ctx } = makeRequest(id, { content: "follow up" });
        const res = await POST(request, ctx);
        expect(res.status).toBe(202);

        const events = await eventsPromise;
        const messageEvents = events.filter((ev): ev is SseMessageEvent => ev.type === "message");
        expect(messageEvents).toHaveLength(1);
        expect(messageEvents[0].message.sender).toBe("human");
        expect(messageEvents[0].message.content).toBe("follow up");

        const rows = await getDb()
            .select()
            .from(messages)
            .where(eq(messages.conversationId, id))
            .orderBy(asc(messages.createdAt));
        expect(rows.map((r) => r.sender)).toEqual(["human"]);

        const [convo] = await getDb()
            .select({ state: conversations.state })
            .from(conversations)
            .where(eq(conversations.id, id));
        expect(convo.state).toBe("active_you");
    });

    it("on awaiting_visitor (proactive join), also persists join + transitions to active_you", async () => {
        authMock.mockResolvedValue(SESSION);
        const id = await seedThread({ state: "awaiting_visitor", email: "j@b.dev" });

        const eventsPromise = collectEvents(id, 2);

        const { request, ctx } = makeRequest(id, { content: "circling back" });
        const res = await POST(request, ctx);
        expect(res.status).toBe(202);

        const events = await eventsPromise;
        const messageEvents = events.filter((ev): ev is SseMessageEvent => ev.type === "message");
        expect(messageEvents.map((m) => m.message.sender)).toEqual(["system", "human"]);

        const [convo] = await getDb()
            .select({ state: conversations.state })
            .from(conversations)
            .where(eq(conversations.id, id));
        expect(convo.state).toBe("active_you");
    });

    it("broadcasts a state_changed event on transition to active_you", async () => {
        authMock.mockResolvedValue(SESSION);
        const id = await seedThread({ state: "awaiting_you", email: "x@y.io" });

        const eventsPromise = collectEvents(id, 3);

        const { request, ctx } = makeRequest(id, { content: "hi" });
        const res = await POST(request, ctx);
        expect(res.status).toBe(202);

        const events = await eventsPromise;
        const stateChanged = events.find((ev) => ev.type === "state_changed");
        expect(stateChanged).toBeDefined();
        if (stateChanged?.type !== "state_changed") throw new Error("unreachable");
        expect(stateChanged.state).toBe("active_you");
    });

    it("does not broadcast state_changed when state is unchanged (active_you → active_you)", async () => {
        authMock.mockResolvedValue(SESSION);
        const id = await seedThread({ state: "active_you", email: "x@y.io" });

        const eventsPromise = collectEvents(id, 1);

        const { request, ctx } = makeRequest(id, { content: "follow up" });
        await POST(request, ctx);
        const events = await eventsPromise;

        expect(events.some((ev) => ev.type === "state_changed")).toBe(false);
    });

    it("on awaiting_you, persists join system + human messages, transitions state, broadcasts both", async () => {
        authMock.mockResolvedValue(SESSION);
        const id = await seedThread({
            state: "awaiting_you",
            email: "priya@northwind.io",
            firstName: "Priya",
        });

        const eventsPromise = collectEvents(id, 2);

        const { request, ctx } = makeRequest(id, { content: "hi Priya, how can I help?" });
        const res = await POST(request, ctx);
        expect(res.status).toBe(202);

        const events = await eventsPromise;
        const messageEvents = events.filter((ev): ev is SseMessageEvent => ev.type === "message");
        expect(messageEvents).toHaveLength(2);
        expect(messageEvents[0].message.sender).toBe("system");
        expect(messageEvents[0].message.content).toBe(JOIN_SYSTEM_MESSAGE);
        expect(messageEvents[1].message.sender).toBe("human");
        expect(messageEvents[1].message.content).toBe("hi Priya, how can I help?");

        const rows = await getDb()
            .select()
            .from(messages)
            .where(eq(messages.conversationId, id))
            .orderBy(asc(messages.createdAt));
        expect(rows.map((r) => r.sender)).toEqual(["system", "human"]);
        expect(rows[0].content).toBe(JOIN_SYSTEM_MESSAGE);
        expect(rows[1].content).toBe("hi Priya, how can I help?");

        const [convo] = await getDb()
            .select({ state: conversations.state })
            .from(conversations)
            .where(eq(conversations.id, id));
        expect(convo.state).toBe("active_you");
    });
});
