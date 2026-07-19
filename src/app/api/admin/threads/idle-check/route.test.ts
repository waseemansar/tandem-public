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
import { resetClock, setClock } from "@/shared/clock";

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));

import { POST } from "@/app/api/admin/threads/idle-check/route";

const SESSION = { user: { email: "admin@example.com" } };
const STEP_OUT_MESSAGE = STEP_OUT_SYSTEM_MESSAGE;
const T0 = new Date("2026-06-08T12:00:00Z");

async function seedThread(opts: {
    state: "twin_only" | "awaiting_you" | "active_you" | "awaiting_visitor" | "resolved";
    lastHumanActivityAt?: Date | null;
    email?: string | null;
}): Promise<string> {
    const db = getDb();
    const [row] = await db
        .insert(conversations)
        .values({
            state: opts.state,
            email: opts.email ?? null,
            lastHumanActivityAt: opts.lastHumanActivityAt ?? null,
        })
        .returning({ id: conversations.id });
    return row.id;
}

function makeRequest(): Request {
    return new Request("http://localhost/api/admin/threads/idle-check", { method: "POST" });
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

describe("POST /api/admin/threads/idle-check", () => {
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
        resetClock();
    });

    afterEach(async () => {
        await getConversation().idle();
        resetClock();
    });

    it("returns 401 when not authenticated", async () => {
        authMock.mockResolvedValue(null);
        const res = await POST(makeRequest());
        expect(res.status).toBe(401);
    });

    it("returns 200 with sweptCount=0 when no threads are idle", async () => {
        authMock.mockResolvedValue(SESSION);
        setClock({ now: () => T0 });

        await seedThread({
            state: "active_you",
            email: "k@e.dev",
            lastHumanActivityAt: new Date(T0.getTime() - 10 * 60 * 1000),
        });

        const res = await POST(makeRequest());
        expect(res.status).toBe(200);
        const body = (await res.json()) as { sweptCount: number };
        expect(body.sweptCount).toBe(0);
    });

    it("sweeps an active_you thread whose lastHumanActivityAt is older than 30 minutes", async () => {
        authMock.mockResolvedValue(SESSION);
        setClock({ now: () => T0 });

        const id = await seedThread({
            state: "active_you",
            email: "k@e.dev",
            lastHumanActivityAt: new Date(T0.getTime() - 31 * 60 * 1000),
        });

        const eventsPromise = collectEvents(id, 2);

        const res = await POST(makeRequest());
        expect(res.status).toBe(200);
        const body = (await res.json()) as { sweptCount: number };
        expect(body.sweptCount).toBe(1);

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

        const [convo] = await getDb()
            .select({ state: conversations.state })
            .from(conversations)
            .where(eq(conversations.id, id));
        expect(convo.state).toBe("awaiting_visitor");
    });

    it("does not sweep threads that are not in active_you", async () => {
        authMock.mockResolvedValue(SESSION);
        setClock({ now: () => T0 });

        const id = await seedThread({
            state: "awaiting_you",
            email: "k@e.dev",
            lastHumanActivityAt: new Date(T0.getTime() - 24 * 60 * 60 * 1000),
        });

        const res = await POST(makeRequest());
        const body = (await res.json()) as { sweptCount: number };
        expect(body.sweptCount).toBe(0);

        const rows = await getDb().select().from(messages).where(eq(messages.conversationId, id));
        expect(rows).toHaveLength(0);
    });

    it("sweep is exact: at exactly 30 minutes it does NOT fire; at 30:00 + 1ms it does", async () => {
        authMock.mockResolvedValue(SESSION);
        setClock({ now: () => T0 });

        const exactly = await seedThread({
            state: "active_you",
            email: "a@a.io",
            lastHumanActivityAt: new Date(T0.getTime() - 30 * 60 * 1000),
        });
        const justOver = await seedThread({
            state: "active_you",
            email: "b@b.io",
            lastHumanActivityAt: new Date(T0.getTime() - 30 * 60 * 1000 - 1),
        });

        const res = await POST(makeRequest());
        const body = (await res.json()) as { sweptCount: number };
        expect(body.sweptCount).toBe(1);

        const [exactlyConvo] = await getDb()
            .select({ state: conversations.state })
            .from(conversations)
            .where(eq(conversations.id, exactly));
        expect(exactlyConvo.state).toBe("active_you");

        const [justOverConvo] = await getDb()
            .select({ state: conversations.state })
            .from(conversations)
            .where(eq(conversations.id, justOver));
        expect(justOverConvo.state).toBe("awaiting_visitor");
    });
});
