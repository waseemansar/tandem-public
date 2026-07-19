import {
    ConversationsFilterTabs,
    type ConversationsFilter,
} from "@/features/console/components/ConversationsFilterTabs";
import { ConversationsRow } from "@/features/console/components/ConversationsRow";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { listConversations } from "@/features/console/inbox";
import type { ConversationState, ConversationSummary } from "@/features/console/types";

const VALID_STATES: ReadonlySet<ConversationState> = new Set([
    "twin_only",
    "awaiting_you",
    "active_you",
    "awaiting_visitor",
    "resolved",
]);

function parseStateFilter(raw: string | string[] | undefined): ConversationsFilter {
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value && VALID_STATES.has(value as ConversationState)) return value as ConversationState;
    return "all";
}

function countByFilter(threads: ConversationSummary[]): Record<ConversationsFilter, number> {
    const counts: Record<ConversationsFilter, number> = {
        all: threads.length,
        twin_only: 0,
        awaiting_you: 0,
        active_you: 0,
        awaiting_visitor: 0,
        resolved: 0,
    };
    for (const t of threads) counts[t.state]++;
    return counts;
}

export default async function ConversationsPage({
    searchParams,
}: {
    searchParams: Promise<{ state?: string }>;
}) {
    const params = await searchParams;
    const active = parseStateFilter(params.state);

    const now = new Date();
    const threads = await listConversations();
    const counts = countByFilter(threads);
    const filteredThreads = active === "all" ? threads : threads.filter((t) => t.state === active);

    return (
        <div className="flex flex-col">
            <header className="border-line bg-panel/60 sticky top-0 z-10 border-b px-8 py-6 backdrop-blur">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                        <SidebarTrigger className="md:hidden" />
                        <div className="flex flex-col gap-1">
                            <h1 className="font-display text-3xl leading-none">Conversations</h1>
                            <p className="text-ink-3 text-sm">Every conversation — newest first</p>
                        </div>
                    </div>
                    <ThemeToggle />
                </div>

                <div className="mt-5">
                    <ConversationsFilterTabs active={active} counts={counts} />
                </div>
            </header>

            <div className="flex w-full flex-col">
                {filteredThreads.length === 0 ? (
                    <div className="mx-auto w-full max-w-4xl px-6 py-6">
                        <EmptyState />
                    </div>
                ) : (
                    <ul className="flex flex-col">
                        {filteredThreads.map((thread) => (
                            <li key={thread.id}>
                                <ConversationsRow thread={thread} now={now} />
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}

function EmptyState() {
    return (
        <div className="border-line bg-panel text-ink-3 rounded-xl border px-4 py-10 text-center text-sm">
            No conversations match this filter.
        </div>
    );
}
