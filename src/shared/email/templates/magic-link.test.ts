import { describe, expect, it } from "vitest";
import { fullName } from "@/config/site";
import { buildMagicLinkEmail } from "@/shared/email/templates/magic-link";

const URL = "https://tandem.example/r/abc.def.ghi";

describe("buildMagicLinkEmail", () => {
    it("renders subject, plain-text, and HTML containing the magic-link URL", async () => {
        const email = await buildMagicLinkEmail({ url: URL });

        expect(email.subject).toBe(`${fullName} replied on Tandem`);
        expect(email.text).toContain(URL);
        expect(email.html).toContain(URL);
    });

    it("renders the configured identity in subject, subtitle, and heading", async () => {
        const email = await buildMagicLinkEmail({ url: URL });

        expect(email.subject).toContain(fullName);
        expect(email.text).toContain(`Digital twin of ${fullName}`);
        // The heading is uppercased by the plain-text renderer.
        expect(email.text).toContain(`${fullName} replied`.toUpperCase());
    });

    it("greets by firstName when provided", async () => {
        const email = await buildMagicLinkEmail({ url: URL, visitorFirstName: "Priya" });

        expect(email.text).toContain("Hi Priya");
        expect(email.html).toContain("Hi Priya");
    });

    it("falls back to a neutral greeting when firstName is absent", async () => {
        const email = await buildMagicLinkEmail({ url: URL });

        expect(email.text).toContain("Hi there");
        expect(email.html).toContain("Hi there");
    });

    it("includes the Tandem wordmark and the 30-day expiry note", async () => {
        const email = await buildMagicLinkEmail({ url: URL });

        expect(email.html).toContain("Tandem");
        expect(email.text).toMatch(/30 days/i);
        expect(email.html).toMatch(/30 days/i);
    });
});
