import { describe, expect, it } from "vitest";
import { fullName, pronouns } from "@/config/site";
import {
    ESCALATION_CONFIRMATION,
    ESCALATION_TEMPLATE,
    JOIN_SYSTEM_MESSAGE,
    RESOLVED_SYSTEM_MESSAGE,
    STEP_OUT_SYSTEM_MESSAGE,
    TWIN_DISABLED_MESSAGE,
    TWIN_RATE_LIMITED_MESSAGE,
} from "@/features/conversation/constants";

describe("conversation system messages", () => {
    const nameCarrying = {
        JOIN_SYSTEM_MESSAGE,
        STEP_OUT_SYSTEM_MESSAGE,
        RESOLVED_SYSTEM_MESSAGE,
        TWIN_DISABLED_MESSAGE,
        TWIN_RATE_LIMITED_MESSAGE,
        ESCALATION_CONFIRMATION,
    };

    it("names the represented human by the configured full name, never a hardcoded person", () => {
        for (const [label, message] of Object.entries(nameCarrying)) {
            expect(message, label).toContain(fullName);
            expect(message, label).not.toMatch(/\bWaseem\b/);
        }
    });

    it("drives the escalation confirmation pronoun from config, capitalized at the sentence start", () => {
        const cappedSubject = pronouns.subject.charAt(0).toUpperCase() + pronouns.subject.slice(1);
        expect(ESCALATION_CONFIRMATION).toContain(`${cappedSubject} may join here shortly`);
        expect(ESCALATION_CONFIRMATION).not.toMatch(/\bHe\b|\bhim\b|\bhis\b/);
    });

    it("drives the escalation template pronoun from config", () => {
        expect(ESCALATION_TEMPLATE).toContain(pronouns.object);
        expect(ESCALATION_TEMPLATE).not.toMatch(/\bhim\b/);
    });
});
