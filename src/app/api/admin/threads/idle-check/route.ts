import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getConversation } from "@/features/conversation";

export async function POST() {
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const result = await getConversation().checkIdleTimeouts();
    return NextResponse.json(result, { status: 200 });
}
