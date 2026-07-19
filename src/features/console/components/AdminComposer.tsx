"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { fullName } from "@/config/site";

export function AdminComposer({
    threadId,
    placeholder = `Reply as ${fullName}…`,
}: {
    threadId: string;
    placeholder?: string;
}) {
    const [value, setValue] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        textareaRef.current?.focus();
    }, []);

    async function submit() {
        const text = value.trim();
        if (!text || isSending) return;
        setIsSending(true);
        setError(null);
        try {
            const res = await fetch(`/api/admin/threads/${threadId}/messages`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ content: text }),
            });
            if (!res.ok) {
                throw new Error(`Send failed: ${res.status}`);
            }
            setValue("");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Send failed");
        } finally {
            setIsSending(false);
            textareaRef.current?.focus();
        }
    }

    function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void submit();
        }
    }

    return (
        <div className="flex flex-col gap-2">
            <div className="composer-surface border-human-line flex items-end gap-3 rounded-[18px] border p-3 pl-5">
                <Textarea
                    ref={textareaRef}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={onKeyDown}
                    rows={1}
                    placeholder={placeholder}
                    aria-label={`Reply as ${fullName}`}
                    disabled={isSending}
                    className="placeholder:text-ink-3 max-h-40 min-h-10 flex-1 resize-none border-0 bg-transparent px-0 py-2 text-[16.5px] shadow-none focus-visible:ring-0 dark:bg-transparent"
                />
                <Button
                    type="button"
                    size="icon"
                    onClick={() => void submit()}
                    disabled={!value.trim() || isSending}
                    aria-label="Send reply"
                    className="send-btn--human size-11 flex-none rounded-[13px] sm:size-12 [&_svg]:size-5"
                >
                    <Send />
                </Button>
            </div>
            {error && <p className="text-destructive text-xs">{error}</p>}
        </div>
    );
}
