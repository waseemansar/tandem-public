import { describe, expect, it } from "vitest";
import { createMagicLinkSigner } from "@/shared/magic-link";

const SECRET = "test-magic-link-secret-32-bytes-long-aaa";

describe("MagicLinkSigner", () => {
    it("sign/verify round-trip yields the original conversationId and email", async () => {
        const signer = createMagicLinkSigner({ secret: SECRET });
        const token = await signer.sign({
            conversationId: "11111111-1111-1111-1111-111111111111",
            email: "visitor@example.com",
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        });

        const result = await signer.verify(token);
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error("unreachable");
        expect(result.payload.conversationId).toBe("11111111-1111-1111-1111-111111111111");
        expect(result.payload.email).toBe("visitor@example.com");
    });

    it("rejects a token signed with a different secret with reason=invalid", async () => {
        const signedByOther = createMagicLinkSigner({
            secret: "other-secret-32-bytes-different-aaaaa",
        });
        const verifier = createMagicLinkSigner({ secret: SECRET });
        const token = await signedByOther.sign({
            conversationId: "33333333-3333-3333-3333-333333333333",
            email: "v@example.com",
            expiresAt: new Date(Date.now() + 60_000),
        });

        const result = await verifier.verify(token);
        expect(result.ok).toBe(false);
        if (result.ok) throw new Error("unreachable");
        expect(result.reason).toBe("invalid");
    });

    it("rejects a token whose payload has been mutated with reason=invalid", async () => {
        const signer = createMagicLinkSigner({ secret: SECRET });
        const token = await signer.sign({
            conversationId: "44444444-4444-4444-4444-444444444444",
            email: "v@example.com",
            expiresAt: new Date(Date.now() + 60_000),
        });
        const [header, payload, sig] = token.split(".");
        const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
        decoded.email = "attacker@example.com";
        const mutatedPayload = Buffer.from(JSON.stringify(decoded))
            .toString("base64url")
            .replace(/=+$/, "");
        const mutated = `${header}.${mutatedPayload}.${sig}`;

        const result = await signer.verify(mutated);
        expect(result.ok).toBe(false);
        if (result.ok) throw new Error("unreachable");
        expect(result.reason).toBe("invalid");
    });

    it("rejects a token whose exp is in the past with reason=expired", async () => {
        const signer = createMagicLinkSigner({ secret: SECRET });
        const token = await signer.sign({
            conversationId: "22222222-2222-2222-2222-222222222222",
            email: "old@example.com",
            expiresAt: new Date(Date.now() - 1000),
        });

        const result = await signer.verify(token);
        expect(result.ok).toBe(false);
        if (result.ok) throw new Error("unreachable");
        expect(result.reason).toBe("expired");
    });
});
