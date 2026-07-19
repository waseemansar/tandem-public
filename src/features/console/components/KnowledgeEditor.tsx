"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { cn } from "@/shared/utils";

type View = "edit" | "preview";

function formatSavedTimestamp(iso: string | null): string {
    if (!iso) return "Never saved";
    const d = new Date(iso);
    return `Saved ${d.toLocaleString()}`;
}

export function KnowledgeEditor({
    initialContent,
    initialUpdatedAt,
}: {
    initialContent: string;
    initialUpdatedAt: string | null;
}) {
    const [content, setContent] = useState(initialContent);
    const [savedContent, setSavedContent] = useState(initialContent);
    const [updatedAt, setUpdatedAt] = useState(initialUpdatedAt);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [view, setView] = useState<View>("edit");

    const isDirty = content !== savedContent;

    async function save() {
        if (!isDirty || isSaving) return;
        setIsSaving(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/knowledge-doc", {
                method: "PUT",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ content }),
            });
            if (!res.ok) throw new Error(`Save failed: ${res.status}`);
            const body = (await res.json()) as { updatedAt: string | null };
            setSavedContent(content);
            setUpdatedAt(body.updatedAt);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Save failed");
        } finally {
            setIsSaving(false);
        }
    }

    return (
        <div className="flex h-full min-h-0 flex-col gap-3 px-8 py-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-ink-3 text-xs">
                    {isDirty ? "Unsaved changes" : formatSavedTimestamp(updatedAt)}
                </p>
                <div className="flex items-center gap-3">
                    <ViewToggle view={view} onChange={setView} />
                    {error && <span className="text-destructive text-xs">{error}</span>}
                    <Button
                        type="button"
                        onClick={() => void save()}
                        disabled={!isDirty || isSaving}
                        className="send-btn--human"
                    >
                        {isSaving ? "Saving…" : "Save"}
                    </Button>
                </div>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
                <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    spellCheck={false}
                    aria-label="Knowledge doc markdown"
                    className={cn(
                        "markdown-source border-line bg-panel text-ink min-h-100 w-full resize-none rounded-xl border p-4 font-mono text-[13.5px] leading-[1.55] focus:outline-none focus-visible:ring-2 focus-visible:ring-(--ring) lg:block",
                        view === "preview" && "hidden",
                    )}
                />
                <div
                    aria-label="Preview"
                    className={cn(
                        "markdown-preview border-line bg-panel/60 text-ink min-h-100 overflow-auto rounded-xl border p-4 text-[14px] leading-[1.6] lg:block",
                        view === "edit" && "hidden",
                    )}
                >
                    {content.trim().length === 0 ? (
                        <p className="text-ink-3 text-sm italic">
                            Preview is empty. Start typing on the left.
                        </p>
                    ) : (
                        <ReactMarkdown>{content}</ReactMarkdown>
                    )}
                </div>
            </div>
        </div>
    );
}

function ViewToggle({ view, onChange }: { view: View; onChange: (v: View) => void }) {
    return (
        <div
            role="tablist"
            aria-label="Editor view"
            className="border-line bg-panel inline-flex items-center rounded-lg border p-0.5 lg:hidden"
        >
            <ViewToggleButton active={view === "edit"} onClick={() => onChange("edit")}>
                Edit
            </ViewToggleButton>
            <ViewToggleButton active={view === "preview"} onClick={() => onChange("preview")}>
                Preview
            </ViewToggleButton>
        </div>
    );
}

function ViewToggleButton({
    active,
    onClick,
    children,
}: {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            role="tab"
            aria-selected={active}
            onClick={onClick}
            className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                active ? "bg-panel-2 text-ink" : "text-ink-3 hover:text-ink-2",
            )}
        >
            {children}
        </button>
    );
}
