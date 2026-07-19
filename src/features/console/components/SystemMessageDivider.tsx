export function SystemMessageDivider({ text }: { text: string }) {
    return (
        <div className="my-2 flex items-center gap-3" role="separator" aria-label={text}>
            <span className="bg-line h-px flex-1" aria-hidden />
            <span className="text-ink-3 text-center text-[12.5px] leading-relaxed">{text}</span>
            <span className="bg-line h-px flex-1" aria-hidden />
        </div>
    );
}
