import Link from "next/link";
import { cn } from "@/shared/utils";
import type { InboxFilter } from "@/features/console/types";

interface TabDef {
    id: InboxFilter;
    label: string;
    count: number;
}

export function InboxFilterTabs({
    active,
    counts,
}: {
    active: InboxFilter;
    counts: Record<InboxFilter, number>;
}) {
    const tabs: TabDef[] = [
        { id: "needs_you", label: "Needs you", count: counts.needs_you },
        { id: "active", label: "Active", count: counts.active },
        { id: "waiting", label: "Waiting", count: counts.waiting },
        { id: "resolved", label: "Resolved", count: counts.resolved },
    ];

    return (
        <nav className="flex flex-wrap gap-2" aria-label="Inbox filter">
            {tabs.map((tab) => {
                const href = tab.id === "needs_you" ? "/admin/inbox" : `/admin/inbox?tab=${tab.id}`;
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
