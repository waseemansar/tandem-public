import { VISITOR_MESSAGE_MAX_CHARS, VISITOR_MESSAGE_SOFT_WARN_CHARS } from "@/shared/anti-abuse";

export type ComposerCounterTone = "warning" | "error";

export interface ComposerCounterState {
    visible: boolean;
    tone: ComposerCounterTone | null;
    count: number;
    max: number;
    sendBlocked: boolean;
}

export function getComposerCounterState(value: string): ComposerCounterState {
    const count = value.length;
    const max = VISITOR_MESSAGE_MAX_CHARS;

    if (count < VISITOR_MESSAGE_SOFT_WARN_CHARS) {
        return { visible: false, tone: null, count, max, sendBlocked: false };
    }
    if (count >= max) {
        return { visible: true, tone: "error", count, max, sendBlocked: true };
    }
    return { visible: true, tone: "warning", count, max, sendBlocked: false };
}
