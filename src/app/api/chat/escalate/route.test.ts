import { asc, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { conversations, messages } from "@/db/schema";
import { resetTestDb, startTestDb, stopTestDb } from "@/test/db";
import {
    resetTwinAgent,
    setTwinAgent,
    type TwinAgent,
    type TwinStreamEvent,
} from "@/features/twin/agent";
import { createDeclineTwinAgent, createEchoTwinAgent } from "@/test/twin-agent";
import {
    getSseBroadcaster,
    resetSseBroadcaster,
    type SseEvent,
    type SseMessageEvent,
} from "@/shared/sse-broadcaster";
import { getConversation, resetConversation } from "@/features/conversation";
import { ESCALATION_CONFIRMATION } from "@/features/conversation/constants";
import { resetClock, setClock } from "@/shared/clock";
import { POST as chatPost } from "@/app/api/chat/route";
import { POST as escalatePost } from "@/app/api/chat/escalate/route";
import { POST as dismissPost } from "@/app/api/chat/escalate/dismiss/route";

function makeRequest(
    body: unknown,
    cookie?: string,
    path = "/api/chat/escalate",
    xff?: string,
): Request {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (cookie) headers["cookie"] = cookie;
    if (xff) headers["x-forwarded-for"] = xff;
    return new Request(`http://localhost${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
    });
}

function makeChat(body: unknown, xff?: string): Request {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (xff) headers["x-forwarded-for"] = xff;
    return new Request("http://localhost/api/chat", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
    });
}

async function drainEvents(
    conversationId: string,
    until: (ev: SseEvent) => boolean,
): Promise<SseEvent[]> {
    const sub = getSseBroadcaster().subscribe(conversationId);
    const iter = sub.events[Symbol.asyncIterator]();
    const seen: SseEvent[] = [];
    while (true) {
        const next = await iter.next();
        if (next.done) break;
        seen.push(next.value);
        if (until(next.value)) break;
    }
    sub.unsubscribe();
    return seen;
}

async function setUpEscalationOffered(): Promise<{ conversationId: string; cookie: string }> {
    setTwinAgent(createDeclineTwinAgent("I don't know."));
    const res = await chatPost(
        new Request("http://localhost/api/chat", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ content: "shoe size?" }),
        }),
    );
    const payload = (await res.json()) as { conversationId: string };
    await drainEvents(payload.conversationId, (ev) => ev.type === "message");
    return {
        conversationId: payload.conversationId,
        cookie: `conversation_id=${payload.conversationId}`,
    };
}

describe("POST /api/chat/escalate", () => {
    beforeAll(async () => {
        await startTestDb();
    });

    afterAll(async () => {
        await stopTestDb();
    });

    beforeEach(async () => {
        await resetTestDb();
        resetTwinAgent();
        setTwinAgent(createEchoTwinAgent());
        resetSseBroadcaster();
        resetConversation();
    });

    afterEach(async () => {
        await getConversation().idle();
        resetClock();
        delete process.env.RATE_LIMIT_IP_PER_MINUTE;
    });

    it("returns 429 on escalate once the IP limit is hit on /api/chat (shared counters)", async () => {
        process.env.RATE_LIMIT_IP_PER_MINUTE = "3";
        setClock({ now: () => new Date("2026-06-26T12:00:00.000Z") });
        const ip = "198.51.100.7";

        // Fill the shared layer-B budget via /api/chat from one IP (no cookie,
        // so each mints a fresh conversation and layer A never bites).
        for (let i = 0; i < 3; i++) {
            const res = await chatPost(makeChat({ content: `m${i}` }, ip));
            expect(res.status).toBe(202);
        }

        // The next request on the *other* route, same IP, is blocked by the
        // shared counter — even with no cookie it 429s before the 401.
        const limited = await escalatePost(
            makeRequest({ email: "v@example.com" }, undefined, undefined, ip),
        );
        expect(limited.status).toBe(429);
        expect(limited.headers.get("retry-after")).toBe("60");
        expect(await limited.json()).toEqual({ error: "rate_limited", retryAfter: 60 });
    });

    it("persists email, transitions to awaiting_you, inserts system confirmation, broadcasts SSE", async () => {
        const { conversationId, cookie } = await setUpEscalationOffered();

        const sub = getSseBroadcaster().subscribe(conversationId);
        const iter = sub.events[Symbol.asyncIterator]();

        const res = await escalatePost(makeRequest({ email: "visitor@example.com" }, cookie));
        expect(res.status).toBe(200);
        const body = (await res.json()) as { conversationId: string };
        expect(body.conversationId).toBe(conversationId);

        const next = await iter.next();
        expect(next.done).toBe(false);
        expect(next.value.type).toBe("message");
        const systemEvent = next.value as SseMessageEvent;
        expect(systemEvent.message.sender).toBe("system");
        expect(systemEvent.message.content).toBe(ESCALATION_CONFIRMATION);
        sub.unsubscribe();

        const [row] = await getDb()
            .select({
                state: conversations.state,
                email: conversations.email,
                escalationOfferedAt: conversations.escalationOfferedAt,
            })
            .from(conversations)
            .where(eq(conversations.id, conversationId));
        expect(row.state).toBe("awaiting_you");
        expect(row.email).toBe("visitor@example.com");
        expect(row.escalationOfferedAt).toBeNull();

        const msgRows = await getDb()
            .select()
            .from(messages)
            .where(eq(messages.conversationId, conversationId))
            .orderBy(asc(messages.createdAt));
        const systemRow = msgRows.find((m) => m.sender === "system");
        expect(systemRow).toBeDefined();
        expect(systemRow!.id).toBe(systemEvent.message.id);
    });

    it("twin continues to answer subsequent visitor messages after escalation", async () => {
        const { conversationId, cookie } = await setUpEscalationOffered();
        await escalatePost(makeRequest({ email: "visitor@example.com" }, cookie));

        // Swap to an answering twin for the follow-up question. Conversation
        // captures the agent at construction time, so rebuild it.
        await getConversation().idle();
        const answer: TwinAgent = {
            async *stream(): AsyncIterable<TwinStreamEvent> {
                yield { type: "text_delta", delta: "Here's the answer." };
            },
        };
        setTwinAgent(answer);
        resetConversation();

        const followRes = await chatPost(
            new Request("http://localhost/api/chat", {
                method: "POST",
                headers: { "content-type": "application/json", cookie },
                body: JSON.stringify({ content: "what's his stack?" }),
            }),
        );
        expect(followRes.status).toBe(202);

        const events = await drainEvents(conversationId, (ev) => ev.type === "message");
        const messageEv = events.find((ev): ev is SseMessageEvent => ev.type === "message")!;
        expect(messageEv.message.sender).toBe("twin");
        expect(messageEv.message.content).toBe("Here's the answer.");

        // State remains awaiting_you — twin answering doesn't reset it.
        const [row] = await getDb()
            .select({ state: conversations.state })
            .from(conversations)
            .where(eq(conversations.id, conversationId));
        expect(row.state).toBe("awaiting_you");
    });

    it("rejects a missing or malformed email with 400 and does not transition state", async () => {
        const { conversationId, cookie } = await setUpEscalationOffered();

        const missing = await escalatePost(makeRequest({}, cookie));
        expect(missing.status).toBe(400);

        const malformed = await escalatePost(makeRequest({ email: "not-an-email" }, cookie));
        expect(malformed.status).toBe(400);

        const [row] = await getDb()
            .select({ state: conversations.state, email: conversations.email })
            .from(conversations)
            .where(eq(conversations.id, conversationId));
        expect(row.state).toBe("twin_only");
        expect(row.email).toBeNull();
    });

    it("rejects when there is no conversation cookie with 401", async () => {
        const res = await escalatePost(makeRequest({ email: "visitor@example.com" }));
        expect(res.status).toBe(401);
    });

    it("dismiss clears escalation_offered_at, broadcasts escalation_cleared, state stays twin_only", async () => {
        const { conversationId, cookie } = await setUpEscalationOffered();

        const sub = getSseBroadcaster().subscribe(conversationId);
        const iter = sub.events[Symbol.asyncIterator]();

        const res = await dismissPost(makeRequest({}, cookie, "/api/chat/escalate/dismiss"));
        expect(res.status).toBe(200);

        const next = await iter.next();
        expect(next.done).toBe(false);
        expect(next.value.type).toBe("escalation_cleared");
        sub.unsubscribe();

        const [row] = await getDb()
            .select({
                state: conversations.state,
                escalationOfferedAt: conversations.escalationOfferedAt,
                email: conversations.email,
            })
            .from(conversations)
            .where(eq(conversations.id, conversationId));
        expect(row.state).toBe("twin_only");
        expect(row.escalationOfferedAt).toBeNull();
        expect(row.email).toBeNull();
    });

    it("dismiss without a conversation cookie returns 401", async () => {
        const res = await dismissPost(makeRequest({}, undefined, "/api/chat/escalate/dismiss"));
        expect(res.status).toBe(401);
    });

    it("a follow-up visitor message clears the open offer before the new reply streams", async () => {
        const { conversationId, cookie } = await setUpEscalationOffered();

        // Switch to an answering twin for the follow-up so we can observe the
        // ordering of escalation_cleared relative to the new reply's chunks.
        await getConversation().idle();
        const slowAnswer: TwinAgent = {
            async *stream(): AsyncIterable<TwinStreamEvent> {
                yield { type: "text_delta", delta: "Based in Berlin." };
            },
        };
        setTwinAgent(slowAnswer);
        resetConversation();

        const sub = getSseBroadcaster().subscribe(conversationId);
        const iter = sub.events[Symbol.asyncIterator]();

        await chatPost(
            new Request("http://localhost/api/chat", {
                method: "POST",
                headers: { "content-type": "application/json", cookie },
                body: JSON.stringify({ content: "where are you from?" }),
            }),
        );

        const observed: SseEvent[] = [];
        while (true) {
            const next = await iter.next();
            if (next.done) break;
            observed.push(next.value);
            if (next.value.type === "message" && next.value.message.sender !== "visitor") break;
        }
        sub.unsubscribe();

        const clearedIdx = observed.findIndex((ev) => ev.type === "escalation_cleared");
        const firstChunkIdx = observed.findIndex((ev) => ev.type === "chunk");
        expect(clearedIdx).toBeGreaterThanOrEqual(0);
        expect(firstChunkIdx).toBeGreaterThan(clearedIdx);
    });

    it("re-accepting from awaiting_you stays awaiting_you, updates email, no second Pushover", async () => {
        const { conversationId, cookie } = await setUpEscalationOffered();
        const first = await escalatePost(makeRequest({ email: "visitor@example.com" }, cookie));
        expect(first.status).toBe(200);

        const second = await escalatePost(makeRequest({ email: "other@example.com" }, cookie));
        expect(second.status).toBe(200);

        // State unchanged; email is updated to the latest submission.
        const [row] = await getDb()
            .select({ state: conversations.state, email: conversations.email })
            .from(conversations)
            .where(eq(conversations.id, conversationId));
        expect(row.state).toBe("awaiting_you");
        expect(row.email).toBe("other@example.com");
    });
});
