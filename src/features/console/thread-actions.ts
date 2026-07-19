import type { ConversationState } from "@/features/console/types";

export type StripActionAvailability = {
    handBack: boolean;
    markResolved: boolean;
    summonDraft: boolean;
};

export function availableActions(state: ConversationState): StripActionAvailability {
    return {
        handBack: state === "active_you",
        markResolved: state !== "resolved",
        summonDraft: state === "active_you",
    };
}
