import { Agent, run, tool } from "@openai/agents";
import { z } from "zod";
import { fullName, pronouns } from "@/config/site";

export const REQUEST_HANDOFF_TOOL_NAME = "request_human_handoff";

// Default twin model. Use the full `gpt-5.6-terra` id, never the bare `gpt-5.6`
// alias — the alias routes to the pricier Sol. One model serves both the streamed
// reply and draftFaq. Override per-deployment with OPENAI_TWIN_MODEL.
const TWIN_MODEL = "gpt-5.6-terra";

// Fast, non-reasoning effort, pinned explicitly rather than relying on the model's
// implicit default (which OpenAI can change between snapshots, and which is the slow
// medium tier on older models like gpt-5-mini). If the two-step escalation dance
// flakes at "none", bump the streamed reply to "low" — the escape hatch from 4626a03.
const TWIN_REASONING_EFFORT = "none" as const;

export type TwinStreamEvent =
    | { type: "text_delta"; delta: string }
    | { type: "tool_call"; name: string };

export interface TwinAgentInput {
    transcript: string;
    doc: string;
    signal?: AbortSignal;
}

export interface DraftFaqInput {
    transcript: string;
    signal?: AbortSignal;
}

export interface DraftFaqResult {
    question: string;
    answer: string;
}

export interface TwinAgent {
    stream(input: TwinAgentInput): AsyncIterable<TwinStreamEvent>;
    draftFaq(input: DraftFaqInput): Promise<DraftFaqResult>;
}

// Operator kill switch (DISABLE_TWIN): when set, the twin short-circuits to an
// escalation-only fallback without ever calling OpenAI. Read at call time so a
// redeploy with the var flipped takes effect immediately.
export function isTwinDisabled(): boolean {
    return process.env.DISABLE_TWIN === "true";
}

// A 429 from the OpenAI API — per-model rate limit or hard-cap-reached — so the
// caller can swap a 500 for a friendly visitor message. The Agents SDK may wrap
// the underlying error, so walk the cause chain looking for status 429.
export function isOpenAiRateLimitError(err: unknown): boolean {
    let current: unknown = err;
    for (let depth = 0; current && depth < 5; depth++) {
        if (typeof current === "object" && (current as { status?: unknown }).status === 429) {
            return true;
        }
        current = (current as { cause?: unknown }).cause;
    }
    return false;
}

function buildInstructions(doc: string): string {
    return [
        `You are Tandem, the digital twin of ${fullName}.`,
        `Threads may include a third speaker — ${fullName}, the human you represent — alongside the visitor and you. The user message you receive is the rendered transcript of the whole thread so far, with each line labelled by speaker.`,
        "Reply with the message body only — do not prefix with 'Tandem:' or any speaker label.",
        `Answer only from the knowledge doc below. Never invent facts about ${fullName}.`,
        'For greetings and small talk (examples: "hi", "hello", "how are you?", "what\'s up?", "thanks", "ok", "cool"): reply with a single short, friendly sentence in your own voice and do NOT call any tool. These are not knowledge gaps. If appropriate, invite the visitor to ask a real question.',
        "If the doc contains an answer, write a grounded reply directly.",
        `If the visitor is expressing intent to reach ${fullName} directly (examples: "I'd like to get in touch", "how do I contact ${pronouns.object}", "can I work with you", "what's ${pronouns.possessive} email"): write exactly one short warm sentence acknowledging the request (e.g. "Happy to put you in touch."), then call the ${REQUEST_HANDOFF_TOOL_NAME} tool. Treat questions asking for ${pronouns.possessive} direct contact info (email, phone) as contact intent, not a knowledge gap.`,
        `If the visitor asks a substantive question about ${fullName} that the doc does NOT cover (and it is not small talk or contact intent): write exactly one short sentence acknowledging you don't have that information, then call the ${REQUEST_HANDOFF_TOOL_NAME} tool.`,
        "After calling the tool, do not write anything further — the system will append the offer copy.",
        "",
        "--- KNOWLEDGE DOC ---",
        doc,
        "--- END KNOWLEDGE DOC ---",
    ].join("\n");
}

const requestHumanHandoff = tool({
    name: REQUEST_HANDOFF_TOOL_NAME,
    description: `Signal that the answer is not in the knowledge doc and the conversation should be offered to ${fullName}.`,
    parameters: z.object({}),
    async execute() {
        return { ok: true };
    },
});

const DRAFT_FAQ_INSTRUCTIONS = [
    `You review a conversation between a visitor and ${fullName} (the human), and produce one Q&A pair suitable for the twin's knowledge doc.`,
    "Distill what the human revealed in the thread into a generalised question/answer the twin could use next time a similar question comes up.",
    `Phrase both the question and the answer in third person, referring to ${fullName} by name or pronoun — match the existing knowledge doc's voice. Example: Q: "Where is ${fullName} based?" A: "Berlin, since 2024." Do not invent facts; ground the answer in what ${fullName} actually said in the thread.`,
    "Return exactly one Q&A pair. If the thread didn't surface anything useful, return your best attempt — the human will dismiss it if it's not worth keeping.",
].join(" ");

const DraftFaqOutput = z.object({
    question: z.string(),
    answer: z.string(),
});

export function createOpenAITwinAgent(): TwinAgent {
    if (!process.env.OPENAI_API_KEY) {
        throw new Error("OPENAI_API_KEY is not set");
    }
    return {
        async *stream({ transcript, doc, signal }) {
            const agent = new Agent({
                name: "Tandem",
                model: process.env.OPENAI_TWIN_MODEL || TWIN_MODEL,
                instructions: buildInstructions(doc),
                tools: [requestHumanHandoff],
                modelSettings: { reasoning: { effort: TWIN_REASONING_EFFORT } },
            });
            const result = await run(agent, transcript, { stream: true, signal });
            for await (const event of result) {
                if (event.type === "raw_model_stream_event") {
                    const data = event.data as { type?: string; delta?: string };
                    if (
                        data?.type === "output_text_delta" &&
                        typeof data.delta === "string" &&
                        data.delta.length > 0
                    ) {
                        yield { type: "text_delta", delta: data.delta };
                    }
                } else if (event.type === "run_item_stream_event") {
                    if (event.name === "tool_called") {
                        const item = event.item as { toolName?: string };
                        if (item.toolName) yield { type: "tool_call", name: item.toolName };
                    }
                }
            }
        },
        async draftFaq({ transcript, signal }) {
            const agent = new Agent({
                name: "Tandem FAQ Drafter",
                model: process.env.OPENAI_TWIN_MODEL || TWIN_MODEL,
                instructions: DRAFT_FAQ_INSTRUCTIONS,
                modelSettings: { reasoning: { effort: TWIN_REASONING_EFFORT } },
                outputType: DraftFaqOutput,
            });
            const result = await run(agent, transcript, { signal });
            const out = result.finalOutput as DraftFaqResult;
            return { question: out.question, answer: out.answer };
        },
    };
}

let _agent: TwinAgent | null = null;

export function setTwinAgent(agent: TwinAgent): void {
    _agent = agent;
}

export function resetTwinAgent(): void {
    _agent = null;
}

export function getTwinAgent(): TwinAgent {
    if (!_agent) {
        _agent = createOpenAITwinAgent();
    }
    return _agent;
}
