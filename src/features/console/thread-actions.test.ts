import { describe, expect, it } from "vitest";
import { availableActions } from "@/features/console/thread-actions";

describe("availableActions", () => {
    it("active_you enables hand-back, mark-resolved, and summon-draft", () => {
        expect(availableActions("active_you")).toEqual({
            handBack: true,
            markResolved: true,
            summonDraft: true,
        });
    });

    it("awaiting_you allows only mark-resolved", () => {
        expect(availableActions("awaiting_you")).toEqual({
            handBack: false,
            markResolved: true,
            summonDraft: false,
        });
    });

    it("awaiting_visitor allows only mark-resolved", () => {
        expect(availableActions("awaiting_visitor")).toEqual({
            handBack: false,
            markResolved: true,
            summonDraft: false,
        });
    });

    it("twin_only allows only mark-resolved", () => {
        expect(availableActions("twin_only")).toEqual({
            handBack: false,
            markResolved: true,
            summonDraft: false,
        });
    });

    it("resolved disables every action", () => {
        expect(availableActions("resolved")).toEqual({
            handBack: false,
            markResolved: false,
            summonDraft: false,
        });
    });
});
