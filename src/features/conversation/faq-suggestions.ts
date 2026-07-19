import { desc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { faqSuggestions } from "@/db/schema";
import { appendToLiveDoc } from "@/features/twin/knowledge-doc";
import {
    SuggestionInvalidStateError,
    SuggestionNotFoundError,
} from "@/features/conversation/errors";

export type FaqSuggestion = {
    id: string;
    conversationId: string;
    question: string;
    answer: string;
    status: "pending" | "approved" | "dismissed";
    createdAt: Date;
};

export type ApproveSuggestionInput = {
    id: string;
    editedQuestion?: string;
    editedAnswer?: string;
};

export type DismissSuggestionInput = {
    id: string;
};

export type FaqSuggestionFlowsDeps = {
    db: Db;
};

export type FaqSuggestionFlows = {
    listPendingSuggestions(): Promise<FaqSuggestion[]>;
    approveSuggestion(input: ApproveSuggestionInput): Promise<void>;
    dismissSuggestion(input: DismissSuggestionInput): Promise<void>;
};

function renderFaqEntry(question: string, answer: string): string {
    return `### ${question.trim()}\n\n${answer.trim()}`;
}

export function createFaqSuggestionFlows(deps: FaqSuggestionFlowsDeps): FaqSuggestionFlows {
    const { db } = deps;

    async function listPendingSuggestions(): Promise<FaqSuggestion[]> {
        const rows = await db
            .select()
            .from(faqSuggestions)
            .where(eq(faqSuggestions.status, "pending"))
            .orderBy(desc(faqSuggestions.createdAt));
        return rows.map((r) => ({
            id: r.id,
            conversationId: r.conversationId,
            question: r.question,
            answer: r.answer,
            status: r.status,
            createdAt: r.createdAt,
        }));
    }

    async function approveSuggestion(input: ApproveSuggestionInput): Promise<void> {
        const [row] = await db
            .select({
                status: faqSuggestions.status,
                question: faqSuggestions.question,
                answer: faqSuggestions.answer,
            })
            .from(faqSuggestions)
            .where(eq(faqSuggestions.id, input.id));
        if (!row) throw new SuggestionNotFoundError();
        if (row.status !== "pending") throw new SuggestionInvalidStateError(row.status);

        const question = input.editedQuestion ?? row.question;
        const answer = input.editedAnswer ?? row.answer;

        await appendToLiveDoc(renderFaqEntry(question, answer));
        await db
            .update(faqSuggestions)
            .set({ status: "approved", question, answer })
            .where(eq(faqSuggestions.id, input.id));
    }

    async function dismissSuggestion(input: DismissSuggestionInput): Promise<void> {
        const [row] = await db
            .select({ status: faqSuggestions.status })
            .from(faqSuggestions)
            .where(eq(faqSuggestions.id, input.id));
        if (!row) throw new SuggestionNotFoundError();
        if (row.status !== "pending") throw new SuggestionInvalidStateError(row.status);

        await db
            .update(faqSuggestions)
            .set({ status: "dismissed" })
            .where(eq(faqSuggestions.id, input.id));
    }

    return {
        listPendingSuggestions,
        approveSuggestion,
        dismissSuggestion,
    };
}
