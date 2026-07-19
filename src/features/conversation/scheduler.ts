import { withTrace } from "@openai/agents";
import { and, eq, lt } from "drizzle-orm";
import type { Db } from "@/db/client";
import { conversations, faqSuggestions } from "@/db/schema";
import type { Clock } from "@/shared/clock";
import { getLiveDoc } from "@/features/twin/knowledge-doc";
import type { SseBroadcaster } from "@/shared/sse-broadcaster";
import {
    isOpenAiRateLimitError,
    isTwinDisabled,
    REQUEST_HANDOFF_TOOL_NAME,
    type TwinAgent,
} from "@/features/twin/agent";
import { sanitizeTwinReply } from "@/features/twin/prompt";
import {
    ESCALATION_TEMPLATE,
    FALLBACK_APOLOGY,
    FAQ_DRAFTER_WORKFLOW_NAME,
    IDLE_TIMEOUT_MS,
    TWIN_DISABLED_MESSAGE,
    TWIN_RATE_LIMITED_MESSAGE,
    TWIN_TURN_WORKFLOW_NAME,
} from "@/features/conversation/constants";
import type { Effects } from "@/features/conversation/effects";
import { transition } from "@/features/conversation/state-machine";

export type CheckIdleTimeoutsResult = {
    sweptCount: number;
};

export type SchedulerDeps = {
    db: Db;
    twinAgent: TwinAgent;
    sse: SseBroadcaster;
    clock: Clock;
};

export type Scheduler = {
    scheduleTwinReply(conversationId: string): void;
    scheduleFaqDraft(conversationId: string): void;
    checkIdleTimeouts(): Promise<CheckIdleTimeoutsResult>;
};

export function createScheduler(
    deps: SchedulerDeps,
    effects: Effects,
    pendingReplies: Set<Promise<void>>,
): Scheduler {
    const { db, twinAgent, sse, clock } = deps;

    async function runTwinReply(conversationId: string): Promise<void> {
        const messageId = crypto.randomUUID();

        // Kill switch: skip OpenAI entirely and offer escalation so the visitor
        // is never stuck.
        if (isTwinDisabled()) {
            await effects.persistAndBroadcast(
                conversationId,
                messageId,
                TWIN_DISABLED_MESSAGE,
                true,
            );
            return;
        }

        const controller = new AbortController();
        sse.registerStream(conversationId, controller);

        const transcript = await effects.buildTranscript(conversationId);
        const doc = await getLiveDoc();

        let accumulated = "";
        let escalated = false;
        let errored = false;
        let rateLimited = false;
        let errorReason: string | undefined;

        try {
            await withTrace(
                TWIN_TURN_WORKFLOW_NAME,
                async () => {
                    const stream = twinAgent.stream({
                        transcript,
                        doc,
                        signal: controller.signal,
                    });

                    for await (const ev of stream) {
                        if (controller.signal.aborted) break;
                        if (ev.type === "text_delta") {
                            accumulated += ev.delta;
                            sse.publish(conversationId, {
                                type: "chunk",
                                messageId,
                                sender: "twin",
                                delta: ev.delta,
                            });
                        } else if (ev.type === "tool_call") {
                            if (ev.name === REQUEST_HANDOFF_TOOL_NAME) {
                                escalated = true;
                            }
                        }
                    }

                    if (escalated && !controller.signal.aborted) {
                        sse.publish(conversationId, {
                            type: "chunk",
                            messageId,
                            sender: "twin",
                            delta: ESCALATION_TEMPLATE,
                        });
                    }
                },
                {
                    groupId: conversationId,
                    metadata: { env: process.env.OPENAI_TRACE_ENV ?? "production" },
                },
            );
        } catch (err) {
            if (!controller.signal.aborted) {
                errored = true;
                errorReason = err instanceof Error ? err.message : String(err);
                rateLimited = isOpenAiRateLimitError(err);
                if (rateLimited) {
                    // Surfaced to the visitor as a friendly message; logged here
                    // with the underlying error for incident triage.
                    console.error("[conversation] OpenAI rate limit / spend cap hit", err);
                }
            }
        } finally {
            sse.unregisterStream(conversationId, controller);
        }

        if (controller.signal.aborted) {
            sse.publish(conversationId, {
                type: "stream_error",
                messageId,
                reason: "superseded",
            });
            return;
        }

        if (errored) {
            sse.publish(conversationId, { type: "stream_error", messageId, reason: errorReason });
            if (rateLimited) {
                await effects.persistAndBroadcast(
                    conversationId,
                    messageId,
                    TWIN_RATE_LIMITED_MESSAGE,
                    true,
                );
            } else {
                await effects.persistAndBroadcast(
                    conversationId,
                    messageId,
                    FALLBACK_APOLOGY,
                    false,
                );
            }
            return;
        }

        const sanitized = sanitizeTwinReply(accumulated);
        const finalContent = escalated ? sanitized + ESCALATION_TEMPLATE : sanitized;
        await effects.persistAndBroadcast(conversationId, messageId, finalContent, escalated);
    }

    async function runFaqDraft(conversationId: string): Promise<void> {
        try {
            const transcript = await effects.buildTranscript(conversationId);
            const draft = await withTrace(
                FAQ_DRAFTER_WORKFLOW_NAME,
                () => twinAgent.draftFaq({ transcript }),
                {
                    groupId: conversationId,
                    metadata: { env: process.env.OPENAI_TRACE_ENV ?? "production" },
                },
            );
            await db.insert(faqSuggestions).values({
                conversationId,
                question: draft.question,
                answer: draft.answer,
            });
        } catch (err) {
            console.error("[conversation] draftFaq threw", err);
        }
    }

    function scheduleTwinReply(conversationId: string): void {
        const work = new Promise<void>((resolve) => {
            setImmediate(() => {
                runTwinReply(conversationId).finally(() => resolve());
            });
        });
        pendingReplies.add(work);
        work.finally(() => pendingReplies.delete(work));
    }

    function scheduleFaqDraft(conversationId: string): void {
        const work = new Promise<void>((resolve) => {
            setImmediate(() => {
                runFaqDraft(conversationId).finally(() => resolve());
            });
        });
        pendingReplies.add(work);
        work.finally(() => pendingReplies.delete(work));
    }

    async function checkIdleTimeouts(): Promise<CheckIdleTimeoutsResult> {
        const now = clock.now();
        const cutoff = new Date(now.getTime() - IDLE_TIMEOUT_MS);

        const idleRows = await db
            .select({ id: conversations.id, state: conversations.state })
            .from(conversations)
            .where(
                and(
                    eq(conversations.state, "active_you"),
                    lt(conversations.lastHumanActivityAt, cutoff),
                ),
            );

        for (const row of idleRows) {
            const { nextState, sideEffects } = transition(row.state, { type: "idle-timeout" });
            await effects.persistStepOutAndBroadcast(row.id, sideEffects, nextState);
        }

        return { sweptCount: idleRows.length };
    }

    return {
        scheduleTwinReply,
        scheduleFaqDraft,
        checkIdleTimeouts,
    };
}
