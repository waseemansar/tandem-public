import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/db/client";
import { conversations } from "@/db/schema";
import { resetTestDb, startTestDb, stopTestDb } from "@/test/db";
import { getSseBroadcaster, resetSseBroadcaster, type SseEvent } from "@/shared/sse-broadcaster";

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));

import { GET } from "@/app/api/admin/threads/[id]/stream/route";

const SESSION = { user: { email: "admin@example.com" } };

async function seedThread(
    state: "twin_only" | "awaiting_you" | "active_you" | "awaiting_visitor" | "resolved",
): Promise<string> {
    const db = getDb();
    const [row] = await db
        .insert(conversations)
        .values({ state })
        .returning({ id: conversations.id });
    return row.id;
}

function callGet(id: string) {
    return GET(new Request(`http://localhost/api/admin/threads/${id}/stream`), {
        params: Promise.resolve({ id }),
    });
}

async function readEvents(
    res: Response,
    until: (parsed: SseEvent) => boolean,
): Promise<SseEvent[]> {
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    const seen: SseEvent[] = [];
    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const chunks = buf.split("\n\n");
        buf = chunks.pop() ?? "";
        for (const chunk of chunks) {
            const line = chunk.trim();
            if (!line.startsWith("data: ")) continue;
            const parsed = JSON.parse(line.slice(6)) as SseEvent;
            seen.push(parsed);
            if (until(parsed)) {
                reader.cancel();
                return seen;
            }
        }
    }
    return seen;
}

describe("GET /api/admin/threads/[id]/stream", () => {
    beforeAll(async () => {
        await startTestDb();
    });

    afterAll(async () => {
        await stopTestDb();
    });

    beforeEach(async () => {
        await resetTestDb();
        authMock.mockReset();
        resetSseBroadcaster();
    });

    it("returns 401 when not authenticated", async () => {
        authMock.mockResolvedValue(null);
        const id = await seedThread("awaiting_you");
        const res = await callGet(id);
        expect(res.status).toBe(401);
    });

    it("returns 404 for a twin_only conversation (not yet escalated)", async () => {
        authMock.mockResolvedValue(SESSION);
        const id = await seedThread("twin_only");
        const res = await callGet(id);
        expect(res.status).toBe(404);
    });

    it("returns 404 for an unknown conversation id", async () => {
        authMock.mockResolvedValue(SESSION);
        const res = await callGet("00000000-0000-0000-0000-000000000000");
        expect(res.status).toBe(404);
    });

    it("forwards a published message event to a subscribed admin", async () => {
        authMock.mockResolvedValue(SESSION);
        const id = await seedThread("awaiting_you");
        const res = await callGet(id);
        expect(res.status).toBe(200);
        expect(res.headers.get("content-type")).toContain("text/event-stream");

        // Publish after subscription is wired up.
        setTimeout(() => {
            getSseBroadcaster().publish(id, {
                type: "message",
                message: {
                    id: "m1",
                    sender: "visitor",
                    content: "hello live",
                    createdAt: new Date().toISOString(),
                },
            });
        }, 0);

        const events = await readEvents(res, (ev) => ev.type === "message");
        const message = events.find((ev) => ev.type === "message");
        expect(message).toBeDefined();
        if (message?.type !== "message") throw new Error("unreachable");
        expect(message.message.content).toBe("hello live");
        expect(message.message.sender).toBe("visitor");
    });

    it("forwards a state_changed event to a subscribed admin", async () => {
        authMock.mockResolvedValue(SESSION);
        const id = await seedThread("awaiting_you");
        const res = await callGet(id);

        setTimeout(() => {
            getSseBroadcaster().publish(id, { type: "state_changed", state: "active_you" });
        }, 0);

        const events = await readEvents(res, (ev) => ev.type === "state_changed");
        const stateChanged = events.find((ev) => ev.type === "state_changed");
        if (stateChanged?.type !== "state_changed") throw new Error("unreachable");
        expect(stateChanged.state).toBe("active_you");
    });
});
