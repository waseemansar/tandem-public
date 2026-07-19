import Link from "next/link";
import { cn } from "@/shared/utils";
import type { ConversationState } from "@/features/console/types";

export type ConversationsFilter = "all" | ConversationState;

interface TabDef {
    id: ConversationsFilter;
    label: string;
    count: number;
}

const STATE_LABELS: Record<ConversationState, string> = {
    twin_only: "Twin only",
    awaiting_you: "Needs you",
    active_you: "Active",
    awaiting_visitor: "Waiting",
    resolved: "Resolved",
};

export function ConversationsFilterTabs({
    active,
    counts,
}: {
    active: ConversationsFilter;
    counts: Record<ConversationsFilter, number>;
}) {
    const tabs: TabDef[] = [
        { id: "all", label: "All", count: counts.all },
        { id: "twin_only", label: STATE_LABELS.twin_only, count: counts.twin_only },
        { id: "awaiting_you", label: STATE_LABELS.awaiting_you, count: counts.awaiting_you },
        { id: "active_you", label: STATE_LABELS.active_you, count: counts.active_you },
        {
            id: "awaiting_visitor",
            label: STATE_LABELS.awaiting_visitor,
            count: counts.awaiting_visitor,
        },
        { id: "resolved", label: STATE_LABELS.resolved, count: counts.resolved },
    ];

    return (
        <nav className="flex flex-wrap gap-2" aria-label="Conversations filter">
            {tabs.map((tab) => {
                const href =
                    tab.id === "all"
                        ? "/admin/conversations"
                        : `/admin/conversations?state=${tab.id}`;
                const isActive = tab.id === active;
                return (
                    <Link
                        key={tab.id}
                        href={href}
                        aria-current={isActive ? "page" : undefined}
                        className={cn(
                            "inline-flex h-9 items-center gap-2 rounded-lg px-3.5 text-sm transition-colors",
                            isActive
                                ? "bg-twin-soft text-twin-2 ring-twin-line ring-1 ring-inset"
                                : "text-ink-2 border-line hover:bg-panel-2 hover:text-ink border",
                        )}
                    >
                        <span className="font-medium">{tab.label}</span>
                        <span
                            className={cn(
                                "font-mono text-[11px] tabular-nums",
                                isActive ? "text-twin-2/70" : "text-ink-3",
                            )}
                        >
                            {tab.count}
                        </span>
                    </Link>
                );
            })}
        </nav>
    );
}
