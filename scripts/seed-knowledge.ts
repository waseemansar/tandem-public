import { fullName } from "@/config/site";
import { setLiveDoc } from "@/features/twin/knowledge-doc";

// Tiny, unmistakably-placeholder knowledge doc so a freshly-cloned Tandem
// answers something out of the box instead of escalating every question.
// Entries follow the live doc's voice (see faq-suggestions.ts): a `### question`
// heading in third person, then a short grounded answer. `fullName` comes from
// config, so this adapts to the fork's configured identity ("Your Name" until
// NEXT_PUBLIC_OWNER_FULL_NAME is set). Replace every "[replace me]" with real
// facts in the admin Knowledge page (/admin/knowledge).
function buildPlaceholderDoc(): string {
    return [
        `PLACEHOLDER SEED — replace this with real facts about ${fullName} in the`,
        "admin Knowledge page (/admin/knowledge), then delete this note.",
        "",
        "### What is Tandem?",
        "",
        `Tandem is ${fullName}'s digital twin — an AI that answers visitors' questions on ${fullName}'s behalf, and offers to bring in ${fullName} directly whenever it doesn't know the answer.`,
        "",
        `### Where is ${fullName} based?`,
        "",
        '[replace me] — for example, "Berlin, since 2024."',
        "",
        `### What does ${fullName} do?`,
        "",
        `[replace me] — a sentence or two about ${fullName}'s work, focus, and what visitors might want to reach out about.`,
        "",
        `### How can someone get in touch with ${fullName}?`,
        "",
        `[replace me] — visitors can also just ask to be put in touch, and the twin will offer to hand the conversation to ${fullName}.`,
    ].join("\n");
}

async function main(): Promise<void> {
    if (!process.env.DATABASE_URL) {
        console.error("Set DATABASE_URL (in .env or inline), then run: pnpm seed:knowledge");
        process.exit(1);
    }

    await setLiveDoc(buildPlaceholderDoc());

    console.log(`Seeded placeholder knowledge doc for "${fullName}".`);
    console.log("Edit it in the admin Knowledge page (/admin/knowledge).");
    process.exit(0);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
