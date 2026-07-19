import Link from "next/link";
import { JustNowBadge } from "@/features/console/components/JustNowBadge";
import { StatePill } from "@/features/console/components/StatePill";
import { VisitorAvatar } from "@/features/console/components/VisitorAvatar";
import { formatRelativeTime, initialFromDisplayName, isJustNow } from "@/features/console/format";
import type { ConversationSummary } from "@/features/console/types";

export function ConversationsRow({ thread, now }: { thread: ConversationSummary; now: Date }) {
    const initial = initialFromDisplayName(thread.displayName);
    const justNow = thread.lastMessageAt ? isJustNow(thread.lastMessageAt, now) : false;
    const timestamp = thread.lastMessageAt ?? thread.createdAt;

    return (
        <Link
            href={`/admin/conversations/${thread.id}`}
            className="border-line hover:bg-panel-2 flex items-start gap-4 border-b px-5 py-4 transition-shadow hover:shadow-[inset_3px_0_0_var(--twin)]"
        >
            <VisitorAvatar initial={initial} size="md" />

            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3 whitespace-nowrap">
                    <span className="text-ink flex-none text-[15px] font-semibold">
                        {thread.displayName}
                    </span>
                    {thread.email && (
                        <span className="text-ink-3 truncate font-mono text-xs">
                            {thread.email}
                        </span>
                    )}
                    {justNow && <JustNowBadge />}
                </div>
                <p className="text-ink-2 mt-1 truncate text-sm">
                    {thread.lastMessagePreview || (
                        <span className="text-ink-3 italic">No messages yet</span>
                    )}
                </p>
            </div>

            <div className="flex flex-none flex-col items-end gap-2">
                <StatePill state={thread.state} />
                <span className="text-ink-3 font-mono text-[11px] tabular-nums">
                    {formatRelativeTime(timestamp, now)}
                </span>
            </div>
        </Link>
    );
}
