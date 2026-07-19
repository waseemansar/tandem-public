export const MESSAGE_TOO_LONG_TEXT = "Your message is too long — please shorten and try again";

export class MessageTooLongError extends Error {
    readonly maxLength: number;
    constructor(maxLength: number) {
        super(MESSAGE_TOO_LONG_TEXT);
        this.name = "MessageTooLongError";
        this.maxLength = maxLength;
    }
}

// Friendly inline copy with a live countdown ({n}s).
export function rateLimitedText(seconds: number): string {
    return `Slow down a moment — Tandem can only answer a few messages a minute. Try again in ${seconds}s.`;
}

const DEFAULT_RETRY_AFTER_SECONDS = 60;

export class RateLimitedError extends Error {
    readonly retryAfterSeconds: number;
    constructor(retryAfterSeconds: number) {
        super("rate_limited");
        this.name = "RateLimitedError";
        this.retryAfterSeconds = retryAfterSeconds;
    }
}

const GENERIC_MESSAGE = "Couldn't send your message. Please try again.";

export async function parseSendChatError(res: Response): Promise<Error> {
    if (res.status === 400) {
        const body = (await res.json().catch(() => null)) as {
            error?: string;
            maxLength?: number;
        } | null;
        if (body?.error === "message_too_long" && typeof body.maxLength === "number") {
            return new MessageTooLongError(body.maxLength);
        }
    }
    if (res.status === 429) {
        const body = (await res.json().catch(() => null)) as { retryAfter?: number } | null;
        const retryAfter =
            typeof body?.retryAfter === "number" && body.retryAfter > 0
                ? body.retryAfter
                : DEFAULT_RETRY_AFTER_SECONDS;
        return new RateLimitedError(retryAfter);
    }
    return new Error(GENERIC_MESSAGE);
}
