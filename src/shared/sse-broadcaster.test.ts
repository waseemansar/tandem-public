import { describe, expect, it } from "vitest";
import { createSseBroadcaster, type SseEvent } from "@/shared/sse-broadcaster";

const CONVO_A = "00000000-0000-0000-0000-00000000000a";
const CONVO_B = "00000000-0000-0000-0000-00000000000b";

function makeMessageEvent(content: string): SseEvent {
    return {
        type: "message",
        message: {
            id: "11111111-1111-1111-1111-111111111111",
            sender: "twin",
            content,
            createdAt: new Date("2026-06-04T12:00:00Z").toISOString(),
        },
    };
}

describe("SSEBroadcaster", () => {
    it("delivers a published event to a subscriber of the same conversation", async () => {
        const broadcaster = createSseBroadcaster();
        const sub = broadcaster.subscribe(CONVO_A);

        const event = makeMessageEvent("hello from twin");
        broadcaster.publish(CONVO_A, event);

        const iter = sub.events[Symbol.asyncIterator]();
        const received = await iter.next();
        sub.unsubscribe();

        expect(received.done).toBe(false);
        expect(received.value).toEqual(event);
    });

    it("does not deliver events from other conversations to a subscriber", async () => {
        const broadcaster = createSseBroadcaster();
        const subA = broadcaster.subscribe(CONVO_A);

        const eventForB = makeMessageEvent("for B");
        const eventForA = makeMessageEvent("for A");
        broadcaster.publish(CONVO_B, eventForB);
        broadcaster.publish(CONVO_A, eventForA);

        const iter = subA.events[Symbol.asyncIterator]();
        const received = await iter.next();
        subA.unsubscribe();

        expect(received.value).toEqual(eventForA);
    });

    it("stops delivering events after unsubscribe", async () => {
        const broadcaster = createSseBroadcaster();
        const sub = broadcaster.subscribe(CONVO_A);

        sub.unsubscribe();
        broadcaster.publish(CONVO_A, makeMessageEvent("after unsubscribe"));

        const iter = sub.events[Symbol.asyncIterator]();
        const received = await iter.next();

        expect(received.done).toBe(true);
    });

    it("delivers an event to every subscriber on the same conversation", async () => {
        const broadcaster = createSseBroadcaster();
        const sub1 = broadcaster.subscribe(CONVO_A);
        const sub2 = broadcaster.subscribe(CONVO_A);

        const event = makeMessageEvent("fan-out");
        broadcaster.publish(CONVO_A, event);

        const iter1 = sub1.events[Symbol.asyncIterator]();
        const iter2 = sub2.events[Symbol.asyncIterator]();
        const [r1, r2] = await Promise.all([iter1.next(), iter2.next()]);
        sub1.unsubscribe();
        sub2.unsubscribe();

        expect(r1.value).toEqual(event);
        expect(r2.value).toEqual(event);
    });
});
