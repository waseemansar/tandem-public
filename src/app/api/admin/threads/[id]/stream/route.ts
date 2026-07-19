import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDb } from "@/db/client";
import { conversations } from "@/db/schema";
import { getSseBroadcaster, type SseEvent } from "@/shared/sse-broadcaster";

function encodeEvent(event: SseEvent): Uint8Array {
    return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
}

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { id } = await ctx.params;
    const [convo] = await getDb()
        .select({ state: conversations.state })
        .from(conversations)
        .where(eq(conversations.id, id));
    if (!convo || convo.state === "twin_only") {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const subscription = getSseBroadcaster().subscribe(id);

    const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
            for await (const event of subscription.events) {
                controller.enqueue(encodeEvent(event));
            }
            controller.close();
        },
        cancel() {
            subscription.unsubscribe();
        },
    });

    return new Response(stream, {
        status: 200,
        headers: {
            "content-type": "text/event-stream; charset=utf-8",
            "cache-control": "no-cache, no-transform",
            connection: "keep-alive",
        },
    });
}
