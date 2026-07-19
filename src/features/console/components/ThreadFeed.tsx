"use client";

import { useEffect, useRef } from "react";
import { ThreadMessage } from "@/features/console/components/ThreadMessage";
import type { ThreadMessage as ThreadMessageType } from "@/features/console/types";

export function ThreadFeed({
    messages,
    visitorDisplayName,
}: {
    messages: ThreadMessageType[];
    visitorDisplayName: string;
}) {
    const bottomRef = useRef<HTMLDivElement>(null);
    const hasMounted = useRef(false);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({
            behavior: hasMounted.current ? "smooth" : "auto",
            block: "end",
        });
        hasMounted.current = true;
    }, [messages.length]);

    return (
        <div className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-6 py-6">
                {messages.map((message) => (
                    <ThreadMessage
                        key={message.id}
                        message={message}
                        visitorDisplayName={visitorDisplayName}
                    />
                ))}
                <div ref={bottomRef} aria-hidden />
            </div>
        </div>
    );
}
