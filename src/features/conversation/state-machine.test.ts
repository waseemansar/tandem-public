import { describe, expect, it } from "vitest";
import { transition } from "@/features/conversation/state-machine";

describe("conversation state machine", () => {
    it("twin_only + escalation-accepted → awaiting_you with email persisted and fire-pushover", () => {
        const result = transition("twin_only", {
            type: "escalation-accepted",
            email: "visitor@example.com",
        });

        expect(result.nextState).toBe("awaiting_you");
        expect(result.sideEffects.persistEmail).toBe("visitor@example.com");
        expect(result.sideEffects.firePushover).toBe(true);
    });

    it("awaiting_you + escalation-accepted stays awaiting_you, persists email, no fire-pushover", () => {
        const result = transition("awaiting_you", {
            type: "escalation-accepted",
            email: "visitor@example.com",
        });

        expect(result.nextState).toBe("awaiting_you");
        expect(result.sideEffects.persistEmail).toBe("visitor@example.com");
        expect(result.sideEffects.firePushover).toBeFalsy();
    });

    it("active_you + escalation-accepted stays active_you, persists email, no fire-pushover", () => {
        const result = transition("active_you", {
            type: "escalation-accepted",
            email: "visitor@example.com",
        });

        expect(result.nextState).toBe("active_you");
        expect(result.sideEffects.persistEmail).toBe("visitor@example.com");
        expect(result.sideEffects.firePushover).toBeFalsy();
    });

    it("awaiting_you + human-message → active_you with join system message", () => {
        const result = transition("awaiting_you", { type: "human-message" });

        expect(result.nextState).toBe("active_you");
        expect(result.sideEffects.emitJoinSystemMessage).toBe(true);
    });

    it("awaiting_visitor + human-message → active_you with join system message", () => {
        const result = transition("awaiting_visitor", { type: "human-message" });

        expect(result.nextState).toBe("active_you");
        expect(result.sideEffects.emitJoinSystemMessage).toBe(true);
    });

    it("active_you + human-message stays active_you with no join system message", () => {
        const result = transition("active_you", { type: "human-message" });

        expect(result.nextState).toBe("active_you");
        expect(result.sideEffects.emitJoinSystemMessage).toBeFalsy();
    });

    it("active_you + hand-back → awaiting_visitor with step-out system message", () => {
        const result = transition("active_you", { type: "hand-back" });

        expect(result.nextState).toBe("awaiting_visitor");
        expect(result.sideEffects.emitStepOutSystemMessage).toBe(true);
    });

    it("active_you + idle-timeout → awaiting_visitor with step-out system message", () => {
        const result = transition("active_you", { type: "idle-timeout" });

        expect(result.nextState).toBe("awaiting_visitor");
        expect(result.sideEffects.emitStepOutSystemMessage).toBe(true);
    });

    it.each(["twin_only", "awaiting_you", "active_you", "awaiting_visitor"] as const)(
        "%s + mark-resolved → resolved with resolved system message",
        (from) => {
            const result = transition(from, { type: "mark-resolved" });

            expect(result.nextState).toBe("resolved");
            expect(result.sideEffects.emitResolvedSystemMessage).toBe(true);
        },
    );

    it("resolved + mark-resolved throws (already terminal)", () => {
        expect(() => transition("resolved", { type: "mark-resolved" })).toThrow();
    });

    it("awaiting_visitor + visitor-message → awaiting_you with fire-pushover", () => {
        const result = transition("awaiting_visitor", { type: "visitor-message" });

        expect(result.nextState).toBe("awaiting_you");
        expect(result.sideEffects.firePushover).toBe(true);
    });

    it("transitions other than into awaiting_you do not fire pushover", () => {
        const handBack = transition("active_you", { type: "hand-back" });
        expect(handBack.sideEffects.firePushover).toBeFalsy();

        const idleTimeout = transition("active_you", { type: "idle-timeout" });
        expect(idleTimeout.sideEffects.firePushover).toBeFalsy();

        const humanReply = transition("awaiting_you", { type: "human-message" });
        expect(humanReply.sideEffects.firePushover).toBeFalsy();

        const resolved = transition("active_you", { type: "mark-resolved" });
        expect(resolved.sideEffects.firePushover).toBeFalsy();
    });
});
