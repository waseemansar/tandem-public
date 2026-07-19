import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { knowledgeDoc } from "@/db/schema";

const SINGLETON_ID = 1;

export async function getLiveDoc(): Promise<string> {
    const [row] = await getDb()
        .select({ content: knowledgeDoc.content })
        .from(knowledgeDoc)
        .where(eq(knowledgeDoc.id, SINGLETON_ID));
    return row?.content ?? "";
}

export async function setLiveDoc(content: string): Promise<void> {
    await getDb()
        .insert(knowledgeDoc)
        .values({ id: SINGLETON_ID, content, updatedAt: new Date() })
        .onConflictDoUpdate({
            target: knowledgeDoc.id,
            set: { content, updatedAt: sql`now()` },
        });
}

export async function appendToLiveDoc(text: string): Promise<void> {
    const current = await getLiveDoc();
    const next = current.length === 0 ? text : `${current}\n\n${text}`;
    await setLiveDoc(next);
}
