import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { getDb } from "@/db/client";
import { knowledgeDoc } from "@/db/schema";
import { setLiveDoc } from "@/features/twin/knowledge-doc";

const putBodySchema = z.object({
    content: z.string(),
});

async function readDocRow() {
    const [row] = await getDb()
        .select({ content: knowledgeDoc.content, updatedAt: knowledgeDoc.updatedAt })
        .from(knowledgeDoc)
        .where(eq(knowledgeDoc.id, 1));
    return row ?? null;
}

export async function GET() {
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const row = await readDocRow();
    return NextResponse.json({
        content: row?.content ?? "",
        updatedAt: row?.updatedAt?.toISOString() ?? null,
    });
}

export async function PUT(request: Request) {
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const parsed = putBodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }

    await setLiveDoc(parsed.data.content);
    const row = await readDocRow();

    return NextResponse.json({ updatedAt: row?.updatedAt?.toISOString() ?? null });
}
