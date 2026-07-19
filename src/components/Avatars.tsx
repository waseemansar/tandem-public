import Image from "next/image";
import { Bot } from "lucide-react";
import { fullName, photo } from "@/config/site";
import { cn } from "@/shared/utils";

export function TwinAvatar({ className }: { className?: string }) {
    return (
        <div className={cn("av-twin grid flex-none place-items-center rounded-full", className)}>
            <Bot className="size-[56%]" strokeWidth={2} aria-hidden />
        </div>
    );
}

type PhotoRing = "hero" | "neutral" | "human";

const RING_CLASS: Record<PhotoRing, string> = {
    hero: "av-hero",
    neutral: "av-photo",
    human: "av-human",
};

export function PhotoAvatar({
    ring = "neutral",
    sizePx,
    className,
}: {
    ring?: PhotoRing;
    sizePx: number;
    className?: string;
}) {
    return (
        <div
            className={cn(
                "relative flex-none overflow-hidden rounded-full",
                RING_CLASS[ring],
                className,
            )}
        >
            <Image
                src={photo}
                alt={fullName}
                fill
                sizes={`${sizePx}px`}
                className="object-cover"
                priority={ring === "hero"}
            />
        </div>
    );
}
