import { Sparkles } from "lucide-react";
import { GithubIcon, LinkedinIcon } from "@/components/BrandIcons";

export function Footer() {
    return (
        <footer className="text-ink-3 flex flex-nowrap items-center justify-center gap-x-2.5 px-3 pb-4 text-xs whitespace-nowrap sm:gap-x-7 sm:text-sm">
            <a
                href="https://linkedin.com/in/waseemansar"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-ink flex items-center gap-1.5 transition-colors sm:gap-2"
            >
                <LinkedinIcon className="size-3.5 sm:size-4" />
                Connect
            </a>
            <span className="text-ink-4" aria-hidden>
                ·
            </span>
            <a
                href="https://github.com/waseemansar"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-ink flex items-center gap-1.5 transition-colors sm:gap-2"
            >
                <GithubIcon className="size-3.5 sm:size-4" />
                GitHub
            </a>
            <span className="text-ink-4" aria-hidden>
                ·
            </span>
            <span className="flex items-center gap-1.5 sm:gap-2">
                <Sparkles className="size-3.5 sm:size-4" />
                Make your own Tandem
            </span>
        </footer>
    );
}
