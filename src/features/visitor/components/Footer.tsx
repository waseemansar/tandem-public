import { Sparkles } from "lucide-react";
import { GithubIcon, LinkedinIcon } from "@/components/BrandIcons";
import { github, linkedin } from "@/config/site";

const linkClassName = "hover:text-ink flex items-center gap-1.5 transition-colors sm:gap-2";

function Separator() {
    return (
        <span className="text-ink-4" aria-hidden>
            ·
        </span>
    );
}

export function Footer() {
    return (
        <footer className="text-ink-3 flex flex-nowrap items-center justify-center gap-x-2.5 px-3 pb-4 text-xs whitespace-nowrap sm:gap-x-7 sm:text-sm">
            {linkedin && (
                <>
                    <a
                        href={linkedin}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={linkClassName}
                    >
                        <LinkedinIcon className="size-3.5 sm:size-4" />
                        Connect
                    </a>
                    <Separator />
                </>
            )}
            {github && (
                <>
                    <a
                        href={github}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={linkClassName}
                    >
                        <GithubIcon className="size-3.5 sm:size-4" />
                        GitHub
                    </a>
                    <Separator />
                </>
            )}
            <a
                href="https://github.com/waseemansar/tandem-public"
                target="_blank"
                rel="noopener noreferrer"
                className={linkClassName}
            >
                <Sparkles className="size-3.5 sm:size-4" />
                Make your own Tandem
            </a>
        </footer>
    );
}
