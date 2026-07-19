import Link from "next/link";
import { fullName } from "@/config/site";
import { cn } from "@/shared/utils";

export function BrandMark({ className }: { className?: string }) {
    return <div className={cn("brand-mark", className)} />;
}

export function Brand({ subtitle = true }: { subtitle?: boolean }) {
    return (
        <Link href="/" aria-label="Tandem — home" className="flex items-center gap-3">
            <BrandMark />
            <div className="flex flex-col">
                <span className="font-display text-lg leading-none sm:text-2xl">Tandem</span>
                {subtitle && (
                    <span className="text-ink-3 mt-0.5 block font-mono text-[10px] font-medium tracking-[0.18em] whitespace-nowrap uppercase sm:mt-0.75 sm:text-[11px] sm:tracking-[0.22em]">
                        {fullName} · Digital Twin
                    </span>
                )}
            </div>
        </Link>
    );
}
