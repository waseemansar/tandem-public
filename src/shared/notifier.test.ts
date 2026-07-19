import { describe, expect, it } from "vitest";
import { createInMemoryNotifier } from "@/test/notifier";

describe("InMemoryNotifier", () => {
    it("records deliveries in order, exposes them via getDeliveries()", async () => {
        const notifier = createInMemoryNotifier();

        await notifier.notify({
            conversationId: "c1",
            title: "Awaiting you",
            message: "New thread",
            threadUrl: "https://app.example/admin/inbox/c1",
        });
        await notifier.notify({
            conversationId: "c2",
            title: "Awaiting you",
            message: "Follow-up",
            threadUrl: "https://app.example/admin/inbox/c2",
        });

        const deliveries = notifier.getDeliveries();
        expect(deliveries).toHaveLength(2);
        expect(deliveries[0].conversationId).toBe("c1");
        expect(deliveries[0].threadUrl).toBe("https://app.example/admin/inbox/c1");
        expect(deliveries[1].conversationId).toBe("c2");
    });
});
