import { InboxBanner, InboxAllClear } from "@/features/console/components/InboxBanner";
import { InboxFilterTabs } from "@/features/console/components/InboxFilterTabs";
import { InboxRow } from "@/features/console/components/InboxRow";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { listEscalatedThreads } from "@/features/console/inbox";
import {
    INBOX_FILTER_TO_STATE,
    type InboxFilter,
    type InboxThreadSummary,
} from "@/features/console/types";

const VALID_TABS: ReadonlySet<InboxFilter> = new Set([
    "needs_you",
    "active",
    "waiting",
    "resolved",
]);

function parseTab(raw: string | string[] | undefined): InboxFilter {
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value && VALID_TABS.has(value as InboxFilter)) return value as InboxFilter;
    return "needs_you";
}

function countByFilter(threads: InboxThreadSummary[]): Record<InboxFilter, number> {
    const counts: Record<InboxFilter, number> = {
        needs_you: 0,
        active: 0,
        waiting: 0,
        resolved: 0,
    };
    for (const filter of Object.keys(INBOX_FILTER_TO_STATE) as InboxFilter[]) {
        counts[filter] = threads.filter((t) => t.state === INBOX_FILTER_TO_STATE[filter]).length;
    }
    return counts;
}

export default async function InboxPage({
    searchParams,
}: {
    searchParams: Promise<{ tab?: string }>;
}) {
    const params = await searchParams;
    const active = parseTab(params.tab);

    const now = new Date();
    const threads = await listEscalatedThreads();
    const counts = countByFilter(threads);
    const filteredThreads = threads.filter((t) => t.state === INBOX_FILTER_TO_STATE[active]);
    const needsYouCount = counts.needs_you;

    return (
        <div className="flex flex-col">
            <header className="border-line bg-panel/60 sticky top-0 z-10 border-b px-8 py-6 backdrop-blur">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                        <SidebarTrigger className="md:hidden" />
                        <div className="flex flex-col gap-1">
                            <h1 className="font-display text-3xl leading-none">Inbox</h1>
                            <p className="text-ink-3 text-sm">
                                Conversations the twin escalated to you
                            </p>
                        </div>
                    </div>
                    <ThemeToggle />
                </div>

                {active === "needs_you" && needsYouCount > 0 && (
                    <div className="mt-5">
                        <InboxBanner count={needsYouCount} />
                    </div>
                )}

                <div className="mt-5">
                    <InboxFilterTabs active={active} counts={counts} />
                </div>
            </header>

            <div className="flex w-full flex-col">
                {filteredThreads.length === 0 ? (
                    <div className="mx-auto w-full max-w-4xl px-6 py-6">
                        {active === "needs_you" ? <InboxAllClear /> : <EmptyTab filter={active} />}
                    </div>
                ) : (
                    <ul className="flex flex-col">
                        {filteredThreads.map((thread) => (
                            <li key={thread.id}>
                                <InboxRow thread={thread} now={now} />
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}

const EMPTY_COPY: Record<InboxFilter, string> = {
    needs_you: "Nothing waiting on you.",
    active: "No active threads. When you reply, threads land here.",
    waiting: "Nothing waiting on the visitor.",
    resolved: "No resolved threads yet.",
};

function EmptyTab({ filter }: { filter: InboxFilter }) {
    return (
        <div className="border-line bg-panel text-ink-3 rounded-xl border px-4 py-10 text-center text-sm">
            {EMPTY_COPY[filter]}
        </div>
    );
}
