import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetTestDb, startTestDb, stopTestDb } from "@/test/db";
import { resetTwinAgent, setTwinAgent } from "@/features/twin/agent";
import { createDeclineTwinAgent, createEchoTwinAgent } from "@/test/twin-agent";
import { resetSseBroadcaster } from "@/shared/sse-broadcaster";
import { getConversation, resetConversation } from "@/features/conversation";
import { createInMemoryNotifier, type InMemoryNotifier } from "@/test/notifier";
import { resetNotifier, setNotifier } from "@/shared/notifier";

describe("conversation visitor-flows integration", () => {
    let notifier: InMemoryNotifier;

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
        notifier = createInMemoryNotifier();
        resetNotifier();
        setNotifier(notifier);
        resetConversation();
    });

    afterEach(async () => {
        await getConversation().idle();
    });

    it("fires the notifier exactly once when the visitor accepts an escalation", async () => {
        setTwinAgent(createDeclineTwinAgent("I don't know."));

        const visitorMsg = await getConversation().handleVisitorMessage({
            session: null,
            content: "shoe size?",
        });
        await getConversation().idle();

        expect(notifier.getDeliveries()).toHaveLength(0);

        await getConversation().acceptEscalation({
            session: { conversationId: visitorMsg.conversationId },
            email: "visitor@example.com",
        });

        const deliveries = notifier.getDeliveries();
        expect(deliveries).toHaveLength(1);
        expect(deliveries[0].conversationId).toBe(visitorMsg.conversationId);
        expect(deliveries[0].threadUrl).toContain(`/admin/inbox/${visitorMsg.conversationId}`);
        // First escalation → "asked for you"; body quotes their last question.
        expect(deliveries[0].title).toBe("Tandem — Visitor asked for you");
        expect(deliveries[0].message).toBe('"shoe size?"');
    });

    it("collapses whitespace and truncates the snippet in the escalation notification", async () => {
        setTwinAgent(createDeclineTwinAgent("I don't know."));

        const longContent = `line one\n\nline two ${"x".repeat(300)}`;
        const visitorMsg = await getConversation().handleVisitorMessage({
            session: null,
            content: longContent,
        });
        await getConversation().idle();

        await getConversation().acceptEscalation({
            session: { conversationId: visitorMsg.conversationId },
            email: "visitor@example.com",
        });

        const [delivery] = notifier.getDeliveries();
        expect(delivery.message.startsWith('"line one line two ')).toBe(true);
        expect(delivery.message).not.toContain("\n");
        expect(delivery.message.endsWith('…"')).toBe(true);
        // Quotes (2) + ≤180-char snippet + ellipsis.
        expect(delivery.message.length).toBeLessThanOrEqual(183);
    });

    it("fires the notifier when a visitor follows up on an awaiting_visitor thread", async () => {
        // Stand up an awaiting_visitor thread: escalate, human reply, hand-back.
        setTwinAgent(createDeclineTwinAgent("I don't know."));
        const visitorMsg = await getConversation().handleVisitorMessage({
            session: null,
            content: "shoe size?",
        });
        await getConversation().idle();
        await getConversation().acceptEscalation({
            session: { conversationId: visitorMsg.conversationId },
            email: "visitor@example.com",
        });
        await getConversation().handleHumanMessage({
            conversationId: visitorMsg.conversationId,
            content: "Hi — answering now.",
        });
        await getConversation().handleHandBack({ conversationId: visitorMsg.conversationId });

        // Clear the escalation-accepted delivery; we want to assert on the
        // follow-up fire in isolation.
        notifier.clear();

        setTwinAgent(createEchoTwinAgent());
        await getConversation().handleVisitorMessage({
            session: { conversationId: visitorMsg.conversationId },
            content: "still curious",
        });
        await getConversation().idle();

        const deliveries = notifier.getDeliveries();
        expect(deliveries).toHaveLength(1);
        expect(deliveries[0].conversationId).toBe(visitorMsg.conversationId);
        expect(deliveries[0].threadUrl).toContain(`/admin/inbox/${visitorMsg.conversationId}`);
        // Re-escalation after step-out → "replied"; body quotes the new message.
        expect(deliveries[0].title).toBe("Tandem — Visitor replied");
        expect(deliveries[0].message).toBe('"still curious"');
    });

    it("does not fire the notifier on routine twin replies in a twin_only thread", async () => {
        await getConversation().handleVisitorMessage({
            session: null,
            content: "hi",
        });
        await getConversation().idle();

        expect(notifier.getDeliveries()).toHaveLength(0);
    });
});
