import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";
import { isAdminPathProtected } from "@/shared/auth/path-gate";
import { enforceAdminRateLimit } from "@/shared/rate-limit";

const { auth } = NextAuth(authConfig);

// The middleware owns all gating: the function-wrapper form of `auth` runs this
// callback in place of Auth.js's default `authorized`-redirect, so the page gate
// is replicated here verbatim.
const proxy = auth(async (req) => {
    const { pathname } = req.nextUrl;

    // /api/admin/* — layer B (client IP) runs before the route handler's own
    // auth check, so unauthenticated probes get a 429 (not a 401). A valid admin
    // session is fully exempt.
    if (pathname.startsWith("/api/admin")) {
        const limited = await enforceAdminRateLimit(req, req.auth);
        return limited ?? NextResponse.next();
    }

    // /admin/* pages — unchanged auth gate: redirect anonymous visitors to the
    // sign-in page with the same callbackUrl Auth.js sets by default.
    if (isAdminPathProtected(pathname) && !req.auth?.user) {
        const signInUrl = req.nextUrl.clone();
        signInUrl.pathname = "/admin/signin";
        signInUrl.searchParams.set("callbackUrl", req.nextUrl.href);
        return NextResponse.redirect(signInUrl);
    }

    return NextResponse.next();
});

export { proxy };
export default proxy;

export const config = {
    matcher: ["/admin/:path*", "/api/admin/:path*"],
};
