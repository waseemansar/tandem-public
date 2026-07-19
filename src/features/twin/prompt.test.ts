import { describe, expect, it } from "vitest";
import { fullName } from "@/config/site";
import { renderTranscript, sanitizeTwinReply } from "@/features/twin/prompt";

describe("renderTranscript", () => {
    it("returns an empty string when there are no rows", () => {
        expect(renderTranscript({ rows: [], visitorDisplayName: null })).toBe("");
    });

    it("renders a single visitor row with the display name in parentheses", () => {
        expect(
            renderTranscript({
                rows: [{ sender: "visitor", content: "hi" }],
                visitorDisplayName: "Priya",
            }),
        ).toBe("Visitor (Priya): hi");
    });

    it("renders a single visitor row without a display name as plain Visitor", () => {
        expect(
            renderTranscript({
                rows: [{ sender: "visitor", content: "hi" }],
                visitorDisplayName: null,
            }),
        ).toBe("Visitor: hi");
    });

    it("joins three-speaker rows in order with exactly one blank line between them", () => {
        expect(
            renderTranscript({
                rows: [
                    { sender: "visitor", content: "what's your stack?" },
                    { sender: "twin", content: "Next.js, Postgres, Drizzle." },
                    { sender: "human", content: "And lots of TypeScript." },
                ],
                visitorDisplayName: "Priya",
            }),
        ).toBe(
            `Visitor (Priya): what's your stack?\n\nTandem: Next.js, Postgres, Drizzle.\n\n${fullName}: And lots of TypeScript.`,
        );
    });

    it("renders sender=system rows as bracketed stage directions with no prefix", () => {
        expect(
            renderTranscript({
                rows: [
                    { sender: "visitor", content: "hello?" },
                    { sender: "system", content: `${fullName} joined the conversation` },
                    { sender: "human", content: "hey, I'm here." },
                ],
                visitorDisplayName: "Priya",
            }),
        ).toBe(
            `Visitor (Priya): hello?\n\n[${fullName} joined the conversation]\n\n${fullName}: hey, I'm here.`,
        );
    });

    it("renders multi-line content verbatim with no indentation or reflow", () => {
        expect(
            renderTranscript({
                rows: [
                    {
                        sender: "visitor",
                        content: "I have two questions:\n1. stack?\n2. timezone?",
                    },
                    { sender: "twin", content: "Stack: Next.js.\nTimezone: CET." },
                ],
                visitorDisplayName: null,
            }),
        ).toBe(
            "Visitor: I have two questions:\n1. stack?\n2. timezone?\n\nTandem: Stack: Next.js.\nTimezone: CET.",
        );
    });

    it("ends on the last row's content with no trailing Tandem: cue", () => {
        const out = renderTranscript({
            rows: [
                { sender: "twin", content: "Hi! What can I tell you?" },
                { sender: "visitor", content: "Where is he based?" },
            ],
            visitorDisplayName: "Priya",
        });
        expect(out).toBe("Tandem: Hi! What can I tell you?\n\nVisitor (Priya): Where is he based?");
        expect(out.endsWith("Where is he based?")).toBe(true);
    });

    it("applies visitorDisplayName retroactively to every visitor row in the thread", () => {
        expect(
            renderTranscript({
                rows: [
                    { sender: "visitor", content: "hi" },
                    { sender: "twin", content: "Hello!" },
                    { sender: "visitor", content: "where is he based?" },
                ],
                visitorDisplayName: "Priya",
            }),
        ).toBe("Visitor (Priya): hi\n\nTandem: Hello!\n\nVisitor (Priya): where is he based?");
    });
});

describe("sanitizeTwinReply", () => {
    it("strips a leading Tandem: label regardless of case and trailing whitespace", () => {
        expect(sanitizeTwinReply("Tandem: Hi there")).toBe("Hi there");
        expect(sanitizeTwinReply("tandem: Hi there")).toBe("Hi there");
        expect(sanitizeTwinReply("TANDEM:  Hi there")).toBe("Hi there");
    });

    it("leaves a mid-string Tandem: occurrence untouched", () => {
        expect(sanitizeTwinReply("Sure — Tandem: that's me.")).toBe("Sure — Tandem: that's me.");
    });
});
