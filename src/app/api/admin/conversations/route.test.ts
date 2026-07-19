import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/db/client";
import { conversations, messages } from "@/db/schema";
import { resetTestDb, startTestDb, stopTestDb } from "@/test/db";

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));

import { GET } from "@/app/api/admin/conversations/route";

const SESSION = { user: { email: "admin@example.com" } };

type Row = {
    id: string;
    displayName: string;
    firstName: string | null;
    email: string | null;
    state: string;
    lastMessagePreview: string;
    lastMessageAt: string | null;
    createdAt: string;
};

async function seedConversation(opts: {
    state: "twin_only" | "awaiting_you" | "active_you" | "awaiting_visitor" | "resolved";
    email?: string | null;
    firstName?: string | null;
    createdAt?: Date;
    msgs?: Array<{
        sender: "visitor" | "twin" | "human" | "system";
        content: string;
        createdAt?: Date;
    }>;
}): Promise<string> {
    const db = getDb();
    const [row] = await db
        .insert(conversations)
        .values({
            state: opts.state,
            email: opts.email ?? null,
            firstName: opts.firstName ?? null,
            ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
        })
        .returning({ id: conversations.id });
    if (opts.msgs?.length) {
        await db.insert(messages).values(
            opts.msgs.map((m) => ({
                conversationId: row.id,
                sender: m.sender,
                content: m.content,
                ...(m.createdAt ? { createdAt: m.createdAt } : {}),
            })),
        );
    }
    return row.id;
}

function makeRequest(url = "http://localhost/api/admin/conversations"): Request {
    return new Request(url);
}

describe("GET /api/admin/conversations", () => {
    beforeAll(async () => {
        await startTestDb();
    });

    afterAll(async () => {
        await stopTestDb();
    });

    beforeEach(async () => {
        await resetTestDb();
        authMock.mockReset();
    });

    it("returns 401 when not authenticated", async () => {
        authMock.mockResolvedValue(null);
        const res = await GET(makeRequest());
        expect(res.status).toBe(401);
    });

    it("includes twin_only conversations alongside escalated ones", async () => {
        authMock.mockResolvedValue(SESSION);
        const lurkerId = await seedConversation({
            state: "twin_only",
            email: "lurker@example.com",
            msgs: [{ sender: "visitor", content: "just browsing" }],
        });
        const escalatedId = await seedConversation({
            state: "awaiting_you",
            email: "priya@northwind.io",
            firstName: "Priya",
            msgs: [{ sender: "visitor", content: "need help" }],
        });

        const res = await GET(makeRequest());
        expect(res.status).toBe(200);
        const body = (await res.json()) as { threads: Row[] };
        const ids = body.threads.map((t) => t.id);
        expect(ids).toContain(lurkerId);
        expect(ids).toContain(escalatedId);
        expect(body.threads).toHaveLength(2);
    });

    it("sorts conversations by creation date descending (newest first)", async () => {
        authMock.mockResolvedValue(SESSION);
        const now = Date.now();
        const oldestId = await seedConversation({
            state: "twin_only",
            email: "old@example.com",
            createdAt: new Date(now - 60_000),
        });
        const newestId = await seedConversation({
            state: "awaiting_you",
            email: "new@example.com",
            createdAt: new Date(now - 1_000),
        });
        const middleId = await seedConversation({
            state: "resolved",
            email: "mid@example.com",
            createdAt: new Date(now - 30_000),
        });

        const res = await GET(makeRequest());
        const body = (await res.json()) as { threads: Row[] };
        expect(body.threads.map((t) => t.id)).toEqual([newestId, middleId, oldestId]);
    });

    it("filters by ?state= query param", async () => {
        authMock.mockResolvedValue(SESSION);
        await seedConversation({
            state: "twin_only",
            email: "lurker@example.com",
        });
        const escalatedId = await seedConversation({
            state: "awaiting_you",
            email: "priya@example.com",
        });
        await seedConversation({ state: "resolved", email: "done@example.com" });

        const res = await GET(
            makeRequest("http://localhost/api/admin/conversations?state=awaiting_you"),
        );
        expect(res.status).toBe(200);
        const body = (await res.json()) as { threads: Row[] };
        expect(body.threads.map((t) => t.id)).toEqual([escalatedId]);
    });

    it("ignores invalid ?state= values and returns all", async () => {
        authMock.mockResolvedValue(SESSION);
        await seedConversation({ state: "twin_only", email: "a@example.com" });
        await seedConversation({ state: "awaiting_you", email: "b@example.com" });

        const res = await GET(
            makeRequest("http://localhost/api/admin/conversations?state=nonsense"),
        );
        const body = (await res.json()) as { threads: Row[] };
        expect(body.threads).toHaveLength(2);
    });

    it("exposes the visitor's firstName field on each row", async () => {
        authMock.mockResolvedValue(SESSION);
        const createdAt = new Date(Date.now() - 10_000);
        const lastAt = new Date(Date.now() - 5_000);

        const withFirstName = await seedConversation({
            state: "twin_only",
            email: "priya@northwind.io",
            firstName: "Priya",
            createdAt,
            msgs: [{ sender: "visitor", content: "hi there", createdAt: lastAt }],
        });
        const noFirstName = await seedConversation({
            state: "twin_only",
            email: "marcus@orbit.com",
            firstName: null,
            createdAt: new Date(createdAt.getTime() - 1000),
        });

        const res = await GET(makeRequest());
        const body = (await res.json()) as { threads: Row[] };

        const priya = body.threads.find((t) => t.id === withFirstName)!;
        expect(priya).toMatchObject({
            firstName: "Priya",
            displayName: "Priya",
            email: "priya@northwind.io",
            state: "twin_only",
            lastMessagePreview: "hi there",
        });
        expect(priya.createdAt).toBe(createdAt.toISOString());
        expect(priya.lastMessageAt).toBe(lastAt.toISOString());

        const marcus = body.threads.find((t) => t.id === noFirstName)!;
        expect(marcus.firstName).toBeNull();
        expect(marcus.email).toBe("marcus@orbit.com");
        expect(marcus.lastMessageAt).toBeNull();
    });
});
