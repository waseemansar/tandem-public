import { afterEach, describe, expect, it, vi } from "vitest";

const OWNER_ENV_KEYS = [
    "NEXT_PUBLIC_OWNER_FULL_NAME",
    "NEXT_PUBLIC_OWNER_FIRST_NAME",
    "NEXT_PUBLIC_OWNER_PRONOUN_SUBJECT",
    "NEXT_PUBLIC_OWNER_PRONOUN_OBJECT",
    "NEXT_PUBLIC_OWNER_PRONOUN_POSSESSIVE",
    "NEXT_PUBLIC_OWNER_PHOTO",
] as const;

async function loadSite() {
    vi.resetModules();
    return import("@/config/site");
}

describe("site config", () => {
    afterEach(() => {
        for (const key of OWNER_ENV_KEYS) delete process.env[key];
    });

    it("falls back to neutral placeholders when no owner env is set", async () => {
        for (const key of OWNER_ENV_KEYS) delete process.env[key];

        const site = await loadSite();

        expect(site.fullName).toBe("Your Name");
        expect(site.firstName).toBe("You");
        expect(site.pronouns).toEqual({ subject: "they", object: "them", possessive: "their" });
        expect(site.photo).toBe("/placeholder-avatar.png");
    });

    it("reads the represented human's identity from owner env when set", async () => {
        process.env.NEXT_PUBLIC_OWNER_FULL_NAME = "Ada Lovelace";
        process.env.NEXT_PUBLIC_OWNER_FIRST_NAME = "Ada";
        process.env.NEXT_PUBLIC_OWNER_PRONOUN_SUBJECT = "she";
        process.env.NEXT_PUBLIC_OWNER_PRONOUN_OBJECT = "her";
        process.env.NEXT_PUBLIC_OWNER_PRONOUN_POSSESSIVE = "her";
        process.env.NEXT_PUBLIC_OWNER_PHOTO = "/ada.png";

        const site = await loadSite();

        expect(site.fullName).toBe("Ada Lovelace");
        expect(site.firstName).toBe("Ada");
        expect(site.pronouns).toEqual({ subject: "she", object: "her", possessive: "her" });
        expect(site.photo).toBe("/ada.png");
    });
});
