export type ConversationState =
    | "twin_only"
    | "awaiting_you"
    | "active_you"
    | "awaiting_visitor"
    | "resolved";

export type ConversationEvent =
    | { type: "escalation-accepted"; email: string }
    | { type: "human-message" }
    | { type: "visitor-message" }
    | { type: "hand-back" }
    | { type: "idle-timeout" }
    | { type: "mark-resolved" };

export type SideEffects = {
    persistEmail?: string;
    emitJoinSystemMessage?: boolean;
    emitStepOutSystemMessage?: boolean;
    emitResolvedSystemMessage?: boolean;
    firePushover?: boolean;
};

export type TransitionResult = {
    nextState: ConversationState;
    sideEffects: SideEffects;
};

export function transition(current: ConversationState, event: ConversationEvent): TransitionResult {
    if (current === "twin_only" && event.type === "escalation-accepted") {
        return {
            nextState: "awaiting_you",
            sideEffects: { persistEmail: event.email, firePushover: true },
        };
    }
    if (
        (current === "awaiting_you" || current === "active_you") &&
        event.type === "escalation-accepted"
    ) {
        // Re-escalation after hand-back: the thread is already in the admin's
        // lap, so no state transition and no second Pushover. Persist the
        // email (it may have changed) and let the caller emit the confirmation
        // system message so the visitor gets feedback.
        return {
            nextState: current,
            sideEffects: { persistEmail: event.email },
        };
    }
    if (current === "awaiting_visitor" && event.type === "visitor-message") {
        return {
            nextState: "awaiting_you",
            sideEffects: { firePushover: true },
        };
    }
    if (
        (current === "awaiting_you" || current === "awaiting_visitor") &&
        event.type === "human-message"
    ) {
        return {
            nextState: "active_you",
            sideEffects: { emitJoinSystemMessage: true },
        };
    }
    if (current === "active_you" && event.type === "human-message") {
        return { nextState: "active_you", sideEffects: {} };
    }
    if (current === "active_you" && (event.type === "hand-back" || event.type === "idle-timeout")) {
        return {
            nextState: "awaiting_visitor",
            sideEffects: { emitStepOutSystemMessage: true },
        };
    }
    if (current !== "resolved" && event.type === "mark-resolved") {
        return {
            nextState: "resolved",
            sideEffects: { emitResolvedSystemMessage: true },
        };
    }
    throw new Error(`Invalid transition: ${current} + ${event.type}`);
}
