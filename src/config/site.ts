// Single build-time source of truth for the represented human's identity.
// Every per-fork value is read from NEXT_PUBLIC_OWNER_* env with
// neutral placeholder fallbacks, so a fresh clone runs without impersonating
// anyone. The fixed product name "Tandem" stays hardcoded — only the human is
// configurable. The NEXT_PUBLIC_ prefix lets client components inline these
// values at build time.

export interface Pronouns {
    subject: string; // they / he / she — subject form ("they may join")
    object: string; // them / him / her — object form ("contact them")
    possessive: string; // their / his / her — possessive form ("their email")
}

export const fullName = process.env.NEXT_PUBLIC_OWNER_FULL_NAME || "Your Name";
export const firstName = process.env.NEXT_PUBLIC_OWNER_FIRST_NAME || "You";
export const pronouns: Pronouns = {
    subject: process.env.NEXT_PUBLIC_OWNER_PRONOUN_SUBJECT || "they",
    object: process.env.NEXT_PUBLIC_OWNER_PRONOUN_OBJECT || "them",
    possessive: process.env.NEXT_PUBLIC_OWNER_PRONOUN_POSSESSIVE || "their",
};
export const photo = process.env.NEXT_PUBLIC_OWNER_PHOTO || "/placeholder-avatar.png";

// Optional owner social links, rendered in the visitor footer. Empty = link hidden,
// so a fresh fork shows no personal socials until its owner sets them.
export const linkedin = process.env.NEXT_PUBLIC_OWNER_LINKEDIN || "";
export const github = process.env.NEXT_PUBLIC_OWNER_GITHUB || "";
