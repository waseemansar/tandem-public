import { errors as joseErrors, jwtVerify, SignJWT } from "jose";

export type MagicLinkPayload = {
    conversationId: string;
    email: string;
};

export type MagicLinkSignInput = MagicLinkPayload & {
    expiresAt: Date;
};

export type MagicLinkVerifyResult =
    | { ok: true; payload: MagicLinkPayload }
    | { ok: false; reason: "expired" | "invalid" };

export interface MagicLinkSigner {
    sign(input: MagicLinkSignInput): Promise<string>;
    verify(token: string): Promise<MagicLinkVerifyResult>;
}

export type MagicLinkConfig = {
    secret: string;
};

export const MAGIC_LINK_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function buildMagicLinkUrl(appBaseUrl: string, token: string): string {
    const trimmed = appBaseUrl.replace(/\/+$/, "");
    return `${trimmed}/r/${token}`;
}

let _signer: MagicLinkSigner = createBrokenSigner();

function createBrokenSigner(): MagicLinkSigner {
    return {
        async sign() {
            throw new Error("MagicLinkSigner not initialised");
        },
        async verify() {
            return { ok: false, reason: "invalid" };
        },
    };
}

export function setMagicLinkSigner(s: MagicLinkSigner): void {
    _signer = s;
}

export function resetMagicLinkSigner(): void {
    _signer = createBrokenSigner();
}

export function getMagicLinkSigner(): MagicLinkSigner {
    return _signer;
}

let _initialized = false;

export function initMagicLinkSignerFromEnv(): void {
    if (_initialized) return;
    _initialized = true;
    const secret = process.env.MAGIC_LINK_SECRET;
    if (!secret) {
        console.warn(
            "[magic-link] MAGIC_LINK_SECRET unset — magic-link signing/verification disabled",
        );
        return;
    }
    setMagicLinkSigner(createMagicLinkSigner({ secret }));
}

export function createMagicLinkSigner(config: MagicLinkConfig): MagicLinkSigner {
    const key = new TextEncoder().encode(config.secret);
    return {
        async sign(input) {
            return new SignJWT({ conversationId: input.conversationId, email: input.email })
                .setProtectedHeader({ alg: "HS256" })
                .setExpirationTime(Math.floor(input.expiresAt.getTime() / 1000))
                .sign(key);
        },
        async verify(token) {
            try {
                const { payload } = await jwtVerify<{ conversationId: string; email: string }>(
                    token,
                    key,
                );
                return {
                    ok: true,
                    payload: {
                        conversationId: payload.conversationId,
                        email: payload.email,
                    },
                };
            } catch (err) {
                if (err instanceof joseErrors.JWTExpired) {
                    return { ok: false, reason: "expired" };
                }
                return { ok: false, reason: "invalid" };
            }
        },
    };
}
