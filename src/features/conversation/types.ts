import type { ConversationState, MessageSender } from "@/db/schema";

export type { ConversationState, MessageSender };

export type Session = {
    conversationId: string;
};

export type HistoryMessage = {
    id: string;
    sender: MessageSender;
    content: string;
    createdAt: string;
};

export type HistoryResponse = {
    conversationId: string | null;
    firstName: string | null;
    state: ConversationState | null;
    escalationOffered: boolean;
    messages: HistoryMessage[];
};

export type ChatAck = {
    conversationId: string;
    messageId: string;
};
