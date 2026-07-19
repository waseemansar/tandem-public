import { fullName, pronouns } from "@/config/site";

export const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

const subjectCapitalized = pronouns.subject.charAt(0).toUpperCase() + pronouns.subject.slice(1);

export const TWIN_TURN_WORKFLOW_NAME = "Twin Turn";
export const FAQ_DRAFTER_WORKFLOW_NAME = "Tandem FAQ Drafter";

export const ESCALATION_TEMPLATE = `\n\nIf you'd like ${pronouns.object} to follow up, just drop your email below.`;
export const FALLBACK_APOLOGY = "Sorry — something glitched on my end. Could you try again?";

// Operator kill switch (DISABLE_TWIN) and OpenAI 429 / spend-cap fallbacks.
// Both invite the visitor to escalate so they're never stuck.
export const TWIN_DISABLED_MESSAGE = `Tandem is offline right now. If you leave your email, ${fullName} will get back to you.`;
export const TWIN_RATE_LIMITED_MESSAGE = `Tandem is having trouble right now. If you leave your email, ${fullName} will get back to you.`;
export const ESCALATION_CONFIRMATION = `Thanks — I've let ${fullName} know. ${subjectCapitalized} may join here shortly; otherwise we'll email you a link to come back to this conversation.`;

export const JOIN_SYSTEM_MESSAGE = `${fullName} joined the conversation`;
export const STEP_OUT_SYSTEM_MESSAGE = `${fullName} stepped out — Tandem is back`;
export const RESOLVED_SYSTEM_MESSAGE = `Conversation marked resolved by ${fullName}`;
