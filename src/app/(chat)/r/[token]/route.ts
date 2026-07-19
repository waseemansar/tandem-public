import { NextResponse } from "next/server";
import { getMagicLinkSigner, initMagicLinkSignerFromEnv } from "@/shared/magic-link";
import { attach } from "@/features/visitor/session";

export async function GET(request: Request, ctx: { params: Promise<{ token: string }> }) {
    initMagicLinkSignerFromEnv();
    const { token } = await ctx.params;

    const result = await getMagicLinkSigner().verify(token);
    if (!result.ok) {
        return NextResponse.redirect(
            new URL(`/magic-link/error?reason=${result.reason}`, request.url),
            {
                status: 302,
            },
        );
    }

    const response = new NextResponse(null, {
        status: 302,
        headers: { location: "/" },
    });
    attach(response, result.payload.conversationId);
    return response;
}
