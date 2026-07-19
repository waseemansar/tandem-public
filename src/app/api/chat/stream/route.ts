import { getSseBroadcaster, type SseEvent } from "@/shared/sse-broadcaster";
import * as VisitorSession from "@/features/visitor/session";

function encodeEvent(event: SseEvent): Uint8Array {
    return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
}

export async function GET(request: Request) {
    const session = await VisitorSession.fromRequest(request);
    if (!session) {
        return new Response(null, { status: 204 });
    }

    const broadcaster = getSseBroadcaster();
    const subscription = broadcaster.subscribe(session.conversationId);

    const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
            // Flush a comment immediately so the response headers are sent and the
            // client's EventSource `open` fires even before any event arrives.
            // Without this, a subscription with no pending events (e.g. the visitor
            // subscribes just after a near-instant reply — DISABLE_TWIN, a fast
            // fallback — was already published) never delivers bytes, `onopen`
            // never fires, and the on-connect history refetch that recovers those
            // missed events never runs. The client ignores comment lines.
            controller.enqueue(new TextEncoder().encode(": connected\n\n"));
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
