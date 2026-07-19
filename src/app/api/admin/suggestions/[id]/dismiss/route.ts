import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
    getConversation,
    SuggestionInvalidStateError,
    SuggestionNotFoundError,
} from "@/features/conversation";

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { id } = await ctx.params;

    try {
        await getConversation().dismissSuggestion({ id });
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
