import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { conversations, messages } from "@/db/schema";
import { resetTestDb, startTestDb, stopTestDb } from "@/test/db";
import { resetTwinAgent, setTwinAgent } from "@/features/twin/agent";
import { createEchoTwinAgent } from "@/test/twin-agent";
import { resetSseBroadcaster } from "@/shared/sse-broadcaster";
import { getConversation, resetConversation } from "@/features/conversation";
import { POST as chatPOST } from "@/app/api/chat/route";
import { POST as resetPOST } from "@/app/api/chat/reset/route";

function makeChatRequest(body: unknown, cookie?: string): Request {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (cookie) headers["cookie"] = cookie;
    return new Request("http://localhost/api/chat", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
    });
}

function makeResetRequest(cookie?: string): Request {
    const headers: Record<string, string> = {};
    if (cookie) headers["cookie"] = cookie;
    return new Request("http://localhost/api/chat/reset", { method: "POST", headers });
}

describe("POST /api/chat/reset", () => {
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
    });

    it("clears the conversation_id cookie but leaves the server-side thread intact", async () => {
        const created = await chatPOST(makeChatRequest({ content: "hello" }));
        const { conversationId } = (await created.json()) as { conversationId: string };

        const res = await resetPOST(makeResetRequest(`conversation_id=${conversationId}`));
        expect(res.status).toBe(204);

        const setCookie = res.headers.get("set-cookie") ?? "";
        expect(setCookie).toContain("conversation_id=");
        expect(setCookie.toLowerCase()).toMatch(/max-age=0|expires=/i);

        const db = getDb();
        const convoRows = await db.select().from(conversations);
        expect(convoRows).toHaveLength(1);
        expect(convoRows[0].id).toBe(conversationId);

        const msgRows = await db.select().from(messages);
        expect(msgRows.length).toBeGreaterThan(0);
        expect(msgRows.every((m) => m.conversationId === conversationId)).toBe(true);
    });

    it("succeeds when called without a cookie", async () => {
        const res = await resetPOST(makeResetRequest());
        expect(res.status).toBe(204);
        const setCookie = res.headers.get("set-cookie") ?? "";
        expect(setCookie).toContain("conversation_id=");
    });
});
