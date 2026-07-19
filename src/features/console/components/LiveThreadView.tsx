"use client";

import { useEffect, useState } from "react";
import { AdminComposer } from "@/features/console/components/AdminComposer";
import {
    ReplyAsHumanStrip,
    type StripAction,
} from "@/features/console/components/ReplyAsHumanStrip";
import { ThreadFeed } from "@/features/console/components/ThreadFeed";
import { ThreadHeader } from "@/features/console/components/ThreadHeader";
import type { SseEvent } from "@/shared/sse-broadcaster";
import type { ConversationState, ThreadMessage } from "@/features/console/types";

export type LiveThreadInitial = {
    id: string;
    displayName: string;
    email: string | null;
    state: ConversationState;
    escalatedAt: string | null;
    messages: Array<{
        id: string;
        sender: ThreadMessage["sender"];
        content: string;
        createdAt: string;
    }>;
};

export function LiveThreadView({
    initial,
    backHref,
    backLabel,
}: {
    initial: LiveThreadInitial;
    backHref?: string;
    backLabel?: string;
}) {
    const [state, setState] = useState<ConversationState>(initial.state);
    const [messages, setMessages] = useState<ThreadMessage[]>(() =>
        initial.messages.map((m) => ({
            id: m.id,
            sender: m.sender,
            content: m.content,
            createdAt: new Date(m.createdAt),
        })),
    );
    const [streamingTwinId, setStreamingTwinId] = useState<string | null>(null);
    const [pending, setPending] = useState<StripAction | null>(null);

    useEffect(() => {
        if (initial.state === "twin_only") return;
        const es = new EventSource(`/api/admin/threads/${initial.id}/stream`);
        es.onmessage = (ev) => {
            let data: SseEvent;
            try {
                data = JSON.parse(ev.data) as SseEvent;
            } catch {
                return;
            }
            if (data.type === "message") {
                setMessages((prev) => {
                    if (prev.some((m) => m.id === data.message.id)) return prev;
                    return [
                        ...prev,
                        {
                            id: data.message.id,
                            sender: data.message.sender,
                            content: data.message.content,
                            createdAt: new Date(data.message.createdAt),
                        },
                    ];
                });
                if (data.message.sender === "twin") {
                    setStreamingTwinId((curr) => (curr === data.message.id ? null : curr));
                }
            } else if (data.type === "chunk") {
                if (data.sender === "twin") {
                    setStreamingTwinId(data.messageId);
                    // The draft POST returns 202 before the twin starts streaming
                    // (scheduleTwinReply uses setImmediate). Hand the busy signal
                    // off to twinStreaming the moment the first chunk lands so the
                    // button stays disabled across the gap.
                    setPending((curr) => (curr === "draft" ? null : curr));
                }
            } else if (data.type === "stream_error") {
                setStreamingTwinId((curr) => (curr === data.messageId ? null : curr));
                setPending((curr) => (curr === "draft" ? null : curr));
            } else if (data.type === "state_changed") {
                setState(data.state);
            }
        };
        return () => es.close();
    }, [initial.id, initial.state]);

    async function onAction(action: StripAction) {
        if (pending) return;
        setPending(action);
        try {
            const res = await fetch(`/api/admin/threads/${initial.id}/${action}`, {
                method: "POST",
            });
            if (action === "draft" && res.ok) {
                // Leave pending set; the SSE chunk/error handler clears it once
                // the streamed reply starts (or errors).
                return;
            }
        } catch {
            // fall through to clear
        }
        setPending(null);
    }

    const escalatedAt = initial.escalatedAt ? new Date(initial.escalatedAt) : null;
    const isReadOnly = state === "resolved" || state === "twin_only";

    return (
        <div className="flex h-screen min-w-0 flex-col overflow-x-hidden">
            <ThreadHeader
                displayName={initial.displayName}
                email={initial.email}
                state={state}
                escalatedAt={escalatedAt}
                now={new Date()}
                backHref={backHref}
                backLabel={backLabel}
            />

            <ThreadFeed messages={messages} visitorDisplayName={initial.displayName} />

            {!isReadOnly && (
                <div className="border-line bg-panel/60 border-t px-6 py-4 backdrop-blur">
                    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
                        <ReplyAsHumanStrip
                            state={state}
                            visitorDisplayName={initial.displayName}
                            pending={pending}
                            twinStreaming={streamingTwinId !== null}
                            onAction={onAction}
                        />
                        <AdminComposer threadId={initial.id} />
                    </div>
                </div>
            )}
        </div>
    );
}
