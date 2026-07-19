import { TwinAvatar } from "@/components/Avatars";

export function TypingIndicator() {
    return (
        <div className="flex items-start gap-3.5">
            <TwinAvatar className="mt-0.5 size-9.5" />
            <div
                className="bg-panel border-line text-twin inline-flex items-center gap-1.5 rounded-2xl rounded-tl-[5px] border px-4.5 py-4"
                role="status"
                aria-label="Tandem is typing"
            >
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="typing-dot" />
            </div>
        </div>
    );
}
