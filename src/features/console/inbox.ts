import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import { getDb, type Db } from "@/db/client";
import { conversations, messages } from "@/db/schema";
import { visitorDisplayName } from "@/features/console/format";
import type {
    ConversationState,
    ConversationSummary,
    InboxThreadSummary,
    ThreadDetail,
} from "@/features/console/types";

const STATE_PRIORITY = sql<number>`case ${conversations.state}
    when 'awaiting_you' then 1
    when 'active_you' then 2
    when 'awaiting_visitor' then 3
    when 'resolved' then 4
    else 5 end`;

export async function listEscalatedThreads(db: Db = getDb()): Promise<InboxThreadSummary[]> {
    const lastMessage = db
        .select({
            conversationId: messages.conversationId,
            content: messages.content,
            createdAt: messages.createdAt,
            rn: sql<number>`row_number() over (partition by ${messages.conversationId} order by ${messages.createdAt} desc)`.as(
                "rn",
            ),
        })
        .from(messages)
        .as("lm");

    const rows = await db
        .select({
            id: conversations.id,
            email: conversations.email,
            firstName: conversations.firstName,
            state: conversations.state,
            escalatedAt: conversations.escalationOfferedAt,
            lastMessageContent: lastMessage.content,
            lastMessageAt: lastMessage.createdAt,
        })
        .from(conversations)
        .leftJoin(
            lastMessage,
            and(eq(lastMessage.conversationId, conversations.id), eq(lastMessage.rn, 1)),
        )
        .where(ne(conversations.state, "twin_only"))
        .orderBy(asc(STATE_PRIORITY), desc(lastMessage.createdAt));

    return rows.map((r) => ({
        id: r.id,
        displayName: visitorDisplayName({ firstName: r.firstName, email: r.email }),
        email: r.email,
        state: r.state,
        lastMessagePreview: r.lastMessageContent ?? "",
        lastMessageAt: r.lastMessageAt ?? new Date(0),
        escalatedAt: r.escalatedAt ?? null,
    }));
}

export async function getThreadDetail(
    id: string,
    opts: { db?: Db; includeTwinOnly?: boolean } = {},
): Promise<ThreadDetail | null> {
    const db = opts.db ?? getDb();
    const [convo] = await db
        .select({
            id: conversations.id,
            email: conversations.email,
            firstName: conversations.firstName,
            state: conversations.state,
            escalatedAt: conversations.escalationOfferedAt,
        })
        .from(conversations)
        .where(eq(conversations.id, id));

    if (!convo) return null;
    if (convo.state === "twin_only" && !opts.includeTwinOnly) return null;

    const rows = await db
        .select({
            id: messages.id,
            sender: messages.sender,
            content: messages.content,
            createdAt: messages.createdAt,
        })
        .from(messages)
        .where(eq(messages.conversationId, id))
        .orderBy(asc(messages.createdAt));

    return {
        id: convo.id,
        displayName: visitorDisplayName({ firstName: convo.firstName, email: convo.email }),
        email: convo.email,
        state: convo.state,
        escalatedAt: convo.escalatedAt,
        messages: rows.map((m) => ({
            id: m.id,
            sender: m.sender,
            content: m.content,
            createdAt: m.createdAt,
        })),
    };
}

export function inboxAwaitingYouCount(threads: InboxThreadSummary[]): number {
    return threads.filter((t) => t.state === "awaiting_you").length;
}

export async function listConversations(
    filter?: ConversationState,
    db: Db = getDb(),
): Promise<ConversationSummary[]> {
    const lastMessage = db
        .select({
            conversationId: messages.conversationId,
            content: messages.content,
            createdAt: messages.createdAt,
            rn: sql<number>`row_number() over (partition by ${messages.conversationId} order by ${messages.createdAt} desc)`.as(
                "rn",
            ),
        })
        .from(messages)
        .as("lm");

    const baseQuery = db
        .select({
            id: conversations.id,
            email: conversations.email,
            firstName: conversations.firstName,
            state: conversations.state,
            createdAt: conversations.createdAt,
            lastMessageContent: lastMessage.content,
            lastMessageAt: lastMessage.createdAt,
        })
        .from(conversations)
        .leftJoin(
            lastMessage,
            and(eq(lastMessage.conversationId, conversations.id), eq(lastMessage.rn, 1)),
        );

    const rows = await (
        filter ? baseQuery.where(eq(conversations.state, filter)) : baseQuery
    ).orderBy(desc(conversations.createdAt));

    return rows.map((r) => ({
        id: r.id,
        displayName: visitorDisplayName({ firstName: r.firstName, email: r.email }),
        firstName: r.firstName,
        email: r.email,
        state: r.state,
        lastMessagePreview: r.lastMessageContent ?? "",
        lastMessageAt: r.lastMessageAt ?? null,
        createdAt: r.createdAt,
    }));
}
