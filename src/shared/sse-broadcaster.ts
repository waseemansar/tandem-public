import type { ConversationState, MessageSender } from "@/db/schema";

export type SseMessageEvent = {
    type: "message";
    message: {
        id: string;
        sender: MessageSender;
        content: string;
        createdAt: string;
    };
};

export type SseStateChangedEvent = {
    type: "state_changed";
    state: ConversationState;
};

export type SseChunkEvent = {
    type: "chunk";
    messageId: string;
    sender: MessageSender;
    delta: string;
};

export type SseStreamErrorEvent = {
    type: "stream_error";
    messageId: string;
    reason?: string;
};

export type SseEscalationOfferedEvent = {
    type: "escalation_offered";
    messageId: string;
};

export type SseEscalationClearedEvent = {
    type: "escalation_cleared";
};

export type SseEvent =
    | SseMessageEvent
    | SseChunkEvent
    | SseStreamErrorEvent
    | SseEscalationOfferedEvent
    | SseEscalationClearedEvent
    | SseStateChangedEvent;

export interface SseSubscription {
    events: AsyncIterable<SseEvent>;
    unsubscribe: () => void;
}

export interface SseBroadcaster {
    subscribe(conversationId: string): SseSubscription;
    publish(conversationId: string, event: SseEvent): void;
    registerStream(conversationId: string, controller: AbortController): void;
    unregisterStream(conversationId: string, controller: AbortController): void;
    abortActiveStream(conversationId: string): void;
}

type Subscriber = {
    push: (event: SseEvent) => void;
    close: () => void;
};

export function createSseBroadcaster(): SseBroadcaster {
    const byConversation = new Map<string, Set<Subscriber>>();
    const activeStreams = new Map<string, AbortController>();

    return {
        subscribe(conversationId) {
            const queue: SseEvent[] = [];
            let waiter: ((value: IteratorResult<SseEvent>) => void) | null = null;
            let closed = false;

            const subscriber: Subscriber = {
                push(event) {
                    if (waiter) {
                        const resolve = waiter;
                        waiter = null;
                        resolve({ value: event, done: false });
                    } else {
                        queue.push(event);
                    }
                },
                close() {
                    closed = true;
                    if (waiter) {
                        const resolve = waiter;
                        waiter = null;
                        resolve({ value: undefined, done: true });
                    }
                },
            };

            let set = byConversation.get(conversationId);
            if (!set) {
                set = new Set();
                byConversation.set(conversationId, set);
            }
            set.add(subscriber);

            const unsubscribe = () => {
                const s = byConversation.get(conversationId);
                if (s) {
                    s.delete(subscriber);
                    if (s.size === 0) byConversation.delete(conversationId);
                }
                subscriber.close();
            };

            const events: AsyncIterable<SseEvent> = {
                [Symbol.asyncIterator]() {
                    return {
                        next(): Promise<IteratorResult<SseEvent>> {
                            if (queue.length > 0) {
                                return Promise.resolve({ value: queue.shift()!, done: false });
                            }
                            if (closed) {
                                return Promise.resolve({ value: undefined, done: true });
                            }
                            return new Promise((resolve) => {
                                waiter = resolve;
                            });
                        },
                        return(): Promise<IteratorResult<SseEvent>> {
                            unsubscribe();
                            return Promise.resolve({ value: undefined, done: true });
                        },
                    };
                },
            };

            return { events, unsubscribe };
        },

        publish(conversationId, event) {
            const set = byConversation.get(conversationId);
            if (!set) return;
            for (const sub of set) sub.push(event);
        },

        registerStream(conversationId, controller) {
            activeStreams.set(conversationId, controller);
        },

        unregisterStream(conversationId, controller) {
            const existing = activeStreams.get(conversationId);
            if (existing === controller) activeStreams.delete(conversationId);
        },

        abortActiveStream(conversationId) {
            const existing = activeStreams.get(conversationId);
            if (!existing) return;
            activeStreams.delete(conversationId);
            existing.abort();
        },
    };
}

let _broadcaster: SseBroadcaster = createSseBroadcaster();

export function setSseBroadcaster(b: SseBroadcaster): void {
    _broadcaster = b;
}

export function resetSseBroadcaster(): void {
    _broadcaster = createSseBroadcaster();
}

export function getSseBroadcaster(): SseBroadcaster {
    return _broadcaster;
}
