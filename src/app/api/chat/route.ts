import { NextResponse } from "next/server";
import { z } from "zod";
import { ConversationInvalidStateError, getConversation } from "@/features/conversation";
import * as VisitorSession from "@/features/visitor/session";
import { VISITOR_MESSAGE_MAX_CHARS } from "@/shared/anti-abuse";
import { enforceVisitorRateLimit } from "@/shared/rate-limit";

const bodySchema = z.object({
    content: z.string().trim().min(1).max(VISITOR_MESSAGE_MAX_CHARS),
    keepChat: z.boolean().optional().default(true),
    firstName: z.string().trim().min(1).max(80).optional(),
});

export async function GET(request: Request) {
    const session = await VisitorSession.fromRequest(request);
    if (!session) {
        return NextResponse.json({
            conversationId: null,
            firstName: null,
            state: null,
            escalationOffered: false,
            messages: [],
        });
    }
    const history = await getConversation().loadHistory(session);
    return NextResponse.json(history);
}

export async function POST(request: Request) {
    const session = await VisitorSession.fromRequest(request);

    // Anti-abuse: combined layer A (conversation_id) + layer B
    // (client IP), shared counters with /api/chat/escalate, before any work.
    const limited = await enforceVisitorRateLimit(request, session?.conversationId ?? null);
    if (limited) return limited;

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
        const tooLong = parsed.error.issues.some(
            (issue) =>
                issue.code === "too_big" && issue.path.length === 1 && issue.path[0] === "content",
        );
        if (tooLong) {
            return NextResponse.json(
                { error: "message_too_long", maxLength: VISITOR_MESSAGE_MAX_CHARS },
                { status: 400 },
            );
        }
        return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }
    const { content, keepChat, firstName } = parsed.data;

    let conversationId: string;
    let messageId: string;
    try {
        ({ conversationId, messageId } = await getConversation().handleVisitorMessage({
            session,
            content,
            firstName,
        }));
    } catch (err) {
        if (err instanceof ConversationInvalidStateError) {
            return NextResponse.json({ error: "conversation_closed" }, { status: 409 });
        }
        throw err;
    }

    const res = NextResponse.json({ conversationId, messageId }, { status: 202 });
    if (keepChat) {
        VisitorSession.attach(res, conversationId);
    }
    return res;
}
