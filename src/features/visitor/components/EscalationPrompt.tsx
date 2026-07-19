"use client";

import { useEffect, useState, type FormEvent } from "react";
import { PhotoAvatar } from "@/components/Avatars";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { firstName } from "@/config/site";
import { RateLimitedError, rateLimitedText } from "@/features/visitor/chat-send-error";

export function EscalationPrompt({
    onAccept,
    onDismiss,
    isSubmitting,
    error,
}: {
    onAccept: (email: string) => void;
    onDismiss: () => void;
    isSubmitting: boolean;
    error: Error | null;
}) {
    const [email, setEmail] = useState("");
    const [cooldownSeconds, setCooldownSeconds] = useState(0);
    const [trackedError, setTrackedError] = useState<Error | null>(null);

    // On a fresh 429, mirror the composer: start a live countdown and disable
    // submit for the duration (the email draft is preserved). Adjusting state
    // during render on an identity change is React's recommended alternative to
    // a prop-syncing effect.
    if (error !== trackedError) {
        setTrackedError(error);
        if (error instanceof RateLimitedError) {
            setCooldownSeconds(error.retryAfterSeconds);
        }
    }

    useEffect(() => {
        if (cooldownSeconds <= 0) return;
        const id = setTimeout(() => setCooldownSeconds((s) => s - 1), 1000);
        return () => clearTimeout(id);
    }, [cooldownSeconds]);

    const rateLimited = cooldownSeconds > 0;
    const errorText =
        error instanceof RateLimitedError
            ? rateLimited
                ? rateLimitedText(cooldownSeconds)
                : null
            : (error?.message ?? null);

    function onSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const trimmed = email.trim();
        if (!trimmed || isSubmitting || rateLimited) return;
        onAccept(trimmed);
    }

    return (
        <form
            onSubmit={onSubmit}
            className="border-line-2 bg-panel flex flex-col gap-3.5 rounded-xl border px-4 py-4"
        >
            <div className="flex items-center gap-3">
                <PhotoAvatar ring="human" sizePx={36} className="size-9" />
                <div className="flex flex-col">
                    <p className="text-ink text-[15px] font-medium">
                        Bring in the real {firstName}
                    </p>
                    <p className="text-ink-2 text-[13px]">Leave your email</p>
                </div>
            </div>
            <Input
                id="escalation-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                disabled={isSubmitting}
                aria-label="Your email"
            />
            <div className="flex items-center gap-2">
                <Button type="submit" disabled={isSubmitting || rateLimited || !email.trim()}>
                    {isSubmitting ? "Sending…" : `Notify ${firstName}`}
                </Button>
                <Button type="button" variant="ghost" onClick={onDismiss} disabled={isSubmitting}>
                    Not now
                </Button>
            </div>
            {errorText && (
                <p role="alert" className="text-destructive text-[13px]">
                    {errorText}
                </p>
            )}
        </form>
    );
}
