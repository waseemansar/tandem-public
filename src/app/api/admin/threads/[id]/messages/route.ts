import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import {
    ConversationInvalidStateError,
    ConversationNotFoundError,
    getConversation,
} from "@/features/conversation";
import { ADMIN_MESSAGE_MAX_CHARS } from "@/shared/anti-abuse";

const bodySchema = z.object({
    content: z.string().trim().min(1).max(ADMIN_MESSAGE_MAX_CHARS),
});

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
        const tooLong = parsed.error.issues.some(
            (issue) =>
                issue.code === "too_big" && issue.path.length === 1 && issue.path[0] === "content",
        );
        if (tooLong) {
            return NextResponse.json(
                { error: "message_too_long", maxLength: ADMIN_MESSAGE_MAX_CHARS },
                { status: 400 },
            );
        }
        return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }

    const { id } = await ctx.params;

    try {
        const result = await getConversation().handleHumanMessage({
            conversationId: id,
            content: parsed.data.content,
        });
        return NextResponse.json(result, { status: 202 });
    } catch (err) {
        if (err instanceof ConversationNotFoundError) {
            return NextResponse.json({ error: "not_found" }, { status: 404 });
        }
        if (err instanceof ConversationInvalidStateError) {
            return NextResponse.json({ error: "not_found" }, { status: 404 });
        }
        throw err;
    }
}
