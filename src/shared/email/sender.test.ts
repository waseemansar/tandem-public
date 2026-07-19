import { describe, expect, it } from "vitest";
import { createInMemoryEmailSender } from "@/test/email-sender";

describe("InMemoryEmailSender", () => {
    it("records sends in order, exposes them via getSends()", async () => {
        const sender = createInMemoryEmailSender();

        await sender.send({
            to: "priya@northwind.io",
            subject: "New reply",
            text: "Click here: https://app.example/r/token-a",
        });
        await sender.send({
            to: "kai@elsewhere.dev",
            subject: "New reply",
            text: "Click here: https://app.example/r/token-b",
        });

        const sends = sender.getSends();
        expect(sends).toHaveLength(2);
        expect(sends[0].to).toBe("priya@northwind.io");
        expect(sends[0].text).toContain("https://app.example/r/token-a");
        expect(sends[1].to).toBe("kai@elsewhere.dev");
    });
});
