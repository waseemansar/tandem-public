import { describe, expect, it } from "vitest";
import { VISITOR_MESSAGE_MAX_CHARS } from "@/shared/anti-abuse";
import { getComposerCounterState } from "@/features/visitor/composer-counter";

describe("getComposerCounterState", () => {
    it("is hidden below 8,000 chars (under the 80% warning threshold)", () => {
        const state = getComposerCounterState("a".repeat(7_999));
        expect(state.visible).toBe(false);
        expect(state.tone).toBeNull();
        expect(state.sendBlocked).toBe(false);
        expect(state.count).toBe(7_999);
        expect(state.max).toBe(VISITOR_MESSAGE_MAX_CHARS);
    });

    it("turns visible in warning tone at exactly 8,000 chars", () => {
        const state = getComposerCounterState("a".repeat(8_000));
        expect(state.visible).toBe(true);
        expect(state.tone).toBe("warning");
        expect(state.sendBlocked).toBe(false);
    });

    it("stays in warning tone at 9,999 chars (just below the cap)", () => {
        const state = getComposerCounterState("a".repeat(9_999));
        expect(state.visible).toBe(true);
        expect(state.tone).toBe("warning");
        expect(state.sendBlocked).toBe(false);
    });

    it("flips to error tone and blocks send at exactly 10,000 chars", () => {
        const state = getComposerCounterState("a".repeat(10_000));
        expect(state.visible).toBe(true);
        expect(state.tone).toBe("error");
        expect(state.sendBlocked).toBe(true);
    });

    it("stays in error tone and blocked above 10,000 chars", () => {
        const state = getComposerCounterState("a".repeat(10_500));
        expect(state.visible).toBe(true);
        expect(state.tone).toBe("error");
        expect(state.sendBlocked).toBe(true);
        expect(state.count).toBe(10_500);
    });

    it("counts emoji by UTF-16 code units (deliberate)", () => {
        // "😀" is a surrogate pair → 2 UTF-16 code units. 4,000 of them = 8,000 chars.
        const emoji = "😀".repeat(4_000);
        const state = getComposerCounterState(emoji);
        expect(state.count).toBe(8_000);
        expect(state.visible).toBe(true);
        expect(state.tone).toBe("warning");
    });
});
