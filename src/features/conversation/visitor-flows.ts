import { asc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { conversations, messages } from "@/db/schema";
import type { SseBroadcaster } from "@/shared/sse-broadcaster";
import { ESCALATION_CONFIRMATION, TWIN_DISABLED_MESSAGE } from "@/features/conversation/constants";
import type { HistoryResponse, Session } from "@/features/conversation/types";
import type { Effects } from "@/features/conversation/effects";
import { ConversationInvalidStateError } from "@/features/conversation/errors";
import type { Scheduler } from "@/features/conversation/scheduler";
import { transition } from "@/features/conversation/state-machine";
import { isTwinDisabled } from "@/features/twin/agent";

export type VisitorMessageInput = {
    session: Session | null;
    content: string;
    firstName?: string;
};

export type VisitorMessageResult = {
    conversationId: string;
    messageId: string;
};

export type AcceptEscalationInput = {
    session: Session;
    email: string;
};

export type AcceptEscalationResult = {
    conversationId: string;
};

export type VisitorFlowsDeps = {
    db: Db;
    sse: SseBroadcaster;
};

export type VisitorFlows = {
    loadHistory(session: Session): Promise<HistoryResponse>;
    handleVisitorMessage(input: VisitorMessageInput): Promise<VisitorMessageResult>;
    acceptEscalation(input: AcceptEscalationInput): Promise<AcceptEscalationResult>;
    dismissEscalation(session: Session): Promise<void>;
};

export function createVisitorFlows(
    deps: VisitorFlowsDeps,
    effects: Effects,
    scheduler: Scheduler,
): VisitorFlows {
    const { db, sse } = deps;

    async function loadHistory(session: Session): Promise<HistoryResponse> {
        const [convoRow] = await db
            .select({
                firstName: conversations.firstName,
                state: conversations.state,
                escalationOfferedAt: conversations.escalationOfferedAt,
            })
            .from(conversations)
            .where(eq(conversations.id, session.conversationId));

        const rows = await db
            .select({
                id: messages.id,
                sender: messages.sender,
                content: messages.content,
                createdAt: messages.createdAt,
            })
            .from(messages)
            .where(eq(messages.conversationId, session.conversationId))
            .orderBy(asc(messages.createdAt));

        return {
            conversationId: session.conversationId,
            firstName: convoRow?.firstName ?? null,
            state: convoRow?.state ?? null,
            escalationOffered:
                convoRow?.state === "twin_only" && convoRow.escalationOfferedAt !== null,
            messages: rows.map((r) => ({
                id: r.id,
                sender: r.sender,
                content: r.content,
                createdAt: r.createdAt.toISOString(),
            })),
        };
    }

    async function handleVisitorMessage(input: VisitorMessageInput): Promise<VisitorMessageResult> {
        let conversationId = input.session?.conversationId;
        let currentState:
            | "twin_only"
            | "awaiting_you"
            | "active_you"
            | "awaiting_visitor"
            | "resolved" = "twin_only";

        if (!conversationId) {
            const [created] = await db
                .insert(conversations)
                .values({ firstName: input.firstName ?? null })
                .returning({ id: conversations.id, state: conversations.state });
            conversationId = created.id;
            currentState = created.state;
        } else {
            const [convo] = await db
                .select({ state: conversations.state })
                .from(conversations)
                .where(eq(conversations.id, conversationId));
            if (convo?.state === "resolved") {
                throw new ConversationInvalidStateError(convo.state);
            }

            sse.abortActiveStream(conversationId);
            if (input.firstName) {
                await db
                    .update(conversations)
                    .set({ firstName: input.firstName })
                    .where(eq(conversations.id, conversationId));
            }
            // A new visitor message implicitly retires any open offer — clear
            // before the next reply streams so the prompt disappears immediately.
            await effects.clearOpenOfferIfAny(conversationId);

            if (convo) currentState = convo.state;
        }

        const [visitorMessage] = await db
            .insert(messages)
            .values({
                conversationId,
                sender: "visitor",
                content: input.content,
            })
            .returning({
                id: messages.id,
                sender: messages.sender,
                content: messages.content,
                createdAt: messages.createdAt,
            });

        sse.publish(conversationId, {
            type: "message",
            message: {
                id: visitorMessage.id,
                sender: visitorMessage.sender,
                content: visitorMessage.content,
                createdAt: visitorMessage.createdAt.toISOString(),
            },
        });

        if (currentState === "awaiting_visitor") {
            const { nextState, sideEffects } = transition(currentState, {
                type: "visitor-message",
            });
            await db
                .update(conversations)
                .set({ state: nextState })
                .where(eq(conversations.id, conversationId));
            sse.publish(conversationId, { type: "state_changed", state: nextState });
            await effects.firePushoverIfNeeded(conversationId, sideEffects);
            currentState = nextState;
        }

        // Twin is paused once the human has joined; visitor still chats freely
        // while waiting, but the twin keeps quiet so it can't race the human.
        if (currentState !== "active_you") {
            if (isTwinDisabled()) {
                // Deliver the kill-switch fallback synchronously, before the 202
                // returns, so the row is committed by the time the client learns
                // its conversationId and opens the SSE stream. The scheduled path
                // would publish this near-instant reply into the first-message
                // subscription gap (before any subscriber exists) and the client's
                // one-shot on-connect refetch could race the commit. Awaiting here
                // makes first-message delivery deterministic; a returning visitor
                // (SSE already open) still receives it live.
                await effects.persistAndBroadcast(
                    conversationId,
                    crypto.randomUUID(),
                    TWIN_DISABLED_MESSAGE,
                    true,
                );
            } else {
                scheduler.scheduleTwinReply(conversationId);
            }
        }

        return { conversationId, messageId: visitorMessage.id };
    }

    async function acceptEscalation(input: AcceptEscalationInput): Promise<AcceptEscalationResult> {
        const conversationId = input.session.conversationId;

        const [current] = await db
            .select({ state: conversations.state })
            .from(conversations)
            .where(eq(conversations.id, conversationId));
        if (!current) throw new Error("conversation_not_found");

        const { nextState, sideEffects } = transition(current.state, {
            type: "escalation-accepted",
            email: input.email,
        });

        await db
            .update(conversations)
            .set({
                state: nextState,
                email: sideEffects.persistEmail ?? null,
                escalationOfferedAt: null,
            })
            .where(eq(conversations.id, conversationId));

        const [systemMessage] = await db
            .insert(messages)
            .values({
                conversationId,
                sender: "system",
                content: ESCALATION_CONFIRMATION,
            })
            .returning({
                id: messages.id,
                sender: messages.sender,
                content: messages.content,
                createdAt: messages.createdAt,
            });

        sse.publish(conversationId, {
            type: "message",
            message: {
                id: systemMessage.id,
                sender: systemMessage.sender,
                content: systemMessage.content,
                createdAt: systemMessage.createdAt.toISOString(),
            },
        });

        await effects.firePushoverIfNeeded(conversationId, sideEffects);

        return { conversationId };
    }

    async function dismissEscalation(session: Session): Promise<void> {
        await effects.clearOpenOfferIfAny(session.conversationId);
    }

    return {
        loadHistory,
        handleVisitorMessage,
        acceptEscalation,
        dismissEscalation,
    };
}
