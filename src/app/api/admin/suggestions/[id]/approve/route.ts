import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import {
    getConversation,
    SuggestionInvalidStateError,
    SuggestionNotFoundError,
} from "@/features/conversation";

const bodySchema = z.object({
    question: z.string().trim().min(1).optional(),
    answer: z.string().trim().min(1).optional(),
});

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { id } = await ctx.params;
    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
        return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }

    try {
        await getConversation().approveSuggestion({
            id,
            editedQuestion: parsed.data.question,
            editedAnswer: parsed.data.answer,
        });
        return NextResponse.json({ id }, { status: 202 });
    } catch (err) {
        if (err instanceof SuggestionNotFoundError) {
            return NextResponse.json({ error: "not_found" }, { status: 404 });
        }
        if (err instanceof SuggestionInvalidStateError) {
            return NextResponse.json({ error: "invalid_state" }, { status: 409 });
        }
        throw err;
    }
}
