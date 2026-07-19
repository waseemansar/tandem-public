import { BrandMark } from "@/components/Brand";

export function ConsoleBrand() {
    return (
        <div className="flex items-center gap-4" aria-label="Tandem console">
            <BrandMark className="brand-mark--lg" />
            <div className="flex flex-col gap-1">
                <span className="font-display text-3xl leading-none">Tandem</span>
                <span className="text-ink-3 font-mono text-[11px] font-medium tracking-[0.22em] uppercase">
                    Console
                </span>
            </div>
        </div>
    );
}
