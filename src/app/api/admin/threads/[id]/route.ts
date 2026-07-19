import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getThreadDetail } from "@/features/console/inbox";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { id } = await ctx.params;
    const thread = await getThreadDetail(id);
    if (!thread) {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    return NextResponse.json({
        id: thread.id,
        displayName: thread.displayName,
        email: thread.email,
        state: thread.state,
        escalatedAt: thread.escalatedAt?.toISOString() ?? null,
        messages: thread.messages.map((m) => ({
            id: m.id,
            sender: m.sender,
            content: m.content,
            createdAt: m.createdAt.toISOString(),
        })),
    });
}
