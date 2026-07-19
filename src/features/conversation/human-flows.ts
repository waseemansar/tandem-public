import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { conversations, messages } from "@/db/schema";
import type { SseBroadcaster } from "@/shared/sse-broadcaster";
import { JOIN_SYSTEM_MESSAGE, RESOLVED_SYSTEM_MESSAGE } from "@/features/conversation/constants";
import type { Effects } from "@/features/conversation/effects";
import {
    ConversationInvalidStateError,
    ConversationNotFoundError,
} from "@/features/conversation/errors";
import type { Scheduler } from "@/features/conversation/scheduler";
import { transition } from "@/features/conversation/state-machine";

export type HumanMessageInput = {
    conversationId: string;
    content: string;
};

export type HumanMessageResult = {
    conversationId: string;
    messageId: string;
};

export type HandBackInput = {
    conversationId: string;
};

export type HandBackResult = {
    conversationId: string;
};

export type MarkResolvedInput = {
    conversationId: string;
};

export type MarkResolvedResult = {
    conversationId: string;
};

export type SummonDraftInput = {
    conversationId: string;
};

export type SummonDraftResult = {
    conversationId: string;
};

export type HumanFlowsDeps = {
    db: Db;
    sse: SseBroadcaster;
};

export type HumanFlows = {
    handleHumanMessage(input: HumanMessageInput): Promise<HumanMessageResult>;
    handleHandBack(input: HandBackInput): Promise<HandBackResult>;
    handleMarkResolved(input: MarkResolvedInput): Promise<MarkResolvedResult>;
    handleSummonDraft(input: SummonDraftInput): Promise<SummonDraftResult>;
};

export function createHumanFlows(
    deps: HumanFlowsDeps,
    effects: Effects,
    scheduler: Scheduler,
): HumanFlows {
    const { db, sse } = deps;

    async function handleHumanMessage(input: HumanMessageInput): Promise<HumanMessageResult> {
        const [convo] = await db
            .select({
                state: conversations.state,
                email: conversations.email,
                firstName: conversations.firstName,
            })
            .from(conversations)
            .where(eq(conversations.id, input.conversationId));
        if (!convo) throw new ConversationNotFoundError();
        if (convo.state === "twin_only" || convo.state === "resolved") {
            throw new ConversationInvalidStateError(convo.state);
        }

        sse.abortActiveStream(input.conversationId);

        if (convo.email) {
            await effects.sendMagicLinkIfFirstHumanReply(
                input.conversationId,
                convo.email,
                convo.firstName,
            );
        }

        const { nextState, sideEffects } = transition(convo.state, { type: "human-message" });

        if (sideEffects.emitJoinSystemMessage) {
            const [systemMessage] = await db
                .insert(messages)
                .values({
                    conversationId: input.conversationId,
                    sender: "system",
                    content: JOIN_SYSTEM_MESSAGE,
                })
                .returning({
                    id: messages.id,
                    sender: messages.sender,
                    content: messages.content,
                    createdAt: messages.createdAt,
                });
            sse.publish(input.conversationId, {
                type: "message",
                message: {
                    id: systemMessage.id,
                    sender: systemMessage.sender,
                    content: systemMessage.content,
                    createdAt: systemMessage.createdAt.toISOString(),
                },
            });
        }

        const [humanMessage] = await db
            .insert(messages)
            .values({
                conversationId: input.conversationId,
                sender: "human",
                content: input.content,
            })
            .returning({
                id: messages.id,
                sender: messages.sender,
                content: messages.content,
                createdAt: messages.createdAt,
            });

        await db
            .update(conversations)
            .set({ state: nextState, lastHumanActivityAt: new Date() })
            .where(eq(conversations.id, input.conversationId));

        sse.publish(input.conversationId, {
            type: "message",
            message: {
                id: humanMessage.id,
                sender: humanMessage.sender,
                content: humanMessage.content,
                createdAt: humanMessage.createdAt.toISOString(),
            },
        });

        if (nextState !== convo.state) {
            sse.publish(input.conversationId, {
                type: "state_changed",
                state: nextState,
            });
        }

        return { conversationId: input.conversationId, messageId: humanMessage.id };
    }

    async function handleHandBack(input: HandBackInput): Promise<HandBackResult> {
        const [convo] = await db
            .select({ state: conversations.state })
            .from(conversations)
            .where(eq(conversations.id, input.conversationId));
        if (!convo) throw new ConversationNotFoundError();

        const { nextState, sideEffects } = transition(convo.state, { type: "hand-back" });

        await effects.persistStepOutAndBroadcast(input.conversationId, sideEffects, nextState);
        scheduler.scheduleFaqDraft(input.conversationId);

        return { conversationId: input.conversationId };
    }

    async function handleMarkResolved(input: MarkResolvedInput): Promise<MarkResolvedResult> {
        const [convo] = await db
            .select({ state: conversations.state })
            .from(conversations)
            .where(eq(conversations.id, input.conversationId));
        if (!convo) throw new ConversationNotFoundError();

        const { nextState, sideEffects } = transition(convo.state, { type: "mark-resolved" });

        if (sideEffects.emitResolvedSystemMessage) {
            const [systemMessage] = await db
                .insert(messages)
                .values({
                    conversationId: input.conversationId,
                    sender: "system",
                    content: RESOLVED_SYSTEM_MESSAGE,
                })
                .returning({
                    id: messages.id,
                    sender: messages.sender,
                    content: messages.content,
                    createdAt: messages.createdAt,
                });
            sse.publish(input.conversationId, {
                type: "message",
                message: {
                    id: systemMessage.id,
                    sender: systemMessage.sender,
                    content: systemMessage.content,
                    createdAt: systemMessage.createdAt.toISOString(),
                },
            });
        }

        await db
            .update(conversations)
            .set({ state: nextState, resolvedAt: new Date() })
            .where(eq(conversations.id, input.conversationId));

        sse.publish(input.conversationId, { type: "state_changed", state: nextState });

        scheduler.scheduleFaqDraft(input.conversationId);

        return { conversationId: input.conversationId };
    }

    async function handleSummonDraft(input: SummonDraftInput): Promise<SummonDraftResult> {
        const [convo] = await db
            .select({ state: conversations.state })
            .from(conversations)
            .where(eq(conversations.id, input.conversationId));
        if (!convo) throw new ConversationNotFoundError();
        if (convo.state !== "active_you") {
            throw new ConversationInvalidStateError(convo.state);
        }

        scheduler.scheduleTwinReply(input.conversationId);

        return { conversationId: input.conversationId };
    }

    return {
        handleHumanMessage,
        handleHandBack,
        handleMarkResolved,
        handleSummonDraft,
    };
}
