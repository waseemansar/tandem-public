"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/shared/utils";

export type PendingSuggestion = {
    id: string;
    conversationId: string;
    question: string;
    answer: string;
    createdAt: string;
};

type RowState = {
    suggestion: PendingSuggestion;
    question: string;
    answer: string;
    isSubmitting: boolean;
    error: string | null;
};

export function SuggestionsTray({ initial }: { initial: PendingSuggestion[] }) {
    const [rows, setRows] = useState<RowState[]>(() =>
        initial.map((s) => ({
            suggestion: s,
            question: s.question,
            answer: s.answer,
            isSubmitting: false,
            error: null,
        })),
    );

    function patchRow(id: string, patch: Partial<RowState>) {
        setRows((prev) => prev.map((r) => (r.suggestion.id === id ? { ...r, ...patch } : r)));
    }

    async function approve(id: string) {
        const row = rows.find((r) => r.suggestion.id === id);
        if (!row || row.isSubmitting) return;
        patchRow(id, { isSubmitting: true, error: null });

        const snapshot = rows;
        // Optimistic removal.
        setRows((prev) => prev.filter((r) => r.suggestion.id !== id));

        try {
            const res = await fetch(`/api/admin/suggestions/${id}/approve`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    question: row.question.trim() || undefined,
                    answer: row.answer.trim() || undefined,
                }),
            });
            if (!res.ok) throw new Error(`Approve failed: ${res.status}`);
        } catch (err) {
            // Restore and surface the error inline.
            setRows(snapshot);
            patchRow(id, {
                isSubmitting: false,
                error: err instanceof Error ? err.message : "Approve failed",
            });
        }
    }

    async function dismiss(id: string) {
        const row = rows.find((r) => r.suggestion.id === id);
        if (!row || row.isSubmitting) return;
        patchRow(id, { isSubmitting: true, error: null });

        const snapshot = rows;
        setRows((prev) => prev.filter((r) => r.suggestion.id !== id));

        try {
            const res = await fetch(`/api/admin/suggestions/${id}/dismiss`, {
                method: "POST",
            });
            if (!res.ok) throw new Error(`Dismiss failed: ${res.status}`);
        } catch (err) {
            setRows(snapshot);
            patchRow(id, {
                isSubmitting: false,
                error: err instanceof Error ? err.message : "Dismiss failed",
            });
        }
    }

    if (rows.length === 0) {
        return (
            <div className="border-line bg-panel text-ink-3 rounded-xl border px-4 py-10 text-center text-sm">
                No drafts waiting for review. New suggestions appear here after hand-back or
                mark-resolved.
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-4">
            {rows.map((row) => (
                <SuggestionCard
                    key={row.suggestion.id}
                    row={row}
                    onQuestionChange={(v) => patchRow(row.suggestion.id, { question: v })}
                    onAnswerChange={(v) => patchRow(row.suggestion.id, { answer: v })}
                    onApprove={() => void approve(row.suggestion.id)}
                    onDismiss={() => void dismiss(row.suggestion.id)}
                />
            ))}
        </div>
    );
}

function SuggestionCard({
    row,
    onQuestionChange,
    onAnswerChange,
    onApprove,
    onDismiss,
}: {
    row: RowState;
    onQuestionChange: (v: string) => void;
    onAnswerChange: (v: string) => void;
    onApprove: () => void;
    onDismiss: () => void;
}) {
    const { suggestion, question, answer, isSubmitting, error } = row;
    const isEmpty = question.trim().length === 0 || answer.trim().length === 0;

    return (
        <div className="border-line bg-panel flex flex-col gap-4 rounded-xl border p-5">
            <div className="flex flex-col gap-2">
                <label
                    htmlFor={`q-${suggestion.id}`}
                    className="text-ink-3 font-mono text-[10.5px] font-medium tracking-[0.18em] uppercase"
                >
                    Question
                </label>
                <input
                    id={`q-${suggestion.id}`}
                    type="text"
                    value={question}
                    onChange={(e) => onQuestionChange(e.target.value)}
                    disabled={isSubmitting}
                    className="border-line bg-panel-2 text-ink focus-visible:ring-ring w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus-visible:ring-2"
                />
            </div>

            <div className="flex flex-col gap-2">
                <label
                    htmlFor={`a-${suggestion.id}`}
                    className="text-ink-3 font-mono text-[10.5px] font-medium tracking-[0.18em] uppercase"
                >
                    Answer
                </label>
                <textarea
                    id={`a-${suggestion.id}`}
                    value={answer}
                    onChange={(e) => onAnswerChange(e.target.value)}
                    disabled={isSubmitting}
                    rows={4}
                    className="border-line bg-panel-2 text-ink focus-visible:ring-ring w-full resize-y rounded-lg border px-3 py-2 text-sm leading-[1.55] focus:outline-none focus-visible:ring-2"
                />
            </div>

            <div className="border-line/60 flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                <div className="flex items-center gap-3">
                    <Link
                        href={`/admin/inbox/${suggestion.conversationId}`}
                        target="_blank"
                        className="text-twin hover:text-twin-2 text-xs underline-offset-2 hover:underline"
                    >
                        View thread
                    </Link>
                    {error && <span className="text-destructive text-xs">{error}</span>}
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={onDismiss}
                        disabled={isSubmitting}
                        className={cn(
                            "border-line-2 text-ink-2 hover:bg-panel-2 inline-flex h-9 cursor-pointer items-center justify-center rounded-lg border bg-transparent px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                        )}
                    >
                        Dismiss
                    </button>
                    <Button
                        type="button"
                        onClick={onApprove}
                        disabled={isSubmitting || isEmpty}
                        className="send-btn--human"
                    >
                        Approve &amp; append
                    </Button>
                </div>
            </div>
        </div>
    );
}
