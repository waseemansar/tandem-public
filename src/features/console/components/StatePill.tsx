import { Badge } from "@/components/ui/badge";
import { cn } from "@/shared/utils";
import type { ConversationState } from "@/features/console/types";

const LABELS: Record<ConversationState, string> = {
    twin_only: "Twin only",
    awaiting_you: "Needs you",
    active_you: "Active",
    awaiting_visitor: "Waiting",
    resolved: "Resolved",
};

const STYLES: Record<ConversationState, string> = {
    twin_only: "bg-twin-soft text-twin-2 ring-twin-line",
    awaiting_you: "bg-human-soft text-human-2 ring-human-line",
    active_you: "bg-human-soft text-human-2 ring-human-line",
    awaiting_visitor: "bg-panel-2 text-ink-2 ring-line-2",
    resolved: "bg-panel-2 text-ink-3 ring-line-2",
};

export function StatePill({ state, className }: { state: ConversationState; className?: string }) {
    return (
        <Badge
            className={cn(
                "gap-1.5 rounded-md px-2 font-mono text-[10.5px] font-semibold tracking-widest uppercase ring-1 ring-inset",
                STYLES[state],
                className,
            )}
        >
            <span className="size-1.5 rounded-full bg-current" aria-hidden />
            {LABELS[state]}
        </Badge>
    );
}
