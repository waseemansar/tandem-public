"use client";

import { Undo2, CheckCircle2, Sparkles, Loader2 } from "lucide-react";
import { PhotoAvatar } from "@/components/Avatars";
import { Button } from "@/components/ui/button";
import { fullName } from "@/config/site";
import { availableActions } from "@/features/console/thread-actions";
import type { ConversationState } from "@/features/console/types";
import { JOIN_SYSTEM_MESSAGE } from "@/features/conversation/constants";

export type StripAction = "hand-back" | "resolve" | "draft";

export function ReplyAsHumanStrip({
    state,
    visitorDisplayName,
    pending,
    twinStreaming = false,
    onAction,
}: {
    state: ConversationState;
    visitorDisplayName: string;
    pending: StripAction | null;
    twinStreaming?: boolean;
    onAction: (action: StripAction) => void;
}) {
    const actions = availableActions(state);
    const busy = pending !== null;
    const draftBusy = pending === "draft" || twinStreaming;

    return (
        <div className="border-human-line bg-human-soft/60 flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-3">
                <PhotoAvatar ring="human" sizePx={32} className="size-8 flex-none" />
                <div className="min-w-0 flex-1">
                    <p className="text-human-2 truncate text-sm leading-tight font-semibold">
                        Replying as {fullName}
                    </p>
                    <p className="text-ink-3 truncate text-xs leading-tight">
                        {`${visitorDisplayName} will see “${JOIN_SYSTEM_MESSAGE}”`}
                    </p>
                </div>
            </div>
            <div className="flex flex-none flex-wrap items-center gap-2">
                {actions.summonDraft && (
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => onAction("draft")}
                        disabled={busy || draftBusy}
                        className="flex-1 gap-1.5 sm:flex-none"
                    >
                        {draftBusy ? (
                            <Loader2 className="size-3.5 animate-spin" aria-hidden />
                        ) : (
                            <Sparkles className="size-3.5" aria-hidden />
                        )}
                        {draftBusy ? "Drafting…" : "Tandem, draft a reply"}
                    </Button>
                )}
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onAction("hand-back")}
                    disabled={busy || !actions.handBack}
                    className="flex-1 gap-1.5 sm:flex-none"
                >
                    {pending === "hand-back" ? (
                        <Loader2 className="size-3.5 animate-spin" aria-hidden />
                    ) : (
                        <Undo2 className="size-3.5" aria-hidden />
                    )}
                    Hand back
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onAction("resolve")}
                    disabled={busy || !actions.markResolved}
                    className="flex-1 gap-1.5 sm:flex-none"
                >
                    {pending === "resolve" ? (
                        <Loader2 className="size-3.5 animate-spin" aria-hidden />
                    ) : (
                        <CheckCircle2 className="size-3.5" aria-hidden />
                    )}
                    Mark resolved
                </Button>
            </div>
        </div>
    );
}
