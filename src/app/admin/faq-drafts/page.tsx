import { ThemeToggle } from "@/components/ThemeToggle";
import { SuggestionsTray } from "@/features/console/components/SuggestionsTray";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { getConversation } from "@/features/conversation";

export default async function FaqDraftsPage() {
    const suggestions = await getConversation().listPendingSuggestions();
    const initial = suggestions.map((s) => ({
        id: s.id,
        conversationId: s.conversationId,
        question: s.question,
        answer: s.answer,
        createdAt: s.createdAt.toISOString(),
    }));

    return (
        <div className="flex flex-col">
            <header className="border-line bg-panel/60 sticky top-0 z-10 border-b px-8 py-6 backdrop-blur">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                        <SidebarTrigger className="md:hidden" />
                        <div className="flex flex-col gap-1">
                            <h1 className="font-display text-3xl leading-none">FAQ drafts</h1>
                            <p className="text-ink-3 text-sm">
                                Q&A pairs the twin drafted from recent threads. Approve to append to
                                the live doc, or dismiss to skip.
                            </p>
                        </div>
                    </div>
                    <ThemeToggle />
                </div>
            </header>

            <div className="mx-auto w-full max-w-4xl px-6 py-6">
                <SuggestionsTray initial={initial} />
            </div>
        </div>
    );
}
