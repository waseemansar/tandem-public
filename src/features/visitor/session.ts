import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { conversations } from "@/db/schema";
import type { Session } from "@/features/conversation/types";

export const CONVERSATION_COOKIE = "conversation_id";

const uuidSchema = z.uuid();

function readCookieHeader(header: string | null, name: string): string | undefined {
    if (!header) return undefined;
    for (const part of header.split(";")) {
        const [k, ...rest] = part.trim().split("=");
        if (k === name) return rest.join("=");
    }
    return undefined;
}

async function verify(rawId: string | undefined): Promise<Session | null> {
    const parsed = uuidSchema.safeParse(rawId);
    if (!parsed.success) return null;

    const [existing] = await getDb()
        .select({ id: conversations.id })
        .from(conversations)
        .where(eq(conversations.id, parsed.data))
        .limit(1);
    return existing ? { conversationId: existing.id } : null;
}

export async function fromRequest(request: Request): Promise<Session | null> {
    const raw = readCookieHeader(request.headers.get("cookie"), CONVERSATION_COOKIE);
    return verify(raw);
}

export async function fromCookies(): Promise<Session | null> {
    const cookieStore = await cookies();
    return verify(cookieStore.get(CONVERSATION_COOKIE)?.value);
}

export function attach(response: NextResponse, conversationId: string): void {
    response.cookies.set(CONVERSATION_COOKIE, conversationId, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
    });
}

export function clear(response: NextResponse): void {
    response.cookies.set(CONVERSATION_COOKIE, "", {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 0,
    });
}
