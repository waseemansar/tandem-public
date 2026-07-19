import { and, asc, count, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { conversations, messages } from "@/db/schema";
import type { Clock } from "@/shared/clock";
import { buildMagicLinkEmail } from "@/shared/email/templates/magic-link";
import type { EmailSender } from "@/shared/email/sender";
import { buildMagicLinkUrl, MAGIC_LINK_TTL_MS, type MagicLinkSigner } from "@/shared/magic-link";
import { buildThreadUrl, type Notifier } from "@/shared/notifier";
import type { SseBroadcaster } from "@/shared/sse-broadcaster";
import { renderTranscript } from "@/features/twin/prompt";
import { STEP_OUT_SYSTEM_MESSAGE } from "@/features/conversation/constants";
import type { ConversationState } from "@/features/conversation/state-machine";
import { visitorDisplayNameOrNull } from "@/features/conversation/visitor-name";

export type EffectsDeps = {
    db: Db;
    sse: SseBroadcaster;
    clock: Clock;
    notifier: Notifier;
    emailSender: EmailSender;
    magicLinkSigner: MagicLinkSigner;
    appBaseUrl: string;
};

export type Effects = {
    sendMagicLinkIfFirstHumanReply(
        conversationId: string,
        email: string,
        visitorFirstName: string | null,
    ): Promise<void>;
    firePushoverIfNeeded(
        conversationId: string,
        sideEffects: { firePushover?: boolean },
    ): Promise<void>;
    persistAndBroadcast(
        conversationId: string,
        messageId: string,
        content: string,
        escalationOffered: boolean,
    ): Promise<void>;
    persistStepOutAndBroadcast(
        conversationId: string,
        sideEffects: { emitStepOutSystemMessage?: boolean },
        nextState: ConversationState,
    ): Promise<void>;
    clearOpenOfferIfAny(conversationId: string): Promise<void>;
    buildTranscript(conversationId: string): Promise<string>;
};

export function createEffects(deps: EffectsDeps): Effects {
    const { db, sse, clock, notifier, emailSender, magicLinkSigner, appBaseUrl } = deps;

    async function sendMagicLinkIfFirstHumanReply(
        conversationId: string,
        email: string,
        visitorFirstName: string | null,
    ): Promise<void> {
        const [{ value: humanCount } = { value: 0 }] = await db
            .select({ value: count() })
            .from(messages)
            .where(and(eq(messages.conversationId, conversationId), eq(messages.sender, "human")));
        if (humanCount > 0) return;

        try {
            const token = await magicLinkSigner.sign({
                conversationId,
                email,
                expiresAt: new Date(clock.now().getTime() + MAGIC_LINK_TTL_MS),
            });
            const url = buildMagicLinkUrl(appBaseUrl, token);
            const built = await buildMagicLinkEmail({
                url,
                visitorFirstName: visitorFirstName ?? undefined,
            });
            await emailSender.send({
                to: email,
                subject: built.subject,
                text: built.text,
                html: built.html,
            });
        } catch (err) {
            console.error("[conversation] magic-link email send threw", err);
        }
    }

    async function firePushoverIfNeeded(
        conversationId: string,
        sideEffects: { firePushover?: boolean },
    ): Promise<void> {
        if (!sideEffects.firePushover) return;
        try {
            await notifier.notify({
                conversationId,
                title: "Tandem — awaiting you",
                message: "A visitor is waiting on your reply.",
                threadUrl: buildThreadUrl(appBaseUrl, conversationId),
            });
        } catch (err) {
            console.error("[conversation] notifier.notify threw", err);
        }
    }

    async function persistAndBroadcast(
        conversationId: string,
        messageId: string,
        content: string,
        escalationOffered: boolean,
    ): Promise<void> {
        const [inserted] = await db
            .insert(messages)
            .values({
                id: messageId,
                conversationId,
                sender: "twin",
                content,
            })
            .returning({
                id: messages.id,
                sender: messages.sender,
                content: messages.content,
                createdAt: messages.createdAt,
            });

        await db
            .update(conversations)
            .set({ escalationOfferedAt: escalationOffered ? new Date() : null })
            .where(eq(conversations.id, conversationId));

        if (escalationOffered) {
            sse.publish(conversationId, {
                type: "escalation_offered",
                messageId: inserted.id,
            });
        } else {
            sse.publish(conversationId, { type: "escalation_cleared" });
        }

        sse.publish(conversationId, {
            type: "message",
            message: {
                id: inserted.id,
                sender: inserted.sender,
                content: inserted.content,
                createdAt: inserted.createdAt.toISOString(),
            },
        });
    }

    async function persistStepOutAndBroadcast(
        conversationId: string,
        sideEffects: { emitStepOutSystemMessage?: boolean },
        nextState: ConversationState,
    ): Promise<void> {
        if (sideEffects.emitStepOutSystemMessage) {
            const [systemMessage] = await db
                .insert(messages)
                .values({
                    conversationId,
                    sender: "system",
                    content: STEP_OUT_SYSTEM_MESSAGE,
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
        }

        await db
            .update(conversations)
            .set({ state: nextState })
            .where(eq(conversations.id, conversationId));

        sse.publish(conversationId, { type: "state_changed", state: nextState });
    }

    async function clearOpenOfferIfAny(conversationId: string): Promise<void> {
        const [row] = await db
            .select({ escalationOfferedAt: conversations.escalationOfferedAt })
            .from(conversations)
            .where(eq(conversations.id, conversationId));
        if (!row || row.escalationOfferedAt === null) return;

        await db
            .update(conversations)
            .set({ escalationOfferedAt: null })
            .where(eq(conversations.id, conversationId));

        sse.publish(conversationId, { type: "escalation_cleared" });
    }

    async function buildTranscript(conversationId: string): Promise<string> {
        const [convo] = await db
            .select({ firstName: conversations.firstName, email: conversations.email })
            .from(conversations)
            .where(eq(conversations.id, conversationId));

        const rows = await db
            .select({ sender: messages.sender, content: messages.content })
            .from(messages)
            .where(eq(messages.conversationId, conversationId))
            .orderBy(asc(messages.createdAt));

        const visitorDisplayName = visitorDisplayNameOrNull({
            firstName: convo?.firstName ?? null,
            email: convo?.email ?? null,
        });
        return renderTranscript({ rows, visitorDisplayName });
    }

    return {
        sendMagicLinkIfFirstHumanReply,
        firePushoverIfNeeded,
        persistAndBroadcast,
        persistStepOutAndBroadcast,
        clearOpenOfferIfAny,
        buildTranscript,
    };
}
