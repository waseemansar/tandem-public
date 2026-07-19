import { PhotoAvatar } from "@/components/Avatars";
import { Button } from "@/components/ui/button";
import { firstName } from "@/config/site";
import { cn } from "@/shared/utils";

export function Hero({
    chips,
    onChipClick,
    disabled,
}: {
    chips: readonly string[];
    onChipClick: (chip: string) => void;
    disabled?: boolean;
}) {
    const lastIndex = chips.length - 1;

    return (
        <div className="flex w-full flex-1 flex-col overflow-y-auto">
            <div className="m-auto flex w-full max-w-270 flex-col items-center px-4 py-6 sm:px-6">
                <PhotoAvatar ring="hero" sizePx={96} className="mb-7.5 size-16 sm:size-20" />

                <h2 className="font-display max-w-220 text-center text-[33px] leading-[1.08] tracking-[-0.01em] sm:text-5xl">
                    Two voices, one chat. Start with{" "}
                    <span className="text-twin italic">Tandem</span>
                    {" — "}
                    {firstName} might <span className="text-twin italic">chime in</span>.
                </h2>

                <p className="text-ink-2 mt-3.5 max-w-140 text-center text-[15.5px] leading-normal sm:text-[17px] lg:text-[19px]">
                    Tandem covers {firstName}&rsquo;s background and experience. The real{" "}
                    {firstName} steps in when your question deserves it.
                </p>

                <div className="mt-6 flex max-w-205 flex-wrap justify-center gap-2 sm:gap-3">
                    {chips.map((chip, i) => (
                        <Button
                            key={chip}
                            type="button"
                            variant="outline"
                            onClick={() => onChipClick(chip)}
                            disabled={disabled}
                            className={cn(
                                "h-10 rounded-full px-4.5 text-[13.5px] font-normal sm:h-10.5 sm:text-[15px]",
                                i === lastIndex &&
                                    "border-twin-line bg-twin-soft text-twin hover:bg-twin-soft hover:text-twin",
                            )}
                        >
                            {chip}
                        </Button>
                    ))}
                </div>
            </div>
        </div>
    );
}
