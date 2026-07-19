import { PhotoAvatar, TwinAvatar } from "@/components/Avatars";
import { fullName } from "@/config/site";
import type { ChatMessage } from "@/features/visitor/types";

function formatMessageTime(iso: string): string | null {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function Timestamp({ iso }: { iso: string }) {
    const label = formatMessageTime(iso);
    if (!label) return null;
    return (
        <time dateTime={iso} className="text-ink-3 text-[11.5px] font-medium tabular-nums">
            {label}
        </time>
    );
}

export function MessageBubble({
    message,
    visitorName = "You",
}: {
    message: ChatMessage;
    visitorName?: string;
}) {
    if (message.from === "system") {
        return (
            <div
                className="my-1 flex items-center gap-3"
                role="separator"
                aria-label={message.text}
            >
                <span className="bg-line h-px flex-1" aria-hidden />
                <span className="text-ink-3 text-center text-[12.5px] leading-relaxed">
                    {message.text}
                </span>
                <span className="bg-line h-px flex-1" aria-hidden />
            </div>
        );
    }

    if (message.from === "visitor") {
        return (
            <div className="flex flex-row-reverse items-start gap-3.5">
                <div className="bg-you-soft border-line-2 max-w-[85%] rounded-2xl rounded-tr-[5px] border px-4.5 py-3.75 sm:max-w-140">
                    <div className="mb-1.5 flex flex-row-reverse">
                        <span className="text-ink-2 text-[13.5px] font-semibold">
                            {visitorName}
                        </span>
                    </div>
                    <p className="text-[15.5px] leading-relaxed whitespace-pre-wrap">
                        {message.text}
                    </p>
                    <div className="mt-1.5 flex justify-end">
                        <Timestamp iso={message.createdAt} />
                    </div>
                </div>
            </div>
        );
    }

    if (message.from === "human") {
        return (
            <div className="flex items-start gap-3.5">
                <PhotoAvatar ring="human" sizePx={38} className="mt-0.5 size-9.5" />
                <div className="bg-human-soft border-human-line max-w-[85%] rounded-2xl rounded-tl-[5px] border px-4.5 py-3.75 sm:max-w-140">
                    <div className="mb-1.5 flex items-center gap-2">
                        <span className="text-human-2 text-[13.5px] font-semibold">{fullName}</span>
                        <span className="bg-human-soft text-human-2 ring-human-line inline-flex h-5.5 items-center gap-1.5 rounded-md px-2 font-mono text-[10.5px] font-semibold tracking-widest uppercase ring-1 ring-inset">
                            <span className="size-1.5 rounded-full bg-current" aria-hidden />
                            Human
                        </span>
                    </div>
                    <p className="text-[15.5px] leading-relaxed whitespace-pre-wrap">
                        {message.text}
                    </p>
                    <div className="mt-1.5 flex justify-end">
                        <Timestamp iso={message.createdAt} />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex items-start gap-3.5">
            <TwinAvatar className="mt-0.5 size-9.5" />
            <div className="bg-panel border-line max-w-[85%] rounded-2xl rounded-tl-[5px] border px-4.5 py-3.75 sm:max-w-140">
                <div className="mb-1.5 flex items-center gap-2">
                    <span className="text-twin text-[13.5px] font-semibold">Tandem</span>
                    <span className="bg-twin-soft text-twin-2 ring-twin-line inline-flex h-5.5 items-center gap-1.5 rounded-md px-2 font-mono text-[10.5px] font-semibold tracking-widest uppercase ring-1 ring-inset">
                        <span className="size-1.5 rounded-full bg-current" aria-hidden />
                        AI
                    </span>
                </div>
                <p className="text-[15.5px] leading-relaxed whitespace-pre-wrap">{message.text}</p>
                <div className="mt-1.5 flex justify-end">
                    <Timestamp iso={message.createdAt} />
                </div>
            </div>
        </div>
    );
}
