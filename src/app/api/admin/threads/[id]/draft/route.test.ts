import { asc, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@openai/agents", () => ({
    Agent: vi.fn(),
    run: vi.fn(),
    tool: vi.fn((cfg: unknown) => cfg),
    withTrace: vi.fn(async (_name: string, fn: (trace: unknown) => Promise<unknown>) => fn(null)),
}));

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
import { resetTwinAgent, setTwinAgent } from "@/features/twin/agent";
import { createEchoTwinAgent } from "@/test/twin-agent";

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));

import { POST } from "@/app/api/admin/threads/[id]/draft/route";

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

async function seedVisitorMessage(conversationId: string, content: string): Promise<void> {
    await getDb().insert(messages).values({ conversationId, sender: "visitor", content });
}

function makeRequest(id: string): {
    request: Request;
    ctx: { params: Promise<{ id: string }> };
} {
    return {
        request: new Request(`http://localhost/api/admin/threads/${id}/draft`, {
            method: "POST",
        }),
        ctx: { params: Promise.resolve({ id }) },
    };
}

async function drainUntilTwinMessage(conversationId: string): Promise<SseEvent[]> {
    const sub = getSseBroadcaster().subscribe(conversationId);
    const iter = sub.events[Symbol.asyncIterator]();
    const seen: SseEvent[] = [];
    while (true) {
        const next = await iter.next();
        if (next.done) break;
        seen.push(next.value);
        if (next.value.type === "message" && next.value.message.sender === "twin") break;
    }
    sub.unsubscribe();
    return seen;
}

describe("POST /api/admin/threads/[id]/draft", () => {
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

    it("returns 401 when not authenticated", async () => {
        authMock.mockResolvedValue(null);
        const id = await seedThread({ state: "active_you", email: "x@y.io" });
        const { request, ctx } = makeRequest(id);
        const res = await POST(request, ctx);
        expect(res.status).toBe(401);
    });

    it("returns 404 for an unknown conversation id", async () => {
        authMock.mockResolvedValue(SESSION);
        const { request, ctx } = makeRequest("00000000-0000-0000-0000-000000000000");
        const res = await POST(request, ctx);
        expect(res.status).toBe(404);
    });

    it("returns 409 when the thread is not in active_you", async () => {
        authMock.mockResolvedValue(SESSION);
        const id = await seedThread({ state: "awaiting_you", email: "x@y.io" });
        const { request, ctx } = makeRequest(id);
        const res = await POST(request, ctx);
        expect(res.status).toBe(409);

        await getConversation().idle();
        const rows = await getDb().select().from(messages).where(eq(messages.conversationId, id));
        expect(rows).toHaveLength(0);
    });

    it("from active_you, streams a twin reply, persists as sender=twin, leaves state at active_you", async () => {
        authMock.mockResolvedValue(SESSION);
        const id = await seedThread({
            state: "active_you",
            email: "priya@northwind.io",
            firstName: "Priya",
        });
        await seedVisitorMessage(id, "any update?");

        const eventsPromise = drainUntilTwinMessage(id);

        const { request, ctx } = makeRequest(id);
        const res = await POST(request, ctx);
        expect(res.status).toBe(202);

        const events = await eventsPromise;

        const chunkEvents = events.filter((ev) => ev.type === "chunk");
        expect(chunkEvents.length).toBeGreaterThan(0);
        expect(chunkEvents.every((ev) => ev.type === "chunk" && ev.sender === "twin")).toBe(true);

        const twinMessage = events
            .filter((ev): ev is SseMessageEvent => ev.type === "message")
            .find((ev) => ev.message.sender === "twin")!;
        expect(twinMessage.message.content).toBe("Echo: any update?");

        const rows = await getDb()
            .select()
            .from(messages)
            .where(eq(messages.conversationId, id))
            .orderBy(asc(messages.createdAt));
        expect(rows.map((r) => r.sender)).toEqual(["visitor", "twin"]);
        expect(rows[1].content).toBe("Echo: any update?");

        const [convo] = await getDb()
            .select({ state: conversations.state })
            .from(conversations)
            .where(eq(conversations.id, id));
        expect(convo.state).toBe("active_you");

        expect(events.some((ev) => ev.type === "state_changed")).toBe(false);
    });
});
