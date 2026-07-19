import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { healthChecks } from "@/db/schema";
import { resetTestDb, startTestDb, stopTestDb } from "@/test/db";
import { POST } from "@/app/api/health/route";

describe("POST /api/health", () => {
    beforeAll(async () => {
        await startTestDb();
    });

    afterAll(async () => {
        await stopTestDb();
    });

    beforeEach(async () => {
        await resetTestDb();
    });

    it("inserts a health-check row and returns its id", async () => {
        const res = await POST();

        expect(res.status).toBe(200);
        const body = (await res.json()) as { id: string; createdAt: string };
        expect(body.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

        const rows = await getDb().select().from(healthChecks);
        expect(rows).toHaveLength(1);
        expect(rows[0].id).toBe(body.id);
    });
});
