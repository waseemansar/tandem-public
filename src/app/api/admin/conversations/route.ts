import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listConversations } from "@/features/console/inbox";
import type { ConversationState } from "@/features/console/types";

const VALID_STATES: ReadonlySet<ConversationState> = new Set([
    "twin_only",
    "awaiting_you",
    "active_you",
    "awaiting_visitor",
    "resolved",
]);

function parseStateFilter(raw: string | null): ConversationState | undefined {
    if (!raw) return undefined;
    return VALID_STATES.has(raw as ConversationState) ? (raw as ConversationState) : undefined;
}

export async function GET(request: Request) {
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const state = parseStateFilter(url.searchParams.get("state"));

    const threads = await listConversations(state);
    return NextResponse.json({
        threads: threads.map((t) => ({
            ...t,
            lastMessageAt: t.lastMessageAt?.toISOString() ?? null,
            createdAt: t.createdAt.toISOString(),
        })),
    });
}
