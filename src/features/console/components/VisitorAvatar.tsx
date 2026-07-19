import { cn } from "@/shared/utils";

const SIZE_CLASS = {
    sm: "size-8 rounded-md text-[12px]",
    md: "size-10 rounded-[11px] text-[13.5px]",
    lg: "size-12 rounded-xl text-[15px]",
} as const;

export function VisitorAvatar({
    initial,
    size = "md",
    className,
}: {
    initial: string;
    size?: keyof typeof SIZE_CLASS;
    className?: string;
}) {
    return (
        <div
            className={cn(
                "bg-panel-2 text-ink-2 ring-line-2 grid flex-none place-items-center font-mono font-semibold ring-1 ring-inset",
                SIZE_CLASS[size],
                className,
            )}
            aria-hidden
        >
            {initial}
        </div>
    );
}
