import { describe, expect, it } from "vitest";
import {
    MessageTooLongError,
    RateLimitedError,
    parseSendChatError,
} from "@/features/visitor/chat-send-error";

function res(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
}

describe("parseSendChatError", () => {
    it("returns MessageTooLongError when the server replies 400 message_too_long", async () => {
        const err = await parseSendChatError(
            res(400, { error: "message_too_long", maxLength: 10000 }),
        );
        expect(err).toBeInstanceOf(MessageTooLongError);
        expect((err as MessageTooLongError).maxLength).toBe(10000);
        expect(err.message).toBe("Your message is too long — please shorten and try again");
    });

    it("returns a generic error for a 400 with a different error code", async () => {
        const err = await parseSendChatError(res(400, { error: "invalid_body" }));
        expect(err).not.toBeInstanceOf(MessageTooLongError);
        expect(err.message).toBe("Couldn't send your message. Please try again.");
    });

    it("returns a RateLimitedError carrying retryAfter when the server replies 429", async () => {
        const err = await parseSendChatError(res(429, { error: "rate_limited", retryAfter: 60 }));
        expect(err).toBeInstanceOf(RateLimitedError);
        expect((err as RateLimitedError).retryAfterSeconds).toBe(60);
    });

    it("defaults a 429 with no retryAfter to a 60s cooldown", async () => {
        const err = await parseSendChatError(res(429, { error: "rate_limited" }));
        expect(err).toBeInstanceOf(RateLimitedError);
        expect((err as RateLimitedError).retryAfterSeconds).toBe(60);
    });

    it("returns a generic error for non-400 status codes", async () => {
        const err = await parseSendChatError(res(500, { error: "boom" }));
        expect(err).not.toBeInstanceOf(MessageTooLongError);
    });

    it("returns a generic error if the 400 body is not valid JSON", async () => {
        const malformed = new Response("not json", {
            status: 400,
            headers: { "content-type": "application/json" },
        });
        const err = await parseSendChatError(malformed);
        expect(err).not.toBeInstanceOf(MessageTooLongError);
    });
});
