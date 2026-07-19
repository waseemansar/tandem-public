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
import { STEP_OUT_SYSTEM_MESSAGE } from "@/features/conversation/constants";
import { resetTwinAgent, setTwinAgent } from "@/features/twin/agent";
import { createEchoTwinAgent } from "@/test/twin-agent";

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));

import { POST } from "@/app/api/admin/threads/[id]/hand-back/route";

const SESSION = { user: { email: "admin@example.com" } };
const STEP_OUT_MESSAGE = STEP_OUT_SYSTEM_MESSAGE;

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

function makeRequest(id: string): {
    request: Request;
    ctx: { params: Promise<{ id: string }> };
} {
    return {
        request: new Request(`http://localhost/api/admin/threads/${id}/hand-back`, {
            method: "POST",
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

describe("POST /api/admin/threads/[id]/hand-back", () => {
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
        const id = await seedThread({ state: "active_you", email: "x@y.io" });
        const { request, ctx } = makeRequest(id);
        const res = await POST(request, ctx);
        expect(res.status).toBe(401);

        const rows = await getDb().select().from(messages).where(eq(messages.conversationId, id));
        expect(rows).toHaveLength(0);
    });

    it("from active_you, transitions to awaiting_visitor, persists step-out, broadcasts message + state_changed", async () => {
        authMock.mockResolvedValue(SESSION);
        const id = await seedThread({ state: "active_you", email: "k@e.dev" });

        const eventsPromise = collectEvents(id, 2);

        const { request, ctx } = makeRequest(id);
        const res = await POST(request, ctx);
        expect(res.status).toBe(202);

        const events = await eventsPromise;
        const messageEvents = events.filter((ev): ev is SseMessageEvent => ev.type === "message");
        expect(messageEvents).toHaveLength(1);
        expect(messageEvents[0].message.sender).toBe("system");
        expect(messageEvents[0].message.content).toBe(STEP_OUT_MESSAGE);

        const stateChanged = events.find((ev) => ev.type === "state_changed");
        expect(stateChanged).toBeDefined();
        if (stateChanged?.type !== "state_changed") throw new Error("unreachable");
        expect(stateChanged.state).toBe("awaiting_visitor");

        const rows = await getDb()
            .select()
            .from(messages)
            .where(eq(messages.conversationId, id))
            .orderBy(asc(messages.createdAt));
        expect(rows.map((r) => r.sender)).toEqual(["system"]);
        expect(rows[0].content).toBe(STEP_OUT_MESSAGE);

        const [convo] = await getDb()
            .select({ state: conversations.state })
            .from(conversations)
            .where(eq(conversations.id, id));
        expect(convo.state).toBe("awaiting_visitor");
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

        const rows = await getDb().select().from(messages).where(eq(messages.conversationId, id));
        expect(rows).toHaveLength(0);

        const [convo] = await getDb()
            .select({ state: conversations.state })
            .from(conversations)
            .where(eq(conversations.id, id));
        expect(convo.state).toBe("awaiting_you");
    });
});
