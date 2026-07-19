import { Brand } from "@/components/Brand";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ChatControls, type ChatControlsProps } from "@/features/visitor/components/ChatControls";

export function VisitorTopBar({ controls }: { controls: ChatControlsProps }) {
    return (
        <header className="border-line bg-background/85 z-10 flex-none border-b px-4 backdrop-blur-md sm:px-6 md:px-7.5">
            <div className="flex h-14 items-center justify-between gap-3 md:h-18.5">
                <Brand />
                <div className="flex items-center gap-2 sm:gap-3">
                    <ChatControls {...controls} className="hidden md:flex" />
                    <ThemeToggle />
                </div>
            </div>
            <ChatControls {...controls} className="pb-2.5 md:hidden" />
        </header>
    );
}

export function ChatHeader({ controls }: { controls: ChatControlsProps }) {
    return (
        <header className="border-line bg-background/85 z-10 flex-none border-b px-4 backdrop-blur-md sm:px-6">
            <div className="flex h-14 items-center justify-between gap-3 md:h-16">
                <Brand subtitle={false} />
                <div className="flex items-center gap-2 sm:gap-3">
                    <ChatControls {...controls} className="hidden md:flex" />
                    <ThemeToggle />
                </div>
            </div>
            <ChatControls {...controls} className="pb-2.5 md:hidden" />
        </header>
    );
}
