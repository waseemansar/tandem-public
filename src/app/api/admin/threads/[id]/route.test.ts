import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/db/client";
import { conversations, messages } from "@/db/schema";
import { resetTestDb, startTestDb, stopTestDb } from "@/test/db";
import { JOIN_SYSTEM_MESSAGE } from "@/features/conversation/constants";

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));

import { GET } from "@/app/api/admin/threads/[id]/route";

const SESSION = { user: { email: "admin@example.com" } };

type ThreadMessageRow = {
    id: string;
    sender: string;
    content: string;
    createdAt: string;
};

type ThreadDetailBody = {
    id: string;
    displayName: string;
    email: string | null;
    state: string;
    escalatedAt: string | null;
    messages: ThreadMessageRow[];
};

async function seedThread(opts: {
    state: "twin_only" | "awaiting_you" | "active_you" | "awaiting_visitor" | "resolved";
    email?: string | null;
    firstName?: string | null;
    escalationOfferedAt?: Date | null;
    msgs?: Array<{
        sender: "visitor" | "twin" | "human" | "system";
        content: string;
        createdAt: Date;
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
                createdAt: m.createdAt,
            })),
        );
    }
    return row.id;
}

function callGet(id: string) {
    return GET(new Request(`http://localhost/api/admin/threads/${id}`), {
        params: Promise.resolve({ id }),
    });
}

describe("GET /api/admin/threads/[id]", () => {
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
        const id = await seedThread({ state: "awaiting_you" });
        const res = await callGet(id);
        expect(res.status).toBe(401);
    });

    it("returns 404 for an unknown conversation id", async () => {
        authMock.mockResolvedValue(SESSION);
        const res = await callGet("00000000-0000-0000-0000-000000000000");
        expect(res.status).toBe(404);
    });

    it("returns 404 for a twin_only conversation (not yet escalated)", async () => {
        authMock.mockResolvedValue(SESSION);
        const id = await seedThread({
            state: "twin_only",
            email: "lurker@example.com",
            msgs: [{ sender: "visitor", content: "browsing", createdAt: new Date() }],
        });
        const res = await callGet(id);
        expect(res.status).toBe(404);
    });

    it("returns the full message history in createdAt order, including system rows", async () => {
        authMock.mockResolvedValue(SESSION);
        const base = Date.now();
        const id = await seedThread({
            state: "active_you",
            email: "anika@studio42.co",
            firstName: "Anika",
            escalationOfferedAt: new Date(base - 600_000),
            msgs: [
                { sender: "visitor", content: "first", createdAt: new Date(base - 500_000) },
                { sender: "twin", content: "second", createdAt: new Date(base - 400_000) },
                {
                    sender: "system",
                    content: JOIN_SYSTEM_MESSAGE,
                    createdAt: new Date(base - 300_000),
                },
                { sender: "human", content: "fourth", createdAt: new Date(base - 200_000) },
                { sender: "visitor", content: "fifth", createdAt: new Date(base - 100_000) },
            ],
        });

        const res = await callGet(id);
        expect(res.status).toBe(200);
        const body = (await res.json()) as ThreadDetailBody;

        expect(body.messages.map((m) => m.sender)).toEqual([
            "visitor",
            "twin",
            "system",
            "human",
            "visitor",
        ]);
        expect(body.messages.map((m) => m.content)).toEqual([
            "first",
            "second",
            JOIN_SYSTEM_MESSAGE,
            "fourth",
            "fifth",
        ]);
    });

    it("returns thread metadata with server-derived displayName and escalatedAt", async () => {
        authMock.mockResolvedValue(SESSION);
        const escalatedAt = new Date(Date.now() - 90_000);

        const namedId = await seedThread({
            state: "awaiting_you",
            email: "priya@northwind.io",
            firstName: "Priya",
            escalationOfferedAt: escalatedAt,
            msgs: [{ sender: "visitor", content: "hi", createdAt: new Date() }],
        });

        const emailOnlyId = await seedThread({
            state: "awaiting_visitor",
            email: "jordan.k@buildco.dev",
            firstName: null,
            escalationOfferedAt: escalatedAt,
            msgs: [{ sender: "visitor", content: "ping", createdAt: new Date() }],
        });

        const named = (await (await callGet(namedId)).json()) as ThreadDetailBody;
        expect(named).toMatchObject({
            id: namedId,
            displayName: "Priya",
            email: "priya@northwind.io",
            state: "awaiting_you",
        });
        expect(named.escalatedAt).toBe(escalatedAt.toISOString());

        const emailOnly = (await (await callGet(emailOnlyId)).json()) as ThreadDetailBody;
        expect(emailOnly.displayName).toBe("Jordan k");
        expect(emailOnly.state).toBe("awaiting_visitor");
    });
});
