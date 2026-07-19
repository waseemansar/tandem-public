export function JustNowBadge() {
    return (
        <span className="bg-human-soft text-human-2 ring-human-line inline-flex h-5.5 items-center gap-1.5 rounded-md px-2 font-mono text-[10.5px] font-semibold tracking-widest uppercase ring-1 ring-inset">
            <span className="bg-ok size-1.5 animate-pulse rounded-full" aria-hidden />
            Just now
        </span>
    );
}
