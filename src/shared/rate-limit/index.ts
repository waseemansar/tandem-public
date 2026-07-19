import { and, eq, lt, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { rateLimitBuckets } from "@/db/schema";
import { getClock } from "@/shared/clock";

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

// A conservative upper bound on retry-after, not a precise slot-free time.
const RETRY_AFTER_SECONDS = 60;
const MINUTE_MS = 60_000;

// Layer A key (per conversation): one prefix per layer keeps a single table.
export function conversationKey(conversationId: string): string {
    return `conv:${conversationId}`;
}

// Layer B key: client IP, IPv6 bucketed to /64.
//
// SOURCE OF TRUTH: the leftmost `x-forwarded-for` entry, trusting Railway's
// proxy as the request's termination point — Railway appends the real client
// IP as the first hop. If Tandem ever moves off Railway (or Railway changes its
// proxy semantics), this trust assumption must be re-verified: a spoofable
// upstream would let an attacker forge the leftmost entry and dodge layer B.
export function clientIpKey(forwardedFor: string | null): string | null {
    const leftmost = forwardedFor?.split(",")[0]?.trim();
    if (!leftmost) return null;
    // IPv6: limiting per /128 is bypassed by default on mobile networks where
    // every device gets a fresh address, so bucket to the /64 network prefix
    // (the first four hextets).
    if (leftmost.includes(":")) {
        return `ip:${ipv6Prefix64(leftmost)}`;
    }
    return `ip:${leftmost}`;
}

// Expand a compressed `::` to the full eight hextets, then keep the first four
// (the /64 network prefix). A `::` inside the prefix would otherwise truncate to
// the wrong groups.
function ipv6Prefix64(addr: string): string {
    const [head, tail] = addr.split("::");
    const headParts = head ? head.split(":") : [];
    const tailParts = tail !== undefined && tail ? tail.split(":") : [];
    const missing = 8 - headParts.length - tailParts.length;
    const full = [...headParts, ...Array(Math.max(missing, 0)).fill("0"), ...tailParts];
    return full.slice(0, 4).join(":");
}

// Env-tunable; default 10/min for the conversation layer.
export function conversationLimitPerMinute(): number {
    const raw = Number(process.env.RATE_LIMIT_CONVERSATION_PER_MINUTE);
    return Number.isFinite(raw) && raw > 0 ? raw : 10;
}

// Env-tunable; default 60/min for the client-IP layer.
export function ipLimitPerMinute(): number {
    const raw = Number(process.env.RATE_LIMIT_IP_PER_MINUTE);
    return Number.isFinite(raw) && raw > 0 ? raw : 60;
}

function floorToMinute(date: Date): Date {
    return new Date(Math.floor(date.getTime() / MINUTE_MS) * MINUTE_MS);
}

// Sliding-window counter: increment the current wall-clock-minute
// bucket, weight the previous minute's count by the unelapsed fraction, and deny
// when the rolling estimate exceeds the limit.
export async function checkRateLimit(
    key: string,
    limitPerMinute: number,
): Promise<RateLimitResult> {
    const db = getDb();
    const now = getClock().now();
    const currentMinute = floorToMinute(now);
    const previousMinute = new Date(currentMinute.getTime() - MINUTE_MS);

    const [current] = await db
        .insert(rateLimitBuckets)
        .values({ key, bucketMinute: currentMinute, count: 1 })
        .onConflictDoUpdate({
            target: [rateLimitBuckets.key, rateLimitBuckets.bucketMinute],
            set: { count: sql`${rateLimitBuckets.count} + 1` },
        })
        .returning({ count: rateLimitBuckets.count });

    const [previous] = await db
        .select({ count: rateLimitBuckets.count })
        .from(rateLimitBuckets)
        .where(
            and(eq(rateLimitBuckets.key, key), eq(rateLimitBuckets.bucketMinute, previousMinute)),
        );

    const elapsedFraction = (now.getTime() - currentMinute.getTime()) / MINUTE_MS;
    const weighted = (previous?.count ?? 0) * (1 - elapsedFraction) + current.count;

    // Opportunistic sweep: only the current and previous minute are ever read.
    await db
        .delete(rateLimitBuckets)
        .where(lt(rateLimitBuckets.bucketMinute, new Date(now.getTime() - 2 * MINUTE_MS)));

    if (weighted > limitPerMinute) {
        return { allowed: false, retryAfterSeconds: RETRY_AFTER_SECONDS };
    }
    return { allowed: true };
}

// The visitor write-path guard: runs both layers against
// shared counters and returns a 429 the moment either trips, or null to let the
// request through. Layers A and B share one `(key, minute)` row each — an
// attacker cannot split their abuse budget across `/api/chat` and
// `/api/chat/escalate`. Callers pass the verified conversation id (or null for
// a fresh request with no cookie, which only layer B can catch).
export async function enforceVisitorRateLimit(
    request: Request,
    conversationId: string | null,
): Promise<NextResponse | null> {
    const ipKey = clientIpKey(request.headers.get("x-forwarded-for"));

    // Layer B — client IP. Applies even with no conversation cookie, closing the
    // first-message and cookie-rotation flood cases.
    if (ipKey) {
        const result = await checkRateLimit(ipKey, ipLimitPerMinute());
        if (!result.allowed) return rateLimited429("B", result.retryAfterSeconds);
    }

    // Layer A — conversation_id, when the visitor has a verified cookie.
    if (conversationId) {
        const result = await checkRateLimit(
            conversationKey(conversationId),
            conversationLimitPerMinute(),
        );
        if (!result.allowed) return rateLimited429("A", result.retryAfterSeconds);
    }

    return null;
}

// The admin write-path guard: runs layer B (client IP)
// against the same shared counters as the visitor routes, but a valid admin
// session is fully exempt — Waseem Ansar's console traffic is never throttled and
// never even touches the counter. Runs in middleware before the request reaches
// the route handler's own auth check, so unauthenticated `/api/admin/*` probes
// are caught with a 429 instead of slipping through to a 401.
export async function enforceAdminRateLimit(
    request: Request,
    session: { user?: unknown } | null,
): Promise<NextResponse | null> {
    if (session?.user) return null;

    const ipKey = clientIpKey(request.headers.get("x-forwarded-for"));
    if (ipKey) {
        const result = await checkRateLimit(ipKey, ipLimitPerMinute());
        if (!result.allowed) return rateLimited429("B", result.retryAfterSeconds);
    }

    return null;
}

// The body never discloses which layer fired; the server log does, for
// incident triage.
function rateLimited429(layer: "A" | "B", retryAfterSeconds: number): NextResponse {
    console.warn(`[rate-limit] layer ${layer} tripped`);
    return NextResponse.json(
        { error: "rate_limited", retryAfter: retryAfterSeconds },
        { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
    );
}
