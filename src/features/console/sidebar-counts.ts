import { getConversation } from "@/features/conversation";
import { inboxAwaitingYouCount, listEscalatedThreads } from "@/features/console/inbox";
import type { SidebarCounts } from "@/features/console/types";

export async function loadSidebarCounts(): Promise<SidebarCounts> {
    const [threads, suggestions] = await Promise.all([
        listEscalatedThreads(),
        getConversation().listPendingSuggestions(),
    ]);
    return {
        inbox: inboxAwaitingYouCount(threads),
        faqDrafts: suggestions.length,
    };
}
