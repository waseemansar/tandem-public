"use client";

import { useEffect, useImperativeHandle, useRef, type KeyboardEvent, type Ref } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getComposerCounterState } from "@/features/visitor/composer-counter";
import { MESSAGE_TOO_LONG_TEXT, rateLimitedText } from "@/features/visitor/chat-send-error";

export interface ComposerHandle {
    focus: () => void;
}

export function Composer({
    ref,
    value,
    onChange,
    onSubmit,
    disabled = false,
    placeholder = "Message Tandem…",
    showServerLengthError = false,
    cooldownSeconds = 0,
}: {
    ref?: Ref<ComposerHandle>;
    value: string;
    onChange: (value: string) => void;
    onSubmit: () => void;
    disabled?: boolean;
    placeholder?: string;
    showServerLengthError?: boolean;
    cooldownSeconds?: number;
}) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const prevValueRef = useRef(value);
    const counter = getComposerCounterState(value);
    const rateLimited = cooldownSeconds > 0;
    const inlineErrorText = rateLimited
        ? rateLimitedText(cooldownSeconds)
        : counter.tone === "error" || showServerLengthError
          ? MESSAGE_TOO_LONG_TEXT
          : null;

    useImperativeHandle(
        ref,
        () => ({
            focus: () => textareaRef.current?.focus(),
        }),
        [],
    );

    useEffect(() => {
        if (!disabled) textareaRef.current?.focus();
    }, [disabled]);

    useEffect(() => {
        if (prevValueRef.current && !value && !disabled) {
            textareaRef.current?.focus();
        }
        prevValueRef.current = value;
    }, [value, disabled]);

    function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSubmit();
        }
    }

    return (
        <div>
            <div className="composer-surface border-line-2 focus-within:border-twin-line flex items-end gap-3 rounded-[18px] border p-3 pl-5 transition-colors">
                <Textarea
                    ref={textareaRef}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onKeyDown={onKeyDown}
                    rows={1}
                    placeholder={placeholder}
                    disabled={disabled}
                    aria-label="Message"
                    className="placeholder:text-ink-3 max-h-40 min-h-10 flex-1 resize-none border-0 bg-transparent px-0 py-2 text-[16.5px] shadow-none focus-visible:ring-0 dark:bg-transparent"
                />
                <Button
                    type="button"
                    size="icon"
                    onClick={onSubmit}
                    disabled={disabled || counter.sendBlocked || rateLimited || !value.trim()}
                    aria-label="Send message"
                    className="send-btn size-11 flex-none rounded-[13px] sm:size-12 [&_svg]:size-5"
                >
                    <Send />
                </Button>
            </div>
            {(counter.visible || inlineErrorText) && (
                <div className="mt-1.5 flex items-center justify-between gap-3 px-2 text-[12.5px]">
                    {inlineErrorText ? (
                        <p
                            role="alert"
                            className="text-destructive flex-1"
                            data-testid="composer-inline-error"
                        >
                            {inlineErrorText}
                        </p>
                    ) : (
                        <span className="flex-1" />
                    )}
                    {counter.visible && (
                        <span
                            aria-live="polite"
                            data-testid="composer-counter"
                            data-tone={counter.tone ?? undefined}
                            className={
                                counter.tone === "error"
                                    ? "text-destructive tabular-nums"
                                    : "text-warn tabular-nums"
                            }
                        >
                            {counter.count.toLocaleString()} / {counter.max.toLocaleString()}
                        </span>
                    )}
                </div>
            )}
        </div>
    );
}
