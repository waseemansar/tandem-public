import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/db/client";
import { conversations, messages } from "@/db/schema";
import { resetTestDb, startTestDb, stopTestDb } from "@/test/db";

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));

import { GET } from "@/app/api/admin/inbox/route";

const SESSION = { user: { email: "admin@example.com" } };

type InboxRow = {
    id: string;
    displayName: string;
    email: string | null;
    state: string;
    lastMessagePreview: string;
    lastMessageAt: string;
    escalatedAt: string | null;
};

async function seedConversation(opts: {
    state: "twin_only" | "awaiting_you" | "active_you" | "awaiting_visitor" | "resolved";
    email?: string | null;
    firstName?: string | null;
    escalationOfferedAt?: Date | null;
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
            escalationOfferedAt: opts.escalationOfferedAt ?? null,
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

describe("GET /api/admin/inbox", () => {
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
        const res = await GET();
        expect(res.status).toBe(401);
    });

    it("excludes twin_only conversations", async () => {
        authMock.mockResolvedValue(SESSION);
        await seedConversation({
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

        const res = await GET();
        expect(res.status).toBe(200);
        const body = (await res.json()) as { threads: InboxRow[] };
        expect(body.threads).toHaveLength(1);
        expect(body.threads[0].id).toBe(escalatedId);
        expect(body.threads[0].state).toBe("awaiting_you");
    });

    it("sorts by state priority awaiting_you → active_you → awaiting_visitor → resolved", async () => {
        authMock.mockResolvedValue(SESSION);
        const now = Date.now();
        // Seed in non-priority order so we can prove the handler sorts, not insertion order.
        const resolvedId = await seedConversation({
            state: "resolved",
            email: "sam@example.com",
            msgs: [{ sender: "human", content: "done", createdAt: new Date(now - 1000) }],
        });
        const waitingId = await seedConversation({
            state: "awaiting_visitor",
            email: "jordan@example.com",
            msgs: [{ sender: "human", content: "ping", createdAt: new Date(now - 2000) }],
        });
        const activeId = await seedConversation({
            state: "active_you",
            email: "anika@example.com",
            msgs: [{ sender: "human", content: "ok", createdAt: new Date(now - 3000) }],
        });
        const needsYouId = await seedConversation({
            state: "awaiting_you",
            email: "priya@example.com",
            msgs: [{ sender: "visitor", content: "help", createdAt: new Date(now - 4000) }],
        });

        const res = await GET();
        const body = (await res.json()) as { threads: InboxRow[] };
        expect(body.threads.map((t) => t.id)).toEqual([
            needsYouId,
            activeId,
            waitingId,
            resolvedId,
        ]);
    });

    it("returns the canonical row shape with server-derived displayName", async () => {
        authMock.mockResolvedValue(SESSION);
        const escalatedAt = new Date(Date.now() - 60_000);
        const lastAt = new Date(Date.now() - 5_000);

        const withFirstName = await seedConversation({
            state: "awaiting_you",
            email: "priya@northwind.io",
            firstName: "Priya",
            escalationOfferedAt: escalatedAt,
            msgs: [
                { sender: "visitor", content: "old", createdAt: new Date(lastAt.getTime() - 5000) },
                { sender: "visitor", content: "latest preview text", createdAt: lastAt },
            ],
        });

        const emailOnly = await seedConversation({
            state: "active_you",
            email: "marcus.lee@orbit-tech.com",
            firstName: null,
            escalationOfferedAt: escalatedAt,
            msgs: [{ sender: "human", content: "hey", createdAt: new Date(lastAt.getTime() - 1) }],
        });

        const res = await GET();
        const body = (await res.json()) as { threads: InboxRow[] };

        const priya = body.threads.find((t) => t.id === withFirstName)!;
        expect(priya).toMatchObject({
            displayName: "Priya",
            email: "priya@northwind.io",
            state: "awaiting_you",
            lastMessagePreview: "latest preview text",
        });
        expect(priya.lastMessageAt).toBe(lastAt.toISOString());
        expect(priya.escalatedAt).toBe(escalatedAt.toISOString());

        const marcus = body.threads.find((t) => t.id === emailOnly)!;
        expect(marcus.displayName).toBe("Marcus lee");
        expect(marcus.email).toBe("marcus.lee@orbit-tech.com");
    });

    it("returns an empty list when no conversations have escalated", async () => {
        authMock.mockResolvedValue(SESSION);
        await seedConversation({
            state: "twin_only",
            msgs: [{ sender: "visitor", content: "browsing" }],
        });
        const res = await GET();
        expect(res.status).toBe(200);
        const body = (await res.json()) as { threads: InboxRow[] };
        expect(body.threads).toEqual([]);
    });

    it("within a state, sorts by most-recent lastMessageAt first", async () => {
        authMock.mockResolvedValue(SESSION);
        const now = Date.now();
        const olderId = await seedConversation({
            state: "awaiting_you",
            email: "a@example.com",
            msgs: [{ sender: "visitor", content: "older", createdAt: new Date(now - 5000) }],
        });
        const newerId = await seedConversation({
            state: "awaiting_you",
            email: "b@example.com",
            msgs: [{ sender: "visitor", content: "newer", createdAt: new Date(now - 1000) }],
        });

        const res = await GET();
        const body = (await res.json()) as { threads: InboxRow[] };
        expect(body.threads.map((t) => t.id)).toEqual([newerId, olderId]);
    });
});
