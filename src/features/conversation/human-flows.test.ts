import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { fullName } from "@/config/site";
import { resetTestDb, startTestDb, stopTestDb } from "@/test/db";
import { resetTwinAgent, setTwinAgent } from "@/features/twin/agent";
import { createDeclineTwinAgent, createEchoTwinAgent } from "@/test/twin-agent";
import { resetSseBroadcaster } from "@/shared/sse-broadcaster";
import { getConversation, resetConversation } from "@/features/conversation";
import { createInMemoryEmailSender, type InMemoryEmailSender } from "@/test/email-sender";
import { resetEmailSender, setEmailSender } from "@/shared/email/sender";
import { createInMemoryNotifier, type InMemoryNotifier } from "@/test/notifier";
import { resetNotifier, setNotifier } from "@/shared/notifier";
import {
    createMagicLinkSigner,
    resetMagicLinkSigner,
    setMagicLinkSigner,
} from "@/shared/magic-link";

const TEST_SECRET = "test-magic-link-secret-32-bytes-long-aaa";

describe("conversation human-flows integration", () => {
    let outbox: InMemoryEmailSender;
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
        outbox = createInMemoryEmailSender();
        resetEmailSender();
        setEmailSender(outbox);
        notifier = createInMemoryNotifier();
        resetNotifier();
        setNotifier(notifier);
        resetMagicLinkSigner();
        setMagicLinkSigner(createMagicLinkSigner({ secret: TEST_SECRET }));
        resetConversation();
    });

    afterEach(async () => {
        await getConversation().idle();
    });

    it("sends a magic-link email on the first human reply for a thread with an associated email", async () => {
        setTwinAgent(createDeclineTwinAgent("I don't know."));
        const visitorMsg = await getConversation().handleVisitorMessage({
            session: null,
            content: "shoe size?",
            firstName: "Priya",
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

        const sends = outbox.getSends();
        expect(sends).toHaveLength(1);
        expect(sends[0].to).toBe("visitor@example.com");
        expect(sends[0].subject).toBe(`${fullName} replied on Tandem`);
        expect(sends[0].text).toMatch(/\/r\/[A-Za-z0-9._-]+/);
        expect(sends[0].text).toContain("Hi Priya");
        expect(sends[0].html).toBeDefined();
        expect(sends[0].html).toContain("Hi Priya");
        expect(sends[0].html).toMatch(/\/r\/[A-Za-z0-9._-]+/);
    });

    it("does not send a second email on subsequent human replies in the same thread", async () => {
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
            content: "Reply 1",
        });
        await getConversation().handleHumanMessage({
            conversationId: visitorMsg.conversationId,
            content: "Reply 2",
        });
        await getConversation().handleHandBack({ conversationId: visitorMsg.conversationId });
        setTwinAgent(createEchoTwinAgent());
        await getConversation().handleVisitorMessage({
            session: { conversationId: visitorMsg.conversationId },
            content: "follow up",
        });
        await getConversation().idle();
        await getConversation().handleHumanMessage({
            conversationId: visitorMsg.conversationId,
            content: "Reply 3",
        });

        expect(outbox.getSends()).toHaveLength(1);
    });

    it("does not fire the notifier on hand-back, mark-resolved, or human-message transitions", async () => {
        // Stand up an awaiting_you thread (escalation accepted): 1 delivery.
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
        expect(notifier.getDeliveries()).toHaveLength(1);

        // human-message → active_you: no notification.
        await getConversation().handleHumanMessage({
            conversationId: visitorMsg.conversationId,
            content: "Hi — here now.",
        });
        // hand-back → awaiting_visitor: no notification.
        await getConversation().handleHandBack({ conversationId: visitorMsg.conversationId });
        // mark-resolved → resolved: no notification.
        await getConversation().handleMarkResolved({ conversationId: visitorMsg.conversationId });

        expect(notifier.getDeliveries()).toHaveLength(1);
    });
});
