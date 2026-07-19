"use client";

import { useEffect, useRef, useState } from "react";
import { MessageTooLongError, RateLimitedError } from "@/features/visitor/chat-send-error";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChatHeader, VisitorTopBar } from "@/features/visitor/components/Headers";
import { Hero } from "@/features/visitor/components/Hero";
import { Composer, type ComposerHandle } from "@/features/visitor/components/Composer";
import { EscalationPrompt } from "@/features/visitor/components/EscalationPrompt";
import { Footer } from "@/features/visitor/components/Footer";
import { MessageBubble } from "@/features/visitor/components/MessageBubble";
import { TypingIndicator } from "@/features/visitor/components/TypingIndicator";
import { useChatMessages } from "@/features/visitor/components/useChatMessages";
import type { ChatControlsProps } from "@/features/visitor/components/ChatControls";
import { STARTER_CHIPS } from "@/features/visitor/starter-chips";
import type { HistoryResponse } from "@/features/conversation/types";

const CLEAR_ON_NEXT_LOAD_KEY = "tandem.clearOnNextLoad";

export function Chat({ initialHistory }: { initialHistory: HistoryResponse }) {
    const {
        messages,
        conversationState,
        hasHistory,
        isAwaitingTwin,
        isSending,
        sendError,
        isResetting,
        escalationOffered,
        isAcceptingEscalation,
        acceptEscalationError,
        send,
        reset,
        accept,
        dismiss,
    } = useChatMessages(initialHistory);
    const isClosed = conversationState === "resolved";
    const [draft, setDraft] = useState("");
    const [firstName, setFirstName] = useState(initialHistory.firstName ?? "");
    const [keepChat, setKeepChat] = useState(true);
    const [serverLengthErrorVisible, setServerLengthErrorVisible] = useState(false);
    const [cooldownSeconds, setCooldownSeconds] = useState(0);
    const visitorName = firstName.trim() || "You";
    const endRef = useRef<HTMLDivElement>(null);
    const composerRef = useRef<ComposerHandle>(null);
    const lastSubmittedRef = useRef("");

    const isEmpty = !hasHistory;

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages.length, isAwaitingTwin]);

    useEffect(() => {
        if (sendError instanceof MessageTooLongError) {
            setDraft(lastSubmittedRef.current);
            setServerLengthErrorVisible(true);
        }
        // On a 429, preserve the draft and start the visible cooldown countdown.
        if (sendError instanceof RateLimitedError) {
            setDraft(lastSubmittedRef.current);
            setCooldownSeconds(sendError.retryAfterSeconds);
        }
    }, [sendError]);

    useEffect(() => {
        if (cooldownSeconds <= 0) return;
        const id = setTimeout(() => setCooldownSeconds((s) => s - 1), 1000);
        return () => clearTimeout(id);
    }, [cooldownSeconds]);

    function submit() {
        const content = draft.trim();
        if (!content || isSending || cooldownSeconds > 0) return;
        lastSubmittedRef.current = draft;
        setDraft("");
        setServerLengthErrorVisible(false);
        send({ content, firstName, keepChat });
    }

    function onDraftChange(next: string) {
        if (serverLengthErrorVisible) setServerLengthErrorVisible(false);
        setDraft(next);
    }

    function sendChip(content: string) {
        if (isSending) return;
        send({ content, firstName, keepChat });
        composerRef.current?.focus();
    }

    function onKeepChatChange(next: boolean) {
        setKeepChat(next);
        if (next) {
            window.localStorage.removeItem(CLEAR_ON_NEXT_LOAD_KEY);
        } else {
            window.localStorage.setItem(CLEAR_ON_NEXT_LOAD_KEY, "1");
        }
    }

    const controls: ChatControlsProps = {
        firstName,
        onFirstNameChange: setFirstName,
        keepChat,
        onKeepChatChange,
        onReset: reset,
        isResetting,
    };

    return (
        <div className="dot-bg relative flex h-full min-h-0 flex-1 flex-col">
            {isEmpty ? <VisitorTopBar controls={controls} /> : <ChatHeader controls={controls} />}

            <main className="relative z-1 flex min-h-0 flex-1 flex-col">
                {isEmpty ? (
                    <>
                        {/* Hero owns a full-width scroll region (scrollbar at the
                            viewport edge); the composer + footer stay pinned below. */}
                        <Hero chips={STARTER_CHIPS} onChipClick={sendChip} disabled={isSending} />
                        <div className="mx-auto w-full max-w-270 flex-none px-4 pt-2 pb-3 sm:px-6">
                            <Composer
                                ref={composerRef}
                                value={draft}
                                onChange={onDraftChange}
                                onSubmit={submit}
                                showServerLengthError={serverLengthErrorVisible}
                                cooldownSeconds={cooldownSeconds}
                            />
                            <ComposerHint />
                        </div>
                        <div className="flex-none pb-1">
                            <Footer />
                        </div>
                    </>
                ) : (
                    <>
                        {/* Full-width scroll area so the scrollbar sits at the viewport
                            edge; the thread itself stays centered within it. */}
                        <ScrollArea className="min-h-0 w-full flex-1">
                            <div className="mx-auto flex w-full max-w-190 flex-col gap-5.5 px-4 py-6 sm:px-6">
                                {messages.map((m) => (
                                    <MessageBubble
                                        key={m.id}
                                        message={m}
                                        visitorName={visitorName}
                                    />
                                ))}
                                {isAwaitingTwin && <TypingIndicator />}
                                {escalationOffered && (
                                    <EscalationPrompt
                                        onAccept={accept}
                                        onDismiss={dismiss}
                                        isSubmitting={isAcceptingEscalation}
                                        error={acceptEscalationError}
                                    />
                                )}
                                {sendError && !(sendError instanceof RateLimitedError) && (
                                    <p className="text-destructive text-sm">{sendError.message}</p>
                                )}
                                <div ref={endRef} />
                            </div>
                        </ScrollArea>
                        <div className="mx-auto w-full max-w-190 flex-none px-4 py-3 sm:px-6">
                            {isClosed ? (
                                <ClosedBanner onStartNew={reset} disabled={isResetting} />
                            ) : (
                                <Composer
                                    ref={composerRef}
                                    value={draft}
                                    onChange={onDraftChange}
                                    onSubmit={submit}
                                    showServerLengthError={serverLengthErrorVisible}
                                    cooldownSeconds={cooldownSeconds}
                                />
                            )}
                        </div>
                    </>
                )}
            </main>
        </div>
    );
}

function ClosedBanner({ onStartNew, disabled }: { onStartNew: () => void; disabled: boolean }) {
    return (
        <div className="border-line bg-panel/60 flex flex-col items-center gap-3 rounded-2xl border px-4 py-4 text-center sm:flex-row sm:justify-between sm:text-left">
            <p className="text-ink-2 text-sm">
                This conversation is closed. Start a new one to chat again.
            </p>
            <button
                type="button"
                onClick={onStartNew}
                disabled={disabled}
                className="border-line-2 text-ink hover:bg-panel-2 inline-flex h-9 flex-none cursor-pointer items-center justify-center rounded-lg border bg-transparent px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
                Start new
            </button>
        </div>
    );
}

function ComposerHint() {
    return (
        <div className="text-ink-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b py-3 text-[13px]">
            <span>
                <Key>Enter</Key> to send
            </span>
            <span aria-hidden>·</span>
            <span>
                <Key>Shift</Key>+<Key>Enter</Key> for a new line
            </span>
        </div>
    );
}

function Key({ children }: { children: React.ReactNode }) {
    return (
        <kbd className="border-line-2 bg-panel text-ink-2 rounded-md border px-1.5 py-0.5 font-mono text-[11.5px]">
            {children}
        </kbd>
    );
}
