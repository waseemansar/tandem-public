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
import { conversations, messages } from "@/db/schema";
import { resetTestDb, startTestDb, stopTestDb } from "@/test/db";
import {
    resetTwinAgent,
    setTwinAgent,
    type TwinAgent,
    type TwinAgentInput,
    type TwinStreamEvent,
} from "@/features/twin/agent";
import {
    createDeclineTwinAgent,
    createEchoTwinAgent,
    createPausingThenEchoingTwinAgent,
} from "@/test/twin-agent";
import {
    getSseBroadcaster,
    resetSseBroadcaster,
    type SseEvent,
    type SseMessageEvent,
} from "@/shared/sse-broadcaster";
import { setLiveDoc } from "@/features/twin/knowledge-doc";
import { getConversation, resetConversation } from "@/features/conversation";
import {
    TWIN_DISABLED_MESSAGE,
    TWIN_RATE_LIMITED_MESSAGE,
} from "@/features/conversation/constants";
import { resetClock, setClock } from "@/shared/clock";
import { GET, POST } from "@/app/api/chat/route";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function makeRequest(body: unknown, cookie?: string, xff?: string): Request {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (cookie) headers["cookie"] = cookie;
    if (xff) headers["x-forwarded-for"] = xff;
    return new Request("http://localhost/api/chat", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
    });
}

function makeGetRequest(cookie?: string): Request {
    const headers: Record<string, string> = {};
    if (cookie) headers["cookie"] = cookie;
    return new Request("http://localhost/api/chat", { method: "GET", headers });
}

async function drainEvents(
    payload: { conversationId: string },
    until: (ev: SseEvent) => boolean,
): Promise<SseEvent[]> {
    const sub = getSseBroadcaster().subscribe(payload.conversationId);
    const iter = sub.events[Symbol.asyncIterator]();
    const seen: SseEvent[] = [];
    while (true) {
        const next = await iter.next();
        if (next.done) break;
        const ev = next.value;
        seen.push(ev);
        if (until(ev)) break;
    }
    sub.unsubscribe();
    return seen;
}

async function postAndAwaitTwinMessage(body: unknown, cookie?: string) {
    const res = await POST(makeRequest(body, cookie));
    const payload = (await res.json()) as { conversationId: string };
    const events = await drainEvents(
        payload,
        (ev) => ev.type === "message" && ev.message.sender !== "visitor",
    );
    const message = events
        .filter((ev): ev is SseMessageEvent => ev.type === "message")
        .find((ev) => ev.message.sender !== "visitor")!;
    return { res, payload, events, message };
}

describe("POST /api/chat", () => {
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
        delete process.env.DISABLE_TWIN;
    });

    it("first POST returns a 202 ack with conversationId and the persisted visitor messageId", async () => {
        const res = await POST(makeRequest({ content: "hello" }));

        expect(res.status).toBe(202);
        const body = (await res.json()) as Record<string, unknown>;

        expect(body.conversationId).toMatch(UUID_RE);
        expect(body.messageId).toMatch(UUID_RE);
        expect(body.reply).toBeUndefined();

        const msgRows = await getDb()
            .select({ id: messages.id })
            .from(messages)
            .where(eq(messages.sender, "visitor"));
        expect(msgRows.map((r) => r.id)).toContain(body.messageId);

        const setCookie = res.headers.get("set-cookie") ?? "";
        expect(setCookie).toContain(`conversation_id=${body.conversationId as string}`);
    });

    it("streams twin chunks then a final message event, persisting the assembled reply", async () => {
        const { payload, events, message } = await postAndAwaitTwinMessage({ content: "hello" });

        const chunkEvents = events.filter((ev) => ev.type === "chunk");
        expect(chunkEvents.length).toBeGreaterThan(0);
        expect(chunkEvents.every((ev) => ev.type === "chunk" && ev.sender === "twin")).toBe(true);

        expect(message.message.sender).toBe("twin");
        expect(message.message.content).toBe("Echo: hello");

        const db = getDb();
        const convoRows = await db.select().from(conversations);
        expect(convoRows).toHaveLength(1);
        expect(convoRows[0].id).toBe(payload.conversationId);

        const msgRows = await db.select().from(messages).orderBy(asc(messages.createdAt));
        expect(msgRows).toHaveLength(2);
        expect(msgRows.map((m) => m.sender)).toEqual(["visitor", "twin"]);
        expect(msgRows[0].content).toBe("hello");
        expect(msgRows[1].content).toBe("Echo: hello");
        expect(msgRows[1].id).toBe(message.message.id);
    });

    it("subsequent POST with cookie reuses the same conversation", async () => {
        const first = await postAndAwaitTwinMessage({ content: "first" });
        const conversationId = first.payload.conversationId;

        const second = await postAndAwaitTwinMessage(
            { content: "second" },
            `conversation_id=${conversationId}`,
        );
        expect(second.payload.conversationId).toBe(conversationId);

        const db = getDb();
        expect(await db.select().from(conversations)).toHaveLength(1);

        const msgRows = await db.select().from(messages);
        expect(msgRows).toHaveLength(4);
        expect(msgRows.every((m) => m.conversationId === conversationId)).toBe(true);
    });

    it("invokes TwinAgent.stream with the live knowledge doc and a rendered transcript ending in the latest visitor message", async () => {
        await setLiveDoc("# Live doc\n\nWaseem Ansar lives in Berlin.");
        const calls: TwinAgentInput[] = [];
        const fake: TwinAgent = {
            async *stream(input): AsyncIterable<TwinStreamEvent> {
                calls.push(input);
                yield { type: "text_delta", delta: "ok" };
            },
        };
        setTwinAgent(fake);

        await postAndAwaitTwinMessage({ content: "what's your stack?" });

        expect(calls).toHaveLength(1);
        expect(calls[0].transcript).toBe("Visitor: what's your stack?");
        expect(calls[0].doc).toBe("# Live doc\n\nWaseem Ansar lives in Berlin.");
    });

    it("wraps the twin reply turn in withTrace with workflow name 'Twin Turn' and groupId equal to the conversation id", async () => {
        const mockedWithTrace = vi.mocked(withTrace);
        mockedWithTrace.mockClear();

        const { payload } = await postAndAwaitTwinMessage({ content: "hello" });

        expect(mockedWithTrace).toHaveBeenCalledTimes(1);
        expect(mockedWithTrace).toHaveBeenCalledWith(
            "Twin Turn",
            expect.any(Function),
            expect.objectContaining({ groupId: payload.conversationId }),
        );
    });

    it("includes prior turns in the transcript on a follow-up visitor message", async () => {
        const calls: TwinAgentInput[] = [];
        const fake: TwinAgent = {
            async *stream(input): AsyncIterable<TwinStreamEvent> {
                calls.push(input);
                yield { type: "text_delta", delta: "Next.js, Postgres, Drizzle." };
            },
        };
        setTwinAgent(fake);

        const { payload } = await postAndAwaitTwinMessage({
            content: "what's your stack?",
            firstName: "Priya",
        });
        await getConversation().idle();

        await postAndAwaitTwinMessage(
            { content: "and the deploy target?" },
            `conversation_id=${payload.conversationId}`,
        );

        expect(calls).toHaveLength(2);
        expect(calls[1].transcript).toBe(
            "Visitor (Priya): what's your stack?\n\nTandem: Next.js, Postgres, Drizzle.\n\nVisitor (Priya): and the deploy target?",
        );
    });

    it("appends the escalation template after a request_human_handoff tool call", async () => {
        setTwinAgent(createDeclineTwinAgent("I don't have reliable information about that."));

        const { message, events } = await postAndAwaitTwinMessage({
            content: "what's his shoe size?",
        });

        expect(message.message.content).toContain("I don't have reliable information about that.");
        expect(message.message.content).toContain("just drop your email below");

        const chunks = events.filter((ev) => ev.type === "chunk");
        const fullDelta = chunks.map((ev) => (ev.type === "chunk" ? ev.delta : "")).join("");
        expect(fullDelta).toBe(message.message.content);

        const persisted = await getDb().select().from(messages).orderBy(asc(messages.createdAt));
        const twinRow = persisted.filter((m) => m.sender === "twin").at(-1)!;
        expect(twinRow.content).toBe(message.message.content);
    });

    it("clears escalation_offered_at and broadcasts escalation_cleared on a subsequent answering reply", async () => {
        // First reply offers.
        setTwinAgent(createDeclineTwinAgent("I don't know."));
        const { payload } = await postAndAwaitTwinMessage({ content: "shoe size?" });
        const conversationId = payload.conversationId;

        // Swap to an answering twin for the follow-up. Conversation captures
        // the agent at construction, so rebuild.
        await getConversation().idle();
        const answering: TwinAgent = {
            async *stream(): AsyncIterable<TwinStreamEvent> {
                yield { type: "text_delta", delta: "Based in Berlin." };
            },
        };
        setTwinAgent(answering);
        resetConversation();

        const { events } = await postAndAwaitTwinMessage(
            { content: "where are you from?" },
            `conversation_id=${conversationId}`,
        );

        expect(events.some((ev) => ev.type === "escalation_cleared")).toBe(true);

        const [row] = await getDb()
            .select({ escalationOfferedAt: conversations.escalationOfferedAt })
            .from(conversations)
            .where(eq(conversations.id, conversationId));
        expect(row.escalationOfferedAt).toBeNull();
    });

    it("records escalation_offered_at and broadcasts an escalation_offered event on tool call", async () => {
        setTwinAgent(createDeclineTwinAgent("I don't have that information."));

        const { payload, events, message } = await postAndAwaitTwinMessage({
            content: "what's his shoe size?",
        });

        const offered = events.find((ev) => ev.type === "escalation_offered");
        expect(offered).toBeDefined();
        expect(offered && offered.type === "escalation_offered" && offered.messageId).toBe(
            message.message.id,
        );

        const [row] = await getDb()
            .select({
                escalationOfferedAt: conversations.escalationOfferedAt,
                state: conversations.state,
            })
            .from(conversations)
            .where(eq(conversations.id, payload.conversationId));
        expect(row.escalationOfferedAt).toBeInstanceOf(Date);
        expect(row.state).toBe("twin_only");
    });

    it("aborts the in-flight twin stream when the visitor sends a superseding message", async () => {
        // First reply emits one chunk then pauses until abort; second reply echoes
        // immediately. Same agent instance — the conversation captures it once.
        setTwinAgent(createPausingThenEchoingTwinAgent("first-chunk "));

        const firstRes = await POST(makeRequest({ content: "first" }));
        const firstPayload = (await firstRes.json()) as { conversationId: string };

        const sub = getSseBroadcaster().subscribe(firstPayload.conversationId);
        const iter = sub.events[Symbol.asyncIterator]();

        const firstChunk = await iter.next();
        expect(firstChunk.value && (firstChunk.value as SseEvent).type).toBe("chunk");

        const cookie = `conversation_id=${firstPayload.conversationId}`;
        await POST(makeRequest({ content: "second" }, cookie));

        const eventsAfter: SseEvent[] = [];
        while (true) {
            const next = await iter.next();
            if (next.done) break;
            eventsAfter.push(next.value);
            if (next.value.type === "message" && next.value.message.sender !== "visitor") break;
        }
        sub.unsubscribe();

        const sawStreamError = eventsAfter.some(
            (ev) => ev.type === "stream_error" && ev.reason === "superseded",
        );
        expect(sawStreamError).toBe(true);

        const finalMessage = eventsAfter.find(
            (ev): ev is SseMessageEvent => ev.type === "message" && ev.message.sender !== "visitor",
        )!;
        expect(finalMessage.message.content).toBe("Echo: second");

        // No twin row was persisted for the aborted first reply — only one twin row exists.
        const twinRows = await getDb().select().from(messages).where(eq(messages.sender, "twin"));
        expect(twinRows).toHaveLength(1);
        expect(twinRows[0].content).toBe("Echo: second");
    });

    it("GET surfaces escalationOffered=true and state=twin_only after the twin declines", async () => {
        setTwinAgent(createDeclineTwinAgent("I don't know."));
        const { payload } = await postAndAwaitTwinMessage({ content: "shoe size?" });

        const res = await GET(makeGetRequest(`conversation_id=${payload.conversationId}`));
        const body = (await res.json()) as {
            state: string;
            escalationOffered: boolean;
        };
        expect(body.escalationOffered).toBe(true);
        expect(body.state).toBe("twin_only");
    });

    it("GET surfaces escalationOffered=false when the latest twin reply did not offer", async () => {
        const { payload } = await postAndAwaitTwinMessage({ content: "hello" });

        const res = await GET(makeGetRequest(`conversation_id=${payload.conversationId}`));
        const body = (await res.json()) as { escalationOffered: boolean; state: string };
        expect(body.escalationOffered).toBe(false);
        expect(body.state).toBe("twin_only");
    });

    it("GET with a valid conversation cookie returns the conversationId and ordered message history", async () => {
        const first = await postAndAwaitTwinMessage({ content: "hello" });
        const { conversationId } = first.payload;
        await postAndAwaitTwinMessage({ content: "second" }, `conversation_id=${conversationId}`);

        const res = await GET(makeGetRequest(`conversation_id=${conversationId}`));
        expect(res.status).toBe(200);
        const body = (await res.json()) as {
            conversationId: string;
            messages: Array<{ id: string; sender: string; content: string }>;
        };

        expect(body.conversationId).toBe(conversationId);
        expect(body.messages).toHaveLength(4);
        expect(body.messages.map((m) => m.sender)).toEqual(["visitor", "twin", "visitor", "twin"]);
        expect(body.messages[0].content).toBe("hello");
        expect(body.messages[2].content).toBe("second");
    });

    it("GET with no cookie returns empty payload", async () => {
        const res = await GET(makeGetRequest());
        expect(res.status).toBe(200);
        const body = (await res.json()) as { conversationId: string | null; messages: unknown[] };
        expect(body.conversationId).toBeNull();
        expect(body.messages).toEqual([]);
    });

    it("GET with a cookie that does not match any conversation returns empty payload", async () => {
        const unknown = "00000000-0000-0000-0000-000000000000";
        const res = await GET(makeGetRequest(`conversation_id=${unknown}`));
        expect(res.status).toBe(200);
        const body = (await res.json()) as { conversationId: string | null; messages: unknown[] };
        expect(body.conversationId).toBeNull();
        expect(body.messages).toEqual([]);
    });

    it("POST with keepChat=false does not set the conversation_id cookie", async () => {
        const res = await POST(makeRequest({ content: "hello", keepChat: false }));
        expect(res.status).toBe(202);
        expect(res.headers.get("set-cookie")).toBeNull();

        const convoRows = await getDb().select().from(conversations);
        expect(convoRows).toHaveLength(1);
    });

    it("POST without keepChat (default) still sets the conversation_id cookie", async () => {
        const res = await POST(makeRequest({ content: "hello" }));
        const body = (await res.json()) as { conversationId: string };
        expect(res.headers.get("set-cookie") ?? "").toContain(
            `conversation_id=${body.conversationId}`,
        );
    });

    it("POST with firstName persists it on the conversation when currently null", async () => {
        const { payload } = await postAndAwaitTwinMessage({ content: "hello", firstName: "Sam" });

        const [row] = await getDb()
            .select({ firstName: conversations.firstName })
            .from(conversations);
        expect(row.firstName).toBe("Sam");
        expect(payload.conversationId).toBeTruthy();
    });

    it("POST overwrites firstName on a subsequent message when a new value is sent", async () => {
        const first = await postAndAwaitTwinMessage({ content: "hello", firstName: "Sam" });
        const { conversationId } = first.payload;
        await postAndAwaitTwinMessage(
            { content: "second", firstName: "Alex" },
            `conversation_id=${conversationId}`,
        );

        const [row] = await getDb()
            .select({ firstName: conversations.firstName })
            .from(conversations);
        expect(row.firstName).toBe("Alex");
    });

    it("POST without a firstName leaves the existing firstName untouched", async () => {
        const first = await postAndAwaitTwinMessage({ content: "hello", firstName: "Sam" });
        const { conversationId } = first.payload;
        await postAndAwaitTwinMessage({ content: "second" }, `conversation_id=${conversationId}`);

        const [row] = await getDb()
            .select({ firstName: conversations.firstName })
            .from(conversations);
        expect(row.firstName).toBe("Sam");
    });

    it("does not schedule a twin reply when the conversation is in active_you", async () => {
        // Seed an existing conversation already in active_you (human has joined).
        const db = getDb();
        const [convo] = await db
            .insert(conversations)
            .values({ state: "active_you", email: "p@n.io", firstName: "Priya" })
            .returning({ id: conversations.id });
        const cookie = `conversation_id=${convo.id}`;

        const res = await POST(makeRequest({ content: "another visitor msg" }, cookie));
        expect(res.status).toBe(202);

        await getConversation().idle();

        const rows = await db.select().from(messages).where(eq(messages.conversationId, convo.id));
        expect(rows.map((r) => r.sender)).toEqual(["visitor"]);
        expect(rows[0].content).toBe("another visitor msg");
    });

    it("rejects a visitor POST on a resolved conversation with 409 and persists nothing", async () => {
        const db = getDb();
        const [convo] = await db
            .insert(conversations)
            .values({ state: "resolved", email: "p@n.io", firstName: "Priya" })
            .returning({ id: conversations.id });
        const cookie = `conversation_id=${convo.id}`;

        const res = await POST(makeRequest({ content: "still there?" }, cookie));
        expect(res.status).toBe(409);
        const body = (await res.json()) as { error: string };
        expect(body.error).toBe("conversation_closed");

        await getConversation().idle();

        const rows = await db.select().from(messages).where(eq(messages.conversationId, convo.id));
        expect(rows).toHaveLength(0);

        const [after] = await db
            .select({ state: conversations.state })
            .from(conversations)
            .where(eq(conversations.id, convo.id));
        expect(after.state).toBe("resolved");
    });

    it("rejects a body with missing or blank content with 400 and persists nothing", async () => {
        const missing = await POST(makeRequest({}));
        expect(missing.status).toBe(400);

        const blank = await POST(makeRequest({ content: "   " }));
        expect(blank.status).toBe(400);

        const db = getDb();
        expect(await db.select().from(conversations)).toHaveLength(0);
        expect(await db.select().from(messages)).toHaveLength(0);
    });

    it("rejects content over 10,000 chars with 400 message_too_long and persists nothing", async () => {
        const overLength = "a".repeat(10_001);
        const res = await POST(makeRequest({ content: overLength }));

        expect(res.status).toBe(400);
        const body = (await res.json()) as { error: string; maxLength: number };
        expect(body).toEqual({ error: "message_too_long", maxLength: 10000 });

        const db = getDb();
        expect(await db.select().from(conversations)).toHaveLength(0);
        expect(await db.select().from(messages)).toHaveLength(0);
    });

    it("returns 429 once the layer A 10/min limit is exceeded for a conversation_id", async () => {
        setClock({ now: () => new Date("2026-06-26T12:00:00.000Z") });

        // First message has no cookie, so layer A is skipped and it does not
        // consume the budget; it only mints the conversation + cookie.
        const first = await POST(makeRequest({ content: "hi" }));
        const { conversationId } = (await first.json()) as { conversationId: string };
        const cookie = `conversation_id=${conversationId}`;

        for (let i = 0; i < 10; i++) {
            const res = await POST(makeRequest({ content: `m${i}` }, cookie));
            expect(res.status).toBe(202);
        }

        const limited = await POST(makeRequest({ content: "one too many" }, cookie));
        expect(limited.status).toBe(429);
        expect(limited.headers.get("retry-after")).toBe("60");
        const body = (await limited.json()) as Record<string, unknown>;
        expect(body).toEqual({ error: "rate_limited", retryAfter: 60 });
    });

    it("catches a cookie-rotating flood from one IP via layer B, even with fresh first-messages", async () => {
        process.env.RATE_LIMIT_IP_PER_MINUTE = "3";
        setClock({ now: () => new Date("2026-06-26T12:00:00.000Z") });
        const ip = "203.0.113.42";

        // Each request has no cookie (a fresh conversation_id every time), so
        // layer A never bites — but layer B counts them all against the one IP.
        for (let i = 0; i < 3; i++) {
            const res = await POST(makeRequest({ content: `fresh ${i}` }, undefined, ip));
            expect(res.status).toBe(202);
        }

        const blocked = await POST(makeRequest({ content: "rotated again" }, undefined, ip));
        expect(blocked.status).toBe(429);
        expect(blocked.headers.get("retry-after")).toBe("60");
        expect(await blocked.json()).toEqual({ error: "rate_limited", retryAfter: 60 });
    });

    it("does not block the first message of a fresh session (no conversation_id cookie)", async () => {
        setClock({ now: () => new Date("2026-06-26T12:00:00.000Z") });

        // A first message with no cookie is never layer-A limited; many fresh
        // sessions in the same minute all succeed.
        for (let i = 0; i < 15; i++) {
            const res = await POST(makeRequest({ content: `fresh ${i}` }));
            expect(res.status).toBe(202);
        }
    });

    it("persists no message and broadcasts no SSE event on a 429", async () => {
        setClock({ now: () => new Date("2026-06-26T12:00:00.000Z") });

        const first = await POST(makeRequest({ content: "hi" }));
        const { conversationId } = (await first.json()) as { conversationId: string };
        const cookie = `conversation_id=${conversationId}`;
        for (let i = 0; i < 10; i++) await POST(makeRequest({ content: `m${i}` }, cookie));
        await getConversation().idle();

        const before = await getDb()
            .select({ id: messages.id })
            .from(messages)
            .where(eq(messages.conversationId, conversationId));

        const sub = getSseBroadcaster().subscribe(conversationId);
        const iter = sub.events[Symbol.asyncIterator]();

        const limited = await POST(makeRequest({ content: "blocked" }, cookie));
        expect(limited.status).toBe(429);

        const race = await Promise.race([
            iter.next().then((n) => n.value as SseEvent),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 100)),
        ]);
        sub.unsubscribe();
        expect(race).toBeNull();

        const after = await getDb()
            .select({ id: messages.id })
            .from(messages)
            .where(eq(messages.conversationId, conversationId));
        expect(after).toHaveLength(before.length);
    });

    it("with DISABLE_TWIN=true, persists the offline reply within the POST, before the 202 returns, without calling the agent", async () => {
        process.env.DISABLE_TWIN = "true";
        let streamCalls = 0;
        setTwinAgent({
            async *stream(): AsyncIterable<TwinStreamEvent> {
                streamCalls++;
                yield { type: "text_delta", delta: "should not run" };
            },
        } as TwinAgent);

        const res = await POST(makeRequest({ content: "hello" }));
        expect(res.status).toBe(202);
        const ack = (await res.json()) as { conversationId: string };

        // No idle() wait: the offline reply is committed synchronously during the
        // POST, so a fresh history read (what the real client does on SSE connect)
        // already reflects it — the first-message delivery race is closed.
        expect(streamCalls).toBe(0);
        const histRes = await GET(makeGetRequest(`conversation_id=${ack.conversationId}`));
        const body = (await histRes.json()) as {
            messages: Array<{ sender: string; content: string }>;
        };
        const twinMsgs = body.messages.filter((m) => m.sender === "twin");
        expect(twinMsgs.map((m) => m.content)).toEqual([TWIN_DISABLED_MESSAGE]);
    });

    it("with DISABLE_TWIN=true, offers escalation so the visitor can still leave their email", async () => {
        process.env.DISABLE_TWIN = "true";
        setTwinAgent({
            async *stream(): AsyncIterable<TwinStreamEvent> {
                yield { type: "text_delta", delta: "should not run" };
            },
        } as TwinAgent);

        const res = await POST(makeRequest({ content: "hello" }));
        const ack = (await res.json()) as { conversationId: string };

        const histRes = await GET(makeGetRequest(`conversation_id=${ack.conversationId}`));
        const body = (await histRes.json()) as { escalationOffered: boolean; state: string };
        expect(body.escalationOffered).toBe(true);
        expect(body.state).toBe("twin_only");
    });

    it("with DISABLE_TWIN=true, delivers the offline reply live to an already-subscribed visitor", async () => {
        process.env.DISABLE_TWIN = "true";
        setTwinAgent({
            async *stream(): AsyncIterable<TwinStreamEvent> {
                yield { type: "text_delta", delta: "should not run" };
            },
        } as TwinAgent);

        // First message mints the conversation + cookie.
        const first = await POST(makeRequest({ content: "hello" }));
        const { conversationId } = (await first.json()) as { conversationId: string };
        const cookie = `conversation_id=${conversationId}`;

        // A returning visitor already has the SSE stream open before sending.
        const sub = getSseBroadcaster().subscribe(conversationId);
        const iter = sub.events[Symbol.asyncIterator]();

        await POST(makeRequest({ content: "again" }, cookie));

        const seen: SseEvent[] = [];
        while (true) {
            const next = await iter.next();
            if (next.done) break;
            seen.push(next.value);
            if (next.value.type === "message" && next.value.message.sender === "twin") break;
        }
        sub.unsubscribe();

        const twinMsg = seen.find(
            (ev): ev is SseMessageEvent => ev.type === "message" && ev.message.sender === "twin",
        );
        expect(twinMsg?.message.content).toBe(TWIN_DISABLED_MESSAGE);
    });

    it("turns an OpenAI 429 into a friendly rate-limited twin message, not a generic apology", async () => {
        setTwinAgent({
            async *stream(): AsyncIterable<TwinStreamEvent> {
                throw Object.assign(new Error("Rate limit reached for gpt-5-mini"), {
                    status: 429,
                });
            },
        } as TwinAgent);

        const { res, payload, message, events } = await postAndAwaitTwinMessage({
            content: "hello",
        });

        expect(res.status).toBe(202);
        expect((payload as { messageId: string }).messageId).toMatch(UUID_RE);

        expect(message.message.sender).toBe("twin");
        expect(message.message.content).toBe(TWIN_RATE_LIMITED_MESSAGE);
        expect(events.some((ev) => ev.type === "escalation_offered")).toBe(true);

        const twinRows = await getDb()
            .select({ content: messages.content })
            .from(messages)
            .where(eq(messages.sender, "twin"));
        expect(twinRows.map((r) => r.content)).toEqual([TWIN_RATE_LIMITED_MESSAGE]);

        const histRes = await GET(makeGetRequest(`conversation_id=${payload.conversationId}`));
        const body = (await histRes.json()) as { escalationOffered: boolean };
        expect(body.escalationOffered).toBe(true);
    });

    it("logs the underlying OpenAI error on the 429 fallback path for incident triage", async () => {
        const underlying = Object.assign(new Error("Rate limit reached for gpt-5-mini"), {
            status: 429,
        });
        setTwinAgent({
            async *stream(): AsyncIterable<TwinStreamEvent> {
                throw underlying;
            },
        } as TwinAgent);
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

        await postAndAwaitTwinMessage({ content: "hello" });

        expect(
            errorSpy.mock.calls.some(
                (call) => typeof call[0] === "string" && call[0].includes("rate limit"),
            ),
        ).toBe(true);
        expect(errorSpy.mock.calls.some((call) => call.includes(underlying))).toBe(true);

        errorSpy.mockRestore();
    });

    it("accepts content of exactly 10,000 chars (boundary)", async () => {
        const atLimit = "a".repeat(10_000);
        const { res, payload } = await postAndAwaitTwinMessage({ content: atLimit });

        expect(res.status).toBe(202);
        expect(payload.conversationId).toMatch(UUID_RE);

        const visitorRows = await getDb()
            .select({ content: messages.content })
            .from(messages)
            .where(eq(messages.sender, "visitor"));
        expect(visitorRows).toHaveLength(1);
        expect(visitorRows[0].content).toBe(atLimit);
    });
});
