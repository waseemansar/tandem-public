import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
    ConversationInvalidStateError,
    ConversationNotFoundError,
    getConversation,
} from "@/features/conversation";

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { id } = await ctx.params;

    try {
        const result = await getConversation().handleSummonDraft({ conversationId: id });
        return NextResponse.json(result, { status: 202 });
    } catch (err) {
        if (err instanceof ConversationNotFoundError) {
            return NextResponse.json({ error: "not_found" }, { status: 404 });
        }
        if (err instanceof ConversationInvalidStateError) {
            return NextResponse.json({ error: "invalid_state" }, { status: 409 });
        }
        throw err;
    }
}
