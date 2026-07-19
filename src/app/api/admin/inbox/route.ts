import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listEscalatedThreads } from "@/features/console/inbox";

export async function GET() {
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const threads = await listEscalatedThreads();
    return NextResponse.json({
        threads: threads.map((t) => ({
            ...t,
            lastMessageAt: t.lastMessageAt.toISOString(),
            escalatedAt: t.escalatedAt?.toISOString() ?? null,
        })),
    });
}
