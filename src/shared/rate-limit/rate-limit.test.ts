import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { rateLimitBuckets } from "@/db/schema";
import { resetTestDb, startTestDb, stopTestDb } from "@/test/db";
import { resetClock, setClock } from "@/shared/clock";
import {
    checkRateLimit,
    clientIpKey,
    enforceAdminRateLimit,
    enforceVisitorRateLimit,
} from "@/shared/rate-limit";

const KEY = "conv:11111111-1111-1111-1111-111111111111";

function at(iso: string) {
    setClock({ now: () => new Date(iso) });
}

// One container for the whole file: each DB describe shares it and only resets
// rows between tests. Starting/stopping per describe would tear down the shared
// postgres client mid-flight (its singleton lives in @/test/db).
beforeAll(async () => {
    await startTestDb();
});

afterAll(async () => {
    await stopTestDb();
});

describe("checkRateLimit", () => {
    beforeEach(async () => {
        await resetTestDb();
    });

    afterEach(() => {
        resetClock();
    });

    it("allows the first N calls and denies the (N+1)th within one minute", async () => {
        at("2026-06-26T12:00:00.000Z");

        for (let i = 0; i < 10; i++) {
            const result = await checkRateLimit(KEY, 10);
            expect(result.allowed).toBe(true);
        }

        const denied = await checkRateLimit(KEY, 10);
        expect(denied).toEqual({ allowed: false, retryAfterSeconds: 60 });
    });

    it("weights the previous minute's count by the unelapsed fraction of the current minute", async () => {
        // Two keys each take the full limit during minute A.
        const keyEarly = "conv:early";
        const keyLate = "conv:late";
        at("2026-06-26T12:00:00.000Z");
        for (let i = 0; i < 10; i++) {
            await checkRateLimit(keyEarly, 10);
            await checkRateLimit(keyLate, 10);
        }

        // At the very start of minute B the previous minute counts in full, so
        // the rolling estimate (10*1 + 1) still exceeds the limit.
        at("2026-06-26T12:01:00.000Z");
        expect(await checkRateLimit(keyEarly, 10)).toEqual({
            allowed: false,
            retryAfterSeconds: 60,
        });

        // Halfway through minute B the previous minute is weighted 0.5, so the
        // estimate (10*0.5 + 1) drops back under the limit.
        at("2026-06-26T12:01:30.000Z");
        expect(await checkRateLimit(keyLate, 10)).toEqual({ allowed: true });
    });

    it("treats a missing previous-minute bucket as zero", async () => {
        // Saturate minute A, then skip a whole minute. The check at minute C
        // looks only at minute B (empty), so the stale minute-A count must not
        // bleed in and the full limit is available again.
        at("2026-06-26T12:00:00.000Z");
        for (let i = 0; i < 10; i++) await checkRateLimit(KEY, 10);

        at("2026-06-26T12:02:30.000Z");
        for (let i = 0; i < 10; i++) {
            expect(await checkRateLimit(KEY, 10)).toEqual({ allowed: true });
        }
        expect(await checkRateLimit(KEY, 10)).toEqual({ allowed: false, retryAfterSeconds: 60 });
    });

    it("sweeps buckets older than two minutes on each check", async () => {
        at("2026-06-26T12:00:00.000Z");
        await checkRateLimit(KEY, 10);

        // A later check more than two minutes on must evict the stale row.
        at("2026-06-26T12:05:00.000Z");
        await checkRateLimit("conv:other", 10);

        const stale = await getDb()
            .select({ count: rateLimitBuckets.count })
            .from(rateLimitBuckets)
            .where(eq(rateLimitBuckets.key, KEY));
        expect(stale).toHaveLength(0);
    });
});

describe("enforceAdminRateLimit", () => {
    beforeEach(async () => {
        await resetTestDb();
    });

    afterEach(() => {
        resetClock();
        delete process.env.RATE_LIMIT_IP_PER_MINUTE;
    });

    function adminRequest(ip: string): Request {
        return new Request("http://localhost/api/admin/inbox", {
            method: "POST",
            headers: { "x-forwarded-for": ip },
        });
    }

    it("429s an unauthenticated burst once the layer B IP limit is exceeded", async () => {
        process.env.RATE_LIMIT_IP_PER_MINUTE = "3";
        at("2026-06-26T12:00:00.000Z");
        const ip = "203.0.113.7";

        for (let i = 0; i < 3; i++) {
            const res = await enforceAdminRateLimit(adminRequest(ip), null);
            expect(res).toBeNull();
        }

        const limited = await enforceAdminRateLimit(adminRequest(ip), null);
        expect(limited?.status).toBe(429);
        expect(limited?.headers.get("retry-after")).toBe("60");
        expect(await limited?.json()).toEqual({ error: "rate_limited", retryAfter: 60 });
    });

    it("never rate-limits a valid admin session, even when its IP is over the limit", async () => {
        process.env.RATE_LIMIT_IP_PER_MINUTE = "3";
        at("2026-06-26T12:00:00.000Z");
        const ip = "203.0.113.7";
        const session = { user: { email: "admin@example.com" } };

        // Drive the IP well past the limit with unauthenticated probes first.
        for (let i = 0; i < 5; i++) await enforceAdminRateLimit(adminRequest(ip), null);
        expect((await enforceAdminRateLimit(adminRequest(ip), null))?.status).toBe(429);

        // The admin shares that hot IP, yet is waved through every time.
        for (let i = 0; i < 5; i++) {
            expect(await enforceAdminRateLimit(adminRequest(ip), session)).toBeNull();
        }
    });

    it("shares layer B counters with the visitor routes for the same IP", async () => {
        process.env.RATE_LIMIT_IP_PER_MINUTE = "3";
        at("2026-06-26T12:00:00.000Z");
        const ip = "203.0.113.7";
        const visitorRequest = new Request("http://localhost/api/chat", {
            method: "POST",
            headers: { "x-forwarded-for": ip },
        });

        // Visitor write-path spends the whole IP budget (layer A skipped: no cookie).
        for (let i = 0; i < 3; i++) {
            expect(await enforceVisitorRateLimit(visitorRequest, null)).toBeNull();
        }

        // An unauthenticated admin probe from the same IP is already over the
        // shared budget — it cannot reset its own counter.
        const limited = await enforceAdminRateLimit(adminRequest(ip), null);
        expect(limited?.status).toBe(429);
    });
});

describe("clientIpKey", () => {
    it("passes an IPv4 address through, taking the leftmost x-forwarded-for entry", () => {
        expect(clientIpKey("203.0.113.5")).toBe("ip:203.0.113.5");
        expect(clientIpKey("203.0.113.5, 70.41.3.18, 150.172.238.178")).toBe("ip:203.0.113.5");
    });

    it("buckets an IPv6 address to its /64 (first four hextets)", () => {
        expect(clientIpKey("2001:db8:85a3:1234:5678:8a2e:370:7334")).toBe("ip:2001:db8:85a3:1234");
    });

    it("expands a compressed :: before truncating so the /64 prefix is correct", () => {
        // 2001:db8::1 → 2001:0db8:0000:0000:… → /64 prefix 2001:db8:0:0
        expect(clientIpKey("2001:db8::1")).toBe("ip:2001:db8:0:0");
    });

    it("returns null when no IP is present so layer B is skipped", () => {
        expect(clientIpKey(null)).toBeNull();
        expect(clientIpKey("")).toBeNull();
        expect(clientIpKey("   ")).toBeNull();
    });
});
