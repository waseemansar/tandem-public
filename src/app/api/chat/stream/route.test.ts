import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { conversations } from "@/db/schema";
import { resetTestDb, startTestDb, stopTestDb } from "@/test/db";
import { GET } from "@/app/api/chat/stream/route";
import { getSseBroadcaster, resetSseBroadcaster, type SseEvent } from "@/shared/sse-broadcaster";

function makeStreamRequest(cookie?: string): Request {
    const headers: Record<string, string> = {};
    if (cookie) headers["cookie"] = cookie;
    return new Request("http://localhost/api/chat/stream", { method: "GET", headers });
}

describe("GET /api/chat/stream", () => {
    beforeAll(async () => {
        await startTestDb();
    });

    afterAll(async () => {
        await stopTestDb();
    });

    beforeEach(async () => {
        await resetTestDb();
        resetSseBroadcaster();
    });

    it("returns 200 with text/event-stream headers when the cookie matches a real conversation", async () => {
        const [convo] = await getDb()
            .insert(conversations)
            .values({})
            .returning({ id: conversations.id });

        const res = await GET(makeStreamRequest(`conversation_id=${convo.id}`));
        // Cancel the stream so the test doesn't hang.
        await res.body?.cancel();

        expect(res.status).toBe(200);
        expect(res.headers.get("content-type")).toContain("text/event-stream");
        expect(res.headers.get("cache-control")).toContain("no-cache");
    });

    it("returns 204 with no body when the cookie is missing", async () => {
        const res = await GET(makeStreamRequest());
        expect(res.status).toBe(204);
        expect(res.body).toBeNull();
    });

    it("returns 204 when the cookie is malformed", async () => {
        const res = await GET(makeStreamRequest("conversation_id=not-a-uuid"));
        expect(res.status).toBe(204);
    });

    it("returns 204 when the cookie does not match any conversation", async () => {
        const unknown = "00000000-0000-0000-0000-000000000000";
        const res = await GET(makeStreamRequest(`conversation_id=${unknown}`));
        expect(res.status).toBe(204);
    });

    it("flushes an initial comment immediately so EventSource.open fires before any event", async () => {
        const [convo] = await getDb()
            .insert(conversations)
            .values({})
            .returning({ id: conversations.id });

        const res = await GET(makeStreamRequest(`conversation_id=${convo.id}`));
        const reader = res.body!.getReader();

        // No event has been published, yet the stream yields a frame right away —
        // without it the response headers never flush and the client's on-connect
        // history refetch (which recovers replies published before it subscribed)
        // never runs.
        const { value, done } = await reader.read();
        await reader.cancel();

        expect(done).toBe(false);
        expect(new TextDecoder().decode(value)).toBe(": connected\n\n");
    });

    it("writes events published for the conversation to the response body as SSE frames", async () => {
        const [convo] = await getDb()
            .insert(conversations)
            .values({})
            .returning({ id: conversations.id });

        const res = await GET(makeStreamRequest(`conversation_id=${convo.id}`));
        const reader = res.body!.getReader();

        // Consume the initial keep-open comment before asserting on real events.
        expect(new TextDecoder().decode((await reader.read()).value)).toBe(": connected\n\n");

        const event: SseEvent = {
            type: "message",
            message: {
                id: "22222222-2222-2222-2222-222222222222",
                sender: "twin",
                content: "ahoy",
                createdAt: new Date("2026-06-04T12:00:00Z").toISOString(),
            },
        };
        getSseBroadcaster().publish(convo.id, event);

        const { value, done } = await reader.read();
        await reader.cancel();

        expect(done).toBe(false);
        const text = new TextDecoder().decode(value);
        expect(text).toBe(`data: ${JSON.stringify(event)}\n\n`);
    });
});
