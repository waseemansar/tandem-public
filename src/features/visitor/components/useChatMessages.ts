"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
    ChatAck,
    ConversationState,
    HistoryMessage,
    HistoryResponse,
} from "@/features/conversation/types";
import type { SseChunkEvent, SseEvent } from "@/shared/sse-broadcaster";
import type { ChatMessage } from "@/features/visitor/types";
import { parseSendChatError } from "@/features/visitor/chat-send-error";

const HISTORY_QUERY_KEY = ["chat", "history"] as const;
const CLEAR_ON_NEXT_LOAD_KEY = "tandem.clearOnNextLoad";
const EMPTY_HISTORY: HistoryResponse = {
    conversationId: null,
    firstName: null,
    state: null,
    escalationOffered: false,
    messages: [],
};

export type SendInput = {
    content: string;
    firstName: string;
    keepChat: boolean;
};

type SendVariables = SendInput & { tempId: string };

async function fetchHistory(): Promise<HistoryResponse> {
    const res = await fetch("/api/chat", { method: "GET" });
    if (!res.ok) throw new Error("Couldn't load this conversation. Please refresh and try again.");
    return (await res.json()) as HistoryResponse;
}

async function sendMessage(input: SendVariables): Promise<ChatAck> {
    const body: Record<string, unknown> = {
        content: input.content,
        keepChat: input.keepChat,
    };
    if (input.firstName.trim()) body.firstName = input.firstName.trim();
    const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
    if (!res.ok) throw await parseSendChatError(res);
    return (await res.json()) as ChatAck;
}

async function resetChat(): Promise<void> {
    const res = await fetch("/api/chat/reset", { method: "POST" });
    if (!res.ok) throw new Error("Couldn't start a new conversation. Please try again.");
}

async function acceptEscalation(email: string): Promise<void> {
    const res = await fetch("/api/chat/escalate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
    });
    if (res.ok) return;
    // Reuse the shared 429 parsing so the escalate form gets the same cooldown
    // RateLimitedError as the composer.
    if (res.status === 429) throw await parseSendChatError(res);
    throw new Error("Couldn't send that. Please try again.");
}

async function dismissEscalation(): Promise<void> {
    const res = await fetch("/api/chat/escalate/dismiss", { method: "POST" });
    if (!res.ok) throw new Error("Couldn't dismiss that. Please try again.");
}

function historyToMessages(history: HistoryResponse): ChatMessage[] {
    return history.messages.map((m) => ({
        id: m.id,
        from: m.sender,
        text: m.content,
        createdAt: m.createdAt,
    }));
}

function upsertMessage(state: HistoryResponse, message: HistoryMessage): HistoryResponse {
    const idx = state.messages.findIndex((m) => m.id === message.id);
    if (idx >= 0) {
        const next = state.messages.slice();
        next[idx] = message;
        return { ...state, messages: next };
    }
    return { ...state, messages: [...state.messages, message] };
}

function applyChunk(state: HistoryResponse, ev: SseChunkEvent): HistoryResponse {
    const idx = state.messages.findIndex((m) => m.id === ev.messageId);
    if (idx >= 0) {
        const next = state.messages.slice();
        next[idx] = { ...next[idx], content: next[idx].content + ev.delta };
        return { ...state, messages: next };
    }
    return {
        ...state,
        messages: [
            ...state.messages,
            {
                id: ev.messageId,
                sender: ev.sender,
                content: ev.delta,
                createdAt: new Date().toISOString(),
            },
        ],
    };
}

function dropMessage(state: HistoryResponse, messageId: string): HistoryResponse {
    return { ...state, messages: state.messages.filter((m) => m.id !== messageId) };
}

export type UseChatMessagesResult = {
    messages: ChatMessage[];
    conversationId: string | null;
    conversationState: ConversationState | null;
    hasHistory: boolean;
    isAwaitingTwin: boolean;
    isSending: boolean;
    sendError: Error | null;
    isResetting: boolean;
    escalationOffered: boolean;
    isAcceptingEscalation: boolean;
    acceptEscalationError: Error | null;
    send: (input: SendInput) => void;
    reset: () => void;
    accept: (email: string) => void;
    dismiss: () => void;
};

export function useChatMessages(initialHistory: HistoryResponse): UseChatMessagesResult {
    const queryClient = useQueryClient();
    const [bootstrapped, setBootstrapped] = useState(false);

    useEffect(() => {
        const pendingClear = window.localStorage.getItem(CLEAR_ON_NEXT_LOAD_KEY) === "1";
        (async () => {
            if (pendingClear) {
                queryClient.setQueryData<HistoryResponse>(HISTORY_QUERY_KEY, EMPTY_HISTORY);
                await fetch("/api/chat/reset", { method: "POST" });
                window.localStorage.removeItem(CLEAR_ON_NEXT_LOAD_KEY);
            }
            setBootstrapped(true);
        })();
    }, [queryClient]);

    const historyQuery = useQuery({
        queryKey: HISTORY_QUERY_KEY,
        queryFn: fetchHistory,
        staleTime: Infinity,
        enabled: bootstrapped,
        initialData: initialHistory,
    });

    const sendMutation = useMutation({
        mutationFn: sendMessage,
        onMutate: async (input) => {
            await queryClient.cancelQueries({ queryKey: HISTORY_QUERY_KEY });
            queryClient.setQueryData<HistoryResponse>(HISTORY_QUERY_KEY, (old) => {
                const base = old ?? EMPTY_HISTORY;
                return {
                    ...base,
                    firstName: base.firstName ?? (input.firstName.trim() || null),
                    messages: [
                        ...base.messages,
                        {
                            id: input.tempId,
                            sender: "visitor",
                            content: input.content,
                            createdAt: new Date().toISOString(),
                        },
                    ],
                };
            });
        },
        onSuccess: (ack, input) => {
            queryClient.setQueryData<HistoryResponse>(HISTORY_QUERY_KEY, (old) => {
                if (!old) return old;
                return {
                    ...old,
                    conversationId: ack.conversationId,
                    messages: old.messages.map((m) =>
                        m.id === input.tempId ? { ...m, id: ack.messageId } : m,
                    ),
                };
            });
        },
        onError: (_err, input) => {
            queryClient.setQueryData<HistoryResponse>(HISTORY_QUERY_KEY, (old) => {
                if (!old) return old;
                return {
                    ...old,
                    messages: old.messages.filter((m) => m.id !== input.tempId),
                };
            });
        },
    });

    const resetMutation = useMutation({
        mutationFn: resetChat,
        onSuccess: () => {
            sendMutation.reset();
            queryClient.setQueryData<HistoryResponse>(HISTORY_QUERY_KEY, EMPTY_HISTORY);
        },
    });

    const acceptMutation = useMutation({
        mutationFn: acceptEscalation,
        onSuccess: () => {
            // Hide the prompt optimistically; the SSE system-message will
            // confirm in-thread and the next history fetch reflects new state.
            queryClient.setQueryData<HistoryResponse>(HISTORY_QUERY_KEY, (old) => {
                if (!old) return old;
                return { ...old, escalationOffered: false, state: "awaiting_you" };
            });
        },
    });

    const dismissMutation = useMutation({
        mutationFn: dismissEscalation,
        onMutate: () => {
            queryClient.setQueryData<HistoryResponse>(HISTORY_QUERY_KEY, (old) => {
                if (!old) return old;
                return { ...old, escalationOffered: false };
            });
        },
    });

    const conversationId = historyQuery.data?.conversationId ?? null;

    useEffect(() => {
        if (!conversationId) return;
        const es = new EventSource("/api/chat/stream");
        // After subscription is established, refetch history to catch any
        // event that was published before this client was subscribed.
        es.onopen = () => {
            queryClient.invalidateQueries({ queryKey: HISTORY_QUERY_KEY });
        };
        es.onmessage = (ev) => {
            let data: SseEvent;
            try {
                data = JSON.parse(ev.data) as SseEvent;
            } catch {
                return;
            }
            queryClient.setQueryData<HistoryResponse>(HISTORY_QUERY_KEY, (old) => {
                if (!old) return old;
                if (data.type === "message") {
                    // Visitor messages are shown via the optimistic insert from
                    // the local send; the SSE echo of the same row is dropped
                    // here to avoid duplicates.
                    if (data.message.sender === "visitor") return old;
                    // An accepted-escalation system message clears the offer.
                    const next = upsertMessage(old, data.message);
                    if (data.message.sender === "system") {
                        return { ...next, escalationOffered: false };
                    }
                    return next;
                }
                if (data.type === "chunk") return applyChunk(old, data);
                if (data.type === "stream_error") return dropMessage(old, data.messageId);
                if (data.type === "escalation_offered") {
                    return { ...old, escalationOffered: true };
                }
                if (data.type === "escalation_cleared") {
                    return { ...old, escalationOffered: false };
                }
                if (data.type === "state_changed") {
                    return { ...old, state: data.state };
                }
                return old;
            });
        };
        return () => es.close();
    }, [conversationId, queryClient]);

    const messages: ChatMessage[] = historyQuery.data ? historyToMessages(historyQuery.data) : [];
    const hasHistory = messages.length > 0;
    const conversationState = historyQuery.data?.state ?? null;

    const lastMessage = messages.at(-1);
    const isAwaitingTwin =
        conversationState !== "active_you" &&
        (sendMutation.isPending || (lastMessage !== undefined && lastMessage.from === "visitor"));

    function send(input: SendInput) {
        const tempId = crypto.randomUUID();
        sendMutation.mutate({ ...input, tempId });
    }

    function reset() {
        resetMutation.mutate();
    }

    function accept(email: string) {
        acceptMutation.mutate(email);
    }

    function dismiss() {
        dismissMutation.mutate();
    }

    return {
        messages,
        conversationId,
        conversationState,
        hasHistory,
        isAwaitingTwin,
        isSending: sendMutation.isPending,
        sendError: sendMutation.error,
        isResetting: resetMutation.isPending,
        escalationOffered: historyQuery.data?.escalationOffered ?? false,
        isAcceptingEscalation: acceptMutation.isPending,
        acceptEscalationError: acceptMutation.error,
        send,
        reset,
        accept,
        dismiss,
    };
}
