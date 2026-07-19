import type { ConversationState, MessageSender } from "@/db/schema";

export type { ConversationState, MessageSender };

export type InboxFilter = "needs_you" | "active" | "waiting" | "resolved";

export const INBOX_FILTER_TO_STATE: Record<InboxFilter, ConversationState> = {
    needs_you: "awaiting_you",
    active: "active_you",
    waiting: "awaiting_visitor",
    resolved: "resolved",
};

export interface InboxThreadSummary {
    id: string;
    displayName: string;
    email: string | null;
    state: ConversationState;
    lastMessagePreview: string;
    lastMessageAt: Date;
    escalatedAt: Date | null;
}

export interface ConversationSummary {
    id: string;
    displayName: string;
    firstName: string | null;
    email: string | null;
    state: ConversationState;
    lastMessagePreview: string;
    lastMessageAt: Date | null;
    createdAt: Date;
}

export interface ThreadMessage {
    id: string;
    sender: MessageSender;
    content: string;
    createdAt: Date;
}

export interface ThreadDetail {
    id: string;
    displayName: string;
    email: string | null;
    state: ConversationState;
    escalatedAt: Date | null;
    messages: ThreadMessage[];
}

export interface SidebarCounts {
    inbox: number;
    faqDrafts: number;
}
