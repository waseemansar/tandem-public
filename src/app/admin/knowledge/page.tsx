import { eq } from "drizzle-orm";
import { ThemeToggle } from "@/components/ThemeToggle";
import { KnowledgeEditor } from "@/features/console/components/KnowledgeEditor";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { getDb } from "@/db/client";
import { knowledgeDoc } from "@/db/schema";

export default async function KnowledgePage() {
    const [row] = await getDb()
        .select({ content: knowledgeDoc.content, updatedAt: knowledgeDoc.updatedAt })
        .from(knowledgeDoc)
        .where(eq(knowledgeDoc.id, 1));

    return (
        <div className="flex h-svh min-h-0 flex-col">
            <header className="border-line bg-panel/60 sticky top-0 z-10 border-b px-8 py-6 backdrop-blur">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                        <SidebarTrigger className="md:hidden" />
                        <div className="flex flex-col gap-1">
                            <h1 className="font-display text-3xl leading-none">Knowledge</h1>
                            <p className="text-ink-3 text-sm">
                                The live doc the twin answers from. Saves apply immediately.
                            </p>
                        </div>
                    </div>
                    <ThemeToggle />
                </div>
            </header>

            <div className="min-h-0 flex-1">
                <KnowledgeEditor
                    initialContent={row?.content ?? ""}
                    initialUpdatedAt={row?.updatedAt?.toISOString() ?? null}
                />
            </div>
        </div>
    );
}
