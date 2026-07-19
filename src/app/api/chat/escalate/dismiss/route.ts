import { NextResponse } from "next/server";
import { getConversation } from "@/features/conversation";
import * as VisitorSession from "@/features/visitor/session";

export async function POST(request: Request) {
    const session = await VisitorSession.fromRequest(request);
    if (!session) {
        return NextResponse.json({ error: "no_conversation" }, { status: 401 });
    }
    await getConversation().dismissEscalation(session);
    return NextResponse.json({ conversationId: session.conversationId });
}
