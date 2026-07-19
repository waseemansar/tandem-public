import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetTestDb, startTestDb, stopTestDb } from "@/test/db";
import { getLiveDoc, setLiveDoc } from "@/features/twin/knowledge-doc";

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));

import { GET, PUT } from "@/app/api/admin/knowledge-doc/route";

const SESSION = { user: { email: "admin@example.com" } };

function makePutRequest(body: unknown): Request {
    return new Request("http://localhost/api/admin/knowledge-doc", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}

describe("admin knowledge-doc route", () => {
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

    describe("GET", () => {
        it("returns 401 when not authenticated", async () => {
            authMock.mockResolvedValue(null);
            const res = await GET();
            expect(res.status).toBe(401);
        });

        it("returns empty content when no doc has been written yet", async () => {
            authMock.mockResolvedValue(SESSION);
            const res = await GET();
            expect(res.status).toBe(200);
            const body = (await res.json()) as { content: string; updatedAt: string | null };
            expect(body.content).toBe("");
            expect(body.updatedAt).toBeNull();
        });

        it("returns the current doc content and updatedAt timestamp", async () => {
            authMock.mockResolvedValue(SESSION);
            await setLiveDoc("# Hello\n\nBody.");

            const res = await GET();
            expect(res.status).toBe(200);
            const body = (await res.json()) as { content: string; updatedAt: string | null };
            expect(body.content).toBe("# Hello\n\nBody.");
            expect(typeof body.updatedAt).toBe("string");
            expect(() => new Date(body.updatedAt as string).toISOString()).not.toThrow();
        });
    });

    describe("PUT", () => {
        it("returns 401 when not authenticated and leaves the doc unchanged", async () => {
            authMock.mockResolvedValue(null);
            await setLiveDoc("# Original");

            const res = await PUT(makePutRequest({ content: "# Replaced" }));
            expect(res.status).toBe(401);
            expect(await getLiveDoc()).toBe("# Original");
        });

        it("replaces the doc content and returns the new updatedAt", async () => {
            authMock.mockResolvedValue(SESSION);
            await setLiveDoc("# Original");

            const res = await PUT(makePutRequest({ content: "# New content" }));
            expect(res.status).toBe(200);
            const body = (await res.json()) as { updatedAt: string };
            expect(typeof body.updatedAt).toBe("string");

            expect(await getLiveDoc()).toBe("# New content");
        });

        it("accepts an empty string body (clearing the doc)", async () => {
            authMock.mockResolvedValue(SESSION);
            await setLiveDoc("# Original");

            const res = await PUT(makePutRequest({ content: "" }));
            expect(res.status).toBe(200);
            expect(await getLiveDoc()).toBe("");
        });

        it("rejects a body missing content with 400", async () => {
            authMock.mockResolvedValue(SESSION);
            const res = await PUT(makePutRequest({}));
            expect(res.status).toBe(400);
        });

        it("rejects a body with non-string content with 400", async () => {
            authMock.mockResolvedValue(SESSION);
            const res = await PUT(makePutRequest({ content: 42 }));
            expect(res.status).toBe(400);
        });
    });
});
