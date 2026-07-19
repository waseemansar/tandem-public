import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { StatePill } from "@/features/console/components/StatePill";
import { VisitorAvatar } from "@/features/console/components/VisitorAvatar";
import { Button } from "@/components/ui/button";
import { formatRelativeTime, initialFromDisplayName } from "@/features/console/format";
import type { ConversationState } from "@/features/console/types";

export function ThreadHeader({
    displayName,
    email,
    state,
    escalatedAt,
    now,
    backHref = "/admin/inbox",
    backLabel = "Back to Inbox",
}: {
    displayName: string;
    email: string | null;
    state: ConversationState;
    escalatedAt: Date | null;
    now: Date;
    backHref?: string;
    backLabel?: string;
}) {
    return (
        <header className="border-line bg-panel/60 sticky top-0 z-10 flex items-center gap-4 border-b px-6 py-4 backdrop-blur">
            <Button asChild variant="ghost" size="icon-sm" aria-label={backLabel}>
                <Link href={backHref}>
                    <ArrowLeft />
                </Link>
            </Button>
            <VisitorAvatar initial={initialFromDisplayName(displayName)} size="lg" />
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2.5">
                    <h1 className="text-ink truncate text-base font-semibold">{displayName}</h1>
                    <StatePill state={state} />
                </div>
                <div className="text-ink-3 flex items-center gap-2 text-xs">
                    {email && <span className="truncate">{email}</span>}
                    {email && escalatedAt && <span aria-hidden>·</span>}
                    {escalatedAt && (
                        <span>Escalated {formatRelativeTime(escalatedAt, now)} ago</span>
                    )}
                </div>
            </div>
        </header>
    );
}
