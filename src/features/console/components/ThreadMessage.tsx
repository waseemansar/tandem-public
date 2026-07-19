import { PhotoAvatar, TwinAvatar } from "@/components/Avatars";
import { fullName } from "@/config/site";
import { SystemMessageDivider } from "@/features/console/components/SystemMessageDivider";
import { VisitorAvatar } from "@/features/console/components/VisitorAvatar";
import { initialFromDisplayName } from "@/features/console/format";
import type { ThreadMessage as ThreadMessageType } from "@/features/console/types";

function formatMessageTime(date: Date): string | null {
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function Timestamp({ date }: { date: Date }) {
    const label = formatMessageTime(date);
    if (!label) return null;
    return (
        <time
            dateTime={date.toISOString()}
            className="text-ink-3 text-[11.5px] font-medium tabular-nums"
        >
            {label}
        </time>
    );
}

export function ThreadMessage({
    message,
    visitorDisplayName,
}: {
    message: ThreadMessageType;
    visitorDisplayName: string;
}) {
    if (message.sender === "system") {
        return <SystemMessageDivider text={message.content} />;
    }

    if (message.sender === "twin") {
        return (
            <div className="flex items-start gap-3.5">
                <TwinAvatar className="mt-0.5 size-9.5" />
                <div className="bg-panel border-line max-w-[85%] rounded-2xl rounded-tl-[5px] border px-4.5 py-3.75 sm:max-w-180">
                    <div className="mb-1.5 flex items-center gap-2">
                        <span className="text-twin text-[13.5px] font-semibold">Tandem</span>
                        <span className="bg-twin-soft text-twin-2 ring-twin-line inline-flex h-5.5 items-center gap-1.5 rounded-md px-2 font-mono text-[10.5px] font-semibold tracking-widest uppercase ring-1 ring-inset">
                            <span className="size-1.5 rounded-full bg-current" aria-hidden />
                            AI
                        </span>
                    </div>
                    <p className="text-[15.5px] leading-relaxed whitespace-pre-wrap">
                        {message.content}
                    </p>
                    <div className="mt-1.5 flex justify-end">
                        <Timestamp date={message.createdAt} />
                    </div>
                </div>
            </div>
        );
    }

    if (message.sender === "human") {
        return (
            <div className="flex items-start gap-3.5">
                <PhotoAvatar ring="human" sizePx={38} className="mt-0.5 size-9.5" />
                <div className="bg-human-soft border-human-line max-w-[85%] rounded-2xl rounded-tl-[5px] border px-4.5 py-3.75 sm:max-w-180">
                    <div className="mb-1.5 flex items-center gap-2">
                        <span className="text-human-2 text-[13.5px] font-semibold">{fullName}</span>
                        <span className="bg-human-soft text-human-2 ring-human-line inline-flex h-5.5 items-center gap-1.5 rounded-md px-2 font-mono text-[10.5px] font-semibold tracking-widest uppercase ring-1 ring-inset">
                            <span className="size-1.5 rounded-full bg-current" aria-hidden />
                            Human
                        </span>
                    </div>
                    <p className="text-[15.5px] leading-relaxed whitespace-pre-wrap">
                        {message.content}
                    </p>
                    <div className="mt-1.5 flex justify-end">
                        <Timestamp date={message.createdAt} />
                    </div>
                </div>
            </div>
        );
    }

    // visitor — labelled by display name on console surface
    return (
        <div className="flex items-start gap-3.5">
            <VisitorAvatar
                initial={initialFromDisplayName(visitorDisplayName)}
                className="mt-0.5 size-9.5"
            />
            <div className="bg-you-soft border-line-2 max-w-[85%] rounded-2xl rounded-tl-[5px] border px-4.5 py-3.75 sm:max-w-180">
                <div className="mb-1.5">
                    <span className="text-ink-2 text-[13.5px] font-semibold">
                        {visitorDisplayName}
                    </span>
                </div>
                <p className="text-[15.5px] leading-relaxed whitespace-pre-wrap">
                    {message.content}
                </p>
                <div className="mt-1.5 flex justify-end">
                    <Timestamp date={message.createdAt} />
                </div>
            </div>
        </div>
    );
}
