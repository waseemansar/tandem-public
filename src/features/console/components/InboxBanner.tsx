export function InboxBanner({ count }: { count: number }) {
    if (count <= 0) return null;
    const noun = count === 1 ? "conversation needs" : "conversations need";
    return (
        <div className="border-human-line bg-human-soft text-human-2 flex items-center justify-between rounded-xl border px-4 py-3 text-sm">
            <span>
                <strong className="font-semibold">
                    {count} {noun} you
                </strong>{" "}
                · Pushover notified.
            </span>
        </div>
    );
}

export function InboxAllClear() {
    return (
        <div className="border-line bg-panel text-ink-2 rounded-xl border px-4 py-6 text-center text-sm">
            <p className="text-ink font-medium">Inbox clear.</p>
            <p className="text-ink-3 mt-1 text-xs">
                Tandem is handling things on its own. You&apos;ll be paged when it needs you.
            </p>
        </div>
    );
}
