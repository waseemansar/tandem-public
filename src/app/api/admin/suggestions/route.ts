import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getConversation } from "@/features/conversation";

export async function GET() {
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const suggestions = await getConversation().listPendingSuggestions();
    return NextResponse.json({
        suggestions: suggestions.map((s) => ({
            id: s.id,
            conversationId: s.conversationId,
            question: s.question,
            answer: s.answer,
            status: s.status,
            createdAt: s.createdAt.toISOString(),
        })),
    });
}
