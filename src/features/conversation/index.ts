import { defaultConversationDeps, type ConversationDeps } from "@/features/conversation/deps";
import { createEffects } from "@/features/conversation/effects";
import {
    createFaqSuggestionFlows,
    type FaqSuggestionFlows,
} from "@/features/conversation/faq-suggestions";
import { createHumanFlows, type HumanFlows } from "@/features/conversation/human-flows";
import { createScheduler, type CheckIdleTimeoutsResult } from "@/features/conversation/scheduler";
import { createVisitorFlows, type VisitorFlows } from "@/features/conversation/visitor-flows";

export type { ConversationDeps } from "@/features/conversation/deps";
export * from "@/features/conversation/errors";
export * from "@/features/conversation/faq-suggestions";
export * from "@/features/conversation/human-flows";
export * from "@/features/conversation/scheduler";
export * from "@/features/conversation/visitor-flows";

export type Conversation = VisitorFlows &
    HumanFlows &
    FaqSuggestionFlows & {
        checkIdleTimeouts(): Promise<CheckIdleTimeoutsResult>;
        idle(): Promise<void>;
    };

export function createConversation(deps: ConversationDeps): Conversation {
    const pendingReplies = new Set<Promise<void>>();
    const effects = createEffects(deps);
    const scheduler = createScheduler(deps, effects, pendingReplies);
    return {
        ...createVisitorFlows(deps, effects, scheduler),
        ...createHumanFlows(deps, effects, scheduler),
        ...createFaqSuggestionFlows(deps),
        checkIdleTimeouts: scheduler.checkIdleTimeouts,
        idle: () => Promise.all([...pendingReplies]).then(() => undefined),
    };
}

let _conversation: Conversation | null = null;

export function getConversation(): Conversation {
    if (!_conversation) _conversation = createConversation(defaultConversationDeps());
    return _conversation;
}

export function setConversation(c: Conversation): void {
    _conversation = c;
}

export function resetConversation(): void {
    _conversation = null;
}
