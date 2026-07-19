import { Chat } from "@/features/visitor/components/Chat";
import { getConversation } from "@/features/conversation";
import * as VisitorSession from "@/features/visitor/session";
import type { HistoryResponse } from "@/features/conversation/types";

async function loadInitialHistory(): Promise<HistoryResponse> {
    const session = await VisitorSession.fromCookies();
    if (!session) {
        return {
            conversationId: null,
            firstName: null,
            state: null,
            escalationOffered: false,
            messages: [],
        };
    }
    return getConversation().loadHistory(session);
}

export default async function Home() {
    const initialHistory = await loadInitialHistory();

    return <Chat initialHistory={initialHistory} />;
}
