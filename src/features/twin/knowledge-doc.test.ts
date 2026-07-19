import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { knowledgeDoc } from "@/db/schema";
import { resetTestDb, startTestDb, stopTestDb } from "@/test/db";
import { appendToLiveDoc, getLiveDoc, setLiveDoc } from "@/features/twin/knowledge-doc";

describe("knowledge-doc lib", () => {
    beforeAll(async () => {
        await startTestDb();
    });

    afterAll(async () => {
        await stopTestDb();
    });

    beforeEach(async () => {
        await resetTestDb();
    });

    it("getLiveDoc returns empty string when no row has been written", async () => {
        expect(await getLiveDoc()).toBe("");
    });

    it("setLiveDoc writes the row content (insert)", async () => {
        await setLiveDoc("# Hello");
        expect(await getLiveDoc()).toBe("# Hello");
    });

    it("setLiveDoc replaces existing content (update)", async () => {
        await setLiveDoc("# First");
        await setLiveDoc("# Second");
        expect(await getLiveDoc()).toBe("# Second");
    });

    it("appendToLiveDoc seeds content when none exists", async () => {
        await appendToLiveDoc("first entry");
        expect(await getLiveDoc()).toBe("first entry");
    });

    it("appendToLiveDoc concatenates onto existing content with a blank-line separator", async () => {
        await setLiveDoc("# Base");
        await appendToLiveDoc("## FAQ\n\nQ: x\n\nA: y");
        expect(await getLiveDoc()).toBe("# Base\n\n## FAQ\n\nQ: x\n\nA: y");
    });

    it("setLiveDoc bumps updated_at on subsequent writes", async () => {
        await setLiveDoc("# v1");
        const [first] = await getDb().select().from(knowledgeDoc);
        await new Promise((r) => setTimeout(r, 5));
        await setLiveDoc("# v2");
        const [second] = await getDb().select().from(knowledgeDoc);
        expect(second.updatedAt.getTime()).toBeGreaterThan(first.updatedAt.getTime());
    });
});
