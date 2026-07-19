import { NextResponse } from "next/server";
import { z } from "zod";
import { getConversation } from "@/features/conversation";
import * as VisitorSession from "@/features/visitor/session";
import { enforceVisitorRateLimit } from "@/shared/rate-limit";

const bodySchema = z.object({
    email: z.email().max(254),
});

export async function POST(request: Request) {
    const session = await VisitorSession.fromRequest(request);

    // Anti-abuse: combined layer A + B with counters shared with
    // /api/chat. Runs before the 401 so an IP flood is caught even with no cookie.
    const limited = await enforceVisitorRateLimit(request, session?.conversationId ?? null);
    if (limited) return limited;

    if (!session) {
        return NextResponse.json({ error: "no_conversation" }, { status: 401 });
    }

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }

    try {
        const result = await getConversation().acceptEscalation({
            session,
            email: parsed.data.email,
        });
        return NextResponse.json({ conversationId: result.conversationId });
    } catch (err) {
        const message = err instanceof Error ? err.message : "unknown";
        return NextResponse.json({ error: message }, { status: 409 });
    }
}
